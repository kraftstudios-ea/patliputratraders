#!/usr/bin/env node
const fs = require('fs');
const path = require('path');

const targetDirName = process.argv[2] || '.pages-site';
const targetDir = path.resolve(process.cwd(), targetDirName);

console.log(`[audit-pages] Auditing build output directory "${targetDir}"...`);

if (!fs.existsSync(targetDir)) {
  console.error(`[audit-pages] Error: target directory "${targetDir}" not found.`);
  process.exit(1);
}

const requiredFiles = ['index.html', 'all_products.html'];
let missing = 0;

for (const file of requiredFiles) {
  const filePath = path.join(targetDir, file);
  if (!fs.existsSync(filePath)) {
    console.error(`[audit-pages] Missing required file: ${file}`);
    missing++;
  }
}

if (missing > 0) {
  process.exit(1);
}

console.log(`[audit-pages] Audit passed! All essential storefront pages verified in "${targetDirName}".`);
process.exit(0);
