/**
 * @file tests/hundred-step-debug.test.ts
 * @description 100-Step Comprehensive Debugging, Audit & Regression Test Suite
 * Executes all 100 live client/domain diagnostic steps from `runClient100StepAudit()`
 * plus static server, security, Firestore rules, Object Storage, and UI contract checks.
 */

import assert from 'node:assert/strict';
import * as fs from 'node:fs';
import { runClient100StepAudit } from '../src/data/diagnosticRunner';
import { parseSingleByteRange, detectMediaFormatByMagicBytes } from '../src/utils/serverObjectStorageHelpers';

export async function runHundredStepDebug(): Promise<void> {
  console.log('========================================================================');
  console.log('شروع ممیزی و دیباگ جامع ۱۰۰ مرحله‌ای (100-Step Deep Debug & Audit Suite)');
  console.log('========================================================================\n');

  const report = runClient100StepAudit();

  for (const step of report.steps) {
    if (step.status !== 'PASS') {
      console.error(`[FAIL] گام #${step.step} [${step.domain}] ${step.name}: ${step.details}`);
      throw new Error(`Step #${step.step} (${step.name}) failed: ${step.details}`);
    }
    console.log(
      `[PASS] گام #${String(step.step).padStart(3, '0')}/100 [${step.domain}] ${step.name} — ${step.details}`
    );
  }

  assert.equal(report.totalSteps, 100, 'Diagnostic runner must execute exactly 100 steps');
  assert.equal(report.totalPassed, 100, 'All 100 diagnostic steps must pass');
  assert.equal(report.allPassed, true, 'allPassed flag must be true');

  // Additional server & static security verification on top of the 100 steps
  const serverSrc = fs.readFileSync('server.ts', 'utf8');
  const storageSrc = fs.readFileSync('src/utils/serverObjectStorage.ts', 'utf8');
  const rulesSrc = fs.readFileSync('firestore.rules', 'utf8');
  const gallerySrc = fs.readFileSync('src/components/ListingMediaGallery.tsx', 'utf8');
  const buyingPowerSrc = fs.readFileSync('src/components/BuyingPowerSummaryCard.tsx', 'utf8');
  const bridgeSrc = fs.readFileSync('src/components/BudgetBridgeAdvisorCard.tsx', 'utf8');

  assert.ok(
    serverSrc.includes('process.env.K_SERVICE || process.env.NODE_ENV === "production"'),
    'server.ts must configure trustProxyHops fallback for production/Cloud Run'
  );
  assert.ok(
    storageSrc.includes("res.setHeader('Cache-Control', 'public, max-age=3600, must-revalidate')"),
    'serverObjectStorage.ts must set bounded revalidating Cache-Control header'
  );
  assert.ok(
    storageSrc.includes("!rangeHeader.includes(',')"),
    'serverObjectStorage.ts must guard against multi-range video requests'
  );
  assert.ok(
    rulesSrc.includes('data.favoriteHoodIds[data.favoriteHoodIds.size() - 1] is number'),
    'firestore.rules must validate tail element of favoriteHoodIds'
  );
  assert.ok(
    gallerySrc.includes('isSafeMediaUrl'),
    'ListingMediaGallery.tsx must guard media URLs with isSafeMediaUrl'
  );
  assert.ok(
    buyingPowerSrc.includes('rentAgeFactor') && bridgeSrc.includes('rahnPerSqm * rentAgeFactor'),
    'BuyingPowerSummaryCard and BudgetBridgeAdvisorCard must scale tenant rahn by rentAgeFactor'
  );
  assert.deepEqual(parseSingleByteRange('bytes=0-127', 1024), { start: 0, end: 127 });
  assert.equal(parseSingleByteRange('bytes=0-10,20-30', 1024), null);
  assert.equal(detectMediaFormatByMagicBytes(Buffer.from('not-media')), null);

  console.log('\n========================================================================');
  console.log(
    `[100-STEP DEBUG PASS] هر ۱۰۰ مرحله دیباگ تخصصی با موفقیت ۱۰۰٪ سپری شدند! (زمان: ${report.elapsedMs}ms)`
  );
  console.log('========================================================================\n');
}

runHundredStepDebug().catch((err) => {
  console.error('[100-STEP DEBUG CRITICAL ERROR]', err);
  process.exit(1);
});
