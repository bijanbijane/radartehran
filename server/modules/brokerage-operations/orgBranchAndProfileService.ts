import crypto from 'crypto';
import {
  AgencyBranchRecord, BrokerageActorContext,
  BrokerageJurisdictionRef, BrokerageOpsError,
  BrokerageOrganizationRecord, BrokerageOrganizationType,
  OrganizationAgentAffiliationRecord, OrganizationOperatingStatus,
  OrganizationVerificationStatus, ProfessionalProfileRecord,
  ProfessionalQualificationRecord, ProfessionalRoleCategory,
  QualificationStatus, } from './types';
import {
  assertBranchAccess, assertExpectedVersion,
  assertSameOrganizationAccess, evaluateQualificationEligibility,
  projectPublicProfessionalProfile, requireNonEmpty,
  validateOrganizationMetadata, } from './validationAndAuthz';
import { BrokerageOperationsExternalAdapters } from './adapters';
import { BrokerageOperationsStore } from './store';
export class OrgBranchAndProfileService {
  constructor(
    private readonly store: BrokerageOperationsStore,
    private readonly adapters: BrokerageOperationsExternalAdapters
  ) {}
  async registerBrokerageOrganization(
    actor: BrokerageActorContext, input: {
      id?: string;
      officialRegisteredName?: string;
      displayName: string;
      organizationType: BrokerageOrganizationType;
      registrationReference?: string;
      professionalLicenseReference?: string;
      jurisdiction: BrokerageJurisdictionRef;
      contactInfo: { phone: string; email: string; website?: string };
      sourceProvenance: string;
      verificationStatus?: OrganizationVerificationStatus;
      operatingStatus?: OrganizationOperatingStatus;
      idempotencyKey?: string;
      isSyntheticTestFixture?: boolean;
    }
  ): Promise<BrokerageOrganizationRecord> {
    if (input.idempotencyKey) {
      const existingId = await this.store.getIdempotencyTargetId(input.idempotencyKey);
      if (existingId) {
        const existing = await this.store.getOrganizationById(existingId);
        if (existing) return existing;
      }
    }
    validateOrganizationMetadata({
      displayName: input.displayName, contactPhone: input.contactInfo.phone,
      contactEmail: input.contactInfo.email, });
    const geoCheck = await this.adapters.geography.validateJurisdiction(input.jurisdiction);
    if (!geoCheck.valid) {
      throw new BrokerageOpsError('JURISDICTION_MISMATCH', geoCheck.reason || 'Invalid jurisdiction.', 400);
    }
    if (input.verificationStatus === 'INDEPENDENTLY_VERIFIED' && actor.role !== 'COMPLIANCE_VERIFIER') {
      throw new BrokerageOpsError(
        'INSUFFICIENT_PRIVILEGE',
        'Only COMPLIANCE_VERIFIER may register an organization directly as INDEPENDENTLY_VERIFIED.', 403
      );
    }
    const now = new Date().toISOString();
    const org: BrokerageOrganizationRecord = {
      id: input.id || `borg_${crypto.randomBytes(6).toString('hex')}`,
      officialRegisteredName: input.officialRegisteredName, displayName: input.displayName.trim(),
      organizationType: input.organizationType, registrationReference: input.registrationReference,
      professionalLicenseReference: input.professionalLicenseReference, jurisdiction: {
        ...input.jurisdiction, citySlug: input.jurisdiction.citySlug.trim().toLowerCase(),
      }, branchIds: [],
      authorizedRepresentativeUserIds: [actor.userId], operatingStatus: input.operatingStatus ?? 'ACTIVE',
      verificationStatus: input.verificationStatus ?? (input.registrationReference ? 'DOCUMENTED' : 'SELF_REPORTED'),
      contactInfo: input.contactInfo,
      sourceProvenance: requireNonEmpty(input.sourceProvenance, 'sourceProvenance', 300),
      isSyntheticTestFixture: input.isSyntheticTestFixture ?? false, version: 1,
      createdAt: now, updatedAt: now,
    };
    await this.store.saveOrganization(org);
    if (input.idempotencyKey) {
      await this.store.saveIdempotencyTargetId(input.idempotencyKey, org.id);
    }
    return org;
  }
  async retrieveBrokerageOrganization(
    actor: BrokerageActorContext, organizationId: string
  ): Promise<BrokerageOrganizationRecord> {
    const org = await this.store.getOrganizationById(organizationId);
    if (!org) {
      throw new BrokerageOpsError('RESOURCE_NOT_FOUND', `Organization '${organizationId}' not found.`, 404);
    }
    assertSameOrganizationAccess(actor, organizationId, false);
    return org;
  }
  async updateOrganizationMetadata(
    actor: BrokerageActorContext, input: {
      organizationId: string;
      displayName?: string;
      contactInfo?: { phone: string; email: string; website?: string };
      operatingStatus?: OrganizationOperatingStatus;
      expectedVersion?: number;
    }
  ): Promise<BrokerageOrganizationRecord> {
    const org = await this.store.getOrganizationById(input.organizationId);
    if (!org) {
      throw new BrokerageOpsError('RESOURCE_NOT_FOUND', `Organization '${input.organizationId}' not found.`, 404);
    }
    assertSameOrganizationAccess(actor, org.id, true);
    assertExpectedVersion(org.version, input.expectedVersion, org.id);
    const nextContact = input.contactInfo ?? org.contactInfo;
    const nextDisplay = input.displayName ?? org.displayName;
    validateOrganizationMetadata({
      displayName: nextDisplay, contactPhone: nextContact.phone,
      contactEmail: nextContact.email, });
    const updated: BrokerageOrganizationRecord = {
      ...org, displayName: nextDisplay.trim(),
      contactInfo: nextContact, operatingStatus: input.operatingStatus ?? org.operatingStatus,
      version: org.version + 1, updatedAt: new Date().toISOString(),
    };
    await this.store.saveOrganization(updated);
    return updated;
  }
  async registerAgencyBranch(
    actor: BrokerageActorContext, input: {
      id?: string;
      parentOrganizationId: string;
      branchName: string;
      addressReference: string;
      jurisdiction: BrokerageJurisdictionRef;
      branchManagerProfileId?: string;
      contactInfo: { phone: string; email: string };
      authorizationReferences?: string[];
      isSyntheticTestFixture?: boolean;
    }
  ): Promise<AgencyBranchRecord> {
    const org = await this.store.getOrganizationById(input.parentOrganizationId);
    if (!org) {
      throw new BrokerageOpsError(
        'RESOURCE_NOT_FOUND', `Parent organization '${input.parentOrganizationId}' does not exist.`,
        404
      );
    }
    assertSameOrganizationAccess(actor, org.id, true);
    const geoCheck = await this.adapters.geography.validateJurisdiction(input.jurisdiction);
    if (!geoCheck.valid) {
      throw new BrokerageOpsError('JURISDICTION_MISMATCH', geoCheck.reason || 'Invalid branch jurisdiction.', 400);
    }
    const now = new Date().toISOString();
    const branch: AgencyBranchRecord = {
      id: input.id || `bbr_${crypto.randomBytes(6).toString('hex')}`, parentOrganizationId: org.id,
      branchName: requireNonEmpty(input.branchName, 'branchName', 200),
      addressReference: requireNonEmpty(input.addressReference, 'addressReference', 500), jurisdiction: {
        ...input.jurisdiction, citySlug: input.jurisdiction.citySlug.trim().toLowerCase(),
      }, branchManagerProfileId: input.branchManagerProfileId,
      contactInfo: input.contactInfo, operationalStatus: 'ACTIVE',
      openingDateIso: now, authorizationReferences: input.authorizationReferences ?? [],
      history: [
        {
          changedAt: now, changedByUserId: actor.userId,
          action: 'BRANCH_REGISTERED', summary: `Registered branch '${input.branchName}'.`,
        }, ],
      isSyntheticTestFixture: input.isSyntheticTestFixture ?? false, version: 1,
      createdAt: now, updatedAt: now,
    };
    await this.store.saveBranch(branch);
    await this.store.saveOrganization({
      ...org, primaryOfficeBranchId: org.primaryOfficeBranchId ?? branch.id,
      branchIds: Array.from(new Set([...org.branchIds, branch.id])), version: org.version + 1,
      updatedAt: now, });
    return branch;
  }
  async closeOrSuspendBranch(
    actor: BrokerageActorContext, input: {
      branchId: string;
      targetStatus: 'SUSPENDED' | 'CLOSED';
      reason: string;
    }
  ): Promise<AgencyBranchRecord> {
    const branch = await this.store.getBranchById(input.branchId);
    if (!branch) {
      throw new BrokerageOpsError('RESOURCE_NOT_FOUND', `Branch '${input.branchId}' not found.`, 404);
    }
    assertBranchAccess(actor, branch);
    const now = new Date().toISOString();
    const updated: AgencyBranchRecord = {
      ...branch, operationalStatus: input.targetStatus,
      closingDateIso: input.targetStatus === 'CLOSED' ? now : branch.closingDateIso, history: [
        ...branch.history, {
          changedAt: now, changedByUserId: actor.userId,
          action: `BRANCH_${input.targetStatus}`, summary: requireNonEmpty(input.reason, 'reason', 500),
        }, ],
      version: branch.version + 1, updatedAt: now,
    };
    await this.store.saveBranch(updated);
    return updated;
  }
  async registerProfessionalProfile(
    actor: BrokerageActorContext, input: {
      id?: string;
      userIdentityRef: string;
      displayName: string;
      professionalRole: ProfessionalRoleCategory;
      specializations?: string[];
      serviceLanguages?: string[];
      geographicServiceAreas?: BrokerageJurisdictionRef[];
      experienceClaims?: { summary: string; provenance: 'SELF_REPORTED' | 'VERIFIED' }[];
      publicVisibility?: 'PUBLIC_SUMMARY' | 'PRIVATE_INTERNAL';
      privateContactEmail?: string;
      isSyntheticTestFixture?: boolean;
    }
  ): Promise<ProfessionalProfileRecord> {
    const now = new Date().toISOString();
    // Creating a profile NEVER automatically grants VERIFIED professional license status
    const profile: ProfessionalProfileRecord = {
      id: input.id || `bprof_${crypto.randomBytes(6).toString('hex')}`,
      userIdentityRef: requireNonEmpty(input.userIdentityRef, 'userIdentityRef', 150),
      displayName: requireNonEmpty(input.displayName, 'displayName', 200), organizationIds: [],
      branchIds: [], professionalRole: input.professionalRole,
      qualificationIds: [], specializations: input.specializations ?? [],
      serviceLanguages: input.serviceLanguages ?? ['fa'],
      geographicServiceAreas: input.geographicServiceAreas ?? [],
      experienceClaims: (input.experienceClaims ?? []).map((c) => ({
        summary: c.summary, provenance: actor.role === 'COMPLIANCE_VERIFIER' ? c.provenance : 'SELF_REPORTED',
      })), profileVerificationStatus: 'UNVERIFIED',
      professionalStatus: 'ACTIVE', publicVisibility: input.publicVisibility ?? 'PUBLIC_SUMMARY',
      privateContactEmail: input.privateContactEmail,
      isSyntheticTestFixture: input.isSyntheticTestFixture ?? false, version: 1,
      createdAt: now, updatedAt: now,
    };
    await this.store.saveProfessionalProfile(profile);
    return profile;
  }
  async retrievePublicProfessionalProfile(profileId: string): Promise<Omit<ProfessionalProfileRecord, 'privateContactEmail'>> {
    const profile = await this.store.getProfessionalProfileById(profileId);
    if (!profile || profile.publicVisibility === 'PRIVATE_INTERNAL') {
      throw new BrokerageOpsError('RESOURCE_NOT_FOUND', `Public profile '${profileId}' is not available.`, 404);
    }
    return projectPublicProfessionalProfile(profile);
  }
  async addQualificationReference(
    actor: BrokerageActorContext, input: {
      id?: string;
      professionalProfileId: string;
      qualificationCategory: string;
      issuingAuthorityRef: string;
      licenseOrCertificateNumber: string;
      jurisdiction: BrokerageJurisdictionRef;
      issueDateIso: string;
      expirationDateIso?: string;
      supportingEvidenceIds?: string[];
      isSyntheticTestFixture?: boolean;
    }
  ): Promise<ProfessionalQualificationRecord> {
    const profile = await this.store.getProfessionalProfileById(input.professionalProfileId);
    if (!profile) {
      throw new BrokerageOpsError('RESOURCE_NOT_FOUND', `Profile '${input.professionalProfileId}' not found.`, 404);
    }
    const geoCheck = await this.adapters.geography.validateJurisdiction(input.jurisdiction);
    if (!geoCheck.valid) {
      throw new BrokerageOpsError('JURISDICTION_MISMATCH', geoCheck.reason || 'Invalid qualification jurisdiction.', 400);
    }
    const now = new Date().toISOString();
    const initialStatus: QualificationStatus =
      input.supportingEvidenceIds && input.supportingEvidenceIds.length > 0 ? 'DOCUMENTED' : 'SELF_REPORTED';
    const qual: ProfessionalQualificationRecord = {
      id: input.id || `bqual_${crypto.randomBytes(6).toString('hex')}`, professionalProfileId: profile.id,
      qualificationCategory: requireNonEmpty(input.qualificationCategory, 'qualificationCategory', 200),
      issuingAuthorityRef: requireNonEmpty(input.issuingAuthorityRef, 'issuingAuthorityRef', 200),
      licenseOrCertificateNumber: requireNonEmpty(input.licenseOrCertificateNumber, 'licenseOrCertificateNumber', 150),
      jurisdiction: {
        ...input.jurisdiction, citySlug: input.jurisdiction.citySlug.trim().toLowerCase(),
      }, issueDateIso: input.issueDateIso,
      expirationDateIso: input.expirationDateIso, status: initialStatus,
      supportingEvidenceIds: input.supportingEvidenceIds ?? [], verificationHistory: [
        {
          changedAt: now, changedByUserId: actor.userId,
          previousStatus: 'UNKNOWN', newStatus: initialStatus,
          notes: 'Qualification reference added.', },
      ], isSyntheticTestFixture: input.isSyntheticTestFixture ?? false,
      createdAt: now, updatedAt: now,
    };
    await this.store.saveQualification(qual);
    await this.store.saveProfessionalProfile({
      ...profile, qualificationIds: Array.from(new Set([...profile.qualificationIds, qual.id])),
      version: profile.version + 1, updatedAt: now,
    });
    return qual;
  }
  async submitQualificationForVerification(
    actor: BrokerageActorContext, qualificationId: string,
    supportingEvidenceIds: string[]
  ): Promise<ProfessionalQualificationRecord> {
    const qual = await this.store.getQualificationById(qualificationId);
    if (!qual) {
      throw new BrokerageOpsError('RESOURCE_NOT_FOUND', `Qualification '${qualificationId}' not found.`, 404);
    }
    if (supportingEvidenceIds.length === 0 && qual.supportingEvidenceIds.length === 0) {
      throw new BrokerageOpsError('VALIDATION_FAILED', 'Supporting evidence is required to submit for verification.', 400);
    }
    const now = new Date().toISOString();
    const updated: ProfessionalQualificationRecord = {
      ...qual, status: 'PENDING_VERIFICATION',
      supportingEvidenceIds: Array.from(new Set([...qual.supportingEvidenceIds, ...supportingEvidenceIds])),
      verificationHistory: [
        ...qual.verificationHistory, {
          changedAt: now, changedByUserId: actor.userId,
          previousStatus: qual.status, newStatus: 'PENDING_VERIFICATION',
          notes: 'Submitted for verification.', },
      ], updatedAt: now,
    };
    await this.store.saveQualification(updated);
    return updated;
  }
  async recordAuthorizedQualificationVerification(
    actor: BrokerageActorContext, input: {
      qualificationId: string;
      newStatus: Extract<QualificationStatus, 'VERIFIED' | 'REJECTED' | 'EXPIRED' | 'SUSPENDED' | 'REVOKED'>;
      verificationMethod: string;
      sourceUrl?: string;
      notes: string;
    }
  ): Promise<ProfessionalQualificationRecord> {
    if (actor.role !== 'COMPLIANCE_VERIFIER' && actor.role !== 'SUPERVISOR') {
      throw new BrokerageOpsError(
        'INSUFFICIENT_PRIVILEGE',
        'Only COMPLIANCE_VERIFIER or authorized SUPERVISOR can verify professional qualifications.', 403
      );
    }
    const qual = await this.store.getQualificationById(input.qualificationId);
    if (!qual) {
      throw new BrokerageOpsError('RESOURCE_NOT_FOUND', `Qualification '${input.qualificationId}' not found.`, 404);
    }
    const now = new Date().toISOString();
    const updated: ProfessionalQualificationRecord = {
      ...qual, status: input.newStatus,
      verificationMethod: requireNonEmpty(input.verificationMethod, 'verificationMethod', 200),
      sourceUrl: input.sourceUrl, lastVerifiedAtIso: now,
      reviewerUserId: actor.userId, verificationHistory: [
        ...qual.verificationHistory, {
          changedAt: now, changedByUserId: actor.userId,
          previousStatus: qual.status, newStatus: input.newStatus,
          notes: requireNonEmpty(input.notes, 'notes', 500), },
      ], updatedAt: now,
    };
    await this.store.saveQualification(updated);
    const profile = await this.store.getProfessionalProfileById(qual.professionalProfileId);
    if (profile) {
      const allQuals = await this.store.listQualificationsByProfile(profile.id);
      const anyVerified = allQuals.some((q) => q.status === 'VERIFIED');
      await this.store.saveProfessionalProfile({
        ...profile, profileVerificationStatus: anyVerified ? 'VERIFIED' : 'UNVERIFIED',
        version: profile.version + 1, updatedAt: now,
      });
    }
    return updated;
  }
  async verifyProfessionalLicensedEligibility(
    professionalProfileId: string, citySlug: string,
    asOfDateIso = new Date().toISOString()
  ): Promise<{ eligible: boolean; reason: string }> {
    const quals = await this.store.listQualificationsByProfile(professionalProfileId);
    const res = evaluateQualificationEligibility(quals, citySlug, asOfDateIso);
    if (!res.hasActiveVerifiedQualificationInJurisdiction) {
      throw new BrokerageOpsError('QUALIFICATION_NOT_VERIFIED_OR_EXPIRED', res.reason, 403);
    }
    return { eligible: true, reason: res.reason };
  }
  async createOrganizationAgentAffiliation(
    actor: BrokerageActorContext, input: {
      id?: string;
      organizationId: string;
      branchId?: string;
      professionalProfileId: string;
      roleWithinOrganization: ProfessionalRoleCategory;
      authorityPermissions: string[];
      supervisingProfessionalProfileId?: string;
      supportingAgreementRef?: string;
    }
  ): Promise<OrganizationAgentAffiliationRecord> {
    assertSameOrganizationAccess(actor, input.organizationId, true);
    const [org, profile] = await Promise.all([
      this.store.getOrganizationById(input.organizationId),
      this.store.getProfessionalProfileById(input.professionalProfileId), ]);
    if (!org) throw new BrokerageOpsError('RESOURCE_NOT_FOUND', `Organization '${input.organizationId}' not found.`, 404);
    if (!profile) throw new BrokerageOpsError('RESOURCE_NOT_FOUND', `Profile '${input.professionalProfileId}' not found.`, 404);
    if (input.branchId) {
      const branch = await this.store.getBranchById(input.branchId);
      if (!branch || branch.parentOrganizationId !== org.id) {
        throw new BrokerageOpsError('UNAUTHORIZED_BRANCH_ACCESS', 'Branch does not belong to organization.', 400);
      }
      assertBranchAccess(actor, branch);
    }
    const now = new Date().toISOString();
    const affiliation: OrganizationAgentAffiliationRecord = {
      id: input.id || `baff_${crypto.randomBytes(6).toString('hex')}`, organizationId: org.id,
      branchId: input.branchId, professionalProfileId: profile.id,
      userIdentityRef: profile.userIdentityRef, roleWithinOrganization: input.roleWithinOrganization,
      startDateIso: now, affiliationStatus: 'ACTIVE',
      authorityPermissions: input.authorityPermissions,
      supervisingProfessionalProfileId: input.supervisingProfessionalProfileId,
      supportingAgreementRef: input.supportingAgreementRef, recordedByUserId: actor.userId,
      history: [{ changedAt: now, changedByUserId: actor.userId, action: 'AFFILIATION_CREATED', summary: 'Active affiliation created.' }],
      version: 1, createdAt: now,
      updatedAt: now, };
    await this.store.saveAffiliation(affiliation);
    await this.store.saveProfessionalProfile({
      ...profile, organizationIds: Array.from(new Set([...profile.organizationIds, org.id])),
      branchIds: input.branchId ? Array.from(new Set([...profile.branchIds, input.branchId])) : profile.branchIds,
      version: profile.version + 1, updatedAt: now,
    });
    return affiliation;
  }
  async transferBranchAffiliation(
    actor: BrokerageActorContext,
    input: { affiliationId: string; newBranchId: string; reason: string; expectedVersion?: number }
  ): Promise<OrganizationAgentAffiliationRecord> {
    const aff = await this.store.getAffiliationById(input.affiliationId);
    if (!aff) throw new BrokerageOpsError('RESOURCE_NOT_FOUND', `Affiliation '${input.affiliationId}' not found.`, 404);
    assertSameOrganizationAccess(actor, aff.organizationId, true);
    assertExpectedVersion(aff.version, input.expectedVersion, aff.id);
    const branch = await this.store.getBranchById(input.newBranchId);
    if (!branch || branch.parentOrganizationId !== aff.organizationId) {
      throw new BrokerageOpsError('UNAUTHORIZED_BRANCH_ACCESS', 'Target branch does not belong to organization.', 400);
    }
    assertBranchAccess(actor, branch);
    const now = new Date().toISOString();
    const updated: OrganizationAgentAffiliationRecord = {
      ...aff, branchId: branch.id,
      history: [...aff.history, { changedAt: now, changedByUserId: actor.userId, action: 'BRANCH_TRANSFERRED', summary: input.reason }],
      version: aff.version + 1, updatedAt: now,
    };
    await this.store.saveAffiliation(updated);
    return updated;
  }
  async suspendOrTerminateAffiliation(
    actor: BrokerageActorContext,
    input: { affiliationId: string; targetStatus: 'SUSPENDED' | 'TERMINATED'; reason: string; expectedVersion?: number }
  ): Promise<OrganizationAgentAffiliationRecord> {
    const aff = await this.store.getAffiliationById(input.affiliationId);
    if (!aff) throw new BrokerageOpsError('RESOURCE_NOT_FOUND', `Affiliation '${input.affiliationId}' not found.`, 404);
    assertSameOrganizationAccess(actor, aff.organizationId, true);
    assertExpectedVersion(aff.version, input.expectedVersion, aff.id);
    const now = new Date().toISOString();
    // Terminated or suspended affiliation immediately clears active authorityPermissions while preserving history
    const updated: OrganizationAgentAffiliationRecord = {
      ...aff, affiliationStatus: input.targetStatus,
      endDateIso: input.targetStatus === 'TERMINATED' ? now : aff.endDateIso, authorityPermissions: [],
      history: [
        ...aff.history,
        { changedAt: now, changedByUserId: actor.userId, action: `AFFILIATION_${input.targetStatus}`, summary: input.reason },
      ], version: aff.version + 1,
      updatedAt: now, };
    await this.store.saveAffiliation(updated);
    return updated;
  }
}
