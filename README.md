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
    *   Injects unique IDs onto interactive elements for reliable targeting (Dynamic Element Labeling).
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
3.  **Label Injection:** Injects a script into the target page that identifies visible, interactive elements and overlays unique IDs (`[data-interactive-id]`). This is our Dynamic Element Labeling mechanism.
4.  **Interaction Loop:**
    *   **Capture State (Observation):** Takes a screenshot and extracts information about visible, interactive elements (using the injected IDs), along with recent console logs and network events.
    *   **Prompt LLM (Reasoning):** Sends the current URL, element information, screenshot, captured state data, and conversation history to the LLM, asking for the next best action to reproduce the bug.
    *   **Receive Plan (Action):** Gets the LLM's reasoning and requested tool calls (e.g., `click`, `fill`, `check_browser_console`).
    *   **Execute Tools:** Translates tool calls into Playwright commands acting on elements identified by their unique IDs or executing inspection logic on captured state.
    *   **Feedback:** Records the outcome (success/error, result message) of the tool execution.
    *   **Repeat:** Sends the execution outcome back to the LLM in the next loop iteration.
5.  **Termination:** The loop ends when:
    *   The LLM calls a termination tool (`reportFound` or `reportNotFound`).
    *   A maximum number of iterations (MAX_AGENT_LOOPS) is reached.
    *   A critical execution error occurs.
6.  **Output:** Returns a result object summarizing success/failure and reproducibility, along with a detailed JSON log file and screenshots.

## Prerequisites 📋

*   **Node.js:** (v18 or later recommended)
*   **npm** or **yarn**
*   **OpenAI API Key:** You need an API key from OpenAI with access to models like `gpt-4o`.

## Installation & Setup 🚀

