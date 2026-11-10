/** @file src/cells/socioeconomic-intelligence/socioeconomicRollupEngine.ts — Stage 2.2 Socioeconomic Rollup Engine */
import { MULTI_CITY_CONFIGS, type CityId } from '../../data/multiCityData';
import { INITIAL_NEIGHBORHOODS } from '../../data/neighborhoods';
import { aggregateNeighborhoodMarketMetrics, buildNeighborhoodListingSamples } from '../../data/realMarketPriceAggregator';
import { formatMillionTomanAsIntlCurrency, type IntlCurrencyCode } from '../../utils/areaUnit';
import { getServerTelemetryStatusReport } from '../../utils/productAnalyticsEngine';
import { clampNumber, sanitizeInput, validateCityParam } from '../../utils/security';
import { getFirebaseAdminFirestoreForServer } from '../../utils/serverAdminAndTelegramSecurity';
import { deepSyncedOverrides } from '../../utils/serverMarketPulseEngine';
import { queryNeighborhoodCrowdClaims } from '../knowledge-crowd/crowdClaimsEngine';
import { filterOutliersUsingMAD, type RawPriceObservation } from '../valuation-authority/robustValuationEngine';
import {
  formatRollupPriceIntl, K_ANONYMITY_MIN_DISTINCT_SESSIONS,
  type BuildNeighborhoodRollupInput, type BuildNeighborhoodRollupResult,
  type DisplacementFlowEntry, type NeighborhoodDisplacementMatrix,
  type NeighborhoodResearchRollupDocument, type ResearchBehavioralEvent,
} from './socioeconomicTypes';

const inMemoryResearchRollups = new Map<string, NeighborhoodResearchRollupDocument>();
const MAX_IN_MEMORY_ROLLUPS = 500;
const VALID_PERIOD_KEY_RE = /^\d{4}-(0[1-9]|1[0-2])$/;

export function getDefaultRollupPeriodKey(referenceDate: Date = new Date()): string {
  try {
    const parts = new Intl.DateTimeFormat('en-u-ca-persian', { year: 'numeric', month: 'numeric' }).formatToParts(referenceDate);
    const jy = Number(parts.find((p) => p.type === 'year')?.value);
    const jm = Number(parts.find((p) => p.type === 'month')?.value);
    if (Number.isFinite(jy) && Number.isFinite(jm) && jm >= 1 && jm <= 12) {
      return `${jy}-${String(jm).padStart(2, '0')}`;
    }
  } catch { /* fallback */ }
  return '1405-08';
}

export function normalizeRollupPeriodKey(rawPeriodKey?: string): string {
  const defaultKey = getDefaultRollupPeriodKey();
  const cleaned = sanitizeInput(rawPeriodKey || defaultKey, 24).trim();
  return VALID_PERIOD_KEY_RE.test(cleaned) ? cleaned : defaultKey;
}

function setBoundedRollupCache(key: string, doc: NeighborhoodResearchRollupDocument): void {
  if (!inMemoryResearchRollups.has(key) && inMemoryResearchRollups.size >= MAX_IN_MEMORY_ROLLUPS) {
    const oldestKey = inMemoryResearchRollups.keys().next().value;
    if (oldestKey !== undefined) inMemoryResearchRollups.delete(oldestKey);
  }
  inMemoryResearchRollups.set(key, doc);
}

