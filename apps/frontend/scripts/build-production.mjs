/**
 * Independent radartehran-frontend production build (repo root as Vite project root).
 * Does not invoke the root package.json "build" script.
 */
import { spawnSync } from 'node:child_process';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../..');

function run(command, args, cwd) {
  const result = spawnSync(command, args, { cwd, stdio: 'inherit', env: process.env });
  if (result.error) {
    console.error(result.error);
    process.exit(1);
  }
  if (result.status !== 0) {
    process.exit(result.status ?? 1);
  }
}

const tsxBin = path.join(repoRoot, 'node_modules/.bin/tsx');
const viteBin = path.join(repoRoot, 'node_modules/.bin/vite');
run(tsxBin, ['scripts/generate-sitemap.ts'], repoRoot);
run(viteBin, ['build', '--config', 'vite.config.ts'], repoRoot);