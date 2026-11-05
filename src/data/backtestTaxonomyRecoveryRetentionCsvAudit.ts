import crypto from 'node:crypto'; import { calculateHedonicValuation, type HedonicRenovationStatus, } from './hedonicPricingEngine'; import type { Neighborhood } from './neighborhoods'; import { normalizeDigitsToEnglish } from '../utils/security'; import { formatAreaUnitLabel, formatMillionTomanAsIntlCurrency, getStoredAreaUnit, getStoredIntlCurrency, type AreaUnit, type IntlCurrencyCode } from '../utils/areaUnit'; export type GeographicTierSegment = 'NORTH_LUXURY' | 'CENTRAL_MIDDLE' | 'SOUTH_AFFORDABLE'; export interface BacktestBenchmarkSample { sampleId: string; neighborhood: Neighborhood; geographicTier: GeographicTierSegment; sqm: number; buildYear: number; renovationStatus: HedonicRenovationStatus; floor: number; hasElevator: boolean; hasParking: boolean; hasStorage: boolean; observedMarketTotalMillion: number; observedAtMs: number; } export interface SegmentBacktestMetrics { segment: GeographicTierSegment; sampleCount: number; maeMillion: number; medianAeMillion: number; rmseMillion: number; meanSignedBiasMillion: number; boundedMapePercent: number; insufficientSampleDensityWarning: boolean; } export interface ValuationBacktestAuditReport { modelArchitecture: 'DETERMINISTIC_ECONOMETRIC_HEDONIC_V2'; evaluationCutoffMs: number; evaluatedSampleCount: number; excludedFutureLeakageCount: number;
  overallMaeMillion: number; overallMedianAeMillion: number; overallRmseMillion: number; overallMeanSignedBiasMillion: number; overallBoundedMapePercent: number; byGeographicSegment: Record<GeographicTierSegment, SegmentBacktestMetrics>; reproducibleDeterministicOutputs: boolean; calibrationStatus: 'CALIBRATED_WITHIN_TOLERANCE' | 'SYSTEMATIC_BIAS_DETECTED' | 'LOW_SAMPLE_WARNING'; displayAreaUnitLabel?: string; overallMaeIntlText?: string; } function computeArrayMedian(values: number[]): number { if (values.length === 0) return 0; const sorted = [...values].sort((a, b) => a - b); const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 === 0 ? Number(((sorted[mid - 1] + sorted[mid]) / 2).toFixed(2)) : Number(sorted[mid].toFixed(2)); } function computeMetricsForSamples( segment: GeographicTierSegment, residuals: Array<{ absError: number; signedError: number; pctError: number }>,
): SegmentBacktestMetrics { const n = residuals.length; if (n === 0) { return { segment, sampleCount: 0, maeMillion: 0, medianAeMillion: 0, rmseMillion: 0, meanSignedBiasMillion: 0, boundedMapePercent: 0, insufficientSampleDensityWarning: true }; }
  const mae = residuals.reduce((acc, r) => acc + r.absError, 0) / n; const mse = residuals.reduce((acc, r) => acc + r.absError * r.absError, 0) / n; const signed = residuals.reduce((acc, r) => acc + r.signedError, 0) / n; const mape = residuals.reduce((acc, r) => acc + r.pctError, 0) / n; return { segment, sampleCount: n, maeMillion: Number(mae.toFixed(2)), medianAeMillion: computeArrayMedian(residuals.map((r) => r.absError)),
    rmseMillion: Number(Math.sqrt(mse).toFixed(2)), meanSignedBiasMillion: Number(signed.toFixed(2)), boundedMapePercent: Number(mape.toFixed(2)), insufficientSampleDensityWarning: n < 5, }; }
