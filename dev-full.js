// Cross-platform script to run both API server and Vite dev server
import { spawn } from 'child_process';

const isWin = process.platform === 'win32';
const npx = isWin ? 'npx.cmd' : 'npx';
const node = process.execPath;

// Start API server
const api = spawn(node, ['dev-server.js'], { stdio: 'inherit' });

// Start Vite dev server
const vite = spawn(npx, ['vite'], { stdio: 'inherit' });

function cleanup() {
  api.kill();
  vite.kill();
  process.exit();
}

process.on('SIGINT', cleanup);
process.on('SIGTERM', cleanup);

api.on('close', cleanup);
vite.on('close', cleanup);
