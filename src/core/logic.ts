import {extractActions, injectLabels} from "../browser/labels";
import chromium from 'playwright';

const DEFAULT_SCREENSHOT_PATH = 'screenshot.png';
const DEFAULT_WAIT_TIME_MS = 500;
const DEFAULT_HEADLESS_MODE = false;

/**
 * Uses a Playwright agent to attempt to reproduce steps described in a bug report.
 * Logs are prefixed with [Agent] for consistency.
 *
 * @param {string} url The starting URL for the test.
 * @param {string} bugReport The natural language bug report describing the steps and issue.
 * @param {object} [options={}] Optional configuration.
 * @param {boolean} [options.headless=false] Run the browser in headless mode.
 * @param {string} [options.screenshotPath='screenshot.png'] Path to save screenshots.
 * @param {number} [options.waitingTimeBetweenActions=500] Wait time in ms between agent actions.
 * @returns {Promise<object>} A promise that resolves to an object containing the results.
 *                            { reproducible: boolean, errors: Array<string>, history: Array<string> }
 */
async function reproduceBug(url, bugReport, options = {}) {
    if (!url || typeof url !== 'string') {
        throw new Error('[Agent] The "url" parameter (string) is required.');
    }
    if (!bugReport || typeof bugReport !== 'string') {
        throw new Error('[Agent] The "bugReport" parameter (string) is required.');
    }

    const {
        headless = DEFAULT_HEADLESS_MODE,
        screenshotPath = DEFAULT_SCREENSHOT_PATH,
        waitingTimeBetweenActions = DEFAULT_WAIT_TIME_MS
    } = options;

    console.log(`[Agent] --- Starting Bug Reproduction ---`);
    console.log(`[Agent] URL: ${url}`);
    console.log(`[Agent] Headless: ${headless}`);
    console.log(`[Agent] Wait Time (ms): ${waitingTimeBetweenActions}`);
    console.log(`[Agent] Screenshot Path: ${screenshotPath}`);
    console.log(`[Agent] Goal: "${bugReport.substring(0, 150).replace(/\n/g, ' ')}..."`); // Log goal concisely

    let browser = null; // Initialize browser to null for finally block
    const errors = []; // Collect errors encountered during execution
    const history = []; // Track agent's thoughts/actions
    let agentTerminated = false;
    let reproducible = false; // Track if the bug is reproducible

    try {
        console.log("[Agent] Launching browser...");
        browser = await chromium.launch({headless});
        const context = await browser.newContext();
        const page = await context.newPage();
        console.log("[Agent] Browser launched, new page created.");

        page.on('load', async (loadedPage) => {
            console.log(`[Agent] Page loaded: ${loadedPage.url()}. Injecting accessibility labels.`);
            try {
                await loadedPage.evaluate(injectLabels);
                console.log(`[Agent] Labels injected on ${loadedPage.url()}`);
            } catch (injectionError) {
                console.error("[Agent] Error injecting labels:", injectionError.message);
            }
        });

        console.log(`[Agent] Navigating to initial URL: ${url}`);
        await page.goto(url, {waitUntil: 'domcontentloaded', timeout: 30000}); // Use domcontentloaded for faster initial load, add timeout
        console.log("[Agent] Initial navigation complete.");

        // --- Agent Interaction Loop ---
        const goal = bugReport; // Agent's objective
        let loopCounter = 0; // Prevent infinite loops
        const MAX_LOOPS = 30; // Set a maximum number of agent iterations

        while (loopCounter < MAX_LOOPS) {
            loopCounter++;
            console.log(`\n[Agent] --- Loop Iteration ${loopCounter}/${MAX_LOOPS} ---`);
            await page.waitForTimeout(waitingTimeBetweenActions); // Wait before acting

            console.log("[Agent] Taking screenshot...");
            await page.screenshot({path: screenshotPath});
            console.log(`[Agent] Screenshot saved to ${screenshotPath}`);

            console.log("[Agent] Extracting actions/accessibility tree...");
            const accessibilityTree = await extractActions(page); // Assuming this returns the necessary info
            // console.log("[Agent] Accessibility Tree:", accessibilityTree); // Uncomment for deep debugging

            console.log("[Agent] Requesting next action from agent model...");
            // Pass current state (screenshot, goal, tree, errors, history) to the agent model
            const agentGuess = await runAgentGuess(screenshotPath, goal, accessibilityTree, errors, history);
            // console.log("[Agent] Raw Agent Guess:", JSON.stringify(agentGuess)); // Uncomment for deep debugging

            // Check for termination condition FIRST
            if (isTerminatingGuess(agentGuess)) {
                console.log("[Agent] Agent signaled termination.");
                agentTerminated = true;
                reproducible = isReproducableGuess(agentGuess); // Check if agent confirmed reproducibility
                if (agentGuess.content) {
                    const finalMessage = `[Agent] Agent Final Message: ${agentGuess.content}`;
                    console.log(finalMessage);
                    history.push(finalMessage);
                } else {
                    history.push("[Agent] Agent terminated without final message.");
                }
                break; // Exit the loop
            }

            // Log agent's reasoning/thought process if available
            if (agentGuess.content) {
                const agentThought = `[Agent] Agent Thought: ${agentGuess.content}`;
                console.log(agentThought);
                history.push(agentThought); // Add thought to history
            } else {
                console.log("[Agent] Agent did not provide a thought for this step.");
                history.push("[Agent] Agent provided action without explicit thought.");
            }

            // Execute the action proposed by the agent
            console.log("[Agent] Executing agent's suggested action(s)...");
            const executionErrors = await executeAgentGuess(agentGuess, page);

            if (executionErrors && executionErrors.length > 0) {
                console.warn("[Agent] Errors during action execution:", executionErrors);
                errors.push(...executionErrors);
                history.push(`[Agent] Action Execution Errors: ${executionErrors.join(', ')}`);
            } else {
                console.log("[Agent] Action(s) executed successfully.");
                history.push(`[Agent] Action Executed`);
            }
        } // --- End Agent Interaction Loop ---

        if (loopCounter >= MAX_LOOPS) {
            console.warn(`[Agent] Reached maximum loop limit (${MAX_LOOPS}). Terminating loop.`);
            errors.push("[Agent] Error: Reached maximum interaction limit.");
            agentTerminated = true;
            reproducible = false;
            history.push("[Agent] Reached maximum interaction limit.");
        }

    } catch (error) {
        console.error("\n[Agent] Critical Error during Agent Execution");
        console.error("[Agent] Error Details:", error.stack || error);
        errors.push(`[Agent] Critical Error: ${error.message || error}`);
        agentTerminated = false;
        reproducible = false; // Cannot assume reproducible if it crashed
    } finally {
        if (browser) {
            console.log("[Agent] Closing browser...");
            try {
                await browser.close();
                console.log("[Agent] Browser closed.");
            } catch (closeError) {
                console.error("[Agent] Error closing browser:", closeError.message);
            }
        } else {
            console.log("[Agent] Browser was not launched or already closed.");
        }
    }

    // --- Results ---
    console.log("\n[Agent] --- Execution Summary ---");
    console.log(`[Agent] Normal Termination: ${agentTerminated}`);
    console.log(`[Agent] Is bug reproducible (according to agent): ${reproducible}`);
    if (errors.length > 0) {
        console.log("[Agent] Errors Encountered:", errors);
    } else {
        console.log("[Agent] No errors reported during execution.");
    }
    console.log("[Agent] Execution History Steps:", history.length);
    // console.log("[Agent] Full History:", history); // Uncomment to see full history log

    return {
        reproducible: reproducible, // Define success more strictly? Or rely solely on agent's claim? Let's use the agent's claim for now.
        errors: errors,
        history: history
    };
}
