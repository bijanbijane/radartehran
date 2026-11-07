/**
 * @file server/modules/real-estate-professionals/professionalEngine.ts
 * @description Core business logic engine for real estate professionals, agency management, and license verification.
 */

import crypto from 'node:crypto';
import type { ProfessionalStore } from './professionalStore';
import type {
  AgencyBranch,
  AgencyMembershipRecord,
  AgencyMembershipState,
  AgencyProfile,
  ListingAgentAssociation,
  ProfessionalCredential,
  ProfessionalCredentialType,
  ProfessionalDomainEvent,
  ProfessionalPrivateProfile,
  RealEstateRole,
  VerificationStatus,
} from './professionalTypes';
import {
  validateAgencyInput,
  validateMembershipTransition,
  validateOfficialVerificationUrl,
  validateProfessionalProfileInput,
} from './professionalValidator';
import type { AuthoritativeRegistryAdapter } from './registryVerificationAdapter';

export class ProfessionalEngine {
  private readonly domainEvents: ProfessionalDomainEvent[] = [];

  constructor(
    private readonly store: ProfessionalStore,
    private readonly registryAdapter: AuthoritativeRegistryAdapter,
  ) {}

  // --- Professional Profile Management ---

  public async registerOrUpdateProfessional(
    userId: string,
    params: {
      publicDisplayName: string;
      role: RealEstateRole;
      primaryCityId: string;
      activeHoodIds?: number[];
      publicBioFa: string;
      contactPhone: string;
    },
  ): Promise<{ success: boolean; errors?: string[]; profile?: ProfessionalPrivateProfile }> {
    const val = validateProfessionalProfileInput(params);
    if (!val.valid || !val.sanitized) {
      return { success: false, errors: val.errors };
    }

    const store = this.store as ProfessionalStore;
    const existing = await store.getProfessionalByUserId(userId);
    const nowIso = new Date().toISOString();
    const id = existing?.id || `pro_${Date.now()}_${crypto.randomBytes(3).toString('hex')}`;

    const profile: ProfessionalPrivateProfile = {
      id,
      userId,
      publicDisplayName: val.sanitized.publicDisplayName,
      role: val.sanitized.role,
      primaryCityId: val.sanitized.primaryCityId,
      activeHoodIds: val.sanitized.activeHoodIds,
      publicBioFa: val.sanitized.publicBioFa,
      contactPhone: val.sanitized.contactPhone,
      verificationStatus: existing?.verificationStatus || 'NOT_SUBMITTED',
      verificationPillars: existing?.verificationPillars || {
        phoneVerified: false,
        identityVerified: false,
        licenseVerified: false,
        verificationMethod: 'UNVERIFIED',
      },
      operatingStatus: 'active',
      credentialIds: existing?.credentialIds || [],
      createdAtIso: existing?.createdAtIso || nowIso,
      updatedAtIso: nowIso,
    };

    const saved = await store.saveProfessionalProfile(profile);

    this.emitEvent({
      eventType: 'professional.profile_submitted',
      recipientUid: userId,
      relatedEntityId: saved.id,
      summaryFa: `پروفایل مشاور املاک «${saved.publicDisplayName}» با موفقیت ثبت شد.`,
    });

    return { success: true, profile: saved };
  }

  // --- Separate Phone Verification ---

  public async recordPhoneVerification(userId: string): Promise<boolean> {
    const store = this.store as ProfessionalStore;
    const profile = await store.getProfessionalByUserId(userId);
    if (!profile) return false;

    // Strict invariant: phone verification NEVER grants license verification!
    const updated: ProfessionalPrivateProfile = {
      ...profile,
      verificationPillars: {
        ...profile.verificationPillars,
        phoneVerified: true,
      },
      updatedAtIso: new Date().toISOString(),
    };

    await store.saveProfessionalProfile(updated);
    await store.logAudit('phone_ownership_verified', userId, { phone: profile.contactPhone });
    return true;
  }

  // --- Agency & Branch Management ---

