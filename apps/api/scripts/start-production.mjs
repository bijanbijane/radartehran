/**
 * Cross-platform production entry for radartehran-api.
 * Forces NODE_ENV=production before loading the bundled server (dotenv loads after, without overriding).
 */
import { spawn } from 'node:child_process';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const apiDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const entry = path.join(apiDir, 'dist/server.mjs');

process.env.NODE_ENV = 'production';

const hasHostingOverride =
  process.env.RADAR_API_ONLY !== undefined || process.env.RADAR_SERVE_FRONTEND !== undefined;
if (!hasHostingOverride) {
  process.env.RADAR_API_ONLY = '1';
}

const forwardArgs = process.argv.slice(2);
const child = spawn(process.execPath, [entry, ...forwardArgs], {
  stdio: 'inherit',
  env: process.env,
  cwd: apiDir,
});

child.on('exit', (code, signal) => {
  if (signal) process.kill(process.pid, signal);
  process.exit(code ?? 1);
});

child.on('error', (err) => {
  console.error('[radartehran-api] Failed to start production server:', err);
  process.exit(1);
});