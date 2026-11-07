// filepath: src/utils/telemetryEdgeAggregationEngine.ts
import Decimal from 'decimal.js';
import { formatMillionTomanAsIntlCurrency, type IntlCurrencyCode, type RadarLocale } from './areaUnit';

export type TelemetryFrictionFlag =
  | 'ASSET_LOAD_LATENCY' | 'NETWORK_LATENCY_RETRY' | 'UI_FRUSTRATION'
  | 'PASSIVE_BACKGROUND_DISPLAY' | 'DORMANT_KIOSK_MODE' | 'PRESENTATION_DISPLAY_MODE'
  | 'COMPARATIVE_CROSS_EVALUATION' | 'EXPORT_IMAGE_PREPARATION' | 'ACTIVE_MEDIA_CONSUMPTION'
  | 'A11Y_NAVIGATION_MODE' | 'LAYOUT_FRICTION' | 'POTENTIAL_MUNICIPAL_LEGAL_FRICTION'
  | 'EXTERNAL_NAVIGATION_VERIFICATION' | 'ASPIRATIONAL_BROWSING' | 'HIGH_INTENT_CONVERSION_FOOTPRINT'
  | 'DECISION_CATALYST' | 'LEGAL_DISPUTE_CRISIS' | 'FINANCIAL_CAPACITY_CEILING' | 'USER_CONFUSION_OSCILLATION';

export interface SubIntentVector {
  readonly clusterId: string;
  readonly districtZone: string;
  readonly budgetBucket: string;
  readonly targetSqm: number;
  readonly refChainToken?: string;
}

export interface SessionSummaryPayload {
  readonly viewedH3Cells: string[];
  readonly activeDwellMs: number;
  readonly maxInteractedTool: string;
  readonly frictionFlags: TelemetryFrictionFlag[];
  readonly subIntentVectors: SubIntentVector[];
  readonly markovChainCatalysts: string[];
  readonly intlBenchmarkLabel: string;
}

export interface RingBufferTelemetryEvent {
  readonly timestampMs: number;
  readonly h3Cell?: string;
  readonly toolId?: string;
  readonly dwellDeltaMs: number;
  readonly flag?: TelemetryFrictionFlag;
}

export class BoundedEdgeTelemetryRingBuffer {
  private readonly buffer: RingBufferTelemetryEvent[];
  private readonly capacity: number;
  private head = 0;
  private size = 0;
  private readonly subIntents: SubIntentVector[] = [];
  private readonly catalysts = new Set<string>();
  private lastToolParams: { sqm: number; budgetMillion: Decimal } | null = null;

  constructor(capacity: number = 128) {
    this.capacity = Number.isFinite(capacity) ? Math.max(1, Math.min(2048, Math.trunc(capacity))) : 128;
    this.buffer = new Array<RingBufferTelemetryEvent>(this.capacity);
  }

  public push(event: RingBufferTelemetryEvent): void {
    this.buffer[this.head] = event;
    this.head = (this.head + 1) % this.capacity;
    if (this.size < this.capacity) this.size += 1;
  }

  public recordToolParameters(toolId: string, sqm: number, budgetMillion: string | number | Decimal): void {
    const cleanTool = String(toolId || '').replace(/[\u0000-\u001F\u007F<>]/g, '').slice(0, 64);
    this.lastToolParams = { sqm, budgetMillion: new Decimal(budgetMillion) };
    this.push({ timestampMs: Date.now(), toolId: cleanTool, dwellDeltaMs: 0 });
  }