  public async registerAgency(
    ownerUid: string,
    params: {
      registeredLegalNameFa: string;
      publicTradingNameFa: string;
      tradeUnionLicenseNumber: string;
      cityId: string;
      centralOfficeAddressFa: string;
      publicPhone: string;
      privateContactPhone: string;
    },
  ): Promise<{ success: boolean; errors?: string[]; agency?: AgencyProfile }> {
    const val = validateAgencyInput(params);
    if (!val.valid || !val.sanitized) {
      return { success: false, errors: val.errors };
    }

    const store = this.store as ProfessionalStore;
    const nowIso = new Date().toISOString();
    const agencyId = `ag_${Date.now()}_${crypto.randomBytes(3).toString('hex')}`;

    const agency: AgencyProfile = {
      id: agencyId,
      ownerUid,
      registeredLegalNameFa: val.sanitized.registeredLegalNameFa,
      publicTradingNameFa: val.sanitized.publicTradingNameFa,
      tradeUnionLicenseNumber: val.sanitized.tradeUnionLicenseNumber,
      cityId: val.sanitized.cityId,
      centralOfficeAddressFa: val.sanitized.centralOfficeAddressFa,
      publicPhone: val.sanitized.publicPhone,
      privateContactPhone: val.sanitized.privateContactPhone,
      verificationStatus: 'SUBMITTED_UNVERIFIED',
      verificationPillars: {
        phoneVerified: false,
        identityVerified: false,
        licenseVerified: false,
        verificationMethod: 'UNVERIFIED',
      },
      branches: [],
      managerUids: [ownerUid],
      isActive: true,
      createdAtIso: nowIso,
      updatedAtIso: nowIso,
    };

    const saved = await store.saveAgencyProfile(agency);

    this.emitEvent({
      eventType: 'agency.submitted',
      recipientUid: ownerUid,
      relatedEntityId: saved.id,
      summaryFa: `دفتر املاک «${saved.publicTradingNameFa}» ثبت گردید و در صف اعتبارسنجی پروانه قرار گرفت.`,
    });

    return { success: true, agency: saved };
  }

  public async addAgencyBranch(
    actorUid: string,
    agencyId: string,
    params: {
      branchNameFa: string;
      cityId: string;
      districtId?: string;
      hoodId?: number;
      streetAddressFa: string;
      phone: string;
      branchManagerUid?: string;
    },
  ): Promise<{ success: boolean; errors?: string[]; branch?: AgencyBranch }> {
    const store = this.store as ProfessionalStore;
    const agency = await store.getAgencyById(agencyId);
    if (!agency) return { success: false, errors: ['AGENCY_NOT_FOUND'] };

    // Only owner or managers can add branches
    if (agency.ownerUid !== actorUid && !agency.managerUids.includes(actorUid)) {
      return { success: false, errors: ['FORBIDDEN_BRANCH_CREATION'] };
    }

    const nowIso = new Date().toISOString();
    const branch: AgencyBranch = {
      id: `br_${agencyId}_${Date.now()}`,
      agencyId,
      branchNameFa: params.branchNameFa.trim().slice(0, 100),
      cityId: params.cityId,
      districtId: params.districtId,
      hoodId: params.hoodId,
      streetAddressFa: params.streetAddressFa.trim().slice(0, 300),
      phone: params.phone.trim(),
      branchManagerUid: params.branchManagerUid,
      isActive: true,
      createdAtIso: nowIso,
      updatedAtIso: nowIso,
    };

    const updatedAgency: AgencyProfile = {
      ...agency,
      branches: [...agency.branches, branch],
      updatedAtIso: nowIso,
    };

    await store.saveAgencyProfile(updatedAgency);
    return { success: true, branch };
  }

  // --- Credential Submission & Authoritative Registry Verification ---

