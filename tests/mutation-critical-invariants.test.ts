/**
 * @file tests/mutation-critical-invariants.test.ts
 * @description Targeted, bounded in-memory mutation testing harness for Tehran Housing Radar.
 * Injects controlled faults (mutants) into critical pricing, area/currency conversion, XSS/URL security,
 * Iranian mobile validation, and byte-range parsing logic and verifies 100% mutant kill rate.
 * Leaves zero mutated files on disk.
 */
import assert from 'node:assert/strict';
import { calculateHedonicValuation, FAST_SALE_FACTOR, type HedonicInputParams } from '../src/data/hedonicPricingEngine';
import { INITIAL_NEIGHBORHOODS, type EvaluatedNeighborhood } from '../src/data/neighborhoods';
import { convertAreaFromSqm, formatMillionTomanAsIntlCurrency } from '../src/utils/areaUnit';
import { escapeHtmlAttr, buildExternalDivarUrl, isValidIranianMobile } from '../src/utils/security';
import { parseSingleByteRange } from '../src/utils/serverObjectStorage';
import { validateObjectStorageEndpoint, detectEnvironmentConfigDrift } from '../src/utils/serverConfigValidator';
import { evaluateCasperNeighborhoodDecision } from '../src/cells/socioeconomic-intelligence/casperDecisionEngine';
import { computeSavageMinimaxRegretMatrix } from '../src/cells/decision-epistemology/paretoRegretEngine';
import { synthesizeExecutiveDecisionReport } from '../src/cells/decision-epistemology/unifiedDecisionSynthesisEngine';
import { computeDixitPindyckRealOption } from '../src/cells/decision-epistemology/realOptionsLiquidityEngine';
import { simulateMertonJumpDiffusionVaR } from '../src/cells/decision-epistemology/monteCarloRiskDensityEngine';

interface MutantScenario<TFn> {
  id: string; targetModule: string; description: string;
  realImpl: TFn; mutantImpl: TFn; oracle: (fn: TFn) => void;
}

console.log('🧬 Running Targeted Critical-Path Mutation Testing Suite...\n');

const sampleHood = INITIAL_NEIGHBORHOODS[0] as unknown as EvaluatedNeighborhood;
const baselineHedonicInput: HedonicInputParams = {
  neighborhood: sampleHood, sqm: 100, buildYear: 1400, renovationStatus: 'renovated',
  floor: 4, totalFloors: 5, hasElevator: true, hasParking: true, hasStorage: true,
  parkingAdjustmentPercent: 5, currentJalaliYear: 1405,
};

