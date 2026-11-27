import type { NipsNeighborhoodProfile } from './types';
import type { NipsPublicationPolicy, NipsProfileValidationIssue } from './validation';
import { validateNipsNeighborhoodProfile, validateNipsPublicationPolicy, NIPS_DEFAULT_PUBLICATION_POLICY } from './validation';
import { computeNipsProfileContentHash } from './canonicalHash';

export type NipsPublicationAudience = 'PUBLIC' | 'INTERNAL' | 'RESTRICTED';

interface NipsPublicationBase {
  readonly publicationId: string;
  readonly snapshotId: string;
  readonly canonicalEntityId: string;
  readonly productKey: string;
  readonly audience: NipsPublicationAudience;
  readonly policyVersion: string;
  readonly decidedAt: string;
  readonly actorReference: string | null;
}

export type NipsProfilePublicationRecord =
  | (NipsPublicationBase & {
      readonly decision: 'APPROVED';
      readonly status: 'ACTIVE';
      readonly revocationReason: null;
    })
  | (NipsPublicationBase & {
      readonly decision: 'REJECTED';
      readonly status: 'SUPERSEDED';
      readonly revocationReason: null;
    })
  | (NipsPublicationBase & {
      readonly decision: 'REVOKED';
      readonly status: 'REVOKED';
      readonly revocationReason: string;
    });

export interface NipsPublicationEvaluation {
  readonly approved: boolean;
  readonly issues: readonly NipsProfileValidationIssue[];
}

export interface CreateApprovedNipsPublicationInput {
  readonly profile: NipsNeighborhoodProfile;
  readonly snapshotId: string;
  readonly canonicalEntityId: string;
  readonly publicationId: string;
  readonly productKey: string;
  readonly audience: NipsPublicationAudience;
  readonly decidedAt: string;
  readonly actorReference: string | null;
  readonly policy?: NipsPublicationPolicy;
}

function uniqueIssues(issues: readonly NipsProfileValidationIssue[]): NipsProfileValidationIssue[] {
  const seen = new Set<string>();
  return issues.filter((issue) => {
    const key = issue.code + '|' + issue.path + '|' + issue.message;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

export async function evaluateNipsPublicationCandidate(
  profile: NipsNeighborhoodProfile,
  canonicalEntityId: string,
  policy: NipsPublicationPolicy = NIPS_DEFAULT_PUBLICATION_POLICY
): Promise<NipsPublicationEvaluation> {
  const issues: NipsProfileValidationIssue[] = [
    ...validateNipsNeighborhoodProfile(profile, policy),
    ...validateNipsPublicationPolicy(profile, policy),
  ];

  if (profile.identity?.data?.canonicalEntityId !== canonicalEntityId) {
    issues.push({
      code: 'PUBLICATION_POLICY_VIOLATION',
      path: 'identity.data.canonicalEntityId',
      message: 'Publication entity must match the confirmed canonical identity in the snapshot.',
    });
  }

  if (profile.identity?.data?.identityStatus !== 'CONFIRMED_CANONICAL') {
    issues.push({
      code: 'PUBLICATION_POLICY_VIOLATION',
      path: 'identity.data.identityStatus',
      message: 'Only a confirmed canonical neighborhood identity can be published.',
    });
  }

  if (profile.metadata?.publicationPolicyVersion !== policy.version) {
    issues.push({
      code: 'PUBLICATION_POLICY_VIOLATION',
      path: 'metadata.publicationPolicyVersion',
      message: 'Snapshot publication policy version must exactly match the policy being evaluated.',
    });
  }

  if (profile.metadata?.publicationState === 'REVOKED' || profile.metadata?.publicationState === 'STALE') {
    issues.push({
      code: 'PUBLICATION_POLICY_VIOLATION',
      path: 'metadata.publicationState',
      message: 'Revoked or stale snapshots cannot be activated for publication.',
    });
  }

  const storedHash = profile.metadata?.contentHash;
  if (typeof storedHash !== 'string' || !/^[a-f0-9]{64}$/i.test(storedHash)) {
    issues.push({
      code: 'PUBLICATION_POLICY_VIOLATION',
      path: 'metadata.contentHash',
      message: 'A valid SHA-256 snapshot content hash is required before publication.',
    });
  } else {
    try {
      const computedHash = await computeNipsProfileContentHash(profile);
      if (computedHash !== storedHash.toLowerCase()) {
        issues.push({
          code: 'PUBLICATION_POLICY_VIOLATION',
          path: 'metadata.contentHash',
          message: 'Stored snapshot hash does not match the deterministic content hash.',
        });
      }
    } catch {
      issues.push({
        code: 'PUBLICATION_POLICY_VIOLATION',
        path: 'metadata.contentHash',
        message: 'Snapshot content cannot be deterministically serialized and hashed.',
      });
    }
  }

  const result = uniqueIssues(issues);
  return { approved: result.length === 0, issues: result };
}

export async function createApprovedNipsPublicationRecord(
  input: CreateApprovedNipsPublicationInput
): Promise<Extract<NipsProfilePublicationRecord, { decision: 'APPROVED' }>> {
  const policy = input.policy ?? NIPS_DEFAULT_PUBLICATION_POLICY;
  const evaluation = await evaluateNipsPublicationCandidate(
    input.profile,
    input.canonicalEntityId,
    policy
  );

  if (!evaluation.approved) {
    const error = new Error('NIPS_PUBLICATION_BLOCKED');
    Object.assign(error, { code: 'NIPS_PUBLICATION_BLOCKED', issues: evaluation.issues });
    throw error;
  }

  if (input.productKey !== policy.productKey || input.audience !== policy.audience) {
    const error = new Error('NIPS_PUBLICATION_SCOPE_POLICY_MISMATCH');
    Object.assign(error, { code: 'NIPS_PUBLICATION_SCOPE_POLICY_MISMATCH' });
    throw error;
  }

  return {
    publicationId: input.publicationId,
    snapshotId: input.snapshotId,
    canonicalEntityId: input.canonicalEntityId,
    productKey: input.productKey,
    audience: input.audience,
    policyVersion: policy.version,
    decision: 'APPROVED',
    status: 'ACTIVE',
    decidedAt: input.decidedAt,
    actorReference: input.actorReference,
    revocationReason: null,
  };
}

export function createRejectedNipsPublicationRecord(input: NipsPublicationBase): Extract<NipsProfilePublicationRecord, { decision: 'REJECTED' }> {
  return {
    ...input,
    decision: 'REJECTED',
    status: 'SUPERSEDED',
    revocationReason: null,
  };
}

export function createRevokedNipsPublicationRecord(
  input: NipsPublicationBase & { readonly revocationReason: string }
): Extract<NipsProfilePublicationRecord, { decision: 'REVOKED' }> {
  if (!input.revocationReason.trim()) throw new Error('NIPS_REVOCATION_REASON_REQUIRED');
  return {
    publicationId: input.publicationId,
    snapshotId: input.snapshotId,
    canonicalEntityId: input.canonicalEntityId,
    productKey: input.productKey,
    audience: input.audience,
    policyVersion: input.policyVersion,
    decidedAt: input.decidedAt,
    actorReference: input.actorReference,
    decision: 'REVOKED',
    status: 'REVOKED',
    revocationReason: input.revocationReason.trim(),
  };
}
