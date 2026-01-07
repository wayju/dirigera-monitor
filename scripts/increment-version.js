#!/usr/bin/env node

const fs = require('fs');
const path = require('path');

const versionFiles = [
  'apps/dashboard/src/version.json',
  'apps/collector/src/version.json',
];

let anyChanged = false;

for (const file of versionFiles) {
  const filePath = path.join(process.cwd(), file);

  if (!fs.existsSync(filePath)) {
    console.log(`Skipping ${file} (not found)`);
    continue;
  }

  const content = JSON.parse(fs.readFileSync(filePath, 'utf8'));
  content.build += 1;

  fs.writeFileSync(filePath, JSON.stringify(content, null, 2) + '\n');
  console.log(`${file}: build ${content.build - 1} -> ${content.build}`);
  anyChanged = true;
}

if (anyChanged) {
  // Stage the updated version files
  const { execSync } = require('child_process');
  for (const file of versionFiles) {
    try {
      execSync(`git add ${file}`, { stdio: 'inherit' });
    } catch (e) {
      // File might not exist
    }
  }
}
