import { Page } from 'playwright';
import { ChatCompletionMessageToolCall } from "openai/resources/chat/completions";
import * as readline from 'node:readline/promises'; // Use promises interface
import { stdin as input, stdout as output } from 'node:process'; // Standard I/O streams
import { INTERACTIVE_ID_KEY, DEFAULT_ACTION_TIMEOUT_MS, DEFAULT_NAVIGATION_TIMEOUT_MS, LOG_PREFIX } from '../../common/constants';

export interface ToolExecutionResult {
    tool_call_id: string;
    success: boolean;
    result?: string;
    error?: string;
}

const getSelector = (id: string | number): string => `[${INTERACTIVE_ID_KEY}="${id}"]`;

async function tool_noop(args: any, page: Page): Promise<string> {
    const waitMs = args.wait_ms ?? 1000;
    await page.waitForTimeout(waitMs);
    return `Waited for ${waitMs}ms.`;
}

async function tool_send_msg_to_user(args: any, page: Page): Promise<string> {
    if (!args.text) throw new Error("Missing 'text' parameter for send_msg_to_user");

    const rl = readline.createInterface({ input, output });
    console.log(`\n${LOG_PREFIX} [Agent Message to User]: ${args.text}`);
    const userReply = await rl.question(`${LOG_PREFIX} [Your Reply]: `);
    rl.close();

    return `User replied: ${userReply}`;
}

async function tool_scroll(args: any, page: Page): Promise<string> {
    const delta_x = args.delta_x ?? 0;
    const delta_y = args.delta_y ?? 0;
    await page.evaluate(({ dx, dy }) => {
        window.scrollBy(dx, dy);
    }, { dx: delta_x, dy: delta_y });
    return `Scrolled by x:${delta_x}, y:${delta_y}.`;
}

async function tool_fill(args: any, page: Page): Promise<string> {
    if (!args.id || typeof args.value === 'undefined') throw new Error("Missing 'id' or 'value' parameter for fill");
    await page.locator(getSelector(args.id)).fill(args.value || '', { timeout: DEFAULT_ACTION_TIMEOUT_MS });
    return `Filled element [${args.id}]`;
}

async function tool_select_option(args: any, page: Page): Promise<string> {
    if (!args.id || !args.opts) throw new Error("Missing 'id' or 'opts' parameter for select_option");
    await page.locator(getSelector(args.id)).selectOption(args.opts || [], { timeout: DEFAULT_ACTION_TIMEOUT_MS });
    return `Selected options in [${args.id}]`;
}

async function tool_click(args: any, page: Page): Promise<string> {
    if (!args.id) throw new Error("Missing 'id' parameter for click");
    await page.locator(getSelector(args.id)).click({
        button: args.button || 'left',
        modifiers: args.modifiers || [],
        timeout: DEFAULT_ACTION_TIMEOUT_MS
    });
    return `Clicked element [${args.id}]`;
}

async function tool_dblclick(args: any, page: Page): Promise<string> {
    if (!args.id) throw new Error("Missing 'id' parameter for dblclick");
    await page.locator(getSelector(args.id)).dblclick({
        button: args.button || 'left',
        modifiers: args.modifiers || [],
        timeout: DEFAULT_ACTION_TIMEOUT_MS
    });
    return `Double-clicked element [${args.id}]`;
}

async function tool_hover(args: any, page: Page): Promise<string> {
    if (!args.id) throw new Error("Missing 'id' parameter for hover");
    await page.locator(getSelector(args.id)).hover({ timeout: DEFAULT_ACTION_TIMEOUT_MS });
    return `Hovered over element [${args.id}]`;
}

async function tool_press(args: any, page: Page): Promise<string> {
    if (!args.id || !args.key_comb) throw new Error("Missing 'id' or 'key_comb' parameter for press");
    await page.locator(getSelector(args.id)).press(args.key_comb, { timeout: DEFAULT_ACTION_TIMEOUT_MS });
    return `Pressed '${args.key_comb}' on element [${args.id}]`;
}

async function tool_focus(args: any, page: Page): Promise<string> {
    if (!args.id) throw new Error("Missing 'id' parameter for focus");
    await page.locator(getSelector(args.id)).focus({ timeout: DEFAULT_ACTION_TIMEOUT_MS });
    return `Focused element [${args.id}]`;
}

async function tool_clear(args: any, page: Page): Promise<string> {
    if (!args.id) throw new Error("Missing 'id' parameter for clear");
    await page.locator(getSelector(args.id)).fill('', { timeout: DEFAULT_ACTION_TIMEOUT_MS });
    return `Cleared element [${args.id}]`;
}

async function tool_drag_and_drop(args: any, page: Page): Promise<string> {
    if (!args.from_id || !args.to_id) throw new Error("Missing 'from_id' or 'to_id' parameter for drag_and_drop");
    await page.locator(getSelector(args.from_id)).dragTo(page.locator(getSelector(args.to_id)), { timeout: DEFAULT_ACTION_TIMEOUT_MS });
    return `Dragged [${args.from_id}] to [${args.to_id}]`;
}