const scenarios: MutantScenario<any>[] = [
  {
    id: 'MUT-01',
    targetModule: 'src/data/hedonicPricingEngine.ts',
    description: 'Mutate FAST_SALE_FACTOR from 0.88 to 0.95 in fastSaleTotalMillion calculation',
    realImpl: (input: HedonicInputParams) => calculateHedonicValuation(input),
    mutantImpl: (input: HedonicInputParams) => ({ ...calculateHedonicValuation(input), fastSaleTotalMillion: Math.round(calculateHedonicValuation(input).hedonicTotalMillion * 0.95) }),
    oracle: (calc) => assert.equal(calc(baselineHedonicInput).fastSaleTotalMillion, Math.round(calc(baselineHedonicInput).hedonicTotalMillion * FAST_SALE_FACTOR)),
  },
  {
    id: 'MUT-02',
    targetModule: 'src/data/hedonicPricingEngine.ts',
    description: 'Invert upper-floor walk-up penalty (missing elevator on floor 4)',
    realImpl: (input: HedonicInputParams) => calculateHedonicValuation(input),
    mutantImpl: (input: HedonicInputParams) => calculateHedonicValuation({ ...input, hasElevator: true }),
    oracle: (calc) => assert.ok(calc({ ...baselineHedonicInput, hasElevator: false }).hedonicPerSqm < calc({ ...baselineHedonicInput, hasElevator: true }).hedonicPerSqm, 'Floor 4 walk-up must lower per-sqm price'),
  },
  {
    id: 'MUT-03',
    targetModule: 'src/data/hedonicPricingEngine.ts',
    description: 'Omit building age depreciation multiplier',
    realImpl: (input: HedonicInputParams) => calculateHedonicValuation(input),
    mutantImpl: (input: HedonicInputParams) => calculateHedonicValuation({ ...input, buildYear: 1405 }),
    oracle: (calc) => {
      const brandNew = calc({ ...baselineHedonicInput, buildYear: 1405 });
      const twentyYearsOld = calc({ ...baselineHedonicInput, buildYear: 1385 });
      assert.ok(twentyYearsOld.hedonicPerSqm < brandNew.hedonicPerSqm, '20-year-old building must depreciate vs brand-new');
    },
  },
  {
    id: 'MUT-04',
    targetModule: 'src/utils/areaUnit.ts',
    description: 'Convert m² to ft² accurately in convertAreaFromSqm (kill identity no-op mutant)',
    realImpl: convertAreaFromSqm,
    mutantImpl: (sqm: number, _unit: 'sqm' | 'sqft') => Math.round(sqm),
    oracle: (conv) => {
      assert.equal(conv(100, 'sqft'), 1076.39);
      assert.equal(conv(100, 'sqm'), 100);
    },
  },
  {
    id: 'MUT-05',
    targetModule: 'src/utils/areaUnit.ts',
    description: 'Omit negative-value clamping in formatMillionTomanAsIntlCurrency (IRT Toman)',
    realImpl: formatMillionTomanAsIntlCurrency,
    mutantImpl: (million: number) => `-${Math.abs(million)} میلیون تومان`,
    oracle: (fmt) => {
      assert.equal(fmt(-100, 'IRT', 'fa'), '۰ میلیون تومان');
      assert.equal(fmt(0, 'IRT', 'fa'), '۰ میلیون تومان');
    },
  },
  {
    id: 'MUT-06',
    targetModule: 'src/utils/security.ts',
    description: 'Skip double-quote escaping in escapeHtmlAttr (XSS attribute breakout mutant)',
    realImpl: escapeHtmlAttr,
    mutantImpl: (raw: string) => escapeHtmlAttr(raw).replace(/&quot;/g, '"'),
    oracle: (esc) => {
      const payload = `ونک" onmouseover="alert(1)`;
      const out = esc(payload);
      assert.ok(!out.includes('"'), 'Must escape double quotes in HTML attributes');
    },
  },
  {
    id: 'MUT-07',
    targetModule: 'src/utils/security.ts',
    description: 'Hardcode city slug to tehran in buildExternalDivarUrl (multi-city routing mutant)',
    realImpl: buildExternalDivarUrl,
    mutantImpl: (_city: any, mode: 'buy' | 'rent', hood: string) => buildExternalDivarUrl('tehran', mode, hood),
    oracle: (builder) => {
      const shirazUrl = builder('shiraz', 'rent', 'معالی‌آباد');
      assert.ok(shirazUrl.startsWith('https://divar.ir/s/shiraz/rent-apartment'), 'Must route Shiraz rent mode accurately');
    },
  },
  {
    id: 'MUT-08',
    targetModule: 'src/utils/security.ts',
    description: 'Relax Iranian mobile regex to accept non-09 prefixes',
    realImpl: isValidIranianMobile,
    mutantImpl: (phone: string) => /^\d{11}$/.test(phone),
    oracle: (validator) => {
      assert.equal(validator('09123456789'), true);
      assert.equal(validator('02123456789'), false, 'Landline prefix 021 must be rejected as mobile');
    },
  },
  {
    id: 'MUT-09',
    targetModule: 'src/utils/serverObjectStorage.ts',
    description: 'Allow inverted byte range start > end in parseSingleByteRange',
    realImpl: parseSingleByteRange,
    mutantImpl: (header: string, size: number) => {
      if (header === 'bytes=500-100') return { start: 500, end: 100 };
      return parseSingleByteRange(header, size);
    },
    oracle: (parser) => {
      assert.deepEqual(parser('bytes=0-99', 1000), { start: 0, end: 99 });
      assert.equal(parser('bytes=500-100', 1000), null, 'Inverted byte range must be rejected as null');
    },
  },
  {
    id: 'MUT-10',
    targetModule: 'src/utils/serverConfigValidator.ts',
    description: 'Allow private loopback/metadata SSRF host in validateObjectStorageEndpoint',
    realImpl: validateObjectStorageEndpoint,
    mutantImpl: (_url: string | undefined) => ({ valid: true, normalizedUrl: 'http://127.0.0.1:9000' }),
    oracle: (validator) => {
      assert.equal(validator('http://127.0.0.1:9000', false).valid, false);
      assert.equal(validator('http://169.254.169.254/latest/meta-data', false).valid, false);
    },
  },
  {
    id: 'MUT-11',
    targetModule: 'src/cells/socioeconomic-intelligence/casperDecisionEngine.ts',
    description: 'Suppress non-compensatory safety veto when safety score < 5.2',
    realImpl: evaluateCasperNeighborhoodDecision,
    mutantImpl: (input: any) => {
      const res = evaluateCasperNeighborhoodDecision(input);
      return { ...res, nonCompensatoryVetoTriggered: false, decisionVerdict: 'OPTIMAL_BUY' };
    },
    oracle: (evaluator) => {
      const out = evaluator({
        hoodId: 99,
        hoodName: 'محله فرضی پرریسک',
        askingPricePerSqm: 100,
        estimatedDealPricePerSqm: 95,
        iqrLowPerSqm: 90,
        iqrHighPerSqm: 100,
        validSampleCount: 15,
        rejectedFraudCount: 0,
        confidenceScore: 80,
        safetyScore: 4.0, // Critical safety risk (< 5.2 threshold)
      });
      assert.equal(out.nonCompensatoryVetoTriggered, true, 'Safety score < 5.2 must trigger non-compensatory veto');
      assert.equal(out.decisionVerdict, 'HIGH_RISK_AVOID', 'Critical risk veto must force HIGH_RISK_AVOID verdict');
    },
  },
  {
    id: 'MUT-12',
    targetModule: 'src/utils/serverConfigValidator.ts',
    description: 'Ignore lingering removed CASPER_HUB_TOKEN/URL env config in detectEnvironmentConfigDrift',
    realImpl: detectEnvironmentConfigDrift,
    mutantImpl: (_env: Record<string, string | undefined>) => ({ valid: true, drifts: [] }),
    oracle: (detector) => {
      const result = detector({ CASPER_HUB_TOKEN: 'legacy-token-123456' });
      assert.equal(result.valid, false, 'Removed Casper Hub env vars must trigger config drift');
      assert.ok(result.drifts.includes('REMOVED_CASPER_HUB_CONFIG_PRESENT'));
    },
  },
  {
    id: 'MUT-13',
    targetModule: 'src/utils/security.ts',
    description: 'Omit ampersand escaping in escapeHtmlAttr',
    realImpl: escapeHtmlAttr,
    mutantImpl: (raw: string) => raw.replace(/"/g, '&quot;').replace(/</g, '&lt;').replace(/>/g, '&gt;'),
    oracle: (esc) => {
      const out = esc('سرمایه‌گذاری & توسعه');
      assert.ok(out.includes('&amp;'), 'Ampersands must be escaped to &amp; in HTML attributes');
      assert.ok(!out.includes('& '), 'Raw unescaped ampersand must not remain');
    },
  },
  {
    id: 'MUT-14',
    targetModule: 'src/cells/decision-epistemology/paretoRegretEngine.ts',
    description: 'Invert Savage Minimax Regret rule to pick maximal regret strategy',
    realImpl: () => computeSavageMinimaxRegretMatrix({ hoodId: 1, basePriceSqm: 120 }),
    mutantImpl: () => {
      const res = computeSavageMinimaxRegretMatrix({ hoodId: 1, basePriceSqm: 120 });
      const worst = res.strategies.reduce((w, s) => (s.maxRegretMillion > w.maxRegretMillion ? s : w), res.strategies[0]);
      return { ...res, minimaxWinnerId: worst.strategyId, strategies: res.strategies.map((s) => ({ ...s, isMinimaxOptimal: s.strategyId === worst.strategyId })) };
    },
    oracle: (fn) => {
      const out = fn();
      const minRegret = Math.min(...out.strategies.map((s: any) => s.maxRegretMillion));
      const winner = out.strategies.find((s: any) => s.strategyId === out.minimaxWinnerId);
      assert.ok(winner && winner.isMinimaxOptimal && winner.maxRegretMillion === minRegret, 'Winner must strictly minimize max regret');
    },
  },
  {
    id: 'MUT-15',
    targetModule: 'src/cells/decision-epistemology/unifiedDecisionSynthesisEngine.ts',
    description: 'Invert Walk-Away Price Ceiling to scale with inflated asking price',
    realImpl: () => synthesizeExecutiveDecisionReport(1, 'پونک', 'tehran', 100, 160),
    mutantImpl: () => {
      const rep = synthesizeExecutiveDecisionReport(1, 'پونک', 'tehran', 100, 160);
      return { ...rep, walkAwayPriceCeilingPerSqm: Math.round(160 * 1.05) };
    },
    oracle: (fn) => {
      const rep = fn();
      assert.ok(rep.walkAwayPriceCeilingPerSqm <= rep.fairPricePerSqm * 1.04, 'Walk-away ceiling must not exceed fair price * 1.04');
    },
  },
  {
    id: 'MUT-16',
    targetModule: 'src/cells/decision-epistemology/realOptionsLiquidityEngine.ts',
    description: 'Invert volatility effect on buyer reservation price',
    realImpl: (sigma: number) => computeDixitPindyckRealOption(100, 0.05, sigma),
    mutantImpl: (sigma: number) => {
      const opt = computeDixitPindyckRealOption(100, 0.05, sigma);
      return { ...opt, buyerReservationPricePerSqm: Number((100 * (1 + sigma)).toFixed(1)) };
    },
    oracle: (fn) => {
      const lowVol = fn(0.15), highVol = fn(0.45);
      assert.ok(highVol.buyerReservationPricePerSqm < lowVol.buyerReservationPricePerSqm, 'Higher volatility must lower buyer reservation price');
    },
  },
  {
    id: 'MUT-17',
    targetModule: 'src/cells/decision-epistemology/monteCarloRiskDensityEngine.ts',
    description: 'Invert illiquidity haircut so emergency exit VaR equals or beats paper VaR',
    realImpl: () => simulateMertonJumpDiffusionVaR(120, { horizonMonths: 12, trialCount: 500 }, 42).metrics,
    mutantImpl: () => {
      const res = simulateMertonJumpDiffusionVaR(120, { horizonMonths: 12, trialCount: 500 }, 42).metrics;
      return { ...res, illiquidityAdjustedVaR95RealPct: res.var95RealPct - 2.0 };
    },
    oracle: (fn) => {
      const m = fn();
      assert.ok(m.illiquidityAdjustedVaR95RealPct > m.var95RealPct + 8.0, 'Illiquidity-adjusted real VaR must exceed paper VaR by >= 8%');
    },
  },
];

let killedCount = 0, survivedCount = 0;

for (const s of scenarios) {
  // 1. Verify real implementation passes the oracle
  s.oracle(s.realImpl);

  // 2. Verify mutant implementation is KILLED (throws AssertionError) by the oracle
  let mutantKilled = false;
  try {
    s.oracle(s.mutantImpl);
  } catch {
    mutantKilled = true;
  }

  if (mutantKilled) {
    killedCount++;
    console.log(`  ✅ [${s.id}] KILLED (${s.targetModule}): ${s.description}`);
  } else {
    survivedCount++;
    console.error(`  ❌ [${s.id}] SURVIVED (${s.targetModule}): ${s.description}`);
  }
}

const scorePercent = Math.round((killedCount / scenarios.length) * 100);
console.log(`\n📊 Mutation Score: ${killedCount}/${scenarios.length} mutants killed (${scorePercent}%)\n`);
assert.equal(survivedCount, 0, `Expected 0 surviving mutants, but ${survivedCount} survived`);
