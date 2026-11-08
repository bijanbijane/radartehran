/**
 * Service Providers Organizations & Membership Sub-Service
 * (`server/modules/service-providers/organizationsAndMembersService.ts`)
 * Exclusive ownership: `server/modules/service-providers/`
 */

import type { ServiceProviderRepository } from './repository';
import type {
  OrganizationMembership,
  OrganizationRole,
  ProviderDomainEvent,
  ProviderOrganization,
  ServiceAreaDeclaration,
} from './types';
import {
  ProviderValidationError,
  sanitizeText,
  validateProviderCategory,
  validateSafeFirestoreId,
} from './validation';

export interface OrgWorkflowContext {
  repository: ServiceProviderRepository;
  emitEvent: (
    eventType: ProviderDomainEvent['eventType'],
    aggregateId: string,
    aggregateType: ProviderDomainEvent['aggregateType'],
    actorUserId: string,
    payload: Record<string, unknown>,
  ) => Promise<void>;
}

export async function createOrganizationWorkflow(
  ctx: OrgWorkflowContext,
  input: {
    nameFa: string;
    organizationType: ProviderOrganization['organizationType'];
    primaryCategory: ProviderOrganization['primaryCategory'];
    businessDescriptionFa?: string;
    specialties?: string[];
    serviceAreas?: ServiceAreaDeclaration[];
    publicPhone?: string;
    publicEmail?: string;
    websiteUrl?: string;
  },
  ownerUserId: string,
): Promise<ProviderOrganization> {
  const nameFa = sanitizeText(input.nameFa, 200);
  if (nameFa.length < 3) {
    throw new ProviderValidationError('INVALID_ORG_NAME', 'Organization name must be at least 3 characters.');
  }

  const category = validateProviderCategory(input.primaryCategory);
  const organizationId = `org_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
  const now = new Date().toISOString();

  const org: ProviderOrganization = {
    organizationId,
    nameFa,
    organizationType: input.organizationType,
    businessDescriptionFa: sanitizeText(input.businessDescriptionFa, 1000) || undefined,
    primaryCategory: category,
    specialties: input.specialties?.map((s) => sanitizeText(s, 100)).filter(Boolean) || [],
    serviceAreas: input.serviceAreas || [],
    publicPhone: sanitizeText(input.publicPhone, 50) || undefined,
    publicEmail: sanitizeText(input.publicEmail, 100) || undefined,
    websiteUrl: sanitizeText(input.websiteUrl, 200) || undefined,
    verificationStatus: 'not_submitted',
    publicationStatus: 'published',
    createdAtIso: now,
    updatedAtIso: now,
  };

  await ctx.repository.saveOrganization(org);

  // Add owner as organization owner member
  const ownerMembership: OrganizationMembership = {
    membershipId: `mem_${organizationId}_${ownerUserId}`,
    organizationId,
    userId: ownerUserId,
    role: 'owner',
    isActive: true,
    joinedAtIso: now,
    invitedByUserId: ownerUserId,
  };
  await ctx.repository.saveMembership(ownerMembership);

  await ctx.emitEvent('provider.organization.created', organizationId, 'organization', ownerUserId, {
    nameFa,
    primaryCategory: category,
  });

  return org;
}

export async function addOrganizationMemberWorkflow(
  ctx: OrgWorkflowContext,
  input: {
    organizationId: string;
    targetUserId: string;
    role: OrganizationRole;
    jobTitleFa?: string;
  },
  actorUserId: string,
): Promise<OrganizationMembership> {
  const orgId = validateSafeFirestoreId(input.organizationId, 'organizationId');
  const targetId = validateSafeFirestoreId(input.targetUserId, 'targetUserId');

  const callerMem = await ctx.repository.getMembership(orgId, actorUserId);
  if (!callerMem || (callerMem.role !== 'owner' && callerMem.role !== 'administrator')) {
    throw new ProviderValidationError('UNAUTHORIZED_MEMBERSHIP_MANAGEMENT', 'Only organization owners or administrators can add members.');
  }

  const existing = await ctx.repository.getMembership(orgId, targetId);
  if (existing && existing.isActive) {
    throw new ProviderValidationError('MEMBER_ALREADY_EXISTS', 'User is already an active member of this organization.');
  }

  const now = new Date().toISOString();
  const membership: OrganizationMembership = {
    membershipId: `mem_${orgId}_${targetId}`,
    organizationId: orgId,
    userId: targetId,
    role: input.role,
    jobTitleFa: sanitizeText(input.jobTitleFa, 100) || undefined,
    isActive: true,
    joinedAtIso: now,
    invitedByUserId: actorUserId,
  };

  await ctx.repository.saveMembership(membership);
  await ctx.emitEvent('provider.organization.member_added', orgId, 'organization', actorUserId, {
    targetUserId: targetId,
    role: input.role,
  });

  return membership;
}

export async function removeOrganizationMemberWorkflow(
  ctx: OrgWorkflowContext,
  organizationId: string,
  targetUserId: string,
  actorUserId: string,
): Promise<void> {
  const callerMem = await ctx.repository.getMembership(organizationId, actorUserId);
  if (!callerMem || (callerMem.role !== 'owner' && callerMem.role !== 'administrator')) {
    throw new ProviderValidationError('UNAUTHORIZED_MEMBERSHIP_MANAGEMENT', 'Only organization owners or administrators can remove members.');
  }

  const targetMem = await ctx.repository.getMembership(organizationId, targetUserId);
  if (!targetMem || !targetMem.isActive) {
    throw new ProviderValidationError('MEMBER_NOT_FOUND', 'Active membership not found for user.');
  }

  if (targetMem.role === 'owner') {
    throw new ProviderValidationError('CANNOT_REMOVE_ORGANIZATION_OWNER', 'Organization owner cannot be removed.');
  }

  targetMem.isActive = false;
  await ctx.repository.saveMembership(targetMem);

  await ctx.emitEvent('provider.organization.member_removed', organizationId, 'organization', actorUserId, {
    targetUserId,
  });
}
