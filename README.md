![411fe2e5-9900-42bf-bce4-9f2ab20fe2d3 (1)](https://github.com/user-attachments/assets/82d75e7c-9e3b-4ee2-8f78-63e5c16f8a10)

[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](https://opensource.org/licenses/MIT)

# Hopper Agent

**Automated Bug Reproduction using LLMs and Playwright**

Inspired by Grace Hopper and the story of the "first actual case of bug being found," Hopper Agent aims to automate the often tedious process of reproducing bugs in web applications based on natural language bug reports. It uses Large Language Models (LLMs) like OpenAI's GPT series combined with the power of Playwright browser automation to navigate, interact, and verify bug conditions.

## Why Hopper Agent?

Manually reproducing bugs reported by users or QA can be:

*   **Time-consuming:** Following steps precisely takes time.
*   **Error-prone:** Humans can miss steps or interpret reports differently.
*   **Context-Switching Heavy:** Developers need to stop their current task to verify a bug.

Hopper Agent tackles this by:

*   **Automating** the reproduction steps from natural language.
*   **Interacting** with web applications like a user through browser automation.
*   **Providing** detailed execution logs and screenshots for analysis.
*   **Saving** valuable developer and QA time.

## Features ✨

*   **Natural Language Understanding:** Interprets bug reports to understand reproduction steps and expected/actual outcomes.
*   **Browser Automation:** Uses Playwright to launch browsers (Chromium, Firefox, WebKit - configured for Chromium in tests) and perform actions.
*   **Intelligent Interaction:**
    *   Injects unique IDs onto interactive elements for reliable targeting.
    *   Uses visual context (screenshots) alongside structured element information.
    *   Supports a range of browser actions (click, fill, scroll, navigate, select, etc.) via defined "tools".
*   **LLM Integration:** Leverages OpenAI's chat completion models (configurable, e.g., GPT-4o) for decision-making.
*   **State Management:** Maintains conversation history with the LLM to inform subsequent actions.
*   **Tool Execution:** Maps LLM function calls to Playwright actions.
*   **Bug Verification:** Attempts to identify the state described in the bug report and reports if found or not found.
*   **Detailed Logging:** Saves a step-by-step JSON log of agent thoughts, actions, and results for each run.
*   **Screenshots:** Captures screenshots during the process for visual debugging.
*   **Batch Processing:** Includes examples for running multiple bug reports sequentially.

## How it Works (High-Level) ⚙️

1.  **Input:** Takes a starting URL and a natural language bug report.
2.  **Initialization:** Launches a Playwright browser, sets up an LLM agent instance with the specific bug report as the goal.
3.  **Label Injection:** Injects a script into the target page that identifies visible, interactive elements and overlays unique IDs (`[data-interactive-id]`).
4.  **Interaction Loop:**
    *   **Capture State:** Takes a screenshot and extracts information about visible, interactive elements (using the injected IDs), along with recent console logs and network events.
    *   **Prompt LLM:** Sends the current URL, element information, screenshot, captured state data, and conversation history to the LLM, asking for the next best action to reproduce the bug.
    *   **Receive Plan:** Gets the LLM's reasoning and requested tool calls (e.g., `click`, `fill`, `check_browser_console`).
    *   **Execute Tools:** Translates tool calls into Playwright commands acting on elements identified by their unique IDs or executing inspection logic on captured state.
    *   **Feedback:** Records the outcome (success/error, result message) of the tool execution.
    *   **Repeat:** Sends the execution outcome back to the LLM in the next loop iteration.
5.  **Termination:** The loop ends when:
    *   The LLM calls a termination tool (`reportFound` or `reportNotFound`).
    *   A maximum number of iterations is reached.
    *   A critical execution error occurs.
6.  **Output:** Returns a result object summarizing success/failure and reproducibility, along with a detailed JSON log file and screenshots.

## Prerequisites 📋

*   **Node.js:** (v18 or later recommended)
*   **npm** or **yarn**
*   **OpenAI API Key:** You need an API key from OpenAI with access to models like `gpt-4o`.

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

## Running Tests 🧪

To run the automated test suite and evaluate the agent on the test bench:

1.  Ensure you have the testbench applications configured and running locally as specified in `/tests/testbench.json`. This typically involves cloning repositories and running their respective startup commands.
2.  Execute the test runner script:
    ```bash
    # Using ts-node
    npx ts-node tests/test_runner.ts

    # Or, after running `npm run build`:
    node dist/tests/test_runner.js
    ```
The test runner will output a summary of results to the console and save detailed logs and screenshots to the `./tests/test_run_outputs/` directory.

## Evaluation Results 📊

We evaluated Hopper Agent on a test bench comprising 28 distinct bug test cases across several simple web applications. Each test case involved running the agent against both a buggy version and a fixed version of the application to assess its ability to reproduce the bug and differentiate its presence.

The overall test suite results are summarized below:

*   **Total Test Cases Evaluated:** 28
*   **Total Execution Time:** 9727.11 seconds
*   **Average Time per Test Case (Buggy + Fixed runs):** $\approx$ 347.40 seconds
*   **Average Time per Individual Run:** $\approx$ 173.7 seconds

| Test Outcome | Count | Percentage |
| :----------- | :---- | :--------- |
| PASSED       | 5     | 17.9\%     |
| FAILED       | 15    | 53.6\%     |
| ERROR        | 8     | 28.6\%     |
| **Total**    | **28**| **100\%**  |

\
The outcomes reveal that while the agent successfully reproduced and differentiated 5 bugs (PASSED), a significant number of tests resulted in FAILED or ERROR statuses. A deeper analysis into the agent's reported reproducibility reveals more nuanced insights:

*   **Correctly Verified Fix (Buggy=True, Fixed=False):** 5 tests (PASSED)
*   **False Positive (Agent found bug in Fixed):** 11 tests (FAILED) - The agent reported the bug as reproducible in both the buggy and fixed versions.
*   **False Negative (Agent found bug in neither):** 4 tests (FAILED) - The agent reported the bug as not reproducible in either version.
*   **Buggy Reproduced, Fixed Run Errored:** 5 tests (ERROR) - The agent successfully reproduced the bug in the buggy version, but the run against the fixed version terminated prematurely (e.g., hitting the maximum loop limit) before the agent could report.
*   **Buggy Failed/Null, Fixed Errored:** 3 tests (ERROR) - The buggy run either reported False or errored, and the fixed run also errored.

\
Loop statistics for runs that completed with an agent result:

| Run Type | Count | Avg Loops | Min Loops | Max Loops |
| :--------- | :---- | :-------- | :-------- | :-------- |
| Buggy      | 21    | 8.75      | 3         | 28        |
| Fixed      | 20    | 7.50      | 2         | 11        |

\
These results highlight the challenges related to agent reliability (false positives/negatives) and efficiency (leading to ERRORs, especially the 5 cases where reproduction succeeded in buggy but fixed run errored).

## Key Components 🧩

*   **Agent (`src/agent/index.ts`):** Manages the conversation history with the LLM, prepares prompts including state information and screenshots, sends requests to the OpenAI API, and processes responses (text + tool calls).
*   **Tools (`src/agent/tools/`):**
    *   `definition.ts`: Defines the functions (tools) the LLM can call, including their names, descriptions, and parameter schemas (JSON Schema).
    *   `implementation.ts`: Contains the actual TypeScript/Playwright code that executes when a tool is called.
*   **Browser Interaction (`src/browser/labels.ts`):**
    *   `injectLabelsScript`: Client-side JavaScript injected into the page to find interactive elements, assign unique IDs, and display visual labels (helpful for debugging/understanding agent behavior).
    *   `extractElementsInfo`: Playwright-side function to retrieve the structured information about labeled elements, console logs, and network events for the LLM prompt.
*   **Core Logic (`src/core/logic.ts`):** Orchestrates the entire bug reproduction process: sets up the browser and agent, manages the main interaction loop, calls state capture and LLM prompting, triggers tool execution, handles logging, and manages cleanup.

## Limitations & Future Work 🚧

Based on our evaluation, key limitations include:

*   **Agent Reliability:** High rates of false positives and negatives indicate challenges in accurately interpreting bug reports and discerning subtle differences in application state between buggy and fixed versions.
*   **Efficiency & Robustness:** The frequency of runs hitting the maximum loop limit suggests inefficient exploration or difficulty navigating complex UI flows within constraints. Error recovery from unexpected states or tool failures also needs improvement.
*   **Generality:** Evaluation on a limited set of applications means performance on more complex or differently structured web applications is unknown.

\
**Future Work Directions:**

*   **Enhanced Bug Report Understanding:** Incorporate more sophisticated natural language processing to better parse and formalize bug report details into actionable goals and verification criteria for the agent.
*   **Improved Planning and Exploration:** Implement more intelligent planning algorithms and exploration strategies to guide the agent more efficiently towards reproducing the bug or confirming its absence.
*   **Advanced State Observation & Oracles:** Develop more robust mechanisms for detecting bug manifestations beyond simple visual or DOM cues, potentially using automated oracles that check specific data states, network responses, or console outputs relevant to the bug report.
*   **Test Bench Expansion:** Evaluate the system on a significantly larger and more diverse set of web applications and real-world bugs.
*   **Automated Test Case Generation:** Explore generating executable test scripts (e.g., Playwright, Cypress) directly from successful agent reproduction traces.
*   **Integration with APR:** Combine the automated bug reproduction capabilities with automated program repair techniques to create a more end-to-end automated bug fixing pipeline.

## Paper 📄

Our work on Hopper Agent has been accepted as a conference paper titled: **"Exploring Agentic Bug Reproduction for Web Based Applications"**.

[Read the paper here!](https://github.com/Yassin-Younis/hopper-agent/blob/main/Exploring_Agentic_Bug_Reproduction_for_Web_Based_Applications%20(1).pdf)

## License

This project is licensed under the MIT License - see the [LICENSE](LICENSE) file for details. % Ensure you have a LICENSE file in your repo.
