import dotenv from 'dotenv';
import path from 'path';
import { promises as fs } from 'fs';
import { reproduceBug, ReproductionResult } from "../src";

dotenv.config();

const startUrl = 'https://www.saucedemo.com/';

const bugReports: string[] = [
    `Bug Report 1
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
Priority: High`,
    `Bug Report 2
Date: 2023-10-26
Title: Login: Invalid error message displayed
Test Case ID: TC.Log.006
Description: Invalid error message displayed when user wants to login without input username and password.
Steps to reproduce:
    1. Launch http://saucedemo.com/
    2. Click on login button.
Expected result: System should display corresponding error message "Epic sadface: Username is required".
Actual result: System displays the message "Epic sadface: Username is required".
Severity: Medium
Priority: Low`,
    `Bug Report 3
Date: 2023-10-26
Title: Checkout: Invalid error message displayed
Test Case ID: TC.CO.002
Description: Invalid error message displayed when user wants to checkout without input form order.
Steps to reproduce:
    1. Precondition: User has logged in with standard_user.
    2. Precondition: User has added at least one item (e.g., Sauce Labs Backpack) to the cart.
    3. Navigate to the Cart page (/cart.html).
    4. Click checkout button.
    5. Click continue button without filling the form.
Expected result: System should display an error message "Error: First Name, Last Name and Postal Code are required".
Actual result: System displays the message "Error: First Name is required".
Severity: Medium
Priority: Low`,
    `Bug Report 4
Date: 2023-10-26
Title: Checkout: Invalid error message displayed (Missing Postal Code)
Test Case ID: TC.CO.006
Description: Invalid error message displayed when user wants to checkout with only First Name and Last Name.
Steps to reproduce:
    1. Precondition: User has logged in with standard_user.
    2. Precondition: User has added at least one item (e.g., Sauce Labs Backpack) to the cart.
    3. Navigate to the Cart page (/cart.html).
    4. Click checkout button.
    5. Enter First Name (e.g., 'Test').
    6. Enter Last Name (e.g., 'User').
    7. Click continue button (without Postal Code).
Expected result: System displays an error message "Error: Postal Code is required".
Actual result: System displays the error message "Error: Postal Code is required".
Severity: Medium
Priority: Low`,
    `Bug Report 5
Date: 2023-10-26
Title: Checkout: Invalid error message displayed (Missing Last Name)
Test Case ID: TC.CO.007
Description: Invalid error message displayed when user wants to checkout with only First Name and Postal Code.
Steps to reproduce:
    1. Precondition: User has logged in with standard_user.
    2. Precondition: User has added at least one item (e.g., Sauce Labs Backpack) to the cart.
    3. Navigate to the Cart page (/cart.html).
    4. Click checkout button.
    5. Enter First Name (e.g., 'Test').
    6. Enter Postal Code (e.g., '12345').
    7. Click continue button (without Last Name).
Expected result: System should display an error message "Error: Last Name is required".
Actual result: System displays the error message "Error: Last Name is required".
Severity: Medium
Priority: Low`,
    `Bug Report 6
Date: 2023-10-26
Title: Checkout: Invalid error message displayed (Missing First Name)
Test Case ID: TC.CO.008
Description: Invalid error message displayed when user wants to checkout with only Last Name and Postal Code.
Steps to reproduce:
    1. Precondition: User has logged in with standard_user.
    2. Precondition: User has added at least one item (e.g., Sauce Labs Backpack) to the cart.
    3. Navigate to the Cart page (/cart.html).
    4. Click checkout button.
    5. Enter Last Name (e.g., 'User').
    6. Enter Postal Code (e.g., '12345').
    7. Click continue button (without First Name).
Expected result: System should display an error message "Error: First Name is required".
Actual result: System displays the error message "Error: First Name is required".
Severity: Medium
Priority: Low`,
    `Bug Report 7
Date: 2023-10-26
Title: Checkout: Error message not showing after user input with invalid format
Test Case ID: TC.CO.009
Description: The error message 'Error: Postal Code is required' appeared instead of an invalid format error; the user could not proceed.
Steps to reproduce:
    1. Precondition: User has logged in with standard_user.
    2. Precondition: User has added at least one item (e.g., Sauce Labs Backpack) to the cart.
    3. Navigate to the Cart page (/cart.html).
    4. Click checkout button.
    5. Enter First Name (e.g., 'Test').
    6. Enter Last Name (e.g., 'User').
    7. Enter Postal Code with string format (e.g., 'abc').
    8. Click continue button.
Expected result: System should display an error message like "Error: Invalid Input: Postal Code must be a number".
Actual result: System stays on the checkout step one page with the form fields still filled, but no specific error message related to format is shown, nor does it proceed. (Verification needed - site behavior might differ)
Severity: Major
Priority: High`,
    `Bug Report 8
Date: 2023-10-26
Title: Checkout: The checkout button is enabled when the cart is empty.
Test Case ID: TC.CO.010
Description: The checkout button should be disabled when the user does not select any products at cart page, but it is enabled.
Steps to reproduce:
    1. Precondition: User has logged in with standard_user.
    2. Ensure the cart is empty (remove items if necessary).
    3. Navigate to the Cart page (/cart.html).
    4. Observe the checkout button.
Expected result: Checkout button must be disabled.
Actual result: Checkout button is enabled and clicking it navigates user to checkout-step-one page.
Severity: Major
Priority: High`
];

