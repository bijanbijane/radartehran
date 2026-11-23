/**
 * Independent radartehran-api production packaging: typecheck + Node ESM bundle.
 * Bundled entry: apps/api/dist/server.mjs (packages external; tsx/source run still supported in dev).
 */
import esbuild from 'esbuild';
import fs from 'node:fs';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const apiDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const repoRoot = path.resolve(apiDir, '../..');
const outDir = path.join(apiDir, 'dist');
const outFile = path.join(outDir, 'server.mjs');

fs.mkdirSync(outDir, { recursive: true });

// esbuild resolves the full Express entry graph; workspace typecheck is `npm run typecheck -w radartehran-api`.

await esbuild.build({
  entryPoints: [path.join(apiDir, 'server.ts')],
  outfile: outFile,
  bundle: true,
  platform: 'node',
  format: 'esm',
  target: 'node22',
  packages: 'external',
  logLevel: 'info',
  sourcemap: false,
});

const check = spawnSync(process.execPath, ['--check', outFile], { stdio: 'inherit' });
if (check.status !== 0) {
  process.exit(check.status ?? 1);
}

const meta = {
  name: 'radartehran-api',
  builtAtIso: new Date().toISOString(),
  entry: 'dist/server.mjs',
  node: process.version,
};
fs.writeFileSync(path.join(outDir, 'build-metadata.json'), `${JSON.stringify(meta, null, 2)}\n`, 'utf8');
console.log(`[radartehran-api] build ok → ${outFile}`);