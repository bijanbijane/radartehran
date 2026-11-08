/**
 * Service Providers Credentials & Verification Sub-Service
 * (`server/modules/service-providers/credentialsAndVerificationService.ts`)
 * Exclusive ownership: `server/modules/service-providers/`
 */

import type { ServiceProviderRepository } from './repository';
import type {
  CredentialVerificationStatus,
  ProviderCredentialRecord,
  ProviderDomainEvent,
} from './types';
import {
  assertNoSelfVerification,
  ProviderValidationError,
  sanitizeText,
  validateIsoDateString,
  validateSafeFirestoreId,
} from './validation';

export interface CredentialsWorkflowContext {
  repository: ServiceProviderRepository;
  emitEvent: (
    eventType: ProviderDomainEvent['eventType'],
    aggregateId: string,
    aggregateType: ProviderDomainEvent['aggregateType'],
    actorUserId: string,
    payload: Record<string, unknown>,
  ) => Promise<void>;
}

export async function submitCredentialWorkflow(
  ctx: CredentialsWorkflowContext,
  input: {
    ownerId: string;
    ownerType: 'individual' | 'organization';
    credentialType: ProviderCredentialRecord['credentialType'];
    issuingAuthorityFa: string;
    credentialIdentifier?: string;
    issueDateIso: string;
    expiryDateIso?: string;
    supportingMediaIds?: string[];
  },
  actorUserId: string,
): Promise<ProviderCredentialRecord> {
  const ownerId = validateSafeFirestoreId(input.ownerId, 'ownerId');
  const authority = sanitizeText(input.issuingAuthorityFa, 200);
  if (authority.length < 3) {
    throw new ProviderValidationError('INVALID_ISSUING_AUTHORITY', 'Issuing authority name must be at least 3 characters.');
  }

  const issueDate = validateIsoDateString(input.issueDateIso, 'issueDateIso');
  const expiryDate = input.expiryDateIso ? validateIsoDateString(input.expiryDateIso, 'expiryDateIso') : undefined;

  if (expiryDate && new Date(expiryDate).getTime() < new Date(issueDate).getTime()) {
    throw new ProviderValidationError('INVALID_EXPIRY_DATE', 'Credential expiry date cannot be earlier than issue date.');
  }

  const credentialId = `crd_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
  const now = new Date().toISOString();

  const record: ProviderCredentialRecord = {
    credentialId,
    ownerId,
    ownerType: input.ownerType,
    credentialType: input.credentialType,
    issuingAuthorityFa: authority,
    credentialIdentifier: sanitizeText(input.credentialIdentifier, 100) || undefined,
    issueDateIso: issueDate,
    expiryDateIso: expiryDate,
    supportingMediaIds: input.supportingMediaIds || [],
    verificationStatus: 'submitted',
    createdAtIso: now,
    updatedAtIso: now,
  };

  await ctx.repository.saveCredential(record);
  await ctx.emitEvent('provider.credential.submitted', credentialId, 'credential', actorUserId, {
    ownerId,
    credentialType: input.credentialType,
  });

  return record;
}

export async function recordCredentialVerificationWorkflow(
  ctx: CredentialsWorkflowContext,
  credentialId: string,
  decision: 'verified' | 'rejected',
  rejectionReasonFa: string | undefined,
  reviewerUserId: string,
): Promise<ProviderCredentialRecord> {
  const cred = await ctx.repository.getCredentialById(credentialId);
  if (!cred) throw new ProviderValidationError('CREDENTIAL_NOT_FOUND', `Credential ${credentialId} not found.`);

  // Check self verification rule
  if (cred.ownerType === 'individual') {
    const profile = await ctx.repository.getProviderProfileById(cred.ownerId);
    if (profile) {
      assertNoSelfVerification(reviewerUserId, profile.userId);
    }
  }

  const now = new Date().toISOString();
  cred.verificationStatus = decision;
  cred.reviewerUserId = reviewerUserId;
  cred.reviewedAtIso = now;
  cred.rejectionReasonFa = decision === 'rejected' ? sanitizeText(rejectionReasonFa, 300) : undefined;
  cred.updatedAtIso = now;

  await ctx.repository.saveCredential(cred);

  // Update provider profile verification status if verified
  if (decision === 'verified') {
    if (cred.ownerType === 'individual') {
      const profile = await ctx.repository.getProviderProfileById(cred.ownerId);
      if (profile) {
        profile.verificationStatus = 'credential_verified';
        await ctx.repository.saveProviderProfile(profile);
      }
    } else if (cred.ownerType === 'organization') {
      const org = await ctx.repository.getOrganizationById(cred.ownerId);
      if (org) {
        org.verificationStatus = 'verified';
        await ctx.repository.saveOrganization(org);
      }
    }
  }

  await ctx.emitEvent(
    decision === 'verified' ? 'provider.credential.verified' : 'provider.credential.rejected',
    credentialId,
    'credential',
    reviewerUserId,
    { ownerId: cred.ownerId, decision },
  );

  return cred;
}