export function backtestHedonicValuationAndGeographicBias(input: { evaluationCutoffMs: number; samples: BacktestBenchmarkSample[]; areaUnit?: AreaUnit; intlCurrency?: IntlCurrencyCode; }): ValuationBacktestAuditReport {
  const activeUnit = input.areaUnit ?? getStoredAreaUnit(); const activeCurrency = input.intlCurrency ?? getStoredIntlCurrency();
  let excludedFutureLeakageCount = 0; const validResiduals: Array<{ segment: GeographicTierSegment; absError: number; signedError: number; pctError: number }> = []; let reproducibleDeterministicOutputs = true; for (const s of input.samples) { if (s.observedAtMs > input.evaluationCutoffMs) { excludedFutureLeakageCount += 1;
      continue; }
    const valInput = { neighborhood: s.neighborhood, sqm: s.sqm, buildYear: s.buildYear, renovationStatus: s.renovationStatus, floor: s.floor,
      hasElevator: s.hasElevator, hasParking: s.hasParking, hasStorage: s.hasStorage, };
    const run1 = calculateHedonicValuation(valInput); const run2 = calculateHedonicValuation(valInput);
    if (run1.hedonicTotalMillion !== run2.hedonicTotalMillion) reproducibleDeterministicOutputs = false;
    const predicted = run1.hedonicTotalMillion; const observed = Math.max(100, s.observedMarketTotalMillion);
    const signedError = predicted - observed; const absError = Math.abs(signedError);
    validResiduals.push({ segment: s.geographicTier, absError, signedError, pctError: (absError / observed) * 100 });
  }
  const overallMetrics = computeMetricsForSamples('CENTRAL_MIDDLE', validResiduals);
  const byGeographicSegment: Record<GeographicTierSegment, SegmentBacktestMetrics> = {
    NORTH_LUXURY: computeMetricsForSamples('NORTH_LUXURY', validResiduals.filter((r) => r.segment === 'NORTH_LUXURY')),
    CENTRAL_MIDDLE: computeMetricsForSamples('CENTRAL_MIDDLE', validResiduals.filter((r) => r.segment === 'CENTRAL_MIDDLE')),
    SOUTH_AFFORDABLE: computeMetricsForSamples('SOUTH_AFFORDABLE', validResiduals.filter((r) => r.segment === 'SOUTH_AFFORDABLE')),
  };
  let calibrationStatus: ValuationBacktestAuditReport['calibrationStatus'] = 'CALIBRATED_WITHIN_TOLERANCE';
  if (validResiduals.length < 5) calibrationStatus = 'LOW_SAMPLE_WARNING';
  else if (overallMetrics.boundedMapePercent > 18) calibrationStatus = 'SYSTEMATIC_BIAS_DETECTED';
  return {
    modelArchitecture: 'DETERMINISTIC_ECONOMETRIC_HEDONIC_V2', evaluationCutoffMs: input.evaluationCutoffMs, evaluatedSampleCount: validResiduals.length,
    excludedFutureLeakageCount, overallMaeMillion: overallMetrics.maeMillion, overallMedianAeMillion: overallMetrics.medianAeMillion,
    overallRmseMillion: overallMetrics.rmseMillion, overallMeanSignedBiasMillion: overallMetrics.meanSignedBiasMillion, overallBoundedMapePercent: overallMetrics.boundedMapePercent,
    byGeographicSegment, reproducibleDeterministicOutputs, calibrationStatus,
    displayAreaUnitLabel: formatAreaUnitLabel(activeUnit), overallMaeIntlText: formatMillionTomanAsIntlCurrency(overallMetrics.maeMillion, activeCurrency),
  };
}
export type CanonicalTransactionType = 'buy' | 'rent';
export type CanonicalPropertyCategory = 'residential_apartment' | 'villa' | 'commercial_office';
export interface CanonicalTaxonomyResolution {
  valid: boolean;
  transactionType: CanonicalTransactionType | null;
  renovationStatus: HedonicRenovationStatus | null;
  propertyCategory: CanonicalPropertyCategory | null;
  migratedFromLegacyAlias: boolean;
  issues: string[];
}
const TRANSACTION_TYPE_SYNONYMS: Record<string, CanonicalTransactionType> = {
  buy: 'buy', sale: 'buy', purchase: 'buy', خرید: 'buy', فروش: 'buy',
  rent: 'rent', lease: 'rent', rahn: 'rent', اجاره: 'rent', رهن: 'rent', 'رهن و اجاره': 'rent',
};
const RENOVATION_SYNONYMS: Record<string, HedonicRenovationStatus> = {
  luxury_renovated: 'luxury_renovated', new: 'luxury_renovated', نوساز: 'luxury_renovated', 'فول بازسازی لوکس': 'luxury_renovated',
  renovated: 'renovated', 'بازسازی شده': 'renovated', 'بازسازی‌شده': 'renovated',
  standard: 'standard', معمولی: 'standard', 'سالم و معمولی': 'standard',
  needs_renovation: 'needs_renovation', old: 'needs_renovation', کلنگی: 'needs_renovation', 'نیازمند بازسازی': 'needs_renovation',
};
const PROPERTY_CATEGORY_SYNONYMS: Record<string, CanonicalPropertyCategory> = {
  residential_apartment: 'residential_apartment', apartment: 'residential_apartment', آپارتمان: 'residential_apartment', مسکونی: 'residential_apartment',
  villa: 'villa', ویلایی: 'villa',
  commercial_office: 'commercial_office', office: 'commercial_office', اداری: 'commercial_office', تجاری: 'commercial_office',
};
export function resolveCanonicalPropertyTaxonomy(input: {
  rawTransactionType: string;
  rawRenovationStatus: string;
  rawPropertyCategory: string;
}): CanonicalTaxonomyResolution {
  const issues: string[] = [];
  const normTx = input.rawTransactionType.trim().toLowerCase().replace(/ي/g, 'ی').replace(/ك/g, 'ک');
  const normRenov = input.rawRenovationStatus.trim().toLowerCase().replace(/ي/g, 'ی').replace(/ك/g, 'ک');
  const normCat = input.rawPropertyCategory.trim().toLowerCase().replace(/ي/g, 'ی').replace(/ك/g, 'ک');
  const transactionType = TRANSACTION_TYPE_SYNONYMS[normTx] ?? null;
  if (!transactionType) issues.push(`UNSUPPORTED_TRANSACTION_TYPE:${input.rawTransactionType}`);
  const renovationStatus = RENOVATION_SYNONYMS[normRenov] ?? null;
  if (!renovationStatus) issues.push(`UNSUPPORTED_RENOVATION_STATUS:${input.rawRenovationStatus}`);
  const propertyCategory = PROPERTY_CATEGORY_SYNONYMS[normCat] ?? null;
  if (!propertyCategory) issues.push(`UNSUPPORTED_PROPERTY_CATEGORY:${input.rawPropertyCategory}`);
  const migratedFromLegacyAlias =
    (transactionType !== null && normTx !== transactionType) ||
    (renovationStatus !== null && normRenov !== renovationStatus) ||
    (propertyCategory !== null && normCat !== propertyCategory);
  return { valid: issues.length === 0, transactionType, renovationStatus, propertyCategory, migratedFromLegacyAlias, issues };
}
interface StoredRecoveryChallenge {
  targetIdentifier: string;
  tokenSha256: string;
  issuedAtMs: number;
  expiresAtMs: number;
  consumed: boolean;
  failedAttempts: number;
}
export class AccountRecoveryAndOtpSecurityGuard {
  private readonly challengesByTarget = new Map<string, StoredRecoveryChallenge>();
  private readonly sessionRevocationEpochs = new Map<string, number>();
  static readonly TTL_MS = 10 * 60 * 1000;
  static readonly RESEND_COOLDOWN_MS = 60 * 1000;
  static readonly MAX_ATTEMPTS = 5;
  private hashToken(rawToken: string): string {
    return crypto.createHash('sha256').update(rawToken, 'utf8').digest('hex');
  }
  issueRecoveryChallenge(input: {
    targetIdentifier: string;
    accountExistsInDb: boolean;
    rawSecretToken: string;
    nowMs: number;
  }): {
    publicEnumerationSafeMessageFa: string;
    rateLimitedCooldown: boolean;
    storedPlaintextToken: false;
  } {
    const publicMessage =
      'در صورت وجود حساب کاربری معتبر، کد یا لینک بازیابی ارسال خواهد شد.';
    const existing = this.challengesByTarget.get(input.targetIdentifier);
    if (existing && input.nowMs - existing.issuedAtMs < AccountRecoveryAndOtpSecurityGuard.RESEND_COOLDOWN_MS) {
      return {
        publicEnumerationSafeMessageFa: publicMessage,
        rateLimitedCooldown: true,
        storedPlaintextToken: false,
      };
    }
    if (input.accountExistsInDb) {
      this.challengesByTarget.set(input.targetIdentifier, {
        targetIdentifier: input.targetIdentifier,
        tokenSha256: this.hashToken(input.rawSecretToken),
        issuedAtMs: input.nowMs,
        expiresAtMs: input.nowMs + AccountRecoveryAndOtpSecurityGuard.TTL_MS,
        consumed: false,
        failedAttempts: 0,
      });
    }
    return {
      publicEnumerationSafeMessageFa: publicMessage,
      rateLimitedCooldown: false,
      storedPlaintextToken: false,
    };
  }
  redeemRecoveryChallengeAndRotateSessions(input: {
    targetIdentifier: string;
    submittedToken: string;
    nowMs: number;
  }): {
    verified: boolean;
    rejectionReason: string | null;
    newSessionRevocationEpoch: number | null;
  } {
    const ch = this.challengesByTarget.get(input.targetIdentifier);
    if (!ch) {
      return { verified: false, rejectionReason: 'INVALID_OR_EXPIRED_RECOVERY_TOKEN', newSessionRevocationEpoch: null };
    }
    if (ch.consumed) {
      return { verified: false, rejectionReason: 'TOKEN_ALREADY_CONSUMED_REPLAY_BLOCKED', newSessionRevocationEpoch: null };
    }
    if (input.nowMs > ch.expiresAtMs) {
      return { verified: false, rejectionReason: 'RECOVERY_TOKEN_EXPIRED', newSessionRevocationEpoch: null };
    }
    if (ch.failedAttempts >= AccountRecoveryAndOtpSecurityGuard.MAX_ATTEMPTS) {
      return { verified: false, rejectionReason: 'MAX_VERIFICATION_ATTEMPTS_EXCEEDED', newSessionRevocationEpoch: null };
    }
    const submittedHash = this.hashToken(input.submittedToken);
    if (submittedHash !== ch.tokenSha256) {
      ch.failedAttempts += 1;
      return { verified: false, rejectionReason: 'INVALID_OR_EXPIRED_RECOVERY_TOKEN', newSessionRevocationEpoch: null };
    }
    ch.consumed = true;
    const nextEpoch = (this.sessionRevocationEpochs.get(input.targetIdentifier) ?? 1) + 1;
    this.sessionRevocationEpochs.set(input.targetIdentifier, nextEpoch);
    return {
      verified: true,
      rejectionReason: null,
      newSessionRevocationEpoch: nextEpoch,
    };
  }
}
export type DataRetentionCategory =
  | 'TRANSIENT_UPLOAD_FRAGMENTS'
  | 'EXPIRED_PUBLIC_LISTINGS'
  | 'SECURITY_FORENSIC_AUDIT_LOGS'
  | 'ENCRYPTED_BACKUPS';
