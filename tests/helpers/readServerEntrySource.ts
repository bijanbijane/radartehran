import fs from 'node:fs';
import path from 'node:path';

/** Canonical Express entry after RT-INFRA-001 (`apps/api/server.ts`), with root shim fallback. */
export function readServerEntrySource(rootDir = process.cwd()): string {
  const canonical = path.join(rootDir, 'apps/api/server.ts');
  if (fs.existsSync(canonical)) {
    return fs.readFileSync(canonical, 'utf8');
  }
  return fs.readFileSync(path.join(rootDir, 'server.ts'), 'utf8');
}