import dotenv from 'dotenv';
import path from 'path';
import { promises as fs } from 'fs';
import os from 'os';
import { exec, spawn, ChildProcess } from 'child_process';
import util from 'util';
import { reproduceBug, ReproductionResult } from "../src";

dotenv.config();

const execPromise = util.promisify(exec);

interface TestCase {
    id: number | string;
    'Git Link': string;
    'Buggy Commit Hash': string;
    'Fixed Commit Hash': string;
    'Steps to Run': string[];
    'Bug Report': string;
    'Deployment Link': string;
    [key: string]: any;
}

interface RunOutcome {
    success: boolean;
    agentResult?: ReproductionResult;
    error?: string;
    logPath?: string;
    screenshotPath?: string;
}

interface TestResult {
    testCaseId: number | string;
    repo: string;
    bugReportSummary: string;
    status: 'PASSED' | 'FAILED' | 'ERROR';
    buggyRun: RunOutcome;
    fixedRun: RunOutcome;
    errorMessage?: string;
}

const TESTBENCH_PATH = path.resolve('./tests/testbench.json');
const BASE_OUTPUT_DIR = path.resolve('./tests/test_run_outputs');
const SERVER_STARTUP_TIMEOUT_MS = 20000;
const AGENT_MODEL = "gpt-4o";

async function runCommand(command: string, cwd: string, logPrefix: string = '[CMD]'): Promise<{ stdout: string; stderr: string }> {
    console.log(`${logPrefix} Running command: ${command} in ${cwd}`);
    try {
        const { stdout, stderr } = await execPromise(command, { cwd });
        if (stdout) console.log(`${logPrefix} stdout:\n${stdout}`);
        if (stderr) console.warn(`${logPrefix} stderr:\n${stderr}`); // Log stderr as warning
        return { stdout, stderr };
    } catch (error: any) {
        console.error(`${logPrefix} Error running command "${command}":`, error.message);
        console.error(`${logPrefix} stdout: ${error.stdout}`);
        console.error(`${logPrefix} stderr: ${error.stderr}`);
        throw new Error(`Command failed: ${command}\n${error.stderr || error.message}`);
    }
}

function startServerProcess(steps: string[], cwd: string, logPrefix: string = '[SERVER]'): ChildProcess | null {
    const serverCommand = steps[steps.length - 1];
    if (!serverCommand) {
        console.error(`${logPrefix} No server start command found in steps.`);
        return null;
    }

    console.log(`${logPrefix} Starting server with command: "${serverCommand}" in ${cwd}`);
    const [command, ...args] = serverCommand.split(' ');

    try {
        const serverProcess = spawn(command, args, {
            cwd,
            stdio: ['ignore', 'pipe', 'pipe'], // Ignore stdin, pipe stdout/stderr
            detached: false, // Keep it attached unless specific reason to detach
            shell: process.platform === 'win32', // Use shell on Windows for npm etc.
        });

        serverProcess.stderr?.on('data', (data) => {
            console.warn(`${logPrefix} stderr: ${data.toString().trim()}`);
        });

        serverProcess.on('error', (err) => {
            console.error(`${logPrefix} Failed to start server process:`, err);
        });

        serverProcess.on('close', (code, signal) => {
            if (code !== 0 && signal !== 'SIGTERM' && signal !== 'SIGINT') { // Ignore expected kills
                console.warn(`${logPrefix} Server process exited unexpectedly with code ${code}, signal ${signal}`);
            } else {
                console.log(`${logPrefix} Server process exited (code ${code}, signal ${signal})`);
            }
        });

        console.log(`${logPrefix} Server process spawned with PID: ${serverProcess.pid}`);
        return serverProcess;
    } catch (error) {
        console.error(`${logPrefix} Error spawning server process:`, error);
        return null;
    }
}

async function stopServerProcess(serverProcess: ChildProcess | null, logPrefix: string = '[SERVER]'): Promise<void> {
    if (!serverProcess || serverProcess.killed || serverProcess.exitCode !== null) {
        console.log(`${logPrefix} Server process already stopped or not running.`);
        return;
    }
    const pid = serverProcess.pid;
    console.log(`${logPrefix} Attempting to stop server process (PID: ${pid})...`);

    return new Promise((resolve) => {
        serverProcess.on('close', () => {
            console.log(`${logPrefix} Server process (PID: ${pid}) confirmed stopped.`);
            resolve();
        });

        const killed = serverProcess.kill('SIGTERM');

        if (!killed) {
            console.warn(`${logPrefix} Failed to send SIGTERM to PID: ${pid}. Process might already be stopped.`);
            resolve();
            return;
        }

        const killTimeout = setTimeout(() => {
            if (!serverProcess.killed) {
                console.warn(`${logPrefix} Server process (PID: ${pid}) did not exit after SIGTERM, sending SIGKILL...`);
                serverProcess.kill('SIGKILL');
            }
        }, 5000);

        serverProcess.on('close', () => {
            clearTimeout(killTimeout);
        });
    });

}