  public verifyMarkovSearchFollowUp(
    toolId: string,
    filterSqm: number,
    filterBudgetMillion: string | number | Decimal,
    districtZone: string,
    refChainToken?: string
  ): boolean {
    const budgetDec = new Decimal(filterBudgetMillion);
    const cleanZone = String(districtZone || '').replace(/[\u0000-\u001F\u007F<>]/g, '').slice(0, 64);
    const cleanToken = refChainToken ? String(refChainToken).replace(/[\u0000-\u001F\u007F<>]/g, '').slice(0, 64) : undefined;
    const prev = this.subIntents[this.subIntents.length - 1];
    if (!prev || prev.districtZone !== cleanZone || prev.budgetBucket !== bucketDifferentialBudget(budgetDec, 0)) {
      if (this.subIntents.length >= 128) this.subIntents.shift();
      this.subIntents.push({
        clusterId: `vec_${this.subIntents.length + 1}`,
        districtZone: cleanZone,
        budgetBucket: bucketDifferentialBudget(budgetDec, 0),
        targetSqm: filterSqm,
        refChainToken: cleanToken,
      });
    }
    if (!this.lastToolParams) return false;
    const sqmMatch = Math.abs(this.lastToolParams.sqm - filterSqm) <= 2;
    const budgetDiffRatio = this.lastToolParams.budgetMillion.minus(budgetDec).abs().div(Decimal.max(1, this.lastToolParams.budgetMillion));
    if (sqmMatch && budgetDiffRatio.lte(new Decimal('0.05'))) {
      const cleanTool = String(toolId || '').replace(/[\u0000-\u001F\u007F<>]/g, '').slice(0, 64);
      this.catalysts.add(cleanTool);
      this.push({ timestampMs: Date.now(), toolId: cleanTool, dwellDeltaMs: 0, flag: 'DECISION_CATALYST' });
      return true;
    }
    return false;
  }

  public buildSummaryPayload(currency: IntlCurrencyCode = 'USD', locale: RadarLocale = 'fa'): SessionSummaryPayload {
    const h3Set = new Set<string>();
    const flagSet = new Set<TelemetryFrictionFlag>();
    const toolDwell = new Map<string, number>();
    let activeDwellMs = 0;

    for (let i = 0; i < this.size; i++) {
      const idx = (this.head - this.size + i + this.capacity) % this.capacity;
      const item = this.buffer[idx];
      if (!item) continue;
      const safeDwell = Number.isFinite(item.dwellDeltaMs) ? Math.max(0, item.dwellDeltaMs) : 0;
      activeDwellMs += safeDwell;
      if (item.h3Cell) h3Set.add(item.h3Cell);
      if (item.flag) flagSet.add(item.flag);
      if (item.toolId) toolDwell.set(item.toolId, (toolDwell.get(item.toolId) ?? 0) + Math.max(1, safeDwell));
    }

    let maxInteractedTool = 'none';
    let maxScore = -1;
    for (const [tool, score] of toolDwell.entries()) {
      if (score > maxScore) {
        maxScore = score;
        maxInteractedTool = tool;
      }
    }

    return {
      viewedH3Cells: Array.from(h3Set),
      activeDwellMs,
      maxInteractedTool,
      frictionFlags: Array.from(flagSet),
      subIntentVectors: [...this.subIntents],
      markovChainCatalysts: Array.from(this.catalysts),
      intlBenchmarkLabel: formatMillionTomanAsIntlCurrency(4500, currency, locale),
    };
  }

  public flushViaBeaconOrKeepalive(endpointUrl: string): boolean {
    const cleanUrl = String(endpointUrl || '').trim();
    const isSafeRelative = cleanUrl.startsWith('/api/') && !cleanUrl.startsWith('//') && !cleanUrl.includes('..') && !/[\s<>"'`\\]/.test(cleanUrl);
    const isSafeHttps = /^https:\/\/[a-zA-Z0-9.-]+(?::\d{1,5})?\/api\//.test(cleanUrl) && !cleanUrl.includes('..') && !/[\s<>"'`\\]/.test(cleanUrl);
    if (!isSafeRelative && !isSafeHttps) return false;
    const payload = JSON.stringify(this.buildSummaryPayload());
    this.head = 0;
    this.size = 0;
    if (typeof navigator !== 'undefined' && typeof navigator.sendBeacon === 'function') {
      return navigator.sendBeacon(cleanUrl, new Blob([payload], { type: 'application/json' }));
    }
    if (typeof fetch === 'function') {
      void fetch(cleanUrl, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: payload, keepalive: true }).catch(() => undefined);
      return true;
    }
    return false;
  }
}

