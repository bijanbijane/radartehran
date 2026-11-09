import crypto from 'crypto';
import { CoreApiError } from '../../core';
import type {
  NormalizedTimestamp,
  SourcePropertyAttributesSnapshot,
} from '../contracts/externalAdapters';
import type {
  CompletionAssessmentOverallState,
  DueDiligenceCasePurpose,
  DueDiligenceCompletionAssessmentRecord,
  DueDiligenceEvidenceRecord,
  DueDiligenceFindingRecord,
  EvidenceCategory,
  EvidenceVerificationState,
  PropertyAttributeDiscrepancyItem,
  PropertyConsistencyCheckReport,
  PropertyFinancialObligationCheckRecord,
  VerificationMethodType,
} from '../domain/types';

/**
 * Section 3C: Explicit Verification State Machine
 * Defines all permitted transitions. Arbitrary state jumps are rejected.
 */
export const ALLOWED_EVIDENCE_STATE_TRANSITIONS: Readonly<
  Record<EvidenceVerificationState, readonly EvidenceVerificationState[]>
> = {
  NOT_SUBMITTED: ['SUBMITTED'],
  SUBMITTED: ['PENDING_REVIEW', 'EXPIRED', 'REQUIRES_ADDITIONAL_EVIDENCE'],
  PENDING_REVIEW: [
    'VERIFIED',
    'REJECTED',
    'EXPIRED',
    'UNVERIFIABLE',
    'REQUIRES_ADDITIONAL_EVIDENCE',
  ],
  REQUIRES_ADDITIONAL_EVIDENCE: ['SUBMITTED', 'PENDING_REVIEW', 'REJECTED', 'EXPIRED'],
  VERIFIED: ['EXPIRED', 'REQUIRES_ADDITIONAL_EVIDENCE'],
  REJECTED: ['SUBMITTED'],
  EXPIRED: ['SUBMITTED'],
  UNVERIFIABLE: ['SUBMITTED', 'PENDING_REVIEW'],
};

export function assertValidEvidenceStateTransition(params: {
  currentState: EvidenceVerificationState;
  targetState: EvidenceVerificationState;
  verificationMethod: VerificationMethodType;
  isAuthorizedReviewer: boolean;
  expirationDateIso: string | null;
  nowEpochMs: number;
}): void {
  const allowedNext = ALLOWED_EVIDENCE_STATE_TRANSITIONS[params.currentState] ?? [];
  if (!allowedNext.includes(params.targetState)) {
    throw new CoreApiError(
      'VALIDATION_FAILED',
      400,
      `INVALID_EVIDENCE_STATE_TRANSITION: Cannot transition evidence from "${params.currentState}" to "${params.targetState}".`,
    );
  }

  // Consequential review states require an authorized human reviewer or official source confirmation
  const reviewerOnlyStates: readonly EvidenceVerificationState[] = [
    'VERIFIED',
    'REJECTED',
    'UNVERIFIABLE',
    'REQUIRES_ADDITIONAL_EVIDENCE',
  ];
  if (reviewerOnlyStates.includes(params.targetState) && !params.isAuthorizedReviewer) {
    throw new CoreApiError(
      'FORBIDDEN',
      403,
      `Transition to "${params.targetState}" requires an authorized due-diligence reviewer.`,
    );
  }

  // Section 3C & 8: Automated checks or AI extraction alone can NEVER transition evidence to VERIFIED
  if (
    params.targetState === 'VERIFIED' &&
    (params.verificationMethod === 'AUTOMATED_METADATA_CHECK_ONLY' ||
      params.verificationMethod === 'UNVERIFIED_SUBMISSION')
  ) {
    throw new CoreApiError(
      'VALIDATION_FAILED',
      400,
      'Evidence cannot be marked VERIFIED solely via automated metadata checks or unverified submission; requires AUTHORIZED_HUMAN_REVIEW or OFFICIAL_SOURCE_CONFIRMATION.',
    );
  }

  // Section 3B & 9.7: Cannot mark an already-expired document as VERIFIED
  if (
    params.targetState === 'VERIFIED' &&
    params.expirationDateIso &&
    Date.parse(params.expirationDateIso) <= params.nowEpochMs
  ) {
    throw new CoreApiError(
      'VALIDATION_FAILED',
      400,
      'EXPIRED_EVIDENCE_CANNOT_BE_VERIFIED: Evidence document has passed its expirationDateIso.',
    );
  }
}