async function tool_upload_file(args: any, page: Page): Promise<string> {
    if (!args.id || !args.file) throw new Error("Missing 'id' or 'file' parameter for upload_file");
    await page.locator(getSelector(args.id)).setInputFiles(args.file, { timeout: DEFAULT_ACTION_TIMEOUT_MS });
    return `Uploaded file(s) to [${args.id}]`;
}

async function tool_go_back(args: any, page: Page): Promise<string> {
    await page.goBack({ timeout: DEFAULT_NAVIGATION_TIMEOUT_MS });
    return "Navigated back";
}

async function tool_go_forward(args: any, page: Page): Promise<string> {
    await page.goForward({ timeout: DEFAULT_NAVIGATION_TIMEOUT_MS });
    return "Navigated forward";
}

async function tool_goto(args: any, page: Page): Promise<string> {
    if (!args.url) throw new Error("Missing 'url' parameter for goto");
    await page.goto(args.url, { timeout: DEFAULT_NAVIGATION_TIMEOUT_MS, waitUntil: 'domcontentloaded' });
    return `Navigated to ${args.url}`;
}

// Termination tools don't interact with the page, just return their reason.
async function tool_reportFound(args: any, page: Page): Promise<string> {
    const reason = args.reason || "Bug reported as found by agent.";
    console.log(`${LOG_PREFIX} Tool 'reportFound' called. Reason: ${reason}`);
    return `Bug reported as FOUND. Reason: ${reason}`;
}

async function tool_reportNotFound(args: any, page: Page): Promise<string> {
    const reason = args.reason || "Bug reported as not found by agent.";
    console.log(`${LOG_PREFIX} Tool 'reportNotFound' called. Reason: ${reason}`);
    return `Bug reported as NOT FOUND. Reason: ${reason}`;
}


// --- Tool Function Mapping ---
// Map tool names to their corresponding implementation functions
const toolImplementations: Record<string, (args: any, page: Page) => Promise<string>> = {
    "noop": tool_noop,
    "send_msg_to_user": tool_send_msg_to_user,
    "scroll": tool_scroll,
    "fill": tool_fill,
    "select_option": tool_select_option,
    "click": tool_click,
    "dblclick": tool_dblclick,
    "hover": tool_hover,
    "press": tool_press,
    "focus": tool_focus,
    "clear": tool_clear,
    "drag_and_drop": tool_drag_and_drop,
    "upload_file": tool_upload_file,
    "go_back": tool_go_back,
    "go_forward": tool_go_forward,
    "goto": tool_goto,
    "reportFound": tool_reportFound,
    "reportNotFound": tool_reportNotFound,
};

// --- Main Executor ---
/**
 * Executes a specific tool call requested by the LLM agent by dispatching
 * to the appropriate tool function.
 * @param toolCall The tool call object from the OpenAI response.
 * @param page The Playwright Page object to interact with.
 * @returns A Promise resolving to a ToolExecutionResult object.
 */
export async function executeTool(toolCall: ChatCompletionMessageToolCall, page: Page): Promise<ToolExecutionResult> {
    const functionName = toolCall.function.name;
    const toolCallId = toolCall.id;
    let args: any;

    console.log(`${LOG_PREFIX} Attempting to execute tool: ${functionName}`);

    try {
        args = JSON.parse(toolCall.function.arguments);
        console.log(`${LOG_PREFIX} Arguments: ${JSON.stringify(args)}`);
    } catch (parseError: any) {
        console.error(`${LOG_PREFIX} Error parsing arguments for tool ${functionName}: ${parseError.message}`);
        return {
            tool_call_id: toolCallId,
            success: false,
            error: `Failed to parse arguments: ${parseError.message}`
        };
    }

    const toolFunction = toolImplementations[functionName];

    if (!toolFunction) {
        console.error(`${LOG_PREFIX} Unknown tool function called: ${functionName}`);
        return {
            tool_call_id: toolCallId,
            success: false,
            error: `Unknown tool: ${functionName}`
        };
    }

    try {
        const resultMessage = await toolFunction(args, page);
        return {
            tool_call_id: toolCallId,
            success: true,
            result: resultMessage
        };
    } catch (error: any) {
        console.error(`${LOG_PREFIX} Error executing tool ${functionName} [${toolCallId}]:`, error.message);
        let errorMessage = error.message;
        if (error.name === 'TimeoutError') {
            errorMessage = `Action timed out after default timeout. Element [${args?.id}] might not be visible, interactable, or the page is slow.`;
        } else if (errorMessage.includes('selector resolved to') || errorMessage.includes('waiting for selector')) {
            errorMessage = `Element ${getSelector(args?.id || args?.from_id)} not found, not visible, or not interactable.`;
        } else if (errorMessage.includes('Target closed')) {
            errorMessage = 'The page or browser context was closed unexpectedly during the action.';
        }
        // Add specific error for missing required args if caught by tool function
        else if (errorMessage.startsWith("Missing '") && errorMessage.includes("' parameter")) {
            errorMessage = `Tool execution failed: ${errorMessage}`;
        } else {
            errorMessage = `Tool execution failed: ${errorMessage}`;
        }

        return {
            tool_call_id: toolCallId,
            success: false,
            error: errorMessage
        };
    }
}