export function classifySandboxSignalHygiene(input: {
  imageLoaded: boolean;
  preLoadWaitMs: number;
  inFlightNetworkRequest: boolean;
  clickIntervalMs: number | null;
  domMutated: boolean;
  visibilityState: 'visible' | 'hidden';
  hasWindowFocus: boolean;
  secondsSincePhysicalEntropy: number;
  activeMediaOrPresentation: boolean;
  tabSwitchDeltaMs: number | null;
  microPanZoomCountBeforeBlur: number;
  copiedText?: boolean;
}): { countDwell: boolean; interestAdjustment: number; flags: TelemetryFrictionFlag[] } {
  const flags: TelemetryFrictionFlag[] = [];
  let interestAdjustment = 0;
  if (!input.imageLoaded) {
    if (input.preLoadWaitMs > 300) flags.push('ASSET_LOAD_LATENCY');
    return { countDwell: false, interestAdjustment: 0, flags };
  }
  if (input.clickIntervalMs !== null && input.clickIntervalMs < 250) {
    if (input.inFlightNetworkRequest) flags.push('NETWORK_LATENCY_RETRY');
    else if (!input.domMutated) {
      flags.push('UI_FRUSTRATION');
      interestAdjustment -= 15;
    }
  }
  if (input.tabSwitchDeltaMs !== null && input.tabSwitchDeltaMs < 5000) flags.push('COMPARATIVE_CROSS_EVALUATION');
  if (input.copiedText || input.microPanZoomCountBeforeBlur >= 3) flags.push('EXPORT_IMAGE_PREPARATION');
  if (input.visibilityState !== 'visible' || !input.hasWindowFocus) {
    flags.push('PASSIVE_BACKGROUND_DISPLAY');
    return { countDwell: false, interestAdjustment, flags };
  }
  if (input.secondsSincePhysicalEntropy >= 180) {
    flags.push(input.activeMediaOrPresentation ? 'PRESENTATION_DISPLAY_MODE' : 'DORMANT_KIOSK_MODE');
    return { countDwell: false, interestAdjustment, flags };
  }
  if (input.secondsSincePhysicalEntropy >= 30) {
    flags.push('PASSIVE_BACKGROUND_DISPLAY');
    return { countDwell: false, interestAdjustment, flags };
  }
  return { countDwell: true, interestAdjustment, flags };
}

export function normalizeReadabilityDwellMs(
  rawDwellMs: number,
  wordCount: number,
  fleschScore: number,
  contrastRatio: number
): { normalizedDwellMs: number; visualStrainTaxApplied: boolean } {
  const safeWords = Math.max(1, wordCount);
  const strainTax = (fleschScore < 45 ? 1.35 : 1.0) * (contrastRatio < 4.5 ? 1.25 : 1.0);
  const expectedReadingMs = (safeWords / 3.2) * 1000 * strainTax;
  const normalizedDwellMs = Math.round(rawDwellMs / strainTax);
  return {
    normalizedDwellMs: Math.min(rawDwellMs, Math.max(normalizedDwellMs, Math.round(expectedReadingMs * 0.5))),
    visualStrainTaxApplied: strainTax > 1.0,
  };
}

export function bucketDifferentialBudget(
  exactBudgetMillion: Decimal | number | string,
  laplaceNoiseScale: number = 25,
  deterministicSeed: number = 0.42
): string {
  let dec: Decimal;
  try { const parsed = new Decimal(exactBudgetMillion); dec = parsed.isFinite() ? parsed : new Decimal(0); } catch { dec = new Decimal(0); }
  const safeScale = Number.isFinite(laplaceNoiseScale) && laplaceNoiseScale >= 0 ? laplaceNoiseScale : 25;
  const safeSeed = Number.isFinite(deterministicSeed) ? deterministicSeed : 0.42;
  const u = Math.max(-0.4999, Math.min(0.4999, safeSeed - 0.5));
  const noise = -safeScale * (u < 0 ? -1 : 1) * Math.log(1 - 2 * Math.abs(u));
  const noisyBillion = dec.plus(noise).div(1000);
  const lowerHalf = Math.floor(noisyBillion.mul(2).toNumber()) / 2;
  return `${lowerHalf.toFixed(1)}B_TO_${(lowerHalf + 0.5).toFixed(1)}B`;
}

