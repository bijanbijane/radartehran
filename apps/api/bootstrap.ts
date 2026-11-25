/**
 * API bootstrap: establish the monorepo working directory and load its environment
 * before importing the Express application graph.
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

function resolveMonorepoRoot(): string {
  let dir = path.dirname(fileURLToPath(import.meta.url));
  for (let depth = 0; depth < 8; depth += 1) {
    const packagePath = path.join(dir, 'package.json');
    if (fs.existsSync(packagePath)) {
      try {
        const pkg = JSON.parse(fs.readFileSync(packagePath, 'utf8')) as { name?: string };
        if (pkg.name === 'radartehran') return dir;
      } catch {
        // Continue searching parent directories.
      }
    }
    const parent = path.dirname(dir);
    if (parent === dir) break;
    dir = parent;
  }
  throw new Error('RADAR_MONOREPO_ROOT_NOT_FOUND');
}

process.chdir(resolveMonorepoRoot());
await import('dotenv/config');
await import('./server.ts');
