import OpenAI from "openai";
import {
    ChatCompletionMessageParam,
    ChatCompletionTool,
    ChatCompletion,
    ChatCompletionMessageToolCall,
    ChatCompletionToolMessageParam,
} from "openai/resources/chat/completions";
import {getBase64Image} from "../utils/image";

interface AgentResponse {
    response: string | null;
    toolCalls: ChatCompletionMessageToolCall[] | undefined;
}

interface ToolResult {
    tool_call_id: string;
    result: string;
}

export class Agent {
    private chatHistory: ChatCompletionMessageParam[] = [];
    private model: string;
    private systemPrompt: string;
    private tools: ChatCompletionTool[] | undefined;
    private readonly openai: OpenAI;

    constructor(
        model: string,
        systemPrompt: string,
        tools?: ChatCompletionTool[]
    ) {
        this.model = model;
        this.systemPrompt = systemPrompt;
        this.tools = tools && tools.length > 0 ? tools : undefined;

        this.openai = new OpenAI();

        this.chatHistory.push({role: "system", content: this.systemPrompt});
        console.log("Agent initialized.");
    }

    /**
     * Updates the model used by the agent for subsequent calls.
     * @param newModel The new model identifier (e.g., "gpt-4o", "gpt-3.5-turbo").
     */
    setModel(newModel: string): void {
        console.log(`Agent model changed from "${this.model}" to "${newModel}".`);
        this.model = newModel;
    }

    /**
     * Updates the system prompt for the agent.
     * This replaces the original system prompt in the chat history
     * and will be used when the agent is reset.
     * Warning: Modifying the system prompt mid-conversation can affect consistency.
     * @param newSystemPrompt The new system prompt content.
     */
    setSystemPrompt(newSystemPrompt: string): void {
        console.warn(`Agent system prompt updated. This modifies the current chat history.`);
        this.systemPrompt = newSystemPrompt;
        const systemMessageIndex = this.chatHistory.findIndex(msg => msg.role === 'system');

        if (systemMessageIndex !== -1) {
            this.chatHistory[systemMessageIndex] = {role: "system", content: newSystemPrompt};
        } else {
            this.chatHistory.unshift({role: "system", content: newSystemPrompt});
        }
    }

    /**
     * Updates the tools available to the agent for subsequent calls.
     * @param newTools An array of tool definitions, or undefined/empty array to remove tools.
     */
    setTools(newTools?: ChatCompletionTool[]): void {
        this.tools = newTools && newTools.length > 0 ? newTools : undefined;
        const toolStatus = this.tools ? `Set ${this.tools.length} tools.` : "Tools removed.";
        console.log(`Agent tools updated. ${toolStatus}`);
    }

    /**
     * Sends a user message to the AI and gets the response.
     * Handles potential tool calls requested by the AI.
     * @param message The user's message content.
     * @param imagePath
     * @param toolResults
     * @returns An object containing the AI's text response and any tool calls.
     */
    async message(message: string, imagePath?: string, toolResults?: ToolResult[]): Promise<AgentResponse> {

        const toolMessages: ChatCompletionToolMessageParam[] = toolResults.map(toolResult => {
            return {
                role: "tool",
                tool_call_id: toolResult.tool_call_id,
                content: toolResult.result,
            };
        });
        this.chatHistory.push(...toolMessages);

        const imageBase64 = imagePath ? await getBase64Image(imagePath) : null;

        if (imageBase64) {
            this.chatHistory.push({
                role: 'user',
                content: [
                    {
                        type: 'text',
                        text: message,
                    },
                    {
                        type: 'image_url',
                        image_url: {
                            url: imageBase64,
                        },
                    },
                ],
            })
        } else {
            this.chatHistory.push({
                role: 'user',
                content: [
                    {
                        type: 'text',
                        text: message,
                    },
                ],
            })
        }

        return this.callOpenAI();
    }

    /**
     * Private helper method to make the actual API call and handle the response.
     * Avoids code duplication between message() and returnToolResponses().
     */
    private async callOpenAI(): Promise<AgentResponse> {
        try {
            const response: ChatCompletion = await this.openai.chat.completions.create({
                model: this.model,
                messages: this.chatHistory,
                tools: this.tools,
                tool_choice: this.tools ? "auto" : undefined,
            });

            const responseMessage = response.choices[0].message;

            if (responseMessage) {
                this.chatHistory.push(responseMessage);
            } else {
                console.warn("Received response with no message content.");
                return {response: null, toolCalls: undefined};
            }

            if (responseMessage.content) {
                console.log(`AI: ${responseMessage.content}`);
            }
            if (responseMessage.tool_calls) {
                console.log(`AI requested tool calls: ${JSON.stringify(responseMessage.tool_calls)}`);
            }

            return {
                response: responseMessage.content,
                toolCalls: responseMessage.tool_calls,
            };

        } catch (error) {
            console.error("Error calling OpenAI API:", error);
            if (this.chatHistory.length > 0) {
                const lastMessage = this.chatHistory[this.chatHistory.length - 1];
            }

            throw error;
        }
    }

    /**
     * Resets the chat history, keeping only the current system prompt.
     */
    reset(): void {
        this.chatHistory = [{role: "system", content: this.systemPrompt}];
        console.log("Agent history reset.");
    }

    /**
     * Gets the current chat history.
     * @returns A copy of the chat history array.
     */
    getHistory(): ChatCompletionMessageParam[] {
        return [...this.chatHistory];
    }
}