  public async submitAndVerifyCredential(
    actorUid: string,
    params: {
      ownerId: string;
      ownerType: 'professional' | 'agency';
      credentialType: ProfessionalCredentialType;
      issuingAuthorityFa: string;
      licenseNumber: string;
      documentMediaId: string;
      autoQueryRegistry?: boolean;
    },
  ): Promise<{ success: boolean; credential?: ProfessionalCredential; lookupResult?: unknown }> {
    const store = this.store as ProfessionalStore;
    const nowIso = new Date().toISOString();
    const credId = `crd_${Date.now()}_${crypto.randomBytes(3).toString('hex')}`;

    let verificationStatus: VerificationStatus = 'UNDER_MANUAL_REVIEW';
    let verificationMethod: 'OFFICIAL_REGISTRY' | 'MANUAL_COMPLIANCE_AUDIT' | 'UNVERIFIED' = 'UNVERIFIED';
    let lookupResult;

    // Attempt authoritative registry lookup if requested
    if (params.autoQueryRegistry) {
      lookupResult = await this.registryAdapter.lookupLicense(params.credentialType, params.licenseNumber);
      if (lookupResult.status === 'VERIFIED') {
        verificationStatus = 'VERIFIED_BY_REGISTRY';
        verificationMethod = 'OFFICIAL_REGISTRY';
      } else if (lookupResult.status === 'EXPIRED') {
        verificationStatus = 'EXPIRED';
      } else if (lookupResult.status === 'UNAVAILABLE') {
        verificationStatus = 'REGISTRY_UNAVAILABLE';
      } else if (lookupResult.status === 'NOT_FOUND') {
        verificationStatus = 'REJECTED';
      }
    }

    const cred: ProfessionalCredential = {
      id: credId,
      ownerId: params.ownerId,
      ownerType: params.ownerType,
      credentialType: params.credentialType,
      issuingAuthorityFa: params.issuingAuthorityFa,
      licenseNumber: params.licenseNumber.trim(),
      documentMediaId: params.documentMediaId,
      verificationStatus,
      verificationMethod,
      submittedAtIso: nowIso,
      updatedAtIso: nowIso,
    };

    await store.saveCredential(cred);

    // Sync parent profile status if verified by registry
    if (verificationStatus === 'VERIFIED_BY_REGISTRY') {
      if (params.ownerType === 'professional') {
        const prof = await store.getPrivateProfessionalById(params.ownerId);
        if (prof) {
          await store.saveProfessionalProfile({
            ...prof,
            verificationStatus: 'VERIFIED_BY_REGISTRY',
            verificationPillars: {
              ...prof.verificationPillars,
              licenseVerified: true,
              verificationMethod: 'OFFICIAL_REGISTRY',
              lastVerifiedAtIso: nowIso,
            },
            updatedAtIso: nowIso,
          });
        }
      } else {
        const ag = await store.getAgencyById(params.ownerId);
        if (ag) {
          await store.saveAgencyProfile({
            ...ag,
            verificationStatus: 'VERIFIED_BY_REGISTRY',
            verificationPillars: {
              ...ag.verificationPillars,
              licenseVerified: true,
              verificationMethod: 'OFFICIAL_REGISTRY',
              lastVerifiedAtIso: nowIso,
            },
            updatedAtIso: nowIso,
          });
        }
      }
    }

    return { success: true, credential: cred, lookupResult };
  }

  // --- Manual Compliance Moderation ---

