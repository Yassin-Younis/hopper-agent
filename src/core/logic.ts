import playwright, { Browser, Page, BrowserContext, ConsoleMessage, Request, Response } from 'playwright';
import {promises as fs} from 'fs';
import path from 'path';
import {Agent, AgentConfig, AgentResponse} from '../agent';
import {getSystemPrompt} from '../agent/prompts';
import {tools} from '../agent/tools/definition';
import {CapturedData, executeTool, ToolExecutionResult} from '../agent/tools/implementation';
import {
    DEFAULT_SCREENSHOT_PATH,
    DEFAULT_WAIT_TIME_MS,
    MAX_AGENT_LOOPS,
    DEFAULT_NAVIGATION_TIMEOUT_MS,
    LOG_PREFIX,
    DEFAULT_MODEL, MAX_NETWORK_EVENTS_TO_KEEP, MAX_CONSOLE_LOGS_TO_KEEP
} from '../common/constants';
import {extractElementsInfo, injectLabelsScript} from "../browser/labels.ts";

export interface ReproduceBugOptions {
    headless?: boolean;
    screenshotPath?: string;
    waitingTimeBetweenActions?: number;
    navigationTimeout?: number;
    actionTimeout?: number;
    maxLoops?: number;
    openaiApiKey?: string;
    model?: string;
    logFilePath?: string;
    onAgentResponse?: (response: AgentResponse, history: any[]) => void;
    onToolExecuting?: (toolCall: any) => void;
    onToolExecuted?: (result: ToolExecutionResult) => void;
}

export interface ReproductionResult {
    success: boolean;
    reproducible: boolean | null;
    message: string;
    history: InteractionLogEntry[];
    error?: string;
}

interface InteractionLogEntry {
    loop: number;
    timestamp: string;
    url?: string;
    elements?: string[];
    agentInputSummary?: string;
    agentResponse?: AgentResponse;
    toolResults?: ToolExecutionResult[];
    error?: string;
}

async function appendToJsonLog(logEntry: InteractionLogEntry, filePath: string): Promise<void> {
    try {
        let logs: InteractionLogEntry[] = [];
        try {
            const data = await fs.readFile(filePath, 'utf-8');
            logs = JSON.parse(data);
            if (!Array.isArray(logs)) {
                console.warn(`${LOG_PREFIX} Log file ${filePath} does not contain a valid JSON array. Initializing.`);
                logs = [];
            }
        } catch (readError: any) {
            if (readError.code !== 'ENOENT') {
                console.warn(`${LOG_PREFIX} Error reading log file ${filePath}: ${readError.message}. Initializing.`);
            }
            logs = [];
        }

        logs.push(logEntry);

        await fs.writeFile(filePath, JSON.stringify(logs, null, 2), 'utf-8'); // Pretty print JSON

    } catch (writeError: any) {
        console.error(`${LOG_PREFIX} !!! Failed to write to log file ${filePath}:`, writeError);
    }
}


/**
 * Main function to attempt bug reproduction using the LLM agent.
 * Logs interactions to a JSON file.
 *
 * @param url The starting URL for the test.
 * @param bugReport The natural language bug report describing the steps and issue.
 * @param options Optional configuration for the reproduction process.
 * @returns A Promise resolving to a ReproductionResult object.
 */