/**
 * Section 3E: Multi-Source Property Information Consistency Engine
 * Compares property attributes across sources without overwriting any source's value.
 */
export function evaluatePropertyInformationConsistency(params: {
  caseId: string;
  canonicalPropertyId: string;
  snapshots: SourcePropertyAttributesSnapshot[];
  nowTs: NormalizedTimestamp;
}): PropertyConsistencyCheckReport {
  const reportId = `ddcons_${crypto.randomBytes(6).toString('hex')}`;
  const fieldsToCompare: Array<{
    key: keyof SourcePropertyAttributesSnapshot;
    label: string;
  }> = [
    { key: 'addressText', label: 'addressText' },
    { key: 'cityId', label: 'cityId' },
    { key: 'districtId', label: 'districtId' },
    { key: 'propertyType', label: 'propertyType' },
    { key: 'landAreaSqm', label: 'landAreaSqm' },
    { key: 'buildingAreaSqm', label: 'buildingAreaSqm' },
    { key: 'floorNumber', label: 'floorNumber' },
    { key: 'unitNumber', label: 'unitNumber' },
    { key: 'constructionYear', label: 'constructionYear' },
    { key: 'buildingUsage', label: 'buildingUsage' },
    { key: 'claimedOwnerRef', label: 'claimedOwnerRef' },
    { key: 'registrationPlateRef', label: 'registrationPlateRef' },
    { key: 'occupancyStatus', label: 'occupancyStatus' },
  ];

  const discrepancies: PropertyAttributeDiscrepancyItem[] = [];

  if (params.snapshots.length >= 2) {
    for (const field of fieldsToCompare) {
      const valuesBySource = params.snapshots.map((s) => {
        const rawVal = s[field.key];
        return {
          sourceId: s.sourceId,
          sourceType: s.sourceType,
          sourceName: s.sourceName,
          observedAtIso: s.observedAtIso,
          value:
            typeof rawVal === 'string' || typeof rawVal === 'number' ? rawVal : null,
        };
      });

      const nonNullValues = valuesBySource.filter((v) => v.value !== null);
      if (nonNullValues.length === 0) continue;

      const distinctNormalized = new Set(
        nonNullValues.map((v) => String(v.value).trim().toLowerCase()),
      );

      if (distinctNormalized.size > 1) {
        discrepancies.push({
          fieldName: field.label,
          discrepancyType: 'CONFLICTING_VALUES',
          valuesBySource,
          explanation: `Source disagreement detected on "${field.label}": found ${distinctNormalized.size} conflicting values across ${nonNullValues.length} sources.`,
        });
      } else if (nonNullValues.length < params.snapshots.length) {
        discrepancies.push({
          fieldName: field.label,
          discrepancyType: 'MISSING_IN_SOME_SOURCES',
          valuesBySource,
          explanation: `Field "${field.label}" is present in ${nonNullValues.length} source(s) but missing in ${params.snapshots.length - nonNullValues.length} source(s).`,
        });
      }
    }
  }

  return {
    reportId,
    caseId: params.caseId,
    canonicalPropertyId: params.canonicalPropertyId,
    preservedSnapshots: structuredClone(params.snapshots),
    discrepancies,
    generatedAt: params.nowTs,
  };
}

/**
 * Section 3I: Due Diligence Completion Assessment Engine
 */
