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
    // Add other fields if needed (e.g., Difficulty)
    [key: string]: any; // Allow other fields
}

interface RunOutcome {
    success: boolean; // Did the setup, agent run, and teardown complete without infra errors?
    agentResult?: ReproductionResult; // Result from reproduceBug
    error?: string; // Infrastructure/setup error message
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
    errorMessage?: string; // Overall error for this test case
}

// --- Configuration ---
const TESTBENCH_PATH = path.resolve('./tests/testbench.json'); // Path to your testbench file
const BASE_OUTPUT_DIR = path.resolve('./tests/test_run_outputs'); // Main output directory
const SERVER_STARTUP_TIMEOUT_MS = 20000; // Max time to wait for server (increase if needed)
const AGENT_MODEL = "gpt-4o"; // Or your preferred model

// --- Helper Functions ---

/** Executes a shell command in a specified directory */
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

/** Starts a server process */
function startServerProcess(steps: string[], cwd: string, logPrefix: string = '[SERVER]'): ChildProcess | null {
    // Find the command that likely starts the server (e.g., 'npm run dev', 'node server.js')
    // This assumes the *last* command in 'Steps to Run' is the server start command. Adjust if needed.
    const serverCommand = steps[steps.length - 1];
    if (!serverCommand) {
        console.error(`${logPrefix} No server start command found in steps.`);
        return null;
    }

    console.log(`${logPrefix} Starting server with command: "${serverCommand}" in ${cwd}`);
    const [command, ...args] = serverCommand.split(' ');

    try {
        // Spawn the process. Use 'pipe' to potentially capture output later if needed,
        // or 'ignore' if output is noisy and not needed.
        const serverProcess = spawn(command, args, {
            cwd,
            stdio: ['ignore', 'pipe', 'pipe'], // Ignore stdin, pipe stdout/stderr
            detached: false, // Keep it attached unless specific reason to detach
            shell: process.platform === 'win32', // Use shell on Windows for npm etc.
        });

        serverProcess.stdout?.on('data', (data) => {
            // console.log(`${logPrefix} stdout: ${data.toString().trim()}`); // Optional: Log server output
        });

        serverProcess.stderr?.on('data', (data) => {
            console.warn(`${logPrefix} stderr: ${data.toString().trim()}`); // Log errors from server
        });

        serverProcess.on('error', (err) => {
            console.error(`${logPrefix} Failed to start server process:`, err);
            // Note: This often indicates the command itself failed (e.g., command not found)
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

/** Stops the server process */
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

        // Try SIGTERM first (graceful shutdown)
        const killed = serverProcess.kill('SIGTERM');

        if (!killed) {
            console.warn(`${logPrefix} Failed to send SIGTERM to PID: ${pid}. Process might already be stopped.`);
            resolve(); // Resolve if kill signal fails
            return;
        }

        // Set a timeout to force kill if SIGTERM doesn't work
        const killTimeout = setTimeout(() => {
            if (!serverProcess.killed) {
                console.warn(`${logPrefix} Server process (PID: ${pid}) did not exit after SIGTERM, sending SIGKILL...`);
                serverProcess.kill('SIGKILL'); // Force kill
            }
        }, 5000); // 5 second timeout for graceful shutdown

        serverProcess.on('close', () => {
            clearTimeout(killTimeout); // Clear the force kill timeout if it closes normally
        });
    });

}

/** Waits for a specified duration */
function sleep(ms: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, ms));
}


