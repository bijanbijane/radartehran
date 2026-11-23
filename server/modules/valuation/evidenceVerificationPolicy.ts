import type { EvidenceVerificationStatus, MarketEvidenceSourceType } from './types';

const BASELINE_ELIGIBLE_STATUSES: ReadonlySet<string> = new Set(['VERIFIED', 'RESTORED', 'CORRECTED']);

export function isEvidenceEligibleForOfficialBaseline(
  verificationStatus: string,
  outlierFlag: boolean,
  duplicateOfEvidenceId?: string,
): boolean {
  if (outlierFlag || duplicateOfEvidenceId) return false;
  if (verificationStatus === 'REJECTED' || verificationStatus === 'PENDING_REVIEW') return false;
  return BASELINE_ELIGIBLE_STATUSES.has(verificationStatus);
}

export function resolveInitialEvidenceVerificationStatus(
  sourceType: MarketEvidenceSourceType,
  outlierFlag: boolean,
): EvidenceVerificationStatus {
  if (outlierFlag) return 'FLAGGED_OUTLIER';
  void sourceType;
  return 'PENDING_REVIEW';
}