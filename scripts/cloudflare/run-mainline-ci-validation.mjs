#!/usr/bin/env node
/**
 * Read-only CI gate runner for the mainline recovery branch.
 *
 * Used by Cloudflare Workers Builds when GitHub-hosted Actions runners are
 * unavailable. Mirrors the repository's non-browser CI quality gates.
 * The associated Workers Build deploy command is a Wrangler dry-run only.
 */

import { spawnSync } from 'node:child_process';

const steps = [
  { label: 'Gate A1 — lint / TypeScript', command: 'npm', args: ['run', 'lint'] },
  { label: 'Gate A2 — typecheck', command: 'npm', args: ['run', 'typecheck'] },
  { label: 'Gate B — architecture', command: 'npm', args: ['run', 'arch:check'] },
  { label: 'Gate C — unit, roadmap, assessment, storage, rules and insights', command: 'npm', args: ['test'] },
  { label: 'Gate C2 — roadmap regression', command: 'npm', args: ['run', 'test:roadmap'] },
  { label: 'Gate C3 — contracts', command: 'npm', args: ['run', 'test:contracts'] },
  { label: 'Gate C4 — mutation invariants', command: 'npm', args: ['run', 'test:mutation'] },
  { label: 'Gate D — 50-cycle stress', command: 'npx', args: ['tsx', 'tests/stress-50-cycles.test.ts'] },
  { label: 'Gate E1 — object storage upload/auth', command: 'npx', args: ['tsx', 'tests/object-storage-upload-auth.test.ts'] },
  { label: 'Gate E2 — object storage security', command: 'npx', args: ['tsx', 'tests/object-storage-security.test.ts'] },
  { label: 'Gate E3 — object storage byte ranges', command: 'npx', args: ['tsx', 'tests/object-storage-range.test.ts'] },
  { label: 'Gate F — production bundle build', command: 'npm', args: ['run', 'build'] },
  { label: 'Gate G — Cloudflare Worker platform', command: 'npm', args: ['run', 'test:cloudflare'] },
  { label: 'Gate G2 — backend Wrangler config validation', command: 'npm', args: ['run', 'cf:backend:validate'] },
];

const completed = [];

for (const step of steps) {
  console.log('');
  console.log(`===== ${step.label} =====`);
  const result = spawnSync(step.command, step.args, {
    cwd: process.cwd(),
    env: process.env,
    stdio: 'inherit',
    shell: process.platform === 'win32',
  });

  if (result.error) {
    console.error(`[CI_GATE_START_FAILED] ${step.label}: ${result.error.message}`);
    process.exitCode = 1;
    break;
  }

  if (result.status !== 0) {
    const status = typeof result.status === 'number' ? result.status : 1;
    console.error(`[CI_GATE_FAILED] ${step.label}; exit=${status}; signal=${result.signal ?? 'none'}`);
    process.exitCode = status;
    break;
  }

  completed.push(step.label);
  console.log(`[CI_GATE_PASSED] ${step.label}`);
}

console.log('');
console.log(`CI gates passed: ${completed.length}/${steps.length}`);
console.log(`CI gate runner result: ${process.exitCode ? 'FAILED' : 'PASSED'}`);
