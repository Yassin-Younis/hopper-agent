// src/agent/index.ts
import OpenAI from "openai";
import {
    ChatCompletionMessageParam,
    ChatCompletionTool,
    ChatCompletion,
    ChatCompletionMessageToolCall,
    ChatCompletionToolMessageParam,
    ChatCompletionContentPart,
    ChatCompletionUserMessageParam,
} from "openai/resources/chat/completions";
import { getBase64Image } from "../utils/image";
import { LOG_PREFIX, DEFAULT_MODEL } from "../common/constants";
import { ToolExecutionResult } from "./tools/implementation";

export interface AgentResponse {
    response: string | null;
    toolCalls: ChatCompletionMessageToolCall[] | undefined;
}

export interface AgentConfig {
    apiKey?: string;
    model?: string;
    systemPromptGenerator: (bugReport: string) => string;
    tools?: ChatCompletionTool[];
    maxHistoryLength?: number;
}

export class Agent {
    private chatHistory: ChatCompletionMessageParam[] = [];
    private model: string;
    private systemPromptGenerator: (bugReport: string) => string;
    private tools: ChatCompletionTool[] | undefined;
    private readonly openai: OpenAI;
    private maxHistoryLength: number | undefined;
    private currentSystemPrompt: string | null = null;

    constructor(config: AgentConfig) {
        this.model = config.model || DEFAULT_MODEL;
        this.systemPromptGenerator = config.systemPromptGenerator;
        this.tools = config.tools && config.tools.length > 0 ? config.tools : undefined;
        this.maxHistoryLength = config.maxHistoryLength;

        this.openai = new OpenAI({ apiKey: config.apiKey });

        console.log(`${LOG_PREFIX} Agent initialized with model ${this.model}.`);
    }

    /**
     * Starts a new bug reproduction task, setting the system prompt
     * and clearing previous history.
     * @param bugReport The bug report text.
     */
    public startNewTask(bugReport: string): void {
        this.currentSystemPrompt = this.systemPromptGenerator(bugReport);
        this.chatHistory = [{ role: "system", content: this.currentSystemPrompt }];
        console.log(`${LOG_PREFIX} Agent starting new task. System prompt set.`);
    }

    /**
     * Sends the current context (user message, optional image, optional tool results)
     * to the AI and gets the next action plan.
     * @param userMessage The user's message content (e.g., describing current state).
     * @param imagePath Optional path to a screenshot image.
     * @param toolResults Optional results from previous tool executions.
     * @returns An object containing the AI's text response and any tool calls.
     */
    public async getNextAction(
        userMessage: string,
        imagePath?: string,
        toolResults?: ToolExecutionResult[]
    ): Promise<AgentResponse> {

        if (!this.currentSystemPrompt) {
            throw new Error(`${LOG_PREFIX} Agent task not started. Call startNewTask(bugReport) first.`);
        }

        if (toolResults && toolResults.length > 0) {
            const toolMessages: ChatCompletionToolMessageParam[] = toolResults.map(toolResult => ({
                role: "tool",
                tool_call_id: toolResult.tool_call_id,
                content: toolResult.success
                    ? toolResult.result || "Tool executed successfully."
                    : `Error: ${toolResult.error || "Tool execution failed."}`,
            }));
            this.chatHistory.push(...toolMessages);
        }

        const userContent: ChatCompletionContentPart[] = [{ type: 'text', text: userMessage }];
        if (imagePath) {
            try {
                const imageBase64 = await getBase64Image(imagePath);
                userContent.push({
                    type: 'image_url',
                    image_url: { url: imageBase64, detail: "auto" }, // Use auto detail
                });
                console.log(`${LOG_PREFIX} Added screenshot to agent message.`);
            } catch (imgError) {
                console.error(`${LOG_PREFIX} Failed to add image to agent message:`, imgError);
                userContent.push({type: 'text', text: "\n[System Note: Failed to load screenshot.]"});
            }
        }

        const userMessageParam: ChatCompletionUserMessageParam = {
            role: 'user',
            content: userContent,
        };
        this.chatHistory.push(userMessageParam);

        this.trimHistory();

        return this.callOpenAI();
    }

    /**
     * Private helper method to make the actual API call.
     */
    private async callOpenAI(): Promise<AgentResponse> {
        console.log(`${LOG_PREFIX} Calling OpenAI API (${this.model}). History length: ${this.chatHistory.length}`);
        try {
            const response: ChatCompletion = await this.openai.chat.completions.create({
                model: this.model,
                messages: this.chatHistory,
                tools: this.tools,
                tool_choice: this.tools ? "required" : undefined,
            });

            const responseMessage = response.choices[0].message;

            if (!responseMessage) {
                console.warn(`${LOG_PREFIX} Received response with no message content.`);
                throw new Error("OpenAI response was empty.");
            }

            this.chatHistory.push(responseMessage);

            if (responseMessage.content) {
                console.log(`${LOG_PREFIX} AI Response: ${responseMessage.content}`);
            }
            if (responseMessage.tool_calls) {
                console.log(`${LOG_PREFIX} AI requested tool calls: ${responseMessage.tool_calls.length}`);
                responseMessage.tool_calls.forEach(tc => console.log(`  - ${tc.function.name}(${tc.function.arguments})`));
            }

            return {
                response: responseMessage.content,
                toolCalls: responseMessage.tool_calls,
            };

        } catch (error: any) {
            console.error(`${LOG_PREFIX} Error calling OpenAI API:`, error);
            if (this.chatHistory.length > 1 && this.chatHistory[this.chatHistory.length - 1].role === 'user') {
                console.warn(`${LOG_PREFIX} Removing last user message from history due to API error.`);
                this.chatHistory.pop();
            }
            throw error;
        }
    }

    /**
     * Trims the chat history if it exceeds the maximum length, preserving the system prompt.
     */
    private trimHistory(): void {
        if (this.maxHistoryLength && this.chatHistory.length > this.maxHistoryLength) {
            console.log(`${LOG_PREFIX} Trimming chat history from ${this.chatHistory.length} to ${this.maxHistoryLength}`);
            const SystemPrompt = this.chatHistory[0];
            const messagesToKeep = this.chatHistory.slice(-(this.maxHistoryLength -1));
            this.chatHistory = [SystemPrompt, ...messagesToKeep];
        }
    }

    /**
     * Gets the current chat history.
     * @returns A copy of the chat history array.
     */
    public getHistory(): ChatCompletionMessageParam[] {
        return JSON.parse(JSON.stringify(this.chatHistory));
    }

    /**
     * Updates the model used by the agent for *subsequent* calls.
     * @param newModel The new model identifier (e.g., "gpt-4o", "gpt-3.5-turbo").
     */
    public setModel(newModel: string): void {
        console.log(`${LOG_PREFIX} Agent model changed from "${this.model}" to "${newModel}".`);
        this.model = newModel;
    }

    /**
     * Updates the tools available to the agent for *subsequent* calls.
     * @param newTools An array of tool definitions, or undefined/empty array to remove tools.
     */
    public setTools(newTools?: ChatCompletionTool[]): void {
        this.tools = newTools && newTools.length > 0 ? newTools : undefined;
        const toolStatus = this.tools ? `Set ${this.tools.length} tools.` : "Tools removed.";
        console.log(`${LOG_PREFIX} Agent tools updated. ${toolStatus}`);
    }
}