export function evaluateCalculatorTelemetryGuard(input: {
  monthlyInstallmentToman: Decimal | number | string;
  monthlyHouseholdIncomeToman: Decimal | number | string;
  sliderOscillationCount: number;
}): { ratioDecimal: Decimal; flags: TelemetryFrictionFlag[]; simplifiedPersianSummary: string | null } {
  let instDec: Decimal; try { const p = new Decimal(input.monthlyInstallmentToman); instDec = p.isFinite() ? p : new Decimal(0); } catch { instDec = new Decimal(0); }
  let incDec: Decimal; try { const p = new Decimal(input.monthlyHouseholdIncomeToman); incDec = p.isFinite() ? p : new Decimal(0); } catch { incDec = new Decimal(0); }
  const ratio = instDec.div(Decimal.max(new Decimal(1), incDec));
  const flags: TelemetryFrictionFlag[] = [];
  if (ratio.gt(new Decimal('0.70'))) flags.push('FINANCIAL_CAPACITY_CEILING');
  if (Number.isFinite(input.sliderOscillationCount) && input.sliderOscillationCount > 10) flags.push('USER_CONFUSION_OSCILLATION');
  return {
    ratioDecimal: ratio,
    flags,
    simplifiedPersianSummary:
      flags.length > 0 ? 'خلاصه ساده: مبلغ قسط ماهانه نباید بیش از ۷۰٪ درآمد خانوار باشد تا توان بازپرداخت حفظ شود.' : null,
  };
}