export async function reproduceBug(
    url: string,
    bugReport: string,
    options: ReproduceBugOptions = {}
): Promise<ReproductionResult> {

    const config = {
        headless: options.headless ?? true,
        screenshotPath: options.screenshotPath || DEFAULT_SCREENSHOT_PATH,
        loopDelayMs: options.waitingTimeBetweenActions || DEFAULT_WAIT_TIME_MS,
        navigationTimeout: options.navigationTimeout || DEFAULT_NAVIGATION_TIMEOUT_MS,
        maxLoops: options.maxLoops || MAX_AGENT_LOOPS,
        openaiApiKey: options.openaiApiKey,
        model: options.model || DEFAULT_MODEL,
        logFilePath: options.logFilePath || 'logs.json',
        onAgentResponse: options.onAgentResponse,
        onToolExecuting: options.onToolExecuting,
        onToolExecuted: options.onToolExecuted,
    };
    const logFilePath = path.resolve(config.logFilePath);
    const logDirPath = path.dirname(logFilePath);

    console.log(`${LOG_PREFIX} --- Starting Bug Reproduction ---`);
    console.log(`${LOG_PREFIX} Config: ${JSON.stringify({
        ...config,
        openaiApiKey: config.openaiApiKey ? '***' : 'Not Set',
        logFilePath: logFilePath
    })}`);
    console.log(`${LOG_PREFIX} Goal: "${bugReport.substring(0, 150).replace(/\n/g, ' ')}..."`);

    try {
        await fs.mkdir(logDirPath, { recursive: true });
        console.log(`${LOG_PREFIX} Ensured log directory exists: ${logDirPath}`);
    } catch (mkdirError: any) {
        console.error(`${LOG_PREFIX} Failed to create log directory ${logDirPath}:`, mkdirError);
    }

    try {
        await fs.writeFile(logFilePath, '[]', 'utf-8');
        console.log(`${LOG_PREFIX} Initialized log file at ${logFilePath}`);
    } catch (initError) {
        console.error(`${LOG_PREFIX} Failed to initialize log file ${logFilePath}:`, initError);
    }

    let browser: Browser | null = null;
    let context: BrowserContext | null = null;
    let page: Page | null = null;
    const capturedConsoleMessages: CapturedData['consoleMessages'] = [];
    const capturedNetworkEvents: CapturedData['networkEvents'] = [];
    let finalResult: ReproductionResult = {
        success: false,
        reproducible: null,
        message: "Process did not complete as expected.",
        history: [],
        error: undefined,
    };

    try {
        const agentConfig: AgentConfig = {
            apiKey: config.openaiApiKey,
            model: config.model,
            systemPromptGenerator: getSystemPrompt,
            tools,
        };
        const agent = new Agent(agentConfig);
        agent.startNewTask(bugReport);

        console.log(`${LOG_PREFIX} Launching browser (headless: ${config.headless})...`);
        browser = await playwright.chromium.launch({headless: config.headless});
        context = await browser.newContext({viewport: null, userAgent: 'BugReproAgent/1.0'});
        context.setDefaultNavigationTimeout(config.navigationTimeout);
        page = await context.newPage();
        console.log(`${LOG_PREFIX} Browser launched, page created.`);
        await page.addInitScript(injectLabelsScript)
        // --- SETUP LISTENERS --- <<< ADD THIS SECTION
        console.log(`${LOG_PREFIX} Setting up event listeners for console and network...`);


        // --- Define Listener Functions --- <<< NEW SECTION
        const handleConsole = (msg: ConsoleMessage) => {
            const type = msg.type();
            const text = msg.text();
            if (!text.startsWith('XHR finished loading')) { // Optional basic filter
                capturedConsoleMessages.push({ type, text, timestamp: Date.now() });
                if (capturedConsoleMessages.length > MAX_CONSOLE_LOGS_TO_KEEP) {
                    capturedConsoleMessages.shift();
                }
            }
        };

        const handleRequestFinished = async (request: Request) => {
            try { // Add try-catch as response() can potentially fail
                const response = await request.response();
                const method = request.method();
                const urlValue = request.url();
                const status = response?.status() ?? null;
                const resourceType = request.resourceType();

                capturedNetworkEvents.push({
                    url: urlValue, method, status, resourceType,
                    failed: status === null || (status >= 400),
                    timestamp: Date.now()
                });
                if (capturedNetworkEvents.length > MAX_NETWORK_EVENTS_TO_KEEP) {
                    capturedNetworkEvents.shift();
                }
            } catch (error) {
                console.warn(`${LOG_PREFIX} Error processing requestfinished event for ${request.url()}:`, error);
            }
        };
        const handleRequestFailed = (request: Request) => {
            const method = request.method();
            const urlValue = request.url();
            const resourceType = request.resourceType();
            const failureText = request.failure()?.errorText || 'Unknown network failure';

            capturedNetworkEvents.push({
                url: urlValue, method,
                status: null,
                resourceType,
                failed: true,
                timestamp: Date.now()
            });
            console.warn(`${LOG_PREFIX} Network request failed: ${method} ${urlValue} - ${failureText}`);
            if (capturedNetworkEvents.length > MAX_NETWORK_EVENTS_TO_KEEP) {
                capturedNetworkEvents.shift();
            }
        };
        // Console Listener

        page.on('console', handleConsole); // Attach console listener

        if (context) {
            context.on('requestfinished', handleRequestFinished); // Attach network listeners
            context.on('requestfailed', handleRequestFailed);
        } else {
            console.error(`${LOG_PREFIX} Browser context not created, cannot attach network listeners.`);
            // Handle error
        }


        console.log(`${LOG_PREFIX} Label injection script added.`);

        console.log(`${LOG_PREFIX} Navigating to initial URL: ${url}`);
        await page.goto(url, {waitUntil: 'domcontentloaded'});
        await page.waitForLoadState('networkidle', {timeout: 15000}).catch(e => console.warn(`${LOG_PREFIX} Network idle timeout exceeded after initial load.`));
        console.log(`${LOG_PREFIX} Initial navigation complete. Current URL: ${page.url()}`);
        await appendToJsonLog({
            loop: 0, // Represent initial state
            timestamp: new Date().toISOString(),
            url: page.url(),
            agentInputSummary: "Initial page load completed.",
        }, logFilePath);


        let loopCounter = 0;
        let currentToolResults: ToolExecutionResult[] | undefined = undefined;
        let agentTerminatedNormally = false;

        while (loopCounter < config.maxLoops) {
            loopCounter++;
            const loopTimestamp = new Date().toISOString();
            let currentLogEntry: InteractionLogEntry = {loop: loopCounter, timestamp: loopTimestamp};

            console.log(`\n${LOG_PREFIX} --- Loop ${loopCounter}/${config.maxLoops} ---`);
            if (!page || page.isClosed()) {
                currentLogEntry.error = "Page was closed unexpectedly.";
                await appendToJsonLog(currentLogEntry, logFilePath);
                throw new Error("Page was closed unexpectedly.");
            }

            try {
                await page.waitForTimeout(config.loopDelayMs);

                // 1. Get Current State
                console.log(`${LOG_PREFIX} Getting page state...`);
                currentLogEntry.url = page.url();
                await page.screenshot({path: config.screenshotPath, fullPage: false});
                console.log(`${LOG_PREFIX} Screenshot saved to ${config.screenshotPath}`);
                const elementsInfo = await extractElementsInfo(page);
                currentLogEntry.elements = elementsInfo; // Log the extracted elements
                console.log(`${LOG_PREFIX} Extracted ${elementsInfo.length} interactive elements.`);

                // 2. Prepare Agent Prompt
                const promptSummary = `URL: ${currentLogEntry.url}\nElements: ${elementsInfo.length} found.\nTask: Continue bug reproduction.`;
                currentLogEntry.agentInputSummary = promptSummary; // Log summary
                const fullPrompt = `
Current URL: ${currentLogEntry.url}
Visible Interactive Elements:
\`\`\`
${elementsInfo.length > 0 ? elementsInfo.join('\n') : 'No interactive elements detected.'}
\`\`\`
`;

                // 3. Call Agent
                console.log(`${LOG_PREFIX} Asking agent for next action...`);
                const agentResponse = await agent.getNextAction(
                    fullPrompt,
                    config.screenshotPath,
                    currentToolResults
                );
                currentLogEntry.agentResponse = {
                    response: agentResponse.response,
                    toolCalls: agentResponse.toolCalls
                };
                if (config.onAgentResponse) {
                    config.onAgentResponse(agentResponse, agent.getHistory());
                }

                currentToolResults = [];

                // 4. Check for Termination & Execute Tools
                let shouldTerminate = false;
                let terminationReason = "";
                let bugFound = false;
                let terminationToolResult: ToolExecutionResult | undefined = undefined;

                if (agentResponse.toolCalls && agentResponse.toolCalls.length > 0) {
                    console.log(`${LOG_PREFIX} Processing ${agentResponse.toolCalls.length} tool call(s)...`);
                    for (const toolCall of agentResponse.toolCalls) {
                        if (config.onToolExecuting) config.onToolExecuting(toolCall);

                        if (toolCall.function.name === 'reportFound' || toolCall.function.name === 'reportNotFound') {
                            shouldTerminate = true;
                            agentTerminatedNormally = true;
                            bugFound = toolCall.function.name === 'reportFound';
                            try {
                                const args = JSON.parse(toolCall.function.arguments);
                                terminationReason = args.reason || `Bug reported as ${bugFound ? 'FOUND' : 'NOT FOUND'} by agent.`;
                            } catch {
                                terminationReason = `Bug reported as ${bugFound ? 'FOUND' : 'NOT FOUND'} by agent.`;
                            }

                            console.log(`${LOG_PREFIX} Agent reported bug ${bugFound ? 'FOUND' : 'NOT FOUND'}. Reason: ${terminationReason}`);
                            terminationToolResult = {
                                tool_call_id: toolCall.id,
                                success: true,
                                result: terminationReason
                            };
                            currentToolResults.push(terminationToolResult);
                            break;
                        }

                        // --- EXECUTE TOOL (PASSING CAPTURED DATA) --- <<< MODIFY THIS CALL
                        const currentCapturedData: CapturedData = {
                            consoleMessages: [...capturedConsoleMessages], // Pass copies
                            networkEvents: [...capturedNetworkEvents]
                        };

                        const executionResult = await executeTool(toolCall, page!, currentCapturedData);
                        currentToolResults.push(executionResult);

                        if (config.onToolExecuted) config.onToolExecuted(executionResult);

                        if (!executionResult.success) {
                            console.warn(`${LOG_PREFIX} Tool execution failed: ${executionResult.error}`);
                        } else {
                            console.log(`${LOG_PREFIX} Tool executed successfully.`);
                        }
                        await page.waitForTimeout(100);
                    }
                    currentLogEntry.toolResults = currentToolResults;

                } else {
                    console.log(`${LOG_PREFIX} Agent provided a response but requested no tools this turn.`);
                    // No tool results to log for this loop
                }

                // 5. Log and Check Termination
                await appendToJsonLog(currentLogEntry, logFilePath);

                if (shouldTerminate) {
                    finalResult = {
                        success: true,
                        reproducible: bugFound,
                        message: terminationReason,
                        history: [],
                        error: undefined
                    };
                    break;
                }

            } catch (loopError: any) {
                console.error(`${LOG_PREFIX} Error within agent loop ${loopCounter}:`, loopError);
                currentLogEntry.error = `Loop Error: ${loopError.message}`;
                await appendToJsonLog(currentLogEntry, logFilePath);
                throw loopError;
            }

        }

        if (!agentTerminatedNormally) {
            let terminationMessage = "";
            if (loopCounter >= config.maxLoops) {
                terminationMessage = `Reached maximum loop limit (${config.maxLoops}). Terminating.`;
                console.warn(`${LOG_PREFIX} ${terminationMessage}`);
                finalResult = {
                    success: false,
                    reproducible: null,
                    message: terminationMessage,
                    history: [],
                    error: terminationMessage
                };
            } else {
                terminationMessage = "Loop terminated unexpectedly.";
                console.error(`${LOG_PREFIX} ${terminationMessage}`);
                finalResult = {
                    success: false,
                    reproducible: null,
                    message: terminationMessage,
                    history: [],
                    error: terminationMessage
                };
            }
            await appendToJsonLog({
                loop: loopCounter + 1, // After last loop
                timestamp: new Date().toISOString(),
                error: terminationMessage,
                agentInputSummary: "Loop termination condition met."
            }, logFilePath);
        }


    } catch (error: any) {
        console.error(`\n${LOG_PREFIX} !!! Critical Error during Agent Execution !!!`);
        console.error(`${LOG_PREFIX} Error Details:`, error.stack || error);
        const errorMessage = `Critical Error: ${error.message || error}`;
        await appendToJsonLog({
            loop: -1, // Indicate critical failure
            timestamp: new Date().toISOString(),
            error: errorMessage,
            agentInputSummary: "Critical error caused process termination."
        }, logFilePath);
        finalResult = {
            success: false,
            reproducible: null,
            message: "Process failed due to a critical error.",
            history: [],
            error: errorMessage
        };
    } finally {
        console.log(`${LOG_PREFIX} Cleaning up resources...`);
        if (page && !page.isClosed()) {
            try {
                await page.close();
            } catch (e) {
                console.warn(`${LOG_PREFIX} Error closing page:`, e);
            }
        }
        if (context) {
            try {
                await context.close();
            } catch (e) {
                console.warn(`${LOG_PREFIX} Error closing context:`, e);
            }
        }
        if (browser) {
            try {
                await browser.close();
                console.log(`${LOG_PREFIX} Browser closed.`);
            } catch (e: any) {
                console.error(`${LOG_PREFIX} Error closing browser:`, e.message);
            }
        } else {
            console.log(`${LOG_PREFIX} Browser was not launched or already closed.`);
        }
    }

    console.log(`\n${LOG_PREFIX} --- Execution Summary ---`);
    console.log(`${LOG_PREFIX} Process Success: ${finalResult.success}`);
    console.log(`${LOG_PREFIX} Bug Reproducible: ${finalResult.reproducible === null ? 'Unknown' : finalResult.reproducible}`);
    console.log(`${LOG_PREFIX} Final Message: ${finalResult.message}`);
    if (finalResult.error) {
        console.error(`${LOG_PREFIX} Critical Error Encountered: ${finalResult.error}`);
    }
    console.log(`${LOG_PREFIX} Detailed interaction log saved to: ${logFilePath}`);
    try {
        const logData = await fs.readFile(logFilePath, 'utf-8');
        finalResult.history = JSON.parse(logData);
    } catch (e) {
        console.warn(`${LOG_PREFIX} Could not read final log file to populate history result field.`);
        finalResult.history = []; // Ensure it's an empty array if read fails
    }

    return finalResult;
}