  public async reviewCredentialManually(
    adminUid: string,
    credentialId: string,
    decision: 'MANUALLY_REVIEWED_BY_PLATFORM' | 'REJECTED' | 'SUSPENDED',
    reasonFa?: string,
  ): Promise<{ success: boolean; errors?: string[] }> {
    const store = this.store as ProfessionalStore;
    const cred = await store.getCredentialById(credentialId);
    if (!cred) return { success: false, errors: ['CREDENTIAL_NOT_FOUND'] };

    // Anti-self-approval rule
    if (cred.ownerId === adminUid) {
      return { success: false, errors: ['CANNOT_APPROVE_OWN_CREDENTIAL'] };
    }

    const nowIso = new Date().toISOString();
    const updatedCred: ProfessionalCredential = {
      ...cred,
      verificationStatus: decision,
      verificationMethod: 'MANUAL_COMPLIANCE_AUDIT',
      reviewerUid: adminUid,
      reviewedAtIso: nowIso,
      rejectionReasonFa: decision === 'REJECTED' ? reasonFa : undefined,
      updatedAtIso: nowIso,
    };

    await store.saveCredential(updatedCred);

    // Update parent profile
    if (cred.ownerType === 'professional') {
      const prof = await store.getPrivateProfessionalById(cred.ownerId);
      if (prof) {
        await store.saveProfessionalProfile({
          ...prof,
          verificationStatus: decision,
          verificationPillars: {
            ...prof.verificationPillars,
            licenseVerified: decision === 'MANUALLY_REVIEWED_BY_PLATFORM',
            verificationMethod: 'MANUAL_COMPLIANCE_AUDIT',
            lastVerifiedAtIso: nowIso,
          },
          updatedAtIso: nowIso,
        });
      }
    }

    await store.logAudit('manual_credential_moderation', adminUid, {
      credentialId,
      decision,
      reasonFa,
    });

    return { success: true };
  }

  // --- Official External Verification Link Attachment ---

  public async attachOfficialVerificationUrl(
    adminUid: string,
    targetId: string,
    type: 'professional' | 'agency',
    rawUrl: string,
  ): Promise<{ success: boolean; errors?: string[]; approvedUrl?: string }> {
    const check = validateOfficialVerificationUrl(rawUrl);
    if (!check.valid || !check.metadata) {
      return { success: false, errors: [check.error || 'INVALID_URL'] };
    }

    const store = this.store as ProfessionalStore;
    const nowIso = new Date().toISOString();

    if (type === 'professional') {
      const prof = await store.getPrivateProfessionalById(targetId);
      if (!prof) return { success: false, errors: ['PROFESSIONAL_NOT_FOUND'] };
      await store.saveProfessionalProfile({
        ...prof,
        officialVerificationUrl: check.metadata.url,
        updatedAtIso: nowIso,
      });
    } else {
      const ag = await store.getAgencyById(targetId);
      if (!ag) return { success: false, errors: ['AGENCY_NOT_FOUND'] };
      await store.saveAgencyProfile({
        ...ag,
        officialVerificationUrl: check.metadata.url,
        updatedAtIso: nowIso,
      });
    }

    await store.logAudit('attach_official_verification_link', adminUid, {
      targetId,
      url: check.metadata.url,
    });

    return { success: true, approvedUrl: check.metadata.url };
  }

  // --- Agency Membership Workflows ---

  public async inviteProfessionalToAgency(
    actorUid: string,
    agencyId: string,
    professionalId: string,
    roleInAgency: RealEstateRole = 'agency_agent',
    branchId?: string,
  ): Promise<{ success: boolean; errors?: string[]; membership?: AgencyMembershipRecord }> {
    const store = this.store as ProfessionalStore;
    const agency = await store.getAgencyById(agencyId);
    if (!agency) return { success: false, errors: ['AGENCY_NOT_FOUND'] };

    if (agency.ownerUid !== actorUid && !agency.managerUids.includes(actorUid)) {
      return { success: false, errors: ['FORBIDDEN_INVITATION'] };
    }

    const prof = await store.getPrivateProfessionalById(professionalId);
    if (!prof) return { success: false, errors: ['PROFESSIONAL_NOT_FOUND'] };

    const nowIso = new Date().toISOString();
    const record: AgencyMembershipRecord = {
      id: `mem_${agencyId}_${professionalId}`,
      agencyId,
      branchId,
      professionalId,
      professionalUserId: prof.userId,
      roleInAgency,
      state: 'INVITED',
      invitedByUid: actorUid,
      stateHistory: [
        {
          state: 'INVITED',
          actorUid,
          timestampIso: nowIso,
          reasonFa: 'دعوت‌نامه همکاری از سوی دفتر املاک ارسال شد.',
        },
      ],
      createdAtIso: nowIso,
      updatedAtIso: nowIso,
    };

    const saved = await store.saveMembership(record);

    this.emitEvent({
      eventType: 'membership.invited',
      recipientUid: prof.userId,
      relatedEntityId: saved.id,
      summaryFa: `دفتر املاک «${agency.publicTradingNameFa}» شما را به عنوان ${roleInAgency} دعوت کرد.`,
    });

    return { success: true, membership: saved };
  }

