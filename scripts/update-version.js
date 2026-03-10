const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');

const versionFilePath = path.join(__dirname, '../src/lib/version.json');

function updateVersion() {
    let versionData = { version: "0.1.0", buildTime: "", commitSha: "" };

    if (fs.existsSync(versionFilePath)) {
        const rawData = fs.readFileSync(versionFilePath, 'utf8');
        try {
            versionData = JSON.parse(rawData);
        } catch (e) {
            console.error("Error parsing version.json, starting fresh.");
        }
    }

    // Increment version
    const versionParts = versionData.version.split('.');
    const patch = parseInt(versionParts[2] || "0", 10) + 1;
    versionData.version = `${versionParts[0] || "0"}.${versionParts[1] || "1"}.${patch}`;

    // Update build time
    versionData.buildTime = new Date().toISOString();

    // Get commit SHA
    try {
        const sha = execSync('git rev-parse --short HEAD').toString().trim();
        versionData.commitSha = sha;
    } catch (e) {
        console.warn("Could not get git commit SHA, defaulting to 'unknown'");
        versionData.commitSha = "unknown";
    }

    fs.writeFileSync(versionFilePath, JSON.stringify(versionData, null, 4));
    console.log(`Updated version to ${versionData.version}`);
}

updateVersion();