// --- Main Test Suite Runner ---
async function runTestSuite() {
    console.log("--- Starting Test Suite Runner ---");
    const suiteTimestamp = new Date().toISOString().replace(/[:.]/g, '-');
    const suiteOutputDir = path.join(BASE_OUTPUT_DIR, `test_run_${suiteTimestamp}`);
    const suiteLogDir = path.join(suiteOutputDir, 'logs');
    const suiteScreenshotDir = path.join(suiteOutputDir, 'screenshots');

    // --- API Key Check ---
    const apiKey = process.env.OPENAI_API_KEY;
    if (!apiKey) {
        console.error("FATAL: OPENAI_API_KEY not found.");
        process.exit(1);
    }
    console.log("OpenAI API Key loaded.");

    // --- Load Testbench ---
    let testCases: TestCase[];
    try {
        const testbenchContent = await fs.readFile(TESTBENCH_PATH, 'utf-8');
        testCases = JSON.parse(testbenchContent);
        console.log(`Loaded ${testCases.length} test cases from ${TESTBENCH_PATH}`);
    } catch (error) {
        console.error(`FATAL: Failed to read or parse testbench file at ${TESTBENCH_PATH}`, error);
        process.exit(1);
    }

    // --- Create Output Dirs ---
    try {
        await fs.mkdir(suiteLogDir, { recursive: true });
        await fs.mkdir(suiteScreenshotDir, { recursive: true });
        console.log(`Created output directories in ${suiteOutputDir}`);
    } catch (error) {
        console.error(`FATAL: Failed to create output directories`, error);
        process.exit(1);
    }

    // --- Run Tests ---
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
        let testStatus: 'PASSED' | 'FAILED' | 'ERROR' = 'ERROR'; // Default to error

        try {
            // 1. Create Temp Directory
            tempDir = await fs.mkdtemp(path.join(os.tmpdir(), `hopper-test-${repoName}-${testCaseId}-`));
            console.log(`${testCasePrefix} Created temp directory: ${tempDir}`);

            // 2. Clone Repo
            await runCommand(`git clone ${testCase['Git Link']} .`, tempDir, `${testCasePrefix} [Git]`);

            // --- 3. Run Buggy Version ---
            console.log(`${testCasePrefix} --- Running Buggy Version (${testCase['Buggy Commit Hash']}) ---`);
            const buggyLogPath = path.join(suiteLogDir, `test_${testCaseNum}_${testCaseId}_buggy_${suiteTimestamp}.json`);
            const buggyScreenshotPath = path.join(suiteScreenshotDir, `test_${testCaseNum}_${testCaseId}_buggy_screenshot.png`);
            const buggyOutcome: RunOutcome = { success: false, logPath: buggyLogPath, screenshotPath: buggyScreenshotPath }; // Start assuming failure

            try {
                await runCommand(`git checkout ${testCase['Buggy Commit Hash']}`, tempDir, `${testCasePrefix} [Git]`);
                // Run setup steps (e.g., npm install) - assumes first N-1 steps are setup
                for (let i = 0; i < testCase['Steps to Run'].length - 1; i++) {
                    await runCommand(testCase['Steps to Run'][i], tempDir, `${testCasePrefix} [Setup]`);
                }
                // Start server
                serverProcessBuggy = startServerProcess(testCase['Steps to Run'], tempDir, `${testCasePrefix} [Server Buggy]`);
                if (!serverProcessBuggy || serverProcessBuggy.exitCode !== null || serverProcessBuggy.killed) {
                    throw new Error("Failed to start server process for buggy version.");
                }
                console.log(`${testCasePrefix} Waiting ${SERVER_STARTUP_TIMEOUT_MS / 1000}s for server to start...`);
                await sleep(SERVER_STARTUP_TIMEOUT_MS); // Simple wait, replace with HTTP check if needed

                // Run Agent
                console.log(`${testCasePrefix} Running agent on buggy version...`);
                buggyOutcome.agentResult = await reproduceBug(testCase['Deployment Link'], testCase['Bug Report'], {
                    headless: true,
                    openaiApiKey: apiKey,
                    logFilePath: buggyLogPath,
                    screenshotPath: buggyScreenshotPath,
                    model: AGENT_MODEL,
                    // Reduce noise in batch runs - use default options or minimal callbacks
                });
                buggyOutcome.success = true; // Mark infrastructure part as success if agent ran

            } catch (err: any) {
                console.error(`${testCasePrefix} Error during buggy run:`, err.message);
                buggyOutcome.error = err.message || String(err);
                buggyOutcome.success = false; // Setup/agent run failed
            } finally {
                await stopServerProcess(serverProcessBuggy, `${testCasePrefix} [Server Buggy]`);
                buggyRunOutcome = buggyOutcome; // Store the outcome
            }
            console.log(`${testCasePrefix} Buggy Run Outcome: Success=${buggyRunOutcome.success}, Reproducible=${buggyRunOutcome.agentResult?.reproducible ?? 'N/A'}`);


            // --- 4. Run Fixed Version ---
            console.log(`${testCasePrefix} --- Running Fixed Version (${testCase['Fixed Commit Hash']}) ---`);
            const fixedLogPath = path.join(suiteLogDir, `test_${testCaseNum}_${testCaseId}_fixed_${suiteTimestamp}.json`);
            const fixedScreenshotPath = path.join(suiteScreenshotDir, `test_${testCaseNum}_${testCaseId}_fixed_screenshot.png`);
            const fixedOutcome: RunOutcome = { success: false, logPath: fixedLogPath, screenshotPath: fixedScreenshotPath };

            try {
                await runCommand(`git checkout ${testCase['Fixed Commit Hash']}`, tempDir, `${testCasePrefix} [Git]`);
                // Re-run setup steps - necessary if node_modules/builds differ
                for (let i = 0; i < testCase['Steps to Run'].length - 1; i++) {
                    await runCommand(testCase['Steps to Run'][i], tempDir, `${testCasePrefix} [Setup]`);
                }
                // Start server
                serverProcessFixed = startServerProcess(testCase['Steps to Run'], tempDir, `${testCasePrefix} [Server Fixed]`);
                if (!serverProcessFixed || serverProcessFixed.exitCode !== null || serverProcessFixed.killed) {
                    throw new Error("Failed to start server process for fixed version.");
                }
                console.log(`${testCasePrefix} Waiting ${SERVER_STARTUP_TIMEOUT_MS / 1000}s for server to start...`);
                await sleep(SERVER_STARTUP_TIMEOUT_MS);

                // Run Agent
                console.log(`${testCasePrefix} Running agent on fixed version...`);
                fixedOutcome.agentResult = await reproduceBug(testCase['Deployment Link'], testCase['Bug Report'], {
                    headless: true,
                    maxLoops: 10, // Limit the number of loops to avoid infinite runs
                    openaiApiKey: apiKey,
                    logFilePath: fixedLogPath,
                    screenshotPath: fixedScreenshotPath,
                    model: AGENT_MODEL,
                });
                fixedOutcome.success = true; // Infrastructure part successful

            } catch (err: any) {
                console.error(`${testCasePrefix} Error during fixed run:`, err.message);
                fixedOutcome.error = err.message || String(err);
                fixedOutcome.success = false;
            } finally {
                await stopServerProcess(serverProcessFixed, `${testCasePrefix} [Server Fixed]`);
                fixedRunOutcome = fixedOutcome; // Store the outcome
            }
            console.log(`${testCasePrefix} Fixed Run Outcome: Success=${fixedRunOutcome.success}, Reproducible=${fixedRunOutcome.agentResult?.reproducible ?? 'N/A'}`);


            // --- 5. Determine Test Status ---
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
            // Ensure any potentially running servers are stopped if error happened mid-way
            await stopServerProcess(serverProcessBuggy, `${testCasePrefix} [Server Buggy Cleanup]`);
            await stopServerProcess(serverProcessFixed, `${testCasePrefix} [Server Fixed Cleanup]`);
        } finally {
            // --- 6. Cleanup Temp Directory ---
            if (tempDir) {
                console.log(`${testCasePrefix} Cleaning up temp directory: ${tempDir}`);
                try {
                    // Add retries or delay if needed, especially on Windows
                    await fs.rm(tempDir, { recursive: true, force: true, maxRetries: 3, retryDelay: 1000 });
                    console.log(`${testCasePrefix} Temp directory removed.`);
                } catch (rmError: any) {
                    console.error(`${testCasePrefix} !!! Failed to remove temp directory ${tempDir}:`, rmError.message);
                    // Don't let cleanup failure stop the whole suite
                }
            }

            // --- 7. Record Final Result ---
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

    // --- Final Suite Summary ---
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

    // Optionally save summary to a file
    try {
        const summaryPath = path.join(suiteOutputDir, 'test_summary.json');
        await fs.writeFile(summaryPath, JSON.stringify(allTestResults, null, 2));
        console.log(`Summary saved to: ${summaryPath}`);
    } catch (e) {
        console.error("Failed to write summary JSON file.", e);
    }

    // Exit with non-zero code if any tests failed or errored
    if (failed > 0 || errors > 0) {
        process.exitCode = 1;
    }
}

// --- Run the Suite ---
runTestSuite().catch(err => {
    console.error("\n--- UNHANDLED FATAL ERROR IN TEST SUITE RUNNER ---");
    console.error(err);
    process.exit(1); // Exit with error code
});