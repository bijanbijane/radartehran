import crypto from 'crypto';
import { CANONICAL_SAFETY_POLICIES } from './lifecycleAndValidation';
import type {
  EvidenceAccessLevel,
  EvidenceType,
  ReportCategory,
  ReportableEntityType,
  RiskSeverity,
  StoredEvidenceRecord,
  StoredRiskAssessment,
  StoredUserReport,
} from './types';

/**
 * Transparent, evidence-based risk assessment engine.
 * Never equates high report counts alone with proven guilt.
 * Deduplicates repeated submissions from the same reporter.
 */
export function evaluateEntityRiskHeuristic(params: {
  targetType: ReportableEntityType;
  targetId: string;
  category: ReportCategory;
  reports: StoredUserReport[];
  signals: string[];
  reviewerUid: string;
  nowIso: string;
}): StoredRiskAssessment {
  const policy = CANONICAL_SAFETY_POLICIES[params.category];
  const uniqueReporters = new Set(params.reports.map((r) => r.reporterUid));
  const distinctReportsCount = uniqueReporters.size;

  let severity: RiskSeverity = policy.defaultSeverity;
  const considered: string[] = [
    `policy_default_severity_${policy.defaultSeverity}`,
    `distinct_reporters_${distinctReportsCount}`,
    ...params.signals,
  ];

  // Specific risk heuristics:
  if (params.category === 'payment_fraud' || params.category === 'impersonation') {
    severity = 'critical';
  } else if (params.category === 'harassment' || params.category === 'unauthorized_representation') {
    severity = distinctReportsCount >= 3 ? 'critical' : 'high';
  } else if (params.category === 'duplicate_listing' || params.category === 'fake_review') {
    severity = distinctReportsCount >= 5 ? 'medium' : 'low';
  } else if (distinctReportsCount >= 4 && severity === 'low') {
    severity = 'medium';
  }

  const limitations: string[] = [
    'Automated heuristic signal only; requires human moderator review before applying severe sanctions.',
    'Report counts are deduplicated per distinct reporter to prevent coordinated brigading.',
  ];

  return {
    id: `risk_${crypto.randomUUID().replace(/-/g, '').slice(0, 16)}`,
    targetType: params.targetType,
    targetId: params.targetId,
    severity,
    signalsConsidered: considered,
    evaluationMethod: 'rule_heuristic',
    policyVersion: policy.version,
    reviewerUid: params.reviewerUid,
    limitations,
    evaluatedAtIso: params.nowIso,
  };
}

/**
 * Builds an evidence record with optional cryptographic hash calculation.
 */
export function buildEvidenceRecord(params: {
  caseId: string;
  type: EvidenceType;
  sourceModule: string;
  sourceRef: string;
  submittedByUid: string;
  accessClassification?: EvidenceAccessLevel;
  description: string;
  contentForHash?: string;
  nowIso: string;
}): StoredEvidenceRecord {
  const hash = params.contentForHash
    ? crypto.createHash('sha256').update(params.contentForHash, 'utf8').digest('hex')
    : undefined;

  return {
    id: `ev_${crypto.randomUUID().replace(/-/g, '').slice(0, 16)}`,
    caseId: params.caseId,
    type: params.type,
    sourceModule: params.sourceModule,
    sourceRef: params.sourceRef,
    submittedByUid: params.submittedByUid,
    sha256Hash: hash,
    accessClassification: params.accessClassification ?? 'internal_moderator_only',
    description: params.description,
    createdAtIso: params.nowIso,
  };
}

/**
 * Redacts restricted evidence based on viewer role and identity.
 */
export function sanitizeEvidenceForViewer(
  evidence: StoredEvidenceRecord[],
  viewer: { uid: string; role: string },
): StoredEvidenceRecord[] {
  const isPrivileged =
    viewer.role === 'primary_admin' ||
    viewer.role === 'delegated_admin' ||
    viewer.role === 'server_secret_admin';

  if (isPrivileged) {
    return evidence;
  }

  return evidence.filter((e) => {
    if (e.accessClassification === 'public') return true;
    if (e.accessClassification === 'reporter_only' && e.submittedByUid === viewer.uid) return true;
    if (e.accessClassification === 'target_and_reporter' && e.submittedByUid === viewer.uid) return true;
    return false;
  });
}
