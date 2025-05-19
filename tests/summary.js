const fs = require('fs');
const path = require('path');

const jsonFilePath = path.join(__dirname, 'testbench.json');
const htmlFilePath = path.join(__dirname, 'testbench_report.html');

try {
    console.log(`Reading data from ${jsonFilePath}...`);
    const rawData = fs.readFileSync(jsonFilePath, 'utf-8');
    const bugsData = JSON.parse(rawData);
    console.log(`Successfully parsed ${bugsData.length} bug entries.`);

    if (!Array.isArray(bugsData) || bugsData.length === 0) {
        console.log("Dataset is empty or not an array. No statistics to generate.");
        process.exit(0);
    }

    const totalBugs = bugsData.length;
    const repositories = new Set();
    const bugsPerRepo = {};
    const difficultyCounts = { Easy: 0, Medium: 0, Hard: 0, Unknown: 0 };
    let issueLinkCount = 0;
    let imageCount = 0;
    const commitPairCounts = new Map();
    const uniqueBuggyCommits = new Set();
    const uniqueFixedCommits = new Set();

    bugsData.forEach(bug => {
        const repoLink = bug['Git Link'];
        if (repoLink) {
            repositories.add(repoLink);
            bugsPerRepo[repoLink] = (bugsPerRepo[repoLink] || 0) + 1;
        }
        const difficulty = bug['Difficulty'];
        if (difficulty && difficultyCounts.hasOwnProperty(difficulty)) {
            difficultyCounts[difficulty]++;
        } else {
            difficultyCounts.Unknown++;
        }
        if (bug['Issue Link']) issueLinkCount++;
        if (bug['Bug Report Images'] && bug['Bug Report Images'].length > 0) imageCount++;
        const buggyHash = bug['Buggy Commit Hash'];
        const fixedHash = bug['Fixed Commit Hash'];
        if (buggyHash) uniqueBuggyCommits.add(buggyHash);
        if (fixedHash) uniqueFixedCommits.add(fixedHash);
        if (buggyHash && fixedHash && repoLink) {
            const key = `${repoLink}|${buggyHash}|${fixedHash}`;
            commitPairCounts.set(key, (commitPairCounts.get(key) || 0) + 1);
        }
    });

    const numUniqueRepos = repositories.size;
    let multiFixCommitInstances = 0;
    let totalBugsInMultiFixCommits = 0;
    commitPairCounts.forEach((count) => {
        if (count > 1) {
            multiFixCommitInstances++;
            totalBugsInMultiFixCommits += count;
        }
    });

    // Sort bugsPerRepo for charting
    const sortedRepos = Object.entries(bugsPerRepo)
        .sort(([, countA], [, countB]) => countB - countA);
    const repoLabels = sortedRepos.map(([repo]) => repo.split('/').pop().replace('.git', '')); // Use short names
    const repoData = sortedRepos.map(([, count]) => count);

    // Prepare difficulty data for chart
    const difficultyLabels = Object.keys(difficultyCounts).filter(k => difficultyCounts[k] > 0);
    const difficultyData = difficultyLabels.map(k => difficultyCounts[k]);

    // --- 3. Generate HTML Output ---

    // Using template literals for easier HTML construction
    const htmlContent = `
<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>Testbench Dataset Statistics Report</title>
    <script src="https://cdn.jsdelivr.net/npm/chart.js"></script>
    <style>
        body { font-family: sans-serif; margin: 20px; background-color: #f4f4f4; color: #333; }
        .container { max-width: 1200px; margin: auto; background: #fff; padding: 20px; border-radius: 8px; box-shadow: 0 0 10px rgba(0,0,0,0.1); }
        h1, h2 { text-align: center; color: #555; }
        .stats-grid { display: grid; grid-template-columns: repeat(auto-fit, minmax(250px, 1fr)); gap: 20px; margin-bottom: 30px; }
        .stat-card { background-color: #eef; padding: 15px; border-radius: 5px; text-align: center; }
        .stat-card .value { font-size: 1.5em; font-weight: bold; color: #0056b3; }
        .stat-card .label { font-size: 0.9em; color: #555; }
        .chart-container { margin-bottom: 40px; padding: 20px; background: #fff; border-radius: 5px; box-shadow: 0 0 5px rgba(0,0,0,0.05);}
        canvas { max-width: 100%; } /* Ensure charts are responsive */
    </style>
</head>
<body>
    <div class="container">
        <h1>📊 Testbench Dataset Statistics Report 📊</h1>

        <h2>Overall Summary</h2>
        <div class="stats-grid">
            <div class="stat-card">
                <div class="value">${totalBugs}</div>
                <div class="label">Total Bug Entries</div>
            </div>
            <div class="stat-card">
                <div class="value">${numUniqueRepos}</div>
                <div class="label">Unique Repositories</div>
            </div>
            <div class="stat-card">
                <div class="value">${uniqueBuggyCommits.size}</div>
                <div class="label">Unique Buggy Commits</div>
            </div>
            <div class="stat-card">
                <div class="value">${uniqueFixedCommits.size}</div>
                <div class="label">Unique Fixed Commits</div>
            </div>
            <div class="stat-card">
                <div class="value">${issueLinkCount} (${((issueLinkCount / totalBugs) * 100).toFixed(1)}%)</div>
                <div class="label">Entries with Issue Links</div>
            </div>
             <div class="stat-card">
                <div class="value">${imageCount} (${((imageCount / totalBugs) * 100).toFixed(1)}%)</div>
                <div class="label">Entries with Images</div>
            </div>
            <div class="stat-card">
                 <div class="value">${multiFixCommitInstances}</div>
                 <div class="label">(Repo, Buggy->Fixed) Pairs Fixing >1 Bug</div>
            </div>
             <div class="stat-card">
                 <div class="value">${totalBugsInMultiFixCommits}</div>
                 <div class="label">Bugs Fixed by Multi-Fix Commits</div>
            </div>
        </div>

        <h2>📈 Bugs per Repository</h2>
        <div class="chart-container">
            <canvas id="repoChart"></canvas>
        </div>

        <h2>⚖️ Bugs by Difficulty</h2>
        <div class="chart-container" style="max-width: 500px; margin-left: auto; margin-right: auto;">
             <canvas id="difficultyChart"></canvas>
        </div>

    </div>

    <script>
        // Embed data calculated by Node.js
        const repoLabels = ${JSON.stringify(repoLabels)};
        const repoData = ${JSON.stringify(repoData)};
        const difficultyLabels = ${JSON.stringify(difficultyLabels)};
        const difficultyData = ${JSON.stringify(difficultyData)};

        // Chart Colors (example)
        const backgroundColors = [
            'rgba(54, 162, 235, 0.6)', 'rgba(255, 99, 132, 0.6)', 'rgba(75, 192, 192, 0.6)',
            'rgba(255, 206, 86, 0.6)', 'rgba(153, 102, 255, 0.6)', 'rgba(255, 159, 64, 0.6)',
             'rgba(199, 199, 199, 0.6)', 'rgba(83, 102, 255, 0.6)', 'rgba(100, 255, 100, 0.6)'
        ];
        const borderColors = backgroundColors.map(color => color.replace('0.6', '1')); // Make border solid

        // Repository Chart (Bar)
        const ctxRepo = document.getElementById('repoChart').getContext('2d');
        const repoChart = new Chart(ctxRepo, {
            type: 'bar',
            data: {
                labels: repoLabels,
                datasets: [{
                    label: 'Number of Bugs',
                    data: repoData,
                    backgroundColor: backgroundColors.slice(0, repoData.length),
                    borderColor: borderColors.slice(0, repoData.length),
                    borderWidth: 1
                }]
            },
            options: {
                indexAxis: 'y', // Horizontal bars might be better if many repos
                scales: {
                    x: { beginAtZero: true }
                },
                plugins: { legend: { display: false } } // Hide legend as label is clear
            }
        });

        // Difficulty Chart (Pie)
        const ctxDifficulty = document.getElementById('difficultyChart').getContext('2d');
        const difficultyChart = new Chart(ctxDifficulty, {
            type: 'pie',
            data: {
                labels: difficultyLabels,
                datasets: [{
                    label: 'Bug Difficulty Distribution',
                    data: difficultyData,
                    backgroundColor: [ // Specific colors for difficulty often make sense
                         'rgba(75, 192, 192, 0.6)', // Easy - Teal
                         'rgba(255, 206, 86, 0.6)', // Medium - Yellow
                         'rgba(255, 99, 132, 0.6)',  // Hard - Red
                         'rgba(201, 203, 207, 0.6)'  // Unknown - Grey
                    ].slice(0, difficultyData.length), // Only take needed colors
                    borderColor: [
                        'rgba(75, 192, 192, 1)',
                        'rgba(255, 206, 86, 1)',
                        'rgba(255, 99, 132, 1)',
                        'rgba(201, 203, 207, 1)'
                    ].slice(0, difficultyData.length),
                    borderWidth: 1
                }]
            },
             options: {
                 responsive: true,
                 plugins: {
                     legend: { position: 'top' },
                     tooltip: {
                         callbacks: {
                             label: function(context) {
                                 let label = context.label || '';
                                 if (label) { label += ': '; }
                                 if (context.parsed !== null) {
                                     label += context.parsed;
                                     const total = context.dataset.data.reduce((a, b) => a + b, 0);
                                     const percentage = ((context.parsed / total) * 100).toFixed(1) + '%';
                                     label += \` (\${percentage})\`
                                 }
                                 return label;
                             }
                         }
                     }
                 }
             }
        });
    </script>
</body>
</html>
    `;
    fs.writeFileSync(htmlFilePath, htmlContent, 'utf-8');
    console.log(`\n📊 Report generated successfully! Open ${htmlFilePath} in your browser.`);

} catch (error) {
    // Improved Error Handling
    if (error.code === 'ENOENT' && error.path === jsonFilePath) {
        console.error(`\n❌ Error: Input file not found at ${jsonFilePath}`);
        console.error("Please make sure 'testbench.json' exists in the same directory as the script.");
    } else if (error instanceof SyntaxError) {
        console.error(`\n❌ Error: Invalid JSON format in ${jsonFilePath}.`);
        console.error(`   Details: ${error.message}`);
    } else {
        console.error(`\n❌ An unexpected error occurred:`);
        console.error(error);
    }
    process.exit(1);
}