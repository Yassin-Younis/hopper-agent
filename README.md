![411fe2e5-9900-42bf-bce4-9f2ab20fe2d3 (1)](https://github.com/user-attachments/assets/82d75e7c-9e3b-4ee2-8f78-63e5c16f8a10)

[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](https://opensource.org/licenses/MIT)

**Automated Bug Reproduction using LLMs and Playwright**

Inspired by Grace Hopper and the story of the "first actual case of bug being found," Hopper Agent aims to automate the often tedious process of reproducing bugs in web applications based on natural language bug reports. It uses Large Language Models (LLMs) like OpenAI's GPT series combined with the power of Playwright browser automation to navigate, interact, and verify bug conditions.

## Why Hopper Agent?

Manually reproducing bugs reported by users or QA can be:

*   **Time-consuming:** Following steps precisely takes time.
*   **Error-prone:** Humans can miss steps or interpret reports differently.
*   **Context-Switching Heavy:** Developers need to stop their current task to verify a bug.

Hopper Agent tackles this by:

*   **Automating** the reproduction steps.
*   **Parsing** natural language bug reports.
*   **Interacting** with web applications like a user.
*   **Providing** detailed execution logs and screenshots.
*   **Saving** valuable developer and QA time.

## Features ✨

*   **Natural Language Understanding:** Interprets bug reports to understand reproduction steps and expected/actual outcomes.
*   **Browser Automation:** Uses Playwright to launch browsers (Chromium, Firefox, WebKit - currently configured for Chromium) and perform actions.
*   **Intelligent Interaction:**
    *   Injects unique IDs onto interactive elements for reliable targeting.
    *   Uses visual context (screenshots) alongside accessibility information.
    *   Supports a range of browser actions (click, fill, scroll, navigate, select, etc.) via defined "tools".
*   **LLM Integration:** Leverages OpenAI's chat completion models (configurable, e.g., GPT-4o) for decision-making.
*   **State Management:** Maintains conversation history with the LLM.
*   **Tool Execution:** Maps LLM function calls to Playwright actions.
*   **Bug Verification:** Attempts to identify the state described in the bug report and reports if found or not found.
*   **Detailed Logging:** Saves a step-by-step JSON log of agent thoughts, actions, and results for each run.
*   **Screenshots:** Captures screenshots during the process.
*   **Batch Processing:** Includes examples for running multiple bug reports sequentially.

## How it Works (High-Level) ⚙️

1.  **Input:** Takes a starting URL and a natural language bug report.
2.  **Initialization:** Launches a Playwright browser, sets up an LLM agent instance with the specific bug report as the goal.
3.  **Label Injection:** Injects a script into the target page that identifies interactive elements and overlays unique IDs (`[data-interactive-id]`).
4.  **Interaction Loop:**
    *   **Capture State:** Takes a screenshot and extracts information about visible, interactive elements (using the injected IDs).
    *   **Prompt LLM:** Sends the current URL, element information, screenshot, and conversation history to the LLM, asking for the next best action to reproduce the bug.
    *   **Receive Plan:** Gets the LLM's reasoning and requested tool calls (e.g., `click`, `fill`).
    *   **Execute Tools:** Translates tool calls into Playwright commands acting on elements identified by their unique IDs.
    *   **Feedback:** Records the outcome (success/error) of the tool execution.
    *   **Repeat:** Sends the execution outcome back to the LLM in the next loop iteration.
5.  **Termination:** The loop ends when:
    *   The LLM calls the `reportFound` tool, believing the bug is reproduced.
    *   The LLM calls the `reportNotFound` tool, concluding it cannot be reproduced.
    *   A maximum number of iterations is reached.
    *   A critical error occurs.
6.  **Output:** Returns a result object summarizing success/failure and reproducibility, along with a detailed JSON log file.

## Prerequisites 📋

*   **Node.js:** (v18 or later recommended)
*   **npm** or **yarn**
*   **OpenAI API Key:** You need an API key from OpenAI.

## Installation & Setup 🚀

1.  **Clone the repository:**
    ```bash
    git clone https://github.com/Yassin-Younis/hopper-agent.git # Replace with your repo URL
    cd hopper-agent
    ```

2.  **Install dependencies:**
    ```bash
    npm install
    # or
    # yarn install
    ```

3.  **Install Playwright browsers:**
    (This downloads the necessary browser binaries)
    ```bash
    npx playwright install --with-deps # --with-deps installs needed OS libraries
    ```

4.  **Configure Environment Variables:**
    *   Create a `.env` file in the project root directory:
        ```bash
        cp .env.example .env
        ```
    *   Edit the `.env` file and add your OpenAI API key:
        ```env
        # .env
        OPENAI_API_KEY=your_openai_api_key_here
        ```
    *   **Important:** Ensure `.env` is listed in your `.gitignore` file to avoid committing secrets.

5.  **Compile TypeScript (Optional but Recommended):**
    ```bash
    npm run build
    ```
    This creates the JavaScript output in the `dist/` directory.

## Usage ▶️

You can run the provided examples:

1.  **Single Bug Report Example:**
    *   Uses `examples/example1.ts`.
    *   Runs in non-headless mode by default so you can watch the browser.
    *   Uses `dotenv` to load the API key.
    ```bash
    # Using ts-node (requires ts-node installation: npm i -g ts-node)
    npx ts-node examples/example1.ts

    # Or, after running `npm run build`:
    node dist/examples/example1.js
    ```

2.  **Batch Bug Report Example:**
    *   Uses `examples/example_batch.ts`.
    *   Runs multiple bug reports sequentially.
    *   Runs in headless mode by default for speed.
    *   Saves logs and screenshots to `examples/batch_outputs/`.
    ```bash
    # Using ts-node
    npx ts-node examples/example_batch.ts

    # Or, after running `npm run build`:
    node dist/examples/example_batch.js
    ```
    *(You can also use the `npm run start` and `npm run start_batch` scripts if configured in `package.json`)*

## Output 📝

*   **Console:** Status updates, agent thoughts (optional), tool execution info, and a final summary.
*   **Log Files:** Detailed JSON logs are saved (default location specified in examples, e.g., `examples/batch_outputs/logs/`). Each log file contains an array of interaction steps, including agent prompts, responses, tool calls, and results.
*   **Screenshots:** Screenshots are saved (default location specified in examples, e.g., `examples/batch_outputs/screenshots/`).

## Key Components 🧩

*   **Agent (`src/agent/index.ts`):** Manages the conversation history with the LLM, prepares prompts, sends requests to the OpenAI API, and processes responses.
*   **Tools (`src/agent/tools/`):**
    *   `definition.ts`: Defines the functions (tools) the LLM can call, including their names, descriptions, and parameter schemas (JSON Schema).
    *   `implementation.ts`: Contains the actual TypeScript/Playwright code that executes when a tool is called.
*   **Browser Interaction (`src/browser/labels.ts`):**
    *   `injectLabelsScript`: Client-side JavaScript injected into the page to find interactive elements, assign unique IDs, and display visual labels (for debugging).
    *   `extractElementsInfo`: Playwright-side function to retrieve the structured information about labeled elements for the LLM prompt.
*   **Core Logic (`src/core/logic.ts`):** Orchestrates the entire process: sets up the browser and agent, manages the main interaction loop, calls state capture and LLM prompting, triggers tool execution, handles logging, and manages cleanup.

## Limitations & Future Work 🚧

*   **LLM Costs & Latency:** API calls incur costs and add latency to each step.
*   **Complex UIs:** Very dynamic applications, complex Shadow DOM structures, or non-standard UI elements can challenge element identification and interaction.
*   **State Ambiguity:** The LLM might misinterpret the visual or accessibility state.
*   **Error Recovery:** Current error handling is basic; more sophisticated retry or alternative path logic could be added.
*   **Security:** Handling sensitive data (like login credentials in bug reports) requires careful consideration. Currently assumes test credentials.
*   **Determinism:** LLM responses can vary slightly even with low temperature.

**Potential Enhancements:**

*   Support for other LLM providers (Anthropic, Gemini).
*   More advanced state representation (e.g., summarizing visual changes).
*   Integration with testing frameworks (Jest, Vitest).
*   Tools for more complex interactions (e.g., date pickers, specific drag-and-drop patterns).
*   Better handling of dynamic waits and asynchronous UI updates.
*   UI for easier bug report submission and result viewing.

## Contributing 🤝

Contributions are welcome! Please feel free to open issues or submit pull requests.

## License 📜

This project is licensed under the MIT License - see the [LICENSE](LICENSE) file for details (or add one if missing).