1.  **Clone the repository:**
    ```bash
    git clone https://github.com/Yassin-Younis/hopper-agent.git
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

We evaluated Hopper Agent on a test bench comprising 28 distinct bug test cases across several simple web applications. Each test case involved running the agent against both a buggy version and a fixed version of the application (total 56 individual runs) to assess its ability to reproduce the bug and differentiate its presence.

The overall test suite results (for the 28 test cases) are summarized below:

*   **Total Test Cases Evaluated:** 28
*   **Total Execution Time (for all 56 runs):** Approximately 9000 seconds
*   **Average Time per Test Case (Buggy + Fixed runs):** About 321 seconds
*   **Average Time per Individual Run:** About 161 seconds

| Test Outcome | Count | Percentage |
| :----------- | :---- | :--------- |
| PASSED       | 10    | 35.7%      |
| FAILED       | 15    | 53.6%      |
| ERROR        | 3     | 10.7%      |
| **Total**    | **28**| **100%**   |

<br/>

To understand these outcomes better, here's a breakdown based on the agent's reports for the buggy and fixed versions of each application (referencing Table III in the paper):

*   **Correctly Verified Fix (PASSED): 10 cases**
    *   Agent reported: Buggy Version = `reproducible: true`, Fixed Version = `reproducible: false`.
*   **False Positive - Bug reported in Fixed Version (FAILED): 10 cases**
    *   Agent reported: Buggy Version = `reproducible: true`, Fixed Version = `reproducible: true`.
*   **False Negative - Bug missed in Buggy Version (FAILED): 5 cases**
    *   Agent reported: Buggy Version = `reproducible: false` (and Fixed Version = `reproducible: false`).
*   **Execution Errors (ERROR): 3 cases**
    *   These were primarily due to the agent timing out (hitting `MAX_AGENT_LOOPS`) during the run on the **fixed version**, after successfully identifying the bug in the buggy version (Buggy Version = `reproducible: true`, Fixed Version = N/A due to error).

<br/>

The agent's performance on individual runs (referencing Table II in the paper):

*   **Buggy Version Runs (28 total):**
    *   The agent reported `reproducible: true` in **23 out of 28** buggy runs (approx. 82.1%).
    *   The agent reported `reproducible: false` in **5 out of 28** buggy runs (these are the False Negatives).
*   **Fixed Version Runs (28 total, 25 completed with an agent result):**
    *   The agent reported `reproducible: true` in **10 out of 25** completed fixed runs (these are the False Positives when the buggy version was also True).
    *   The agent reported `reproducible: false` in **15 out of 25** completed fixed runs.
    *   *(The 3 ERROR cases account for fixed runs not completing with an agent result).*

Loop statistics for runs that completed with an agent result:

| Run Type                  | Count of Runs with Agent Result | Avg Loops | Min Loops | Max Loops |
| :------------------------ | :------------------------------ | :-------- | :-------- | :-------- |
| Buggy Runs                | 28                              | 9.46      | 3         | 28        |
| Fixed Runs                | 25                              | 7.70      | 2         | 11        |

<br/>

These results indicate that while the agent shows promise (successfully differentiating 10 bugs and identifying bugs in over 80% of buggy versions), challenges remain, particularly with false positives in fixed versions and occasional execution timeouts.

## Key Components 🧩

*   **Agent (`src/agent/index.ts`):** Manages the conversation history with the LLM, prepares prompts including state information and screenshots, sends requests to the OpenAI API, and processes responses (text + tool calls).
*   **Tools (`src/agent/tools/`):**
    *   `definition.ts`: Defines the functions (tools) the LLM can call, including their names, descriptions, and parameter schemas (JSON Schema).
    *   `implementation.ts`: Contains the actual TypeScript/Playwright code that executes when a tool is called.
*   **Browser Interaction (`src/browser/labels.ts`):**
    *   `injectLabelsScript`: Client-side JavaScript injected into the page to find interactive elements, assign unique IDs, and display visual labels (helpful for debugging/understanding agent behavior). This is a key part of our Dynamic Element Labeling.
    *   `extractElementsInfo`: Playwright-side function to retrieve the structured information about labeled elements, console logs, and network events for the LLM prompt.
*   **Core Logic (`src/core/logic.ts`):** Orchestrates the entire bug reproduction process: sets up the browser and agent, manages the main interaction loop, calls state capture and LLM prompting, triggers tool execution, handles logging, and manages cleanup.

## Limitations & Future Work 🚧

Based on our evaluation, key limitations and challenges include:

*   **Agent Reliability - False Positives:** A high rate (10 out of 28 cases, or 35.7% of all tests) of false positives, where the agent incorrectly reported the bug as present in the *fixed* application versions. This suggests difficulty in precisely discerning the absence of a bug or interpreting normal application behavior.
*   **Agent Reliability - False Negatives:** The agent failed to reproduce an existing bug in 5 buggy versions (17.9% of all tests), indicating challenges in accurately following reproduction steps or correctly identifying bug symptoms even when present.
*   **Execution Efficiency & Robustness:** The 3 ERROR cases (10.7% of all tests, attributed to agent timeouts on fixed runs) highlight the need for improved agent efficiency and accuracy. While average loops are reasonable for successful runs, unrecoverable states or timeouts can still occur.
*   **Test Bench & Generality:** The evaluation was conducted on a specific set of 28 bugs in relatively simple applications. Performance on more complex, production-level applications and a wider variety of bug types needs further investigation.
*   **LLM Dependency & Oracle:** The system's performance is tied to the underlying LLM's capabilities (e.g., GPT-4o), and the bug detection relies on the LLM's interpretation rather than a more objective, external oracle.

<br/>

**Future Work Directions:**

*   **Enhanced Bug Report Understanding:** Incorporate more sophisticated natural language processing and LLM prompting techniques to better parse and formalize bug report details into actionable goals and verification criteria for the agent.
*   **Improved Planning and Exploration:** Implement more intelligent planning algorithms, fine-tuning strategies, and exploration strategies (e.g., error recovery mechanisms) to guide the agent more efficiently towards reproducing the bug or confirming its absence, reducing timeouts.
*   **Advanced State Observation & Oracles:** Develop more robust and potentially domain-specific mechanisms for detecting bug manifestations beyond simple visual or DOM cues, potentially using automated oracles that check specific data states, network responses, or console outputs relevant to the bug report.
*   **Test Bench Expansion:** Evaluate the system on a significantly larger and more diverse set of web applications, UI patterns, web technologies, and real-world bugs.
*   **Automated Test Case Generation:** Explore generating executable test scripts (e.g., Playwright, Cypress) directly from successful agent reproduction traces.
*   **Integration with APR:** Investigate the integration of such a system with automated program repair tools to create a more end-to-end automated bug fixing pipeline.

## Paper 📄

Our work on Hopper Agent has been presented in the paper titled: **"Exploring Agentic Bug Reproduction for Web Based Applications"**.

[Read the paper here!](https://github.com/Yassin-Younis/hopper-agent/blob/main/Exploring_Agentic_Bug_Reproduction_for_Web_Based_Applications%20(1).pdf)

## License

This project is licensed under the MIT License - see the [LICENSE](LICENSE) file for details.