export function verifyBiometricHumanAndScrollGate(input: { keydownLatenciesMs: readonly number[]; backspaceCount: number; totalKeystrokes: number; zeroLatencyPasteDetected: boolean; hasHeroImage: boolean; technicalDescriptionScrollRatio: number; }): { isHumanVerified: boolean; quarantinedPaste: boolean; votingUnlocked: boolean } {
  if (input.zeroLatencyPasteDetected) return { isHumanVerified: false, quarantinedPaste: true, votingUnlocked: false };
  const validLatencies = (input.keydownLatenciesMs || []).filter((v) => typeof v === 'number' && Number.isFinite(v));
  const n = validLatencies.length; const mean = n > 0 ? validLatencies.reduce((a, b) => a + b, 0) / n : 0;
  const variance = n > 1 ? validLatencies.reduce((acc, v) => acc + (v - mean) ** 2, 0) / (n - 1) : 0;
  const backspaceRatio = input.totalKeystrokes > 0 ? input.backspaceCount / input.totalKeystrokes : 0;
  return { isHumanVerified: variance >= 12 && backspaceRatio >= 0.01, quarantinedPaste: false, votingUnlocked: !input.hasHeroImage || (Number.isFinite(input.technicalDescriptionScrollRatio) && input.technicalDescriptionScrollRatio >= 0.7) };
}
export function packZeroCopyClusterTransferable(points: ReadonlyArray<{ lng: number; lat: number; pricePerSqm: number; hoodId: number }>): { buffer: ArrayBuffer; float64View: Float64Array; stride: 4 } {
  const float64View = new Float64Array(points.length * 4);
  for (let i = 0; i < points.length; i++) { const o = i * 4; float64View[o] = points[i].lng; float64View[o + 1] = points[i].lat; float64View[o + 2] = points[i].pricePerSqm; float64View[o + 3] = points[i].hoodId; }
  return { buffer: float64View.buffer, float64View, stride: 4 };
}
export interface TelemetryPolicyManifest { policyVersion: number; activeLevel: number; samplingRate: number; dailyIngestionCap: number; leaseExpiresAtEpochMs: number | null; updatedAtEpochMs?: number; updatedAtIso?: string; leaseExpiredReverted?: boolean; capDowngraded?: boolean; }
export const DEFAULT_TELEMETRY_POLICY: TelemetryPolicyManifest = { policyVersion: 1, activeLevel: 4, samplingRate: 1.0, dailyIngestionCap: 250_000, leaseExpiresAtEpochMs: null, updatedAtEpochMs: 0, updatedAtIso: "2026-01-01T00:00:00.000Z" };
export function validateAndNormalizeTelemetryPolicy(input: Partial<TelemetryPolicyManifest> & Record<string, unknown>, nowMs: number = Date.now()): { valid: true; manifest: TelemetryPolicyManifest } | { valid: false; code: "HIGH_LEVEL_LEASE_REQUIRED" | "INVALID_TELEMETRY_LEVEL"; messageFa: string; message: string } {
  const rawLevel = typeof input.activeLevel === "number" ? Math.round(input.activeLevel) : DEFAULT_TELEMETRY_POLICY.activeLevel;
  if (!Number.isFinite(rawLevel) || rawLevel < 0 || rawLevel > 10) return { valid: false, code: "INVALID_TELEMETRY_LEVEL", messageFa: "سطح تله‌متری باید بین ۰ تا ۱۰ باشد.", message: "Level must be 0..10" };
  const leaseMs = typeof input.leaseExpiresAtEpochMs === "number" && Number.isFinite(input.leaseExpiresAtEpochMs) ? input.leaseExpiresAtEpochMs : null;
  if (rawLevel >= 9 && (leaseMs === null || leaseMs <= nowMs || leaseMs - nowMs > 7 * 24 * 60 * 60 * 1000)) return { valid: false, code: "HIGH_LEVEL_LEASE_REQUIRED", messageFa: "سطوح ۹ و ۱۰ نیازمند مهلت انقضای حداکثر ۷ روزه هستند.", message: "Levels 9-10 require lease <= 7d" };
  const cap = typeof input.dailyIngestionCap === "number" && input.dailyIngestionCap > 0 ? Math.floor(input.dailyIngestionCap) : DEFAULT_TELEMETRY_POLICY.dailyIngestionCap;
  const rate = rawLevel === 0 ? 0 : typeof input.samplingRate === "number" ? Math.max(0, Math.min(1, input.samplingRate)) : 1.0;
  const ver = typeof input.policyVersion === "number" && input.policyVersion >= 1 ? Math.floor(input.policyVersion) : DEFAULT_TELEMETRY_POLICY.policyVersion + 1;
  return { valid: true, manifest: { policyVersion: ver, activeLevel: rawLevel, samplingRate: rate, dailyIngestionCap: cap, leaseExpiresAtEpochMs: rawLevel >= 9 ? leaseMs : null, updatedAtEpochMs: nowMs, updatedAtIso: new Date(nowMs).toISOString() } };
}
export function evaluateEffectiveTelemetryPolicy(manifest: TelemetryPolicyManifest, currentDailyIngestedCount: number, nowMs: number = Date.now()): { effective: TelemetryPolicyManifest; leaseExpiredReverted: boolean; capDowngraded: boolean } {
  let activeLevel = manifest.activeLevel; let samplingRate = manifest.samplingRate; let leaseExpiresAtEpochMs = manifest.leaseExpiresAtEpochMs;
  let leaseExpiredReverted = false; let capDowngraded = false;
  if (activeLevel >= 9 && (leaseExpiresAtEpochMs === null || nowMs > leaseExpiresAtEpochMs)) { activeLevel = 4; leaseExpiresAtEpochMs = null; leaseExpiredReverted = true; }
  if (currentDailyIngestedCount >= manifest.dailyIngestionCap) { activeLevel = 0; samplingRate = 0; capDowngraded = true; }
  return { effective: { ...manifest, activeLevel, samplingRate, leaseExpiresAtEpochMs, leaseExpiredReverted, capDowngraded }, leaseExpiredReverted, capDowngraded };
}