function sleep(ms: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, ms));
}


async function runTestSuite() {
    console.log("--- Starting Test Suite Runner ---");
    const suiteTimestamp = new Date().toISOString().replace(/[:.]/g, '-');
    const suiteOutputDir = path.join(BASE_OUTPUT_DIR, `test_run_${suiteTimestamp}`);
    const suiteLogDir = path.join(suiteOutputDir, 'logs');
    const suiteScreenshotDir = path.join(suiteOutputDir, 'screenshots');

    const apiKey = process.env.OPENAI_API_KEY;
    if (!apiKey) {
        console.error("FATAL: OPENAI_API_KEY not found.");
        process.exit(1);
    }
    console.log("OpenAI API Key loaded.");

    let testCases: TestCase[];
    try {
        const testbenchContent = await fs.readFile(TESTBENCH_PATH, 'utf-8');
        testCases = JSON.parse(testbenchContent);
        console.log(`Loaded ${testCases.length} test cases from ${TESTBENCH_PATH}`);
    } catch (error) {
        console.error(`FATAL: Failed to read or parse testbench file at ${TESTBENCH_PATH}`, error);
        process.exit(1);
    }

    try {
        await fs.mkdir(suiteLogDir, { recursive: true });
        await fs.mkdir(suiteScreenshotDir, { recursive: true });
        console.log(`Created output directories in ${suiteOutputDir}`);
    } catch (error) {
        console.error(`FATAL: Failed to create output directories`, error);
        process.exit(1);
    }

    const allTestResults: TestResult[] = [];
    const overallStartTime = Date.now();

    for (const [index, testCase] of testCases.entries()) {
        const testCaseNum = index + 1;
        const testCaseId = testCase.id || `Index_${index}`;
        const repoName = testCase['Git Link'].split('/').pop()?.replace('.git', '') || `repo_${testCaseNum}`;
        const testCasePrefix = `[Test ${testCaseNum}/${testCases.length} | ID: ${testCaseId} | ${repoName}]`;
        console.log(`\n${testCasePrefix} --- Starting Test Case ---`);

        let tempDir: string | null = null;
        let serverProcessBuggy: ChildProcess | null = null;
        let serverProcessFixed: ChildProcess | null = null;
        let buggyRunOutcome: RunOutcome | null = null;
        let fixedRunOutcome: RunOutcome | null = null;
        let testErrorMessage: string | undefined;
        let testStatus: 'PASSED' | 'FAILED' | 'ERROR' = 'ERROR';

        try {
            tempDir = await fs.mkdtemp(path.join(os.tmpdir(), `hopper-test-${repoName}-${testCaseId}-`));
            console.log(`${testCasePrefix} Created temp directory: ${tempDir}`);

            await runCommand(`git clone ${testCase['Git Link']} .`, tempDir, `${testCasePrefix} [Git]`);

            console.log(`${testCasePrefix} --- Running Buggy Version (${testCase['Buggy Commit Hash']}) ---`);
            const buggyLogPath = path.join(suiteLogDir, `test_${testCaseNum}_${testCaseId}_buggy_${suiteTimestamp}.json`);
            const buggyScreenshotPath = path.join(suiteScreenshotDir, `test_${testCaseNum}_${testCaseId}_buggy_screenshot.png`);
            const buggyOutcome: RunOutcome = { success: false, logPath: buggyLogPath, screenshotPath: buggyScreenshotPath }; // Start assuming failure

            try {
                await runCommand(`git checkout ${testCase['Buggy Commit Hash']}`, tempDir, `${testCasePrefix} [Git]`);
                for (let i = 0; i < testCase['Steps to Run'].length - 1; i++) {
                    await runCommand(testCase['Steps to Run'][i], tempDir, `${testCasePrefix} [Setup]`);
                }
                serverProcessBuggy = startServerProcess(testCase['Steps to Run'], tempDir, `${testCasePrefix} [Server Buggy]`);
                if (!serverProcessBuggy || serverProcessBuggy.exitCode !== null || serverProcessBuggy.killed) {
                    throw new Error("Failed to start server process for buggy version.");
                }
                console.log(`${testCasePrefix} Waiting ${SERVER_STARTUP_TIMEOUT_MS / 1000}s for server to start...`);
                await sleep(SERVER_STARTUP_TIMEOUT_MS);

                console.log(`${testCasePrefix} Running agent on buggy version...`);
                buggyOutcome.agentResult = await reproduceBug(testCase['Deployment Link'], testCase['Bug Report'], {
                    headless: true,
                    openaiApiKey: apiKey,
                    logFilePath: buggyLogPath,
                    screenshotPath: buggyScreenshotPath,
                    model: AGENT_MODEL,
                });
                buggyOutcome.success = true;

            } catch (err: any) {
                console.error(`${testCasePrefix} Error during buggy run:`, err.message);
                buggyOutcome.error = err.message || String(err);
                buggyOutcome.success = false;
            } finally {
                await stopServerProcess(serverProcessBuggy, `${testCasePrefix} [Server Buggy]`);
                buggyRunOutcome = buggyOutcome;
            }
            console.log(`${testCasePrefix} Buggy Run Outcome: Success=${buggyRunOutcome.success}, Reproducible=${buggyRunOutcome.agentResult?.reproducible ?? 'N/A'}`);

            console.log(`${testCasePrefix} --- Running Fixed Version (${testCase['Fixed Commit Hash']}) ---`);
            const fixedLogPath = path.join(suiteLogDir, `test_${testCaseNum}_${testCaseId}_fixed_${suiteTimestamp}.json`);
            const fixedScreenshotPath = path.join(suiteScreenshotDir, `test_${testCaseNum}_${testCaseId}_fixed_screenshot.png`);
            const fixedOutcome: RunOutcome = { success: false, logPath: fixedLogPath, screenshotPath: fixedScreenshotPath };

            try {
                await runCommand(`git checkout ${testCase['Fixed Commit Hash']}`, tempDir, `${testCasePrefix} [Git]`);
                for (let i = 0; i < testCase['Steps to Run'].length - 1; i++) {
                    await runCommand(testCase['Steps to Run'][i], tempDir, `${testCasePrefix} [Setup]`);
                }
                serverProcessFixed = startServerProcess(testCase['Steps to Run'], tempDir, `${testCasePrefix} [Server Fixed]`);
                if (!serverProcessFixed || serverProcessFixed.exitCode !== null || serverProcessFixed.killed) {
                    throw new Error("Failed to start server process for fixed version.");
                }
                console.log(`${testCasePrefix} Waiting ${SERVER_STARTUP_TIMEOUT_MS / 1000}s for server to start...`);
                await sleep(SERVER_STARTUP_TIMEOUT_MS);

                console.log(`${testCasePrefix} Running agent on fixed version...`);
                fixedOutcome.agentResult = await reproduceBug(testCase['Deployment Link'], testCase['Bug Report'], {
                    headless: true,
                    maxLoops: 30,
                    openaiApiKey: apiKey,
                    logFilePath: fixedLogPath,
                    screenshotPath: fixedScreenshotPath,
                    model: AGENT_MODEL,
                });
                fixedOutcome.success = true;

            } catch (err: any) {
                console.error(`${testCasePrefix} Error during fixed run:`, err.message);
                fixedOutcome.error = err.message || String(err);
                fixedOutcome.success = false;
            } finally {
                await stopServerProcess(serverProcessFixed, `${testCasePrefix} [Server Fixed]`);
                fixedRunOutcome = fixedOutcome; // Store the outcome
            }
            console.log(`${testCasePrefix} Fixed Run Outcome: Success=${fixedRunOutcome.success}, Reproducible=${fixedRunOutcome.agentResult?.reproducible ?? 'N/A'}`);

            if (!buggyRunOutcome || !fixedRunOutcome) {
                throw new Error("Critical error: Run outcomes missing."); // Should not happen
            }

            const buggySucceeded = buggyRunOutcome.success && buggyRunOutcome.agentResult?.success;
            const fixedSucceeded = fixedRunOutcome.success && fixedRunOutcome.agentResult?.success;
            const buggyResultReproducible = buggyRunOutcome.agentResult?.reproducible ?? false;
            const fixedResultReproducible = fixedRunOutcome.agentResult?.reproducible ?? true; // Default to true if agent failed, as failure != not reproducible

            if (!buggySucceeded || !fixedSucceeded) {
                testStatus = 'ERROR';
                testErrorMessage = `One or both agent runs failed to complete process. Buggy Infra OK: ${buggyRunOutcome.success}, Buggy Agent OK: ${buggyRunOutcome.agentResult?.success ?? false}. Fixed Infra OK: ${fixedRunOutcome.success}, Fixed Agent OK: ${fixedRunOutcome.agentResult?.success ?? false}`;
                console.error(`${testCasePrefix} ${testErrorMessage}`);
            } else if (buggyResultReproducible === true && fixedResultReproducible === false) {
                testStatus = 'PASSED';
                console.log(`${testCasePrefix} Status: PASSED`);
            } else {
                testStatus = 'FAILED';
                testErrorMessage = `Unexpected agent results. Expected Buggy=true/Fixed=false. Got Buggy=${buggyResultReproducible}/Fixed=${fixedResultReproducible}.`;
                console.warn(`${testCasePrefix} Status: FAILED - ${testErrorMessage}`);
            }

        } catch (error: any) {
            console.error(`${testCasePrefix} !!! Test Case CRITICAL ERROR:`, error.message);
            testStatus = 'ERROR';
            testErrorMessage = `Critical error during test case execution: ${error.message || String(error)}`;
            await stopServerProcess(serverProcessBuggy, `${testCasePrefix} [Server Buggy Cleanup]`);
            await stopServerProcess(serverProcessFixed, `${testCasePrefix} [Server Fixed Cleanup]`);
        } finally {
            if (tempDir) {
                console.log(`${testCasePrefix} Cleaning up temp directory: ${tempDir}`);
                try {
                    await fs.rm(tempDir, { recursive: true, force: true, maxRetries: 3, retryDelay: 1000 });
                    console.log(`${testCasePrefix} Temp directory removed.`);
                } catch (rmError: any) {
                    console.error(`${testCasePrefix} !!! Failed to remove temp directory ${tempDir}:`, rmError.message);
                }
            }

            allTestResults.push({
                testCaseId: testCaseId,
                repo: repoName,
                bugReportSummary: (testCase['Bug Report'] || 'N/A').substring(0, 100) + '...',
                status: testStatus,
                buggyRun: buggyRunOutcome || { success: false, error: "Buggy run did not execute." },
                fixedRun: fixedRunOutcome || { success: false, error: "Fixed run did not execute." },
                errorMessage: testErrorMessage,
            });
            console.log(`${testCasePrefix} --- Finished Test Case ---`);
        }
    }

    const overallEndTime = Date.now();
    const suiteDuration = ((overallEndTime - overallStartTime) / 1000).toFixed(2);
    console.log(`\n\n--- Test Suite Finished (${suiteDuration}s) ---`);
    console.log("Summary:");

    const passed = allTestResults.filter(r => r.status === 'PASSED').length;
    const failed = allTestResults.filter(r => r.status === 'FAILED').length;
    const errors = allTestResults.filter(r => r.status === 'ERROR').length;

    console.table(allTestResults.map(r => ({
        ID: r.testCaseId,
        Repo: r.repo,
        Status: r.status,
        'Buggy Run Ok': r.buggyRun.success,
        'Buggy Repro': r.buggyRun.agentResult?.reproducible ?? 'N/A',
        'Fixed Run Ok': r.fixedRun.success,
        'Fixed Repro': r.fixedRun.agentResult?.reproducible ?? 'N/A',
        'Error Msg': r.errorMessage || (r.buggyRun.error || r.fixedRun.error) || '',
    })));

    console.log(`\nTotal Tests: ${testCases.length} | Passed: ${passed} | Failed: ${failed} | Errors: ${errors}`);
    console.log(`Detailed logs and screenshots saved in: ${suiteOutputDir}`);

    try {
        const summaryPath = path.join(suiteOutputDir, 'test_summary.json');
        await fs.writeFile(summaryPath, JSON.stringify(allTestResults, null, 2));
        console.log(`Summary saved to: ${summaryPath}`);
    } catch (e) {
        console.error("Failed to write summary JSON file.", e);
    }
    if (failed > 0 || errors > 0) {
        process.exitCode = 1;
    }
}

runTestSuite().catch(err => {
    console.error("\n--- UNHANDLED FATAL ERROR IN TEST SUITE RUNNER ---");
    console.error(err);
    process.exit(1); // Exit with error code
});