export function evaluateDueDiligenceCompletionAssessment(params: {
  caseId: string;
  versionNumber: number;
  canonicalPropertyId: string;
  purpose: DueDiligenceCasePurpose;
  requestedScope: EvidenceCategory[];
  evidenceList: DueDiligenceEvidenceRecord[];
  findingsList: DueDiligenceFindingRecord[];
  obligationChecks: PropertyFinancialObligationCheckRecord[];
  generatedByUid: string;
  nowTs: NormalizedTimestamp;
}): DueDiligenceCompletionAssessmentRecord {
  const assessmentId = `ddass_${crypto.randomBytes(6).toString('hex')}`;
  const nowMs = params.nowTs.epochMs;

  const expiredEvidenceIds: string[] = [];
  const verifiedCategoriesSet = new Set<EvidenceCategory>();

  for (const ev of params.evidenceList) {
    const isPastExpiry =
      ev.expirationDateIso !== null && Date.parse(ev.expirationDateIso) <= nowMs;
    if (ev.verificationStatus === 'EXPIRED' || isPastExpiry) {
      expiredEvidenceIds.push(ev.evidenceId);
      continue;
    }
    if (ev.verificationStatus === 'VERIFIED') {
      verifiedCategoriesSet.add(ev.category);
    }
  }

  const verifiedEvidenceCategories = params.requestedScope.filter((cat) =>
    verifiedCategoriesSet.has(cat),
  );
  const missingEvidenceCategories = params.requestedScope.filter(
    (cat) => !verifiedCategoriesSet.has(cat),
  );

  const unresolvedFindings = params.findingsList.filter(
    (f) => f.resolutionStatus === 'OPEN_UNRESOLVED',
  );
  const highOrCriticalUnresolved = unresolvedFindings.filter(
    (f) => f.severityClassification === 'HIGH' || f.severityClassification === 'CRITICAL',
  );

  const unknownObligationDomains = params.obligationChecks.filter(
    (o) =>
      o.statusClassification === 'UNKNOWN_FINANCIAL_STATUS' ||
      o.statusClassification === 'VERIFIED_OUTSTANDING_OBLIGATION' ||
      o.statusClassification === 'REPORTED_BUT_UNVERIFIED_OBLIGATION',
  );

  let overallState: CompletionAssessmentOverallState = 'NOT_STARTED';
  if (params.evidenceList.length === 0 && params.findingsList.length === 0) {
    overallState = 'NOT_STARTED';
  } else if (highOrCriticalUnresolved.length > 0) {
    overallState = 'BLOCKED';
  } else if (missingEvidenceCategories.length > 0 || expiredEvidenceIds.length > 0) {
    overallState = 'INCOMPLETE';
  } else if (
    params.evidenceList.some(
      (e) =>
        e.verificationStatus === 'SUBMITTED' || e.verificationStatus === 'PENDING_REVIEW',
    )
  ) {
    overallState = 'IN_PROGRESS';
  } else if (unresolvedFindings.length > 0 || unknownObligationDomains.length > 0) {
    overallState = 'COMPLETED_WITH_FINDINGS';
  } else {
    overallState = 'COMPLETED_WITHOUT_IDENTIFIED_FINDINGS';
  }

  return {
    assessmentId,
    versionNumber: params.versionNumber,
    caseId: params.caseId,
    canonicalPropertyId: params.canonicalPropertyId,
    purpose: params.purpose,
    overallState,
    requiredEvidenceCategories: [...params.requestedScope],
    verifiedEvidenceCategories,
    missingEvidenceCategories,
    expiredEvidenceIds,
    unresolvedFindingsCount: unresolvedFindings.length,
    highOrCriticalUnresolvedFindingsCount: highOrCriticalUnresolved.length,
    unknownFinancialObligationDomainsCount: unknownObligationDomains.length,
    scopeSummary: `Evaluated ${params.requestedScope.length} required evidence categories for ${params.purpose} review (${verifiedEvidenceCategories.length} verified, ${missingEvidenceCategories.length} missing).`,
    limitations: [
      'A document’s existence or upload does not independently establish legal authenticity.',
      'Missing financial debt or tax records are classified as unknown status and never imply zero debt.',
      'AI-extracted document metadata is treated as untrusted input and never substitutes for human or official verification.',
    ],
    nonGuaranteeAndNonLegalCertificationDisclaimer:
      'DUE_DILIGENCE_BOUNDARY_DISCLAIMER: Completion assessment reflects only the reviewed evidence within the defined scope. It never implies that a property is legally safe, financially risk-free, structurally sound, or a guaranteed investment.',
    generatedByUid: params.generatedByUid,
    generatedAt: params.nowTs,
  };
}
