import dotenv from 'dotenv';
import path from 'path';
import { reproduceBug, ReproductionResult } from "../src";

dotenv.config();

const startUrl = 'https://www.saucedemo.com/';
const bugReport = `Bug Report 1
Date: 2023-10-26
Title: Login: Inventory page display with invalid image products
Test Case ID: TC.Log.003
Description: Inventory page display with invalid image products using problem_user.
Steps to reproduce:
    1. Launch http://saucedemo.com/
    2. Enter username 'problem_user'.
    3. Enter password 'secret_sauce'.
    4. Click on login button.
Expected result: System should navigate user to inventory page with valid products.
Actual result: Inventory page displays with invalid image products.
Severity: Major
Priority: High`;

const logFileName = `example1_log_${new Date().toISOString().replace(/[:.]/g, '-')}.json`;
const logFilePath = path.join(__dirname, 'logs', logFileName);

async function runExample1() {
    console.log("--- Starting Bug Reproduction Example 1 ---");
    console.log(`Target URL: ${startUrl}`);
    console.log(`Log file will be saved to: ${logFilePath}`);

    const apiKey = process.env.OPENAI_API_KEY;
    if (!apiKey) {
        console.error("FATAL: OPENAI_API_KEY not found in environment variables.");
        console.error("Ensure you have a .env file in the project root with OPENAI_API_KEY set.");
        process.exit(1);
    }
    console.log("OpenAI API Key loaded successfully from environment."); // Confirmation

    try {
        const result: ReproductionResult = await reproduceBug(startUrl, bugReport, {
            headless: false,
            openaiApiKey: apiKey,
            logFilePath: logFilePath,
            model: "gpt-4o",
            screenshotPath: 'example1_screenshot.png',
        });

        console.log("\n--- Bug Reproduction Finished ---");
        console.log("Overall Success (Process Completed):", result.success);
        console.log("Bug Reproducible (Agent Decision):", result.reproducible);
        console.log("Final Message:", result.message);
        if (result.error) {
            console.error("Critical Error During Run:", result.error);
        }
        console.log(`Detailed logs available in: ${logFilePath}`);

    } catch (error) {
        console.error("\n--- UNHANDLED ERROR DURING REPRODUCTION ---");
        console.error(error);
    }
}

runExample1();