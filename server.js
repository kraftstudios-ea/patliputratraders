// Root entrypoint for Render and hosting platforms
const path = require('path');

// Change working directory to Backend so relative paths (.env, templates, etc.) resolve correctly
const backendDir = path.join(__dirname, 'Backend');
try {
  process.chdir(backendDir);
} catch (err) {
  console.error('[server] Failed to switch working directory to Backend:', err);
}

// Start the Patliputra Traders backend server
require('./Backend/server.js');