  public async transitionMembershipState(
    actorUid: string,
    membershipId: string,
    targetState: AgencyMembershipState,
    reasonFa?: string,
    isAdmin = false,
  ): Promise<{ success: boolean; errors?: string[]; membership?: AgencyMembershipRecord }> {
    const store = this.store as ProfessionalStore;
    const mem = await store.getMembershipById(membershipId);
    if (!mem) return { success: false, errors: ['MEMBERSHIP_NOT_FOUND'] };

    const agency = await store.getAgencyById(mem.agencyId);
    const isProfessional = mem.professionalUserId === actorUid;
    const isAgencyOwner = agency?.ownerUid === actorUid || Boolean(agency?.managerUids.includes(actorUid));

    const transitionCheck = validateMembershipTransition(mem.state, targetState, {
      isProfessional,
      isAgencyOwner,
      isAdmin,
    });

    if (!transitionCheck.allowed) {
      return { success: false, errors: [transitionCheck.reasonFa || 'TRANSITION_NOT_ALLOWED'] };
    }

    const nowIso = new Date().toISOString();
    const updated: AgencyMembershipRecord = {
      ...mem,
      state: targetState,
      joinedAtIso: targetState === 'ACTIVE' ? nowIso : mem.joinedAtIso,
      terminatedAtIso: targetState === 'TERMINATED' ? nowIso : mem.terminatedAtIso,
      stateHistory: [
        ...mem.stateHistory,
        {
          state: targetState,
          actorUid,
          timestampIso: nowIso,
          reasonFa,
        },
      ],
      updatedAtIso: nowIso,
    };

    // If active, link agencyId to professional profile
    if (targetState === 'ACTIVE') {
      const prof = await store.getPrivateProfessionalById(mem.professionalId);
      if (prof) {
        await store.saveProfessionalProfile({
          ...prof,
          agencyId: mem.agencyId,
          branchId: mem.branchId,
          updatedAtIso: nowIso,
        });
      }
    }

    const saved = await store.saveMembership(updated);
    return { success: true, membership: saved };
  }

  // --- Listing Association ---

  public async associateProfessionalWithListing(
    actorUid: string,
    listingId: string,
    professionalId: string,
    representationType: ListingAgentAssociation['representationType'] = 'EXCLUSIVE_BROKER',
    validDays = 90,
  ): Promise<{ success: boolean; errors?: string[]; association?: ListingAgentAssociation }> {
    const store = this.store as ProfessionalStore;
    const prof = await store.getPrivateProfessionalById(professionalId);
    if (!prof) return { success: false, errors: ['PROFESSIONAL_NOT_FOUND'] };

    // Must be verified or active
    if (prof.operatingStatus !== 'active') {
      return { success: false, errors: ['PROFESSIONAL_NOT_ACTIVE'] };
    }

    const nowIso = new Date().toISOString();
    const authorizedUntilIso = new Date(Date.now() + validDays * 86400000).toISOString();

    const assoc: ListingAgentAssociation = {
      id: `assoc_${listingId}_${professionalId}`,
      listingId,
      professionalId,
      agencyId: prof.agencyId,
      branchId: prof.branchId,
      representationType,
      status: 'ACTIVE',
      authorizedUntilIso,
      createdAtIso: nowIso,
    };

    const saved = await store.saveListingAssociation(assoc);
    return { success: true, association: saved };
  }

  private emitEvent(event: Omit<ProfessionalDomainEvent, 'eventId' | 'timestampIso'>): void {
    this.domainEvents.push({
      ...event,
      eventId: `pfevt_${Date.now()}_${crypto.randomBytes(3).toString('hex')}`,
      timestampIso: new Date().toISOString(),
    });
  }

  public getDomainEvents(): readonly ProfessionalDomainEvent[] {
    return this.domainEvents;
  }
}
