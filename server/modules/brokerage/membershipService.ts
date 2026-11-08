/**
 * @file server/modules/brokerage/membershipService.ts
 * @description Service for Agent Profiles, Agency Memberships, Invitation Lifecycles, and Teams.
 */

import type {
  AgentProfessionalProfile,
  AgencyMembershipRecord,
  AgencyTeamRecord,
  InternalAgencyRole,
  MembershipStatus,
  ServiceCategory,
} from './types';
import type { BrokerageStore } from './store';
import type { BrokerageNotificationEventSink } from './adapters';
import {
  authorizeAgencyAction,
  validateRoleAssignmentPermission,
} from './authorization';
import {
  validateSafeId,
  validateInternalRole,
  sanitizeText,
  BrokerageValidationError,
} from './validation';

export interface RegisterAgentProfileInput {
  publicDisplayName: string;
  professionalBio: string;
  languages?: string[];
  serviceCategories: ServiceCategory[];
  geographicCoverage: {
    cityId: string;
    coveredNeighborhoodIds: number[];
  }[];
  experienceYears?: number;
  credentialReferences?: string[];
}

export interface InviteMemberInput {
  agencyId: string;
  userUid: string;
  role: InternalAgencyRole;
  branchId?: string | null;
  teamId?: string | null;
}

export class MembershipService {
  constructor(
    private readonly store: BrokerageStore,
    private readonly notificationSink: BrokerageNotificationEventSink,
  ) {}

