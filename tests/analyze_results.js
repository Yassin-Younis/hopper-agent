const fs = require('fs');
const path = require('path');

const jsonFilePath = '/Users/yassinyounis/WebstormProjects/hopper-agent/tests/test_run_outputs/test_run_2025-04-28T17-02-44-456Z/test_summary.json'; // <-- Update this path

try {
    // Read the JSON file content
    const jsonData = fs.readFileSync(jsonFilePath, 'utf8');

    // Parse the JSON data into a JavaScript array
    const testResults = JSON.parse(jsonData);

    // --- Initialize counters and data structures ---
    let totalCases = testResults.length;

    let statusCounts = {
        PASSED: 0,
        FAILED: 0,
        ERROR: 0,
        // Add other statuses if they exist in your data but aren't listed
    };

    let repoCounts = {}; // Count cases per repository
    let repoStatusCounts = {}; // Status counts per repository

    let buggyRunOutcomes = {
        totalRuns: 0,
        infraSuccess: 0, // Infrastructure success
        infraFailure: 0, // Infrastructure failure
        agentReproducible: 0,
        agentNotReproducible: 0,
        agentReproducibleNull: 0,
        runsWithAgentResult: 0,
        agentSuccess: 0, // Agent reported success
        agentFailure: 0 // Agent reported failure
    };

    let fixedRunOutcomes = {
        totalRuns: 0,
        infraSuccess: 0, // Infrastructure success
        infraFailure: 0, // Infrastructure failure
        agentReproducible: 0,
        agentNotReproducible: 0,
        agentReproducibleNull: 0,
        runsWithAgentResult: 0,
        agentSuccess: 0, // Agent reported success
        agentFailure: 0, // Agent reported failure
        agentMaxLoopLimitFailure: 0, // Specifically count fixed runs where AGENT failed due to max loop limit
    };

    let outcomeCombinations = {
        // Based on agent reproducible result (true/false/null) for runs *with agent results*
        'buggy=T/fixed=F': 0, // Ideal PASSED scenario
        'buggy=T/fixed=T': 0, // Bug still present - FAILED
        'buggy=F/fixed=F': 0, // Bug not reproduced - FAILED (potential test/agent issue)
        'buggy=F/fixed=T': 0, // Unexpected - potential new bug or flaky test - FAILED/ERROR
        'buggy=T/fixed=N': 0, // Buggy reproducible, Fixed result null (often infra fail or agent failure) - ERROR
        'buggy=F/fixed=N': 0, // Buggy not reproducible, Fixed result null - ERROR
        'buggy=N/fixed=T': 0, // Buggy result null, Fixed reproducible - ERROR
        'buggy=N/fixed=F': 0, // Buggy result null, Fixed not reproducible - ERROR
        'buggy=N/fixed=N': 0, // Both results null - ERROR
        // Cases where one side might not have an agentResult object at all
        'buggy=T/fixed=no_agent_result': 0,
        'buggy=F/fixed=no_agent_result': 0,
        'buggy=N/fixed=no_agent_result': 0,
        'buggy=no_agent_result/fixed=T': 0,
        'buggy=no_agent_result/fixed=F': 0,
        'buggy=no_agent_result/fixed=N': 0,
        'no_agent_result/no_agent_result': 0
    };

    let infraFailureTypes = {
        buggyOnly: 0,
        fixedOnly: 0,
        both: 0,
        none: 0
    };

    let errorMessages = {}; // Count occurrences of specific error messages

    let severityCounts = {}; // Count cases by reported severity
    let componentCounts = {}; // Count cases by reported component

    // Agent loop analysis (only for runs with agent results)
    let buggyLoops = [];
    let fixedLoops = [];

    // Regex to extract Severity and Component from bugReportSummary
    const severityRegex = /\*\*Severity\*\*: ([^\n]+)/;
    const componentRegex = /\*\*Component\*\*: ([^\n]+)/;

    // --- Iterate and analyze each test case ---
    testResults.forEach(testCase => {
        // Count by Status
        statusCounts[testCase.status] = (statusCounts[testCase.status] || 0) + 1;

        // Count by Repository and Status within Repo
        repoCounts[testCase.repo] = (repoCounts[testCase.repo] || 0) + 1;
        if (!repoStatusCounts[testCase.repo]) {
            repoStatusCounts[testCase.repo] = { PASSED: 0, FAILED: 0, ERROR: 0 }; // Initialize if needed
        }
        repoStatusCounts[testCase.repo][testCase.status] = (repoStatusCounts[testCase.repo][testCase.status] || 0) + 1;


        // Analyze Buggy Run
        buggyRunOutcomes.totalRuns++;
        if (testCase.buggyRun?.success) {
            buggyRunOutcomes.infraSuccess++;
            if (testCase.buggyRun.agentResult) {
                buggyRunOutcomes.runsWithAgentResult++;
                buggyRunOutcomes.agentSuccess += testCase.buggyRun.agentResult.success === true ? 1 : 0;
                buggyRunOutcomes.agentFailure += testCase.buggyRun.agentResult.success === false ? 1 : 0;

                if (testCase.buggyRun.agentResult.reproducible === true) {
                    buggyRunOutcomes.agentReproducible++;
                } else if (testCase.buggyRun.agentResult.reproducible === false) {
                    buggyRunOutcomes.agentNotReproducible++;
                } else if (testCase.buggyRun.agentResult.reproducible === null) {
                    buggyRunOutcomes.agentReproducibleNull++;
                }
                // Track loops for runs that produced an agent result
                const lastBuggyLoop = testCase.buggyRun.agentResult.history?.slice(-1)[0]?.loop;
                if (lastBuggyLoop !== undefined) {
                    buggyLoops.push(lastBuggyLoop);
                }
            }
        } else {
            buggyRunOutcomes.infraFailure++;
        }

        // Analyze Fixed Run
        fixedRunOutcomes.totalRuns++;
        if (testCase.fixedRun?.success) {
            fixedRunOutcomes.infraSuccess++;
            if (testCase.fixedRun.agentResult) {
                fixedRunOutcomes.runsWithAgentResult++;
                fixedRunOutcomes.agentSuccess += testCase.fixedRun.agentResult.success === true ? 1 : 0;
                fixedRunOutcomes.agentFailure += testCase.fixedRun.agentResult.success === false ? 1 : 0;


                if (testCase.fixedRun.agentResult.reproducible === true) {
                    fixedRunOutcomes.agentReproducible++;
                } else if (testCase.fixedRun.agentResult.reproducible === false) {
                    fixedRunOutcomes.agentNotReproducible++;
                } else if (testCase.fixedRun.agentResult.reproducible === null) {
                    fixedRunOutcomes.agentReproducibleNull++;
                    // Check for max loop limit message when agentResult.reproducible is null
                    // This condition is now decoupled from fixedRun.success
                    if (testCase.fixedRun.agentResult.message?.includes("Reached maximum loop limit")) {
                        fixedRunOutcomes.agentMaxLoopLimitFailure++;
                    }
                }

                // Track loops for runs that produced an agent result
                const lastFixedLoop = testCase.fixedRun.agentResult.history?.slice(-1)[0]?.loop;
                if (lastFixedLoop !== undefined) {
                    fixedLoops.push(lastFixedLoop);
                }
            }
        } else {
            fixedRunOutcomes.infraFailure++;
            // If fixedRun.success is false AND agentResult exists and message contains "Reached maximum loop limit",
            // this is also a max loop failure, but caught by the agentResult.success check below.
            // The primary indicator for agent failure due to max loops is agentResult.success: false
        }

        // Analyze Infrastructure Failures
        const buggyInfraOk = testCase.buggyRun?.success === true;
        const fixedInfraOk = testCase.fixedRun?.success === true;
        if (!buggyInfraOk && !fixedInfraOk) {
            infraFailureTypes.both++;
        } else if (!buggyInfraOk) {
            infraFailureTypes.buggyOnly++;
        } else if (!fixedInfraOk) {
            infraFailureTypes.fixedOnly++;
        } else {
            infraFailureTypes.none++;
        }


        // Analyze Outcome Combinations (based on agent reproducible status for runs *with agent results*)
        const buggyAgentRepro = testCase.buggyRun?.agentResult?.reproducible;
        const fixedAgentRepro = testCase.fixedRun?.agentResult?.reproducible;
        const buggyHasAgentResult = !!testCase.buggyRun?.agentResult;
        const fixedHasAgentResult = !!testCase.fixedRun?.agentResult;

        let outcomeKey = '?:?';

        if (buggyHasAgentResult && fixedHasAgentResult) {
            outcomeKey = `buggy=${buggyAgentRepro === true ? 'T' : (buggyAgentRepro === false ? 'F' : 'N')}/fixed=${fixedAgentRepro === true ? 'T' : (fixedAgentRepro === false ? 'F' : 'N')}`;
        } else if (buggyHasAgentResult) {
            outcomeKey = `buggy=${buggyAgentRepro === true ? 'T' : (buggyAgentRepro === false ? 'F' : 'N')}/fixed=no_agent_result`;
        } else if (fixedHasAgentResult) {
            outcomeKey = `buggy=no_agent_result/fixed=${fixedAgentRepro === true ? 'T' : (fixedAgentRepro === false ? 'F' : 'N')}`;
        } else {
            outcomeKey = 'no_agent_result/no_agent_result';
        }

        outcomeCombinations[outcomeKey] = (outcomeCombinations[outcomeKey] || 0) + 1;


        // Count Error Messages
        if (testCase.errorMessage) {
            errorMessages[testCase.errorMessage] = (errorMessages[testCase.errorMessage] || 0) + 1;
        }

        // Extract and Count Severity
        const severityMatch = testCase.bugReportSummary?.match(severityRegex);
        if (severityMatch && severityMatch[1]) {
            const severity = severityMatch[1].trim();
            severityCounts[severity] = (severityCounts[severity] || 0) + 1;
        } else {
            severityCounts['Unknown'] = (severityCounts['Unknown'] || 0) + 1;
        }

        // Extract and Count Component
        const componentMatch = testCase.bugReportSummary?.match(componentRegex);
        if (componentMatch && componentMatch[1]) {
            const component = componentMatch[1].trim();
            componentCounts[component] = (componentCounts[component] || 0) + 1;
        } else {
            componentCounts['Unknown'] = (componentCounts['Unknown'] || 0) + 1;
        }

    });

    // --- Calculate derived statistics ---
    const averageBuggyLoops = buggyLoops.length > 0 ? buggyLoops.reduce((sum, loop) => sum + loop, 0) / buggyLoops.length : 0;
    const minBuggyLoops = buggyLoops.length > 0 ? Math.min(...buggyLoops) : 0;
    const maxBuggyLoops = buggyLoops.length > 0 ? Math.max(...buggyLoops) : 0;

    const averageFixedLoops = fixedLoops.length > 0 ? fixedLoops.reduce((sum, loop) => sum + loop, 0) / fixedLoops.length : 0;
    const minFixedLoops = fixedLoops.length > 0 ? Math.min(...fixedLoops) : 0;
    const maxFixedLoops = fixedLoops.length > 0 ? Math.max(...fixedLoops) : 0;


    // --- Print Statistics and Insights ---
    console.log("--- Test Run Statistics and Insights ---");
    console.log(`Total Test Cases: ${totalCases}`);

    console.log("\nCases by Overall Status:");
    for (const status in statusCounts) {
        console.log(`  ${status}: ${statusCounts[status]}`);
    }

    console.log("\nCases by Repository:");
    // Sort repos alphabetically for consistent output
    Object.keys(repoCounts).sort().forEach(repo => {
        console.log(`  ${repo}: ${repoCounts[repo]} cases`);
        console.log(`    Status Breakdown: PASSED(${repoStatusCounts[repo]?.PASSED || 0}), FAILED(${repoStatusCounts[repo]?.FAILED || 0}), ERROR(${repoStatusCounts[repo]?.ERROR || 0})`);
    });


    console.log("\nCases by Reported Severity:");
    // Sort severities for consistent output
    Object.keys(severityCounts).sort().forEach(severity => {
        console.log(`  ${severity}: ${severityCounts[severity]}`);
    });

    console.log("\nCases by Reported Component:");
    // Sort components for consistent output
    Object.keys(componentCounts).sort().forEach(component => {
        console.log(`  ${component}: ${componentCounts[component]}`);
    });


    console.log("\nBuggy Run Outcomes:");
    console.log(`  Total Runs Attempted: ${buggyRunOutcomes.totalRuns}`);
    console.log(`  Infrastructure Success: ${buggyRunOutcomes.infraSuccess}`);
    console.log(`  Infrastructure Failure: ${buggyRunOutcomes.infraFailure}`);
    console.log(`  Runs with Agent Result: ${buggyRunOutcomes.runsWithAgentResult}`);
    console.log(`  Agent Reported Success: ${buggyRunOutcomes.agentSuccess}`);
    console.log(`  Agent Reported Failure: ${buggyRunOutcomes.agentFailure}`);
    console.log(`  Agent Reported Reproducible (true): ${buggyRunOutcomes.agentReproducible}`);
    console.log(`  Agent Reported Not Reproducible (false): ${buggyRunOutcomes.agentNotReproducible}`);
    console.log(`  Agent Result Reproducible=null: ${buggyRunOutcomes.agentReproducibleNull}`);
    console.log(`  Agent Max Loops (for runs with result): Avg=${averageBuggyLoops.toFixed(2)}, Min=${minBuggyLoops}, Max=${maxBuggyLoops}`);


    console.log("\nFixed Run Outcomes:");
    console.log(`  Total Runs Attempted: ${fixedRunOutcomes.totalRuns}`);
    console.log(`  Infrastructure Success: ${fixedRunOutcomes.infraSuccess}`);
    console.log(`  Infrastructure Failure: ${fixedRunOutcomes.infraFailure}`);
    console.log(`  Runs with Agent Result: ${fixedRunOutcomes.runsWithAgentResult}`);
    console.log(`  Agent Reported Success: ${fixedRunOutcomes.agentSuccess}`);
    console.log(`  Agent Reported Failure: ${fixedRunOutcomes.agentFailure}`);
    console.log(`  Agent Reported Reproducible (true): ${fixedRunOutcomes.agentReproducible}`);
    console.log(`  Agent Reported Not Reproducible (false): ${fixedRunOutcomes.agentNotReproducible}`);
    console.log(`  Agent Result Reproducible=null: ${fixedRunOutcomes.agentReproducibleNull}`);
    console.log(`  Agent Failed due to Max Loop Limit: ${fixedRunOutcomes.agentMaxLoopLimitFailure}`); // Renamed for clarity
    console.log(`  Agent Max Loops (for runs with result): Avg=${averageFixedLoops.toFixed(2)}, Min=${minFixedLoops}, Max=${maxFixedLoops}`);


    console.log("\nInfrastructure Failure Analysis:");
    console.log(`  Buggy Run Infra Only Failed: ${infraFailureTypes.buggyOnly}`);
    console.log(`  Fixed Run Infra Only Failed: ${infraFailureTypes.fixedOnly}`);
    console.log(`  Both Runs Infra Failed: ${infraFailureTypes.both}`);
    console.log(`  Neither Run Infra Failed: ${infraFailureTypes.none}`);


    console.log("\nAgent Reproducibility Outcome Combinations (for runs with Agent Results):");
    // Sort outcomes alphabetically for consistent output
    Object.keys(outcomeCombinations).sort().forEach(outcome => {
        if (outcomeCombinations[outcome] > 0) { // Only show combinations that occurred
            // Nicer formatting
            let [buggyPart, fixedPart] = outcome.split('/');
            let buggyStatus = buggyPart.split('=')[1];
            let fixedStatus = fixedPart.split('=')[1];
            console.log(`  Buggy Agent: ${buggyStatus}, Fixed Agent: ${fixedStatus}: ${outcomeCombinations[outcome]}`);
        }
    });

    console.log("\nSpecific Failure Insight (as requested):");
    const errorBuggyReproFixedMaxLoopCount = testResults.filter(testCase =>
        testCase.status === "ERROR" &&
        testCase.buggyRun?.agentResult?.reproducible === true &&
        testCase.fixedRun?.agentResult?.success === false && // Fixed Agent reported failure
        testCase.fixedRun?.agentResult?.reproducible === null && // Fixed Agent reproducible is null
        testCase.fixedRun?.agentResult?.message?.includes("Reached maximum loop limit") // Specific message
    ).length;
    console.log(`  Cases (Status: ERROR) where Buggy=Reproducible(true) AND Fixed Agent Failed due to Max Loop (reproducible=null): ${errorBuggyReproFixedMaxLoopCount}`);

    console.log("\nTop Error Messages (from testCase.errorMessage):");
    const sortedErrorMessages = Object.entries(errorMessages).sort(([, a], [, b]) => b - a);
    if (sortedErrorMessages.length > 0) {
        sortedErrorMessages.slice(0, 5).forEach(([msg, count]) => { // Show top 5
            console.log(`  "${msg.substring(0, 80)}${msg.length > 80 ? '...' : ''}" : ${count}`); // Truncate long messages nicely
        });
        if (sortedErrorMessages.length > 5) {
            console.log(`  ... and ${sortedErrorMessages.length - 5} more unique error messages.`);
        }
    } else {
        console.log("  No error messages recorded in the test summary.");
    }


} catch (error) {
    console.error(`Error reading or parsing JSON file: ${error.message}`);
    // If the file path is wrong, error.code might be 'ENOENT'
    if (error.code === 'ENOENT') {
        console.error(`Please ensure the file path is correct: ${jsonFilePath}`);
    }
}