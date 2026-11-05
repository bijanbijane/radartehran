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
import { validateObjectStorageEndpoint } from '../src/utils/serverConfigValidator';

interface MutantScenario<TFn> {
  id: string;
  targetModule: string;
  description: string;
  realImpl: TFn;
  mutantImpl: TFn;
  oracle: (fn: TFn) => void;
}

console.log('🧬 Running Targeted Critical-Path Mutation Testing Suite...\n');

const sampleHood = INITIAL_NEIGHBORHOODS[0] as unknown as EvaluatedNeighborhood;
const baselineHedonicInput: HedonicInputParams = {
  neighborhood: sampleHood,
  sqm: 100,
  buildYear: 1400,
  renovationStatus: 'renovated',
  floor: 4,
  totalFloors: 5,
  hasElevator: true,
  hasParking: true,
  hasStorage: true,
  parkingAdjustmentPercent: 5,
  currentJalaliYear: 1405,
};

const scenarios: MutantScenario<any>[] = [
  {
    id: 'MUT-01',
    targetModule: 'src/data/hedonicPricingEngine.ts',
    description: 'Mutate FAST_SALE_FACTOR from 0.88 to 0.95 in fastSaleTotalMillion calculation',
    realImpl: (input: HedonicInputParams) => calculateHedonicValuation(input),
    mutantImpl: (input: HedonicInputParams) => {
      const res = calculateHedonicValuation(input);
      return { ...res, fastSaleTotalMillion: Math.round(res.hedonicTotalMillion * 0.95) };
    },
    oracle: (calc) => {
      const out = calc(baselineHedonicInput);
      assert.equal(out.fastSaleTotalMillion, Math.round(out.hedonicTotalMillion * FAST_SALE_FACTOR));
    },
  },
  {
    id: 'MUT-02',
    targetModule: 'src/data/hedonicPricingEngine.ts',
    description: 'Invert upper-floor walk-up penalty (missing elevator on floor 4)',
    realImpl: (input: HedonicInputParams) => calculateHedonicValuation(input),
    mutantImpl: (input: HedonicInputParams) => {
      const res = calculateHedonicValuation({ ...input, hasElevator: true });
      return res;
    },
    oracle: (calc) => {
      const withElevator = calc({ ...baselineHedonicInput, hasElevator: true });
      const withoutElevator = calc({ ...baselineHedonicInput, hasElevator: false });
      assert.ok(withoutElevator.hedonicPerSqm < withElevator.hedonicPerSqm, 'Floor 4 walk-up must lower per-sqm price');
    },
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
    description: 'Swap m²->ft² multiplication with division in convertAreaFromSqm',
    realImpl: convertAreaFromSqm,
    mutantImpl: (sqm: number, unit: 'sqm' | 'sqft') => (unit === 'sqft' ? Math.round(sqm / 10.7639) : sqm),
    oracle: (conv) => {
      assert.equal(conv(100, 'sqft'), 1076);
      assert.equal(conv(100, 'sqm'), 100);
    },
  },
  {
    id: 'MUT-05',
    targetModule: 'src/utils/areaUnit.ts',
    description: 'Omit negative-value clamping in formatMillionTomanAsIntlCurrency',
    realImpl: formatMillionTomanAsIntlCurrency,
    mutantImpl: (million: number) => `$-${Math.abs(million)}`,
    oracle: (fmt) => {
      assert.equal(fmt(-100, 'USD', 'en'), '$0');
      assert.equal(fmt(0, 'USD', 'en'), '$0');
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
];

let killedCount = 0;
let survivedCount = 0;

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