  // --- Agent Profile ---
  async registerAgentProfile(
    userUid: string,
    input: RegisterAgentProfileInput,
  ): Promise<AgentProfessionalProfile> {
    if (!userUid) throw new BrokerageValidationError('AUTH_REQUIRED', 'User UID required.');
    const displayName = sanitizeText(input.publicDisplayName, 100);
    if (!displayName || displayName.length < 2) {
      throw new BrokerageValidationError('INVALID_NAME', 'Display name must be at least 2 characters.');
    }

    const existing = await this.store.getAgentProfileByUserUid(userUid);
    const profileId = existing?.id || `agp_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
    const nowIso = new Date().toISOString();

    const profile: AgentProfessionalProfile = {
      id: profileId,
      userUid,
      publicDisplayName: displayName,
      professionalBio: sanitizeText(input.professionalBio, 1500),
      languages: (input.languages || ['fa']).map((l) => sanitizeText(l, 30)),
      serviceCategories: input.serviceCategories || ['residential_sale', 'residential_rent'],
      geographicCoverage: input.geographicCoverage || [],
      experienceYears: typeof input.experienceYears === 'number' && input.experienceYears >= 0 ? input.experienceYears : undefined,
      credentialReferences: (input.credentialReferences || []).map((r) => sanitizeText(r, 64)),
      publicationStatus: 'published',
      verificationState: existing?.verificationState || 'unverified',
      createdAtIso: existing?.createdAtIso || nowIso,
      updatedAtIso: nowIso,
      version: existing ? existing.version + 1 : 1,
    };

    return this.store.saveAgentProfile(profile);
  }

  async getAgentProfile(userUid: string): Promise<AgentProfessionalProfile | null> {
    return this.store.getAgentProfileByUserUid(userUid);
  }

  // --- Memberships & Invitations ---
  async inviteMember(
    actorUid: string,
    input: InviteMemberInput,
    isPlatformAdmin = false,
  ): Promise<AgencyMembershipRecord> {
    validateSafeId(input.agencyId, 'agencyId');
    validateSafeId(input.userUid, 'userUid');
    const targetRole = validateInternalRole(input.role);

    const agency = await this.store.getAgencyById(input.agencyId);
    if (!agency) throw new BrokerageValidationError('NOT_FOUND', `Agency ${input.agencyId} not found.`);

    // Active agency operating status required
    if (agency.operatingStatus === 'suspended' || agency.operatingStatus === 'closed') {
      throw new BrokerageValidationError('AGENCY_SUSPENDED', `Cannot invite members while agency is ${agency.operatingStatus}.`);
    }

    const actorMembership = await this.store.findMembershipByAgencyAndUser(input.agencyId, actorUid);
    const authDecision = authorizeAgencyAction('agency.manage_memberships', {
      principalUid: actorUid,
      isPlatformAdmin,
      agency,
      membership: actorMembership,
      targetBranchId: input.branchId,
    });
    if (!authDecision.allowed) {
      throw new BrokerageValidationError('FORBIDDEN', authDecision.reason || 'Unauthorized to manage memberships.');
    }

    // Role escalation prevention
    if (!isPlatformAdmin) {
      const escalationCheck = validateRoleAssignmentPermission(
        actorMembership?.role || 'administrative_employee',
        targetRole,
        actorUid,
        input.userUid,
      );
      if (!escalationCheck.allowed) {
        throw new BrokerageValidationError('UNAUTHORIZED_ROLE_ESCALATION', escalationCheck.reason || 'Role escalation prohibited.');
      }
    }

    // Branch validity
    if (input.branchId) {
      const branch = await this.store.getBranchById(input.branchId);
      if (!branch || branch.agencyId !== input.agencyId) {
        throw new BrokerageValidationError('INVALID_BRANCH', 'Specified branch does not belong to this agency.');
      }
    }

    // Check existing active or invited membership
    const existingMembership = await this.store.findMembershipByAgencyAndUser(input.agencyId, input.userUid);
    if (existingMembership) {
      if (existingMembership.status === 'active') {
        throw new BrokerageValidationError('ALREADY_MEMBER', 'User is already an active member of this agency.');
      }
      if (existingMembership.status === 'invited') {
        throw new BrokerageValidationError('ALREADY_INVITED', 'User already has a pending invitation for this agency.');
      }
    }

    const nowIso = new Date().toISOString();
    const expiresIso = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString();
    const token = `inv_${Date.now()}_${Math.random().toString(36).slice(2, 12)}`;
    const membershipId = `mem_${input.agencyId}_${input.userUid}_${Date.now()}`;

    const record: AgencyMembershipRecord = {
      id: membershipId,
      agencyId: input.agencyId,
      userUid: input.userUid,
      branchId: input.branchId || null,
      teamId: input.teamId || null,
      role: targetRole,
      status: 'invited',
      invitationToken: token,
      invitedByUid: actorUid,
      invitedAtIso: nowIso,
      expiresAtIso: expiresIso,
      createdAtIso: nowIso,
      updatedAtIso: nowIso,
      version: 1,
    };

    const saved = await this.store.saveMembership(record);

    await this.notificationSink.emitEvent({
      eventType: 'brokerage.invitation_created',
      recipientUid: input.userUid,
      agencyId: input.agencyId,
      actorUid,
      data: { role: targetRole, agencyName: agency.publicDisplayName, invitationToken: token },
      timestampIso: nowIso,
    });

    await this.store.saveActivityRecord({
      id: `act_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`,
      agencyId: input.agencyId,
      branchId: input.branchId,
      actorUid,
      actorRole: actorMembership?.role || 'agency_owner',
      actionType: 'invitation_created',
      resourceType: 'membership',
      resourceId: membershipId,
      timestampIso: nowIso,
      metadata: { targetUserUid: input.userUid, role: targetRole },
    });

    return saved;
  }

  async acceptInvitation(
    membershipId: string,
    userUid: string,
    token?: string,
  ): Promise<AgencyMembershipRecord> {
    validateSafeId(membershipId, 'membershipId');
    const membership = await this.store.getMembershipById(membershipId);
    if (!membership) throw new BrokerageValidationError('NOT_FOUND', 'Invitation record not found.');

    if (membership.userUid !== userUid) {
      throw new BrokerageValidationError('FORBIDDEN', 'User cannot accept an invitation addressed to someone else.');
    }
    if (membership.status !== 'invited') {
      throw new BrokerageValidationError('INVALID_STATUS', `Invitation is not pending (status: ${membership.status}).`);
    }
    if (membership.expiresAtIso && Date.parse(membership.expiresAtIso) < Date.now()) {
      membership.status = 'rejected';
      membership.terminationReason = 'Invitation expired.';
      await this.store.saveMembership(membership);
      throw new BrokerageValidationError('INVITATION_EXPIRED', 'This invitation has expired.');
    }
    if (token && membership.invitationToken && membership.invitationToken !== token) {
      throw new BrokerageValidationError('INVALID_TOKEN', 'Supplied invitation token is invalid.');
    }

    const agency = await this.store.getAgencyById(membership.agencyId);
    if (!agency || agency.operatingStatus === 'suspended' || agency.operatingStatus === 'closed') {
      throw new BrokerageValidationError('AGENCY_SUSPENDED', 'Agency is currently not active.');
    }

    membership.status = 'active';
    membership.acceptedAtIso = new Date().toISOString();
    const saved = await this.store.saveMembership(membership);

    await this.notificationSink.emitEvent({
      eventType: 'brokerage.invitation_accepted',
      recipientUid: agency.ownerUid,
      agencyId: membership.agencyId,
      actorUid: userUid,
      data: { role: membership.role, memberUid: userUid },
      timestampIso: new Date().toISOString(),
    });

    return saved;
  }

  async updateMembershipRole(
    actorUid: string,
    membershipId: string,
    newRole: InternalAgencyRole,
    isPlatformAdmin = false,
  ): Promise<AgencyMembershipRecord> {
    const membership = await this.store.getMembershipById(membershipId);
    if (!membership) throw new BrokerageValidationError('NOT_FOUND', 'Membership record not found.');

    const targetRole = validateInternalRole(newRole);
    const agency = await this.store.getAgencyById(membership.agencyId);
    const actorMembership = await this.store.findMembershipByAgencyAndUser(membership.agencyId, actorUid);

    const authDecision = authorizeAgencyAction('agency.manage_memberships', {
      principalUid: actorUid,
      isPlatformAdmin,
      agency,
      membership: actorMembership,
      targetBranchId: membership.branchId,
    });
    if (!authDecision.allowed) {
      throw new BrokerageValidationError('FORBIDDEN', authDecision.reason || 'Unauthorized to alter roles.');
    }

    if (!isPlatformAdmin) {
      const escalationCheck = validateRoleAssignmentPermission(
        actorMembership?.role || 'administrative_employee',
        targetRole,
        actorUid,
        membership.userUid,
      );
      if (!escalationCheck.allowed) {
        throw new BrokerageValidationError('UNAUTHORIZED_ROLE_ESCALATION', escalationCheck.reason || 'Escalation rejected.');
      }
    }

    membership.role = targetRole;
    membership.updatedAtIso = new Date().toISOString();
    return this.store.saveMembership(membership);
  }

  async terminateMembership(
    actorUid: string,
    membershipId: string,
    reason: string,
    isPlatformAdmin = false,
  ): Promise<AgencyMembershipRecord> {
    const membership = await this.store.getMembershipById(membershipId);
    if (!membership) throw new BrokerageValidationError('NOT_FOUND', 'Membership record not found.');

    const isSelfLeaving = actorUid === membership.userUid;
    if (!isSelfLeaving && !isPlatformAdmin) {
      const agency = await this.store.getAgencyById(membership.agencyId);
      const actorMembership = await this.store.findMembershipByAgencyAndUser(membership.agencyId, actorUid);
      const authDecision = authorizeAgencyAction('agency.manage_memberships', {
        principalUid: actorUid,
        agency,
        membership: actorMembership,
        targetBranchId: membership.branchId,
      });
      if (!authDecision.allowed) {
        throw new BrokerageValidationError('FORBIDDEN', 'Unauthorized to terminate this membership.');
      }
    }

    membership.status = 'terminated';
    membership.terminatedAtIso = new Date().toISOString();
    membership.terminationReason = sanitizeText(reason, 200) || 'Terminated by authorized action.';
    return this.store.saveMembership(membership);
  }

  async listAgencyMembers(agencyId: string, status?: MembershipStatus): Promise<AgencyMembershipRecord[]> {
    validateSafeId(agencyId, 'agencyId');
    return this.store.findMembershipsByAgency(agencyId, status);
  }
}
