#!/usr/bin/env node
const fs = require('fs');
const path = require('path');

const targetDirName = process.argv[2] || '.pages-site';
const targetDir = path.resolve(process.cwd(), targetDirName);
const sourceDir = path.resolve(process.cwd(), 'public');

console.log(`[build-pages-site] Copying static frontend from "${sourceDir}" to "${targetDir}"...`);

if (!fs.existsSync(sourceDir)) {
  console.error(`[build-pages-site] Error: source directory "${sourceDir}" not found.`);
  process.exit(1);
}

// Clean target directory
if (fs.existsSync(targetDir)) {
  fs.rmSync(targetDir, { recursive: true, force: true });
}
fs.mkdirSync(targetDir, { recursive: true });

// Recursive copy helper
function copyRecursive(src, dest) {
  const stat = fs.statSync(src);
  if (stat.isDirectory()) {
    fs.mkdirSync(dest, { recursive: true });
    for (const child of fs.readdirSync(src)) {
      copyRecursive(path.join(src, child), path.join(dest, child));
    }
  } else {
    fs.copyFileSync(src, dest);
  }
}

copyRecursive(sourceDir, targetDir);

// Also copy root sitemap/robots if not inside public
for (const rootFile of ['sitemap.xml', 'robots.txt']) {
  const rootFilePath = path.join(process.cwd(), rootFile);
  const targetFilePath = path.join(targetDir, rootFile);
  if (fs.existsSync(rootFilePath) && !fs.existsSync(targetFilePath)) {
    fs.copyFileSync(rootFilePath, targetFilePath);
  }
}

console.log(`[build-pages-site] Successfully built Patliputra Traders site in "${targetDirName}".`);
process.exit(0);
