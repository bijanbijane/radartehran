import {
  runDirtyDozenSecurityTests,
  runStaticRulesStructuralAudit,
  runDataIntegrityRegressionTests,
} from '../firestore.rules.test';

const mode = process.argv[2] || 'all';

async function main(): Promise<void> {
  const staticRes = runStaticRulesStructuralAudit();
  console.log(
    `[PASS] Static Firestore Rules Audit: ${staticRes.passed}/${staticRes.total}`
  );

  const integrityRes = runDataIntegrityRegressionTests();
  console.log(
    `[PASS] Data Integrity Regression Suite: ${integrityRes.passed}/${integrityRes.total}`
  );

  if (mode === 'static') {
    return;
  }

  if (!process.env.FIRESTORE_EMULATOR_HOST) {
    console.error(
      '[ERROR] FIRESTORE_EMULATOR_HOST is not set. Run via `npm run test:rules` or start the Firestore emulator.'
    );
    process.exit(1);
  }

  const report = await runDirtyDozenSecurityTests();
  console.log(
    `[PASS] Emulator Behavioral Security Tests: ${report.passedAssertions}/${report.totalAssertions}`
  );
}

main().catch((err) => {
  console.error('[FAIL] Firestore Rules Test Runner:', err);
  process.exit(1);
});
