/** Public, redacted DTOs for Data Governance read APIs — RT-DGOV-CRITICAL-033 */
import type {
  DataClaimRecord,
  DataCorrectionProposal,
  EntityVersionRecord,
  ProvenanceEdge,
  ReconciliationCase,
  ReviewWorkflowState,
} from '../../../src/features/data-governance/models/dataGovernance.types';

const INTERNAL_REVIEW_STATES: ReadonlySet<ReviewWorkflowState> = new Set([
  'NEW',
  'TRIAGED',
  'ASSIGNED',
  'UNDER_REVIEW',
  'NEEDS_EVIDENCE',
  'CONFLICTED',
  'ESCALATED',
]);

export interface PublicDataClaimDTO {
  claimId: string;
  entityType: string;
  entityId: string;
  attribute: string;
  value: string | number;
  unit?: string;
  sourceType: string;
  verificationStatus: string;
  confidenceLevel: string;
  observedAt: string;
  limitationsFa: string[];
}

export interface PublicReconciliationSummaryDTO {
  caseId: string;
  entityType: string;
  entityId: string;
  attribute: string;
  severity: string;
  status: string;
  requiresHumanReview: boolean;
  createdAt: string;
}

export interface PublicCorrectionProposalDTO {
  proposalId: string;
  entityType: string;
  entityId: string;
  attribute: string;
  status: string;
  createdAt: string;
}

export interface PublicLineageEdgeDTO {
  edgeId: string;
  parentType: string;
  childType: string;
  relationshipType: string;
  transformationId: string;
  createdAt: string;
}

export interface PublicEntityVersionDTO {
  versionId: string;
  entityType: string;
  entityId: string;
  attribute: string;
  versionNumber: number;
  dataVersion: string;
  methodologyVersion: string;
  value: string | number;
  qualityStatus: string;
  validFrom: string;
  validTo?: string;
  changeType: string;
  published: boolean;
}

function redactEntityIdForPublic(entityId: string): string {
  if (/^\d+$/.test(entityId)) return entityId;
  return entityId.replace(/[a-zA-Z0-9_-]{20,}/g, '[redacted]');
}

export function toPublicDataClaimDTO(claim: DataClaimRecord): PublicDataClaimDTO | null {
  if (claim.verificationStatus === 'REJECTED' || claim.verificationStatus === 'UNVERIFIED') return null;
  const limitations: string[] = [];
  if (claim.confidenceLevel === 'LOW' || claim.confidenceLevel === 'UNKNOWN') {
    limitations.push('سطح اطمینان این ادعا محدود است؛ صرفاً برای تحلیل غیررسمی.');
  }
  return {
    claimId: claim.id,
    entityType: claim.entityType,
    entityId: redactEntityIdForPublic(claim.entityId),
    attribute: claim.attribute,
    value: claim.value,
    unit: claim.unit,
    sourceType: claim.sourceType,
    verificationStatus: claim.verificationStatus,
    confidenceLevel: claim.confidenceLevel,
    observedAt: claim.observedAt,
    limitationsFa: limitations,
  };
}

export function toPublicReconciliationSummary(c: ReconciliationCase): PublicReconciliationSummaryDTO | null {
  if (INTERNAL_REVIEW_STATES.has(c.status)) return null;
  return {
    caseId: c.id,
    entityType: c.entityType,
    entityId: redactEntityIdForPublic(c.entityId),
    attribute: c.attribute,
    severity: c.severity,
    status: c.status,
    requiresHumanReview: c.requiresHumanReview,
    createdAt: c.createdAt,
  };
}

export function toPublicCorrectionProposal(p: DataCorrectionProposal): PublicCorrectionProposalDTO | null {
  if (p.status !== 'PUBLISHED' && p.status !== 'RESOLVED' && p.status !== 'CLOSED') return null;
  return {
    proposalId: p.id,
    entityType: p.entityType,
    entityId: redactEntityIdForPublic(p.entityId),
    attribute: p.attribute,
    status: p.status,
    createdAt: p.createdAt,
  };
}

export function toPublicLineageEdge(edge: ProvenanceEdge): PublicLineageEdgeDTO {
  return {
    edgeId: edge.id,
    parentType: edge.parentType,
    childType: edge.childType,
    relationshipType: edge.relationshipType,
    transformationId: edge.transformationId,
    createdAt: edge.createdAt,
  };
}

export function toPublicEntityVersion(v: EntityVersionRecord): PublicEntityVersionDTO | null {
  const published = v.qualityStatus !== 'UNVERIFIED' && v.qualityStatus !== 'REJECTED';
  if (!published) return null;
  return {
    versionId: v.id,
    entityType: v.entityType,
    entityId: redactEntityIdForPublic(v.entityId),
    attribute: v.attribute,
    versionNumber: v.versionNumber,
    dataVersion: v.dataVersion,
    methodologyVersion: v.methodologyVersion,
    value: v.value,
    qualityStatus: v.qualityStatus,
    validFrom: v.validFrom,
    validTo: v.validTo,
    changeType: v.changeType,
    published: true,
  };
}