export const DATA_RETENTION_POLICY_DAYS: Record<
  DataRetentionCategory,
  { retentionDays: number; autoPurgeAllowed: boolean }
> = {
  TRANSIENT_UPLOAD_FRAGMENTS: { retentionDays: 1, autoPurgeAllowed: true },
  EXPIRED_PUBLIC_LISTINGS: { retentionDays: 90, autoPurgeAllowed: true },
  SECURITY_FORENSIC_AUDIT_LOGS: { retentionDays: 365, autoPurgeAllowed: false },
  ENCRYPTED_BACKUPS: { retentionDays: 30, autoPurgeAllowed: true },
};
export interface RetentionManagedRecord {
  recordId: string;
  category: DataRetentionCategory;
  createdAtMs: number;
  legalHoldActive: boolean;
  legalHoldReason?: string;
}
export function evaluateDataRetentionCleanupBatch(input: {
  nowMs: number;
  dryRun: boolean;
  records: RetentionManagedRecord[];
}): {
  dryRun: boolean;
  eligibleForPurgeIds: string[];
  protectedByLegalHoldIds: string[];
  protectedForensicEvidenceIds: string[];
  retainedActiveIds: string[];
} {
  const eligibleForPurgeIds: string[] = [];
  const protectedByLegalHoldIds: string[] = [];
  const protectedForensicEvidenceIds: string[] = [];
  const retainedActiveIds: string[] = [];
  for (const rec of input.records) {
    if (rec.legalHoldActive) {
      protectedByLegalHoldIds.push(rec.recordId);
      continue;
    }
    const policy = DATA_RETENTION_POLICY_DAYS[rec.category];
    if (!policy.autoPurgeAllowed) {
      protectedForensicEvidenceIds.push(rec.recordId);
      continue;
    }
    const ageDays = (input.nowMs - rec.createdAtMs) / (24 * 60 * 60 * 1000);
    if (ageDays > policy.retentionDays) {
      eligibleForPurgeIds.push(rec.recordId);
    } else {
      retainedActiveIds.push(rec.recordId);
    }
  }
  return { dryRun: input.dryRun, eligibleForPurgeIds, protectedByLegalHoldIds, protectedForensicEvidenceIds, retainedActiveIds };
}
export interface SpreadsheetExportRowInput {
  ownerUid: string;
  listingId: string;
  neighborhoodNameFa: string;
  titleFa: string;
  postalCode10: string;
  contactPhone: string;
  priceMillion: number | null;
  priceDiffPercent: number;
}
export function sanitizeSpreadsheetTextCell(
  rawText: string,
  preserveLeadingZeroIdentifier = false,
): { escapedCsvCell: string; formulaInjectionNeutralized: boolean } {
  const cleaned = rawText.replace(/\r?\n/g, ' ');
  const trimmedLeading = cleaned.replace(/^[\s\u0000-\u001F]+/, '');
  let formulaInjectionNeutralized = false;
  let safeValue = cleaned;
  if (/^[=+\-@]/.test(trimmedLeading) || /^[\t\r]/.test(cleaned)) {
    formulaInjectionNeutralized = true;
    safeValue = `'${cleaned}`;
  } else if (preserveLeadingZeroIdentifier && /^0\d+$/.test(normalizeDigitsToEnglish(cleaned.trim()))) {
    safeValue = `'${normalizeDigitsToEnglish(cleaned.trim())}`;
  }
  return { escapedCsvCell: `"${safeValue.replace(/"/g, '""')}"`, formulaInjectionNeutralized };
}
export function serializeSafeCsvReport(input: {
  requesterUid: string;
  rows: SpreadsheetExportRowInput[];
}): {
  utf8BomIncluded: boolean;
  exportedRowCount: number;
  skippedCrossOwnerCount: number;
  neutralizedFormulaCellCount: number;
  csvContentWithBom: string;
} {
  const header = '"شناسه آگهی","محله","عنوان آگهی","کد پستی ۱۰ رقمی","تلفن تماس","قیمت کل (میلیون تومان)","تغییر نسبت به میانگین (درصد)"';
  const lines: string[] = [header];
  let skippedCrossOwnerCount = 0;
  let neutralizedFormulaCellCount = 0;
  for (const row of input.rows.slice(0, 5000)) {
    if (row.ownerUid !== input.requesterUid) {
      skippedCrossOwnerCount += 1;
      continue;
    }
    const cells = [
      sanitizeSpreadsheetTextCell(row.listingId),
      sanitizeSpreadsheetTextCell(row.neighborhoodNameFa),
      sanitizeSpreadsheetTextCell(row.titleFa),
      sanitizeSpreadsheetTextCell(row.postalCode10, true),
      sanitizeSpreadsheetTextCell(row.contactPhone, true),
    ];
    for (const c of cells) {
      if (c.formulaInjectionNeutralized) neutralizedFormulaCellCount += 1; } const priceCell = row.priceMillion === null ? '"نامشخص"' : String(row.priceMillion); lines.push([...cells.map((c) => c.escapedCsvCell), priceCell, String(row.priceDiffPercent)].join(',')); } return { utf8BomIncluded: true, exportedRowCount: lines.length - 1, skippedCrossOwnerCount, neutralizedFormulaCellCount,
    csvContentWithBom: `\uFEFF${lines.join('\r\n')}`,
  }; }