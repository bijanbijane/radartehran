/**
 * RT-INFRA-001 — Export deduplicated API route inventory (read-only).
 * Output: docs/architecture/rt-infra-001-route-inventory.csv
 */
import fs from 'node:fs';
import path from 'node:path';
import { REGISTERED_API_ROUTES } from '../../src/utils/expressRouteCatalog.ts';
import { ROUTE_MIGRATION_CONTROL_REGISTER } from '../../worker/migrationRegister.ts';

const LEGAL_TEST_GLOB = 'server/modules/legal-regulatory';
const WORKER_TEST = 'tests/cloudflare-phase1-and-phase2-worker.test.ts';

function csvEscape(value: string): string {
  if (/[",\n]/.test(value)) return `"${value.replace(/"/g, '""')}"`;
  return value;
}

const migrationByKey = new Map(
  ROUTE_MIGRATION_CONTROL_REGISTER.map((e) => [`${e.method} ${e.path}`, e]),
);

const rows: string[] = [
  [
    'method',
    'path',
    'declarationSource',
    'expressSourceModule',
    'migrationStatus',
    'activeRuntime',
    'workerHandlerModule',
    'mountedClassification',
    'declared',
    'registered',
    'workerImplemented',
    'testDefined',
  ].join(','),
];

for (const route of REGISTERED_API_ROUTES) {
  const key = `${route.method} ${route.path}`;
  const mig = migrationByKey.get(key);
  const workerImplemented = mig?.status === 'VERIFIED' ? 'yes' : 'no';
  rows.push(
    [
      route.method,
      route.path,
      route.sourceFile,
      mig?.expressSourceModule ?? route.sourceFile,
      mig?.status ?? 'UNKNOWN',
      mig?.activeRuntime ?? 'UNKNOWN',
      mig?.workerHandlerModule ?? '',
      mig?.mountClassification ?? '',
      'yes',
      'yes',
      workerImplemented,
      route.path.includes('legal-regulatory')
        ? 'legal-module-tests'
        : workerImplemented === 'yes'
          ? WORKER_TEST
          : '',
    ]
      .map((c) => csvEscape(String(c)))
      .join(','),
  );
}

const healthOnly = migrationByKey.get('GET /api/health');
if (healthOnly && !REGISTERED_API_ROUTES.some((r) => r.path === '/api/health')) {
  rows.push(
    [
      'GET',
      '/api/health',
      'worker/routes/healthAndMetadataRoutes.ts',
      healthOnly.expressSourceModule,
      healthOnly.status,
      healthOnly.activeRuntime,
      healthOnly.workerHandlerModule ?? '',
      healthOnly.mountClassification,
      'migration-register-only',
      'worker',
      'yes',
      WORKER_TEST,
    ]
      .map((c) => csvEscape(String(c)))
      .join(','),
  );
}

const outDir = path.resolve(process.cwd(), 'docs/architecture');
fs.mkdirSync(outDir, { recursive: true });
const outPath = path.join(outDir, 'rt-infra-001-route-inventory.csv');
fs.writeFileSync(outPath, rows.join('\n') + '\n', 'utf8');
console.log(`Wrote ${rows.length - 1} routes to ${outPath}`);