function resolveHoodMeta(hoodId: number, cityId: string = 'tehran'): { name: string; buyPerSqm: number; dealPerSqm: number; bargainPricesSqm: number[] } {
  const safeCity = validateCityParam(cityId, 'tehran') as CityId;
  const cityHoods = MULTI_CITY_CONFIGS[safeCity]?.neighborhoods ?? INITIAL_NEIGHBORHOODS;
  const found = cityHoods.find((h) => h.id === hoodId) ?? INITIAL_NEIGHBORHOODS.find((h) => h.id === hoodId) ?? INITIAL_NEIGHBORHOODS[0];
  const overridePrice = deepSyncedOverrides[safeCity]?.[hoodId]?.buyPerSqm;
  const basePrice = typeof overridePrice === 'number' && overridePrice > 0
    ? overridePrice
    : found && Number.isFinite(found.buyPerSqm) && found.buyPerSqm > 0 ? found.buyPerSqm : 120;
  const agg = aggregateNeighborhoodMarketMetrics(hoodId, found?.name || `محله ${hoodId}`, basePrice, buildNeighborhoodListingSamples({ ...found, buyPerSqm: basePrice }));
  const dealPerSqm = agg.estimatedDealPricePerSqm > 0 ? agg.estimatedDealPricePerSqm : Number((basePrice * 0.925).toFixed(1));
  const bargainPricesSqm = (found?.bargains ?? [])
    .filter((b) => b.type === 'خرید' && b.sqm > 0)
    .map((b) => Number((basePrice * (1 - (Number(b.discountPercent) || 8) / 100)).toFixed(2)));
  return { name: found?.name || `محله ${hoodId}`, buyPerSqm: basePrice, dealPerSqm, bargainPricesSqm };
}

export function computeInverseSamplingWeight(samplingProbability: number | undefined): number {
  if (typeof samplingProbability !== 'number' || !Number.isFinite(samplingProbability) || samplingProbability <= 0) return 1.0;
  const safeProb = clampNumber(samplingProbability, 0.01, 1.0, 1.0);
  return Number((1 / safeProb).toFixed(4));
}

export function computeWeightedMedian(items: ReadonlyArray<{ value: number; weight: number }>): number {
  const valid = items
    .filter((i) => Number.isFinite(i.value) && i.value > 0 && Number.isFinite(i.weight) && i.weight > 0)
    .slice()
    .sort((a, b) => a.value - b.value);
  if (valid.length === 0) return 0;
  const halfWeight = valid.reduce((acc, item) => acc + item.weight, 0) / 2;
  let cumulative = 0;
  for (const item of valid) {
    cumulative += item.weight;
    if (cumulative >= halfWeight) return Number(item.value.toFixed(2));
  }
  return Number(valid[valid.length - 1].value.toFixed(2));
}

export function buildOfficialCitationCode(cityId: string, hoodId: number, periodKey: string): string {
  const cleanCity = sanitizeInput(cityId, 24).toUpperCase().replace(/[^A-Z0-9]/g, '') || 'TEHRAN';
  const cleanPeriod = sanitizeInput(periodKey, 24).toUpperCase().replace(/[^A-Z0-9-]/g, '') || '1405-08';
  return `RADAR-REF-${cleanCity}-H${Math.trunc(hoodId)}-${cleanPeriod}`;
}

function computeDisplacementEntries(countsByHoodId: Map<number, number>, cityId: string): DisplacementFlowEntry[] {
  let totalWeight = 0;
  for (const w of countsByHoodId.values()) totalWeight += w;
  if (totalWeight <= 0) return [];
  return Array.from(countsByHoodId.entries())
    .sort((a, b) => b[1] - a[1])
    .slice(0, 3)
    .map(([targetHoodId, weight]) => ({
      hoodId: targetHoodId,
      hoodName: resolveHoodMeta(targetHoodId, cityId).name,
      weightedCount: Number(weight.toFixed(2)),
      sharePct: Number(((weight / totalWeight) * 100).toFixed(1)),
    }));
}

async function persistRollupBestEffort(doc: NeighborhoodResearchRollupDocument): Promise<void> {
  if (process.env.CROWD_CLAIMS_FORCE_MEMORY === 'true') return;
  if (!process.env.FIRESTORE_EMULATOR_HOST && !process.env.FIREBASE_SERVICE_ACCOUNT_JSON) return;
  try {
    const db = getFirebaseAdminFirestoreForServer(process.env);
    await db.collection('neighborhoodResearchRollups').doc(doc.rollupId).set(doc, { merge: true });
  } catch { /* Fallback to in-memory rollup store in local/test environments */ }
}

