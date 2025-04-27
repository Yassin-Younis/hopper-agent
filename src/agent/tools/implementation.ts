import {ChatCompletionMessageToolCall} from "openai/resources/chat/completions";

const ID_KEY = 'data-interactive-id';

async function executeTool(toolCall : ChatCompletionMessageToolCall, page) {
    // Parse the arguments if they are in JSON string format
    const functionName = toolCall.function.name;
    let args: any;
    try {
        args = JSON.parse(toolCall.function.arguments);
    } catch (parseError: any) {
        console.error(`Error parsing arguments for tool ${functionName}: ${parseError.message}`);
        return {success: false, status: "failed", error: `Failed to parse arguments: ${parseError.message}`};
    }

    console.log(`\nEXECUTING TOOL: ${functionName}`);
    console.log(`Arguments: ${JSON.stringify(args)}`);

    try {
        switch (functionName) {
            case "noop":
                return await noop(args);
            case "send_msg_to_user":
                return await sendMessageToUser(args);
            case 'scroll':
                await page.evaluate(({delta_x = 0, delta_y = 0}) => {
                    window.scrollBy(delta_x, delta_y);
                }, params);
                break;

            case 'fill':
                await page.fill(`[${ID_KEY}="${params?.id}"]`, params?.value || '', {timeout: 2000});
                break;

            case 'select_option':
                await page.selectOption(`[${ID_KEY}="${params?.id}"]`, params?.opts || [], {timeout: 2000});
                break;

            case 'click':
                await page.click(`[${ID_KEY}="${params?.id}"]`, {
                    button: params?.button || 'left',
                    modifiers: params?.modifiers || [],
                    timeout: 2000
                });
                break;

            case 'dblclick':
                await page.dblclick(`[${ID_KEY}="${params?.id}"]`, {
                    button: params?.button || 'left',
                    modifiers: params?.modifiers || [],
                    timeout: 2000
                });
                break;

            case 'hover':
                await page.hover(`[${ID_KEY}="${params?.id}"]`, {timeout: 2000});
                break;

            case 'press':
                if (!params?.key_comb) throw new Error(`Missing 'key_comb' parameter for press action`);
                await page.press(`[${ID_KEY}="${params.id}"]`, params.key_comb, {timeout: 2000});
                break;

            case 'focus':
                await page.focus(`[${ID_KEY}="${params?.id}"]`, {timeout: 2000});
                break;

            case 'clear':
                await page.fill(`[${ID_KEY}="${params?.id}"]`, '', {timeout: 2000});
                break;

            case 'drag_and_drop':
                await page.dragAndDrop(`[${ID_KEY}="${params?.from_id}"]`, `[${ID_KEY}="${params?.to_id}"]`, {timeout: 2000});
                break;

            case 'upload_file':
                await page.setInputFiles(`[${ID_KEY}="${params?.id}"]`, params?.file || [], {timeout: 2000});
                break;

            case 'go_back':
                await page.goBack({timeout: 2000});
                break;

            case 'go_forward':
                await page.goForward({timeout: 2000});
                break;

            case 'goto':
                if (!params?.url) throw new Error(`Missing 'url' parameter for goto action`);
                await page.goto(params.url, {timeout: 2000});
                break;

            case 'reportFound':
                console.log("BUG WAS REPLICATED")
                break;

            case 'reportNotFound':
                console.log("BUG IS NOT REPRODUCIBLE")
                break;

            default:
                throw new Error(`Unknown action: ${action}. Please use a valid action.`);
            default:
                console.error(`Unknown tool function called: ${functionName}`);
                return {success: false, status: "failed", error: `Unknown tool: ${functionName}`};
        }
    } catch (error: any) {
        console.error(`Error executing tool ${functionName}:`, error);
        const errorMessage = error.code === 'ENOENT' ? `File or command not found (${error.path || error.syscall})` : error.message;
        return {success: false, status: "failed", error: `Tool execution failed: ${errorMessage}`};
    }
}

const noop = async () => {
    const res = await page.waitForTimeout(params?.wait_ms || 2000);
}

// other functions