const baseOutputDir = path.join(__dirname, 'batch_outputs'); // Store all outputs in one subfolder
const logsDir = path.join(baseOutputDir, 'logs');
const screenshotsDir = path.join(baseOutputDir, 'screenshots');

async function runBatchExample() {
    console.log("--- Starting Batch Bug Reproduction ---");
    console.log(`Processing ${bugReports.length} bug reports...`);

    const apiKey = process.env.OPENAI_API_KEY;
    if (!apiKey) {
        console.error("FATAL: OPENAI_API_KEY not found in environment variables.");
        console.error("Ensure you have a .env file in the project root with OPENAI_API_KEY set.");
        process.exit(1);
    }
    console.log("OpenAI API Key loaded successfully.");

    try {
        await fs.mkdir(logsDir, { recursive: true });
        await fs.mkdir(screenshotsDir, { recursive: true });
        console.log(`Ensured output directories exist: ${baseOutputDir}`);
    } catch (err) {
        console.error("FATAL: Could not create output directories.", err);
        process.exit(1);
    }

    const resultsSummary: Array<{ index: number; title: string; result: ReproductionResult | { error: string } }> = [];
    const startTime = Date.now();

    for (const [index, report] of bugReports.entries()) {
        const reportNumber = index + 1;
        const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
        const reportTitleMatch = report.match(/Title: (.*)/);
        const reportTitle = reportTitleMatch ? reportTitleMatch[1].trim() : `Bug Report ${reportNumber}`;
        const safeTitle = reportTitle.replace(/[^a-z0-9_\-]/gi, '_').substring(0, 50);

        const logFileName = `batch_report_${reportNumber}_${safeTitle}_${timestamp}.json`;
        const screenshotFileName = `batch_report_${reportNumber}_${safeTitle}_screenshot.png`;
        const logFilePath = path.join(logsDir, logFileName);
        const screenshotPath = path.join(screenshotsDir, screenshotFileName);

        console.log(`\n--- [${reportNumber}/${bugReports.length}] Reproducing: "${reportTitle}" ---`);
        console.log(`   Log File: ${logFilePath}`);
        console.log(`   Screenshot File: ${screenshotPath}`);

        try {
            const result = await reproduceBug(startUrl, report, {
                headless: false,
                openaiApiKey: apiKey,
                logFilePath: logFilePath,
                screenshotPath: screenshotPath,
                model: "gpt-4o",
            });
            console.log(`\n   Result: Success=${result.success}, Reproducible=${result.reproducible}, Message=${result.message}`);
            resultsSummary.push({ index: reportNumber, title: reportTitle, result: result });

        } catch (error: any) {
            process.stdout.write('\n');
            console.error(`   --- ERROR Reproducing Report ${reportNumber}: "${reportTitle}" ---`);
            console.error(error.message || error);
            resultsSummary.push({ index: reportNumber, title: reportTitle, result: { error: error.message || String(error) } });
        }
    }

    const endTime = Date.now();
    const durationSeconds = ((endTime - startTime) / 1000).toFixed(2);
    console.log(`\n\n--- Batch Reproduction Finished (${durationSeconds}s) ---`);
    console.log("Summary:");

    let completedCount = 0;
    let reproducibleCount = 0;
    let failedCount = 0;

    for (const item of resultsSummary) {
        if (item.result && typeof item.result === 'object' && 'success' in item.result) {
            const resultData = item.result as ReproductionResult;
            completedCount++;

            if (resultData.reproducible) {
                reproducibleCount++;
            }

            console.log(`  - Report ${item.index} (${item.title}): ${resultData.success ? 'Completed' : 'Incomplete'}, Reproducible: ${resultData.reproducible}, Message: ${resultData.message}`);

            if (!resultData.success && resultData.error) {
                console.log(`      (Process Error: ${resultData.error})`);
            }
        }
        else if (item.result && typeof item.result === 'object' && 'error' in item.result) {
            failedCount++;
            const errorMsg = (item.result as { error: string }).error;
            console.log(`  - Report ${item.index} (${item.title}): FAILED (Caught Error: ${errorMsg})`);
        } else {
            failedCount++;
            console.log(`  - Report ${item.index} (${item.title}): FAILED (Unknown result structure)`);
        }
    }
    console.log(`\nTotal Reports: ${bugReports.length}`);
    console.log(`Successfully Completed Runs: ${completedCount}`);
    console.log(`Bugs Found (Reproducible by Agent): ${reproducibleCount}`);
    console.log(`Runs Failed (Caught Errors): ${failedCount}`);
    console.log(`Detailed logs and screenshots saved in: ${baseOutputDir}`);
}

runBatchExample();