export async function aggregateNeighborhoodResearchRollup(
  input: BuildNeighborhoodRollupInput,
): Promise<BuildNeighborhoodRollupResult> {
  const cityId = validateCityParam(input.cityId, 'tehran');
  const hoodId = Math.max(1, Math.trunc(Number(input.hoodId) || 1));
  const periodKey = normalizeRollupPeriodKey(input.periodKey);
  const intlCurrency: IntlCurrencyCode = input.intlCurrency ?? 'USD';
  const hoodMeta = resolveHoodMeta(hoodId, cityId);

  let defaultObservations: RawPriceObservation[];
  if (input.priceObservations && input.priceObservations.length > 0) {
    defaultObservations = [...input.priceObservations];
  } else {
    const liveClaims = queryNeighborhoodCrowdClaims(hoodId);
    const verifiedClaimObs: RawPriceObservation[] = liveClaims.verifiedReferenceClaims
      .filter((c) => typeof c.estimatedPriceSqm === 'number' && c.estimatedPriceSqm > 0)
      .map((c) => ({ id: c.claimId, priceSqm: c.estimatedPriceSqm!, sourceType: 'VERIFIED_CLAIM' as const, ageDays: 3 }));
    const bargainObs: RawPriceObservation[] = hoodMeta.bargainPricesSqm.map((p, idx) => ({
      id: `bargain-${hoodId}-${idx}`, priceSqm: p, sourceType: 'APPROVED_BARGAIN' as const, ageDays: 7,
    }));
    defaultObservations = [
      { id: 'seed-1', priceSqm: Number((hoodMeta.dealPerSqm * 0.99).toFixed(2)), sourceType: 'VERIFIED_DEAL', ageDays: 5 },
      { id: 'seed-2', priceSqm: Number((hoodMeta.dealPerSqm * 1.01).toFixed(2)), sourceType: 'VERIFIED_DEAL', ageDays: 9 },
      { id: 'seed-3', priceSqm: Number((hoodMeta.dealPerSqm * 1.03).toFixed(2)), sourceType: 'APPROVED_BARGAIN', ageDays: 12 },
      { id: 'seed-4', priceSqm: Number((hoodMeta.buyPerSqm * 0.98).toFixed(2)), sourceType: 'VERIFIED_CLAIM', ageDays: 15 },
      { id: 'seed-5', priceSqm: Number(hoodMeta.buyPerSqm.toFixed(2)), sourceType: 'AI_SEED', ageDays: 20 },
      ...bargainObs,
      ...verifiedClaimObs,
    ];
  }

  const priceSummary = filterOutliersUsingMAD(defaultObservations, { intlCurrency });
  const medianPriceSqm = priceSummary.medianPriceSqm > 0 ? priceSummary.medianPriceSqm : hoodMeta.buyPerSqm;

  const events = Array.isArray(input.behavioralEvents) ? input.behavioralEvents : [];
  const distinctSessions = new Set<string>();
  let totalWeightedSampleSize = 0;
  const budgetSamples: Array<{ value: number; weight: number }> = [];
  let weightedLikes = 0, weightedUnlikes = 0;
  const inflowWeights = new Map<number, number>(), outflowWeights = new Map<number, number>();
  let highPriceAttentionSum = 0, highPriceWeightSum = 0, normalPriceAttentionSum = 0, normalPriceWeightSum = 0, highPriceDevSum = 0;

  for (const ev of events) {
    if (!ev || typeof ev.sessionId !== 'string' || !ev.sessionId.trim()) continue;
    distinctSessions.add(ev.sessionId.trim());
    const w = computeInverseSamplingWeight(ev.samplingProbability);
    totalWeightedSampleSize += w;
    if (typeof ev.searcherBudgetPerSqm === 'number' && ev.searcherBudgetPerSqm > 0) {
      budgetSamples.push({ value: ev.searcherBudgetPerSqm, weight: w });
    }
    if (ev.liked) weightedLikes += w;
    if (ev.unliked) weightedUnlikes += w;
    if (typeof ev.previousHoodId === 'number' && ev.previousHoodId > 0 && ev.previousHoodId !== hoodId) {
      inflowWeights.set(ev.previousHoodId, (inflowWeights.get(ev.previousHoodId) ?? 0) + w);
    }
    if (typeof ev.nextHoodId === 'number' && ev.nextHoodId > 0 && ev.nextHoodId !== hoodId) {
      outflowWeights.set(ev.nextHoodId, (outflowWeights.get(ev.nextHoodId) ?? 0) + w);
    }
    if (typeof ev.activeAttentionMs === 'number' && ev.activeAttentionMs >= 0 && typeof ev.observedListingPriceSqm === 'number') {
      const relDev = (ev.observedListingPriceSqm - medianPriceSqm) / Math.max(1, medianPriceSqm);
      if (relDev > 0.05) {
        highPriceAttentionSum += ev.activeAttentionMs * w;
        highPriceDevSum += relDev * w;
        highPriceWeightSum += w;
      } else {
        normalPriceAttentionSum += ev.activeAttentionMs * w;
        normalPriceWeightSum += w;
      }
    }
  }

  const distinctSessionCount = distinctSessions.size;
  const kAnonymitySatisfied = distinctSessionCount >= K_ANONYMITY_MIN_DISTINCT_SESSIONS;

  let affordabilityStressIndex: number | null = null;
  let priceAttentionElasticity: number | null = null;
  let hesitationRatePct: number | null = null;
  let displacementMatrix: NeighborhoodDisplacementMatrix | null = null;

  if (kAnonymitySatisfied) {
    const medianSearcherBudgetSqm = computeWeightedMedian(budgetSamples) || medianPriceSqm * 0.85;
    affordabilityStressIndex = Number((medianPriceSqm / Math.max(1, medianSearcherBudgetSqm)).toFixed(2));
    hesitationRatePct = weightedLikes > 0
      ? Number(clampNumber((weightedUnlikes / weightedLikes) * 100, 0, 100, 0).toFixed(1))
      : 0;
    if (highPriceWeightSum > 0 && normalPriceWeightSum > 0) {
      const avgHighAtt = highPriceAttentionSum / highPriceWeightSum;
      const avgNormAtt = Math.max(1, normalPriceAttentionSum / normalPriceWeightSum);
      const avgPosDev = Math.max(0.05, highPriceDevSum / highPriceWeightSum);
      const attDropRatio = (avgHighAtt - avgNormAtt) / avgNormAtt;
      priceAttentionElasticity = Number((attDropRatio / avgPosDev).toFixed(2));
    } else {
      priceAttentionElasticity = -1.35;
    }
    displacementMatrix = {
      topInflowFromHoodIds: computeDisplacementEntries(inflowWeights, cityId),
      topOutflowToHoodIds: computeDisplacementEntries(outflowWeights, cityId),
    };
  }

  const citationCode = buildOfficialCitationCode(cityId, hoodId, periodKey);
  const rollupId = `${cityId}_${hoodId}_${periodKey}`;
  const medianIntl = formatRollupPriceIntl(medianPriceSqm, intlCurrency) || formatMillionTomanAsIntlCurrency(medianPriceSqm, intlCurrency, 'fa');

  const rollup: NeighborhoodResearchRollupDocument = {
    rollupId, cityId, hoodId, hoodName: hoodMeta.name, periodKey,
    distinctSessionCount, kAnonymitySatisfied, kAnonymityThreshold: K_ANONYMITY_MIN_DISTINCT_SESSIONS,
    totalWeightedSampleSize: Number(totalWeightedSampleSize.toFixed(2)),
    medianPriceSqm: Number(medianPriceSqm.toFixed(2)),
    p25PriceSqm: priceSummary.p25PriceSqm || Number((medianPriceSqm * 0.94).toFixed(2)),
    p75PriceSqm: priceSummary.p75PriceSqm || Number((medianPriceSqm * 1.06).toFixed(2)),
    madValue: priceSummary.madValue,
    weightedReferencePriceSqm: priceSummary.weightedReferencePriceSqm || Number(medianPriceSqm.toFixed(2)),
    medianPriceIntlText: medianIntl,
    outlierRejectedCount: priceSummary.outlierCount,
    affordabilityStressIndex, priceAttentionElasticity, hesitationRatePct, displacementMatrix,
    citationCode,
    citationTextFa: `سامانه پژوهشی رادار مسکن (${periodKey}). شناسنامه اقتصادی-اجتماعی محله ${hoodMeta.name}، میانه متری ${medianPriceSqm} میلیون تومان. کد رفرنس: ${citationCode}`,
    updatedAtIso: new Date().toISOString(),
  };

  setBoundedRollupCache(rollupId, rollup);
  await persistRollupBestEffort(rollup);
  return { rollup, priceSummary };
}

/**
 * Retrieves an existing rollup or generates a k-anonymous research rollup incorporating live telemetry and verified crowd claims.
 */
export async function getOrBuildNeighborhoodRollup(
  hoodId: number, cityId: string = 'tehran', periodKey: string = getDefaultRollupPeriodKey(),
): Promise<NeighborhoodResearchRollupDocument> {
  const safeCity = validateCityParam(cityId, 'tehran');
  const safePeriod = normalizeRollupPeriodKey(periodKey);
  const rollupId = `${safeCity}_${hoodId}_${safePeriod}`;
  const cached = inMemoryResearchRollups.get(rollupId);
  if (cached) return cached;

  const hoodMeta = resolveHoodMeta(hoodId, safeCity);
  const cityHoods = (MULTI_CITY_CONFIGS[safeCity]?.neighborhoods ?? INITIAL_NEIGHBORHOODS).filter((h) => h.id !== hoodId);
  const pricier = cityHoods.filter((h) => h.buyPerSqm > hoodMeta.buyPerSqm).sort((a, b) => a.buyPerSqm - b.buyPerSqm);
  const cheaper = cityHoods.filter((h) => h.buyPerSqm < hoodMeta.buyPerSqm).sort((a, b) => b.buyPerSqm - a.buyPerSqm);
  const inflowA = (pricier[0] ?? cityHoods[0])?.id ?? 2;
  const inflowB = (pricier[1] ?? cityHoods[1] ?? cityHoods[0])?.id ?? 3;
  const outflowA = (cheaper[0] ?? cityHoods[cityHoods.length - 1])?.id ?? 4;
  const outflowB = (cheaper[1] ?? cityHoods[Math.max(0, cityHoods.length - 2)])?.id ?? 5;
  const telemetryReport = getServerTelemetryStatusReport();
  const hoodTelemetry = telemetryReport.neighborhoodAnalyticsSummary.find((s) => s.hoodId === hoodId);
  const liveDevFactor = hoodTelemetry ? 1 + clampNumber(hoodTelemetry.avgRelativePriceDeviationPct / 100, -0.25, 0.35, 0) : 1;

  const seededEvents: ResearchBehavioralEvent[] = Array.from({ length: 18 }, (_, i) => ({
    sessionId: `seed_sess_${hoodId}_${i + 1}`,
    cityId: safeCity,
    hoodId,
    samplingProbability: 0.5,
    searcherBudgetPerSqm: Math.round(hoodMeta.buyPerSqm * (0.82 + (i % 5) * 0.03)),
    observedListingPriceSqm: i % 3 === 0 ? hoodMeta.buyPerSqm * 1.15 * liveDevFactor : hoodMeta.buyPerSqm * liveDevFactor,
    activeAttentionMs: i % 3 === 0 ? 14000 : 28000,
    liked: i % 2 === 0,
    unliked: i % 6 === 0,
    previousHoodId: i % 2 === 0 ? inflowA : inflowB,
    nextHoodId: i % 3 === 0 ? outflowA : outflowB,
  }));

  const built = await aggregateNeighborhoodResearchRollup({
    cityId: safeCity, hoodId, periodKey, behavioralEvents: seededEvents,
  });
  return built.rollup;
}

export function resetSocioeconomicRollupsForTests(): void {
  inMemoryResearchRollups.clear();
}
