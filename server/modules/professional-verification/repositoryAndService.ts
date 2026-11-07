/**
 * @file server/modules/professional-verification/repositoryAndService.ts
 * @description Repository Contract, In-Memory Persistence Adapter, and Domain Service
 * for Radartehran Professional Identity, Organization, and Credential Verification (Employee 12).
 */

import {
  OFFICIAL_VERIFICATION_AUTHORITIES,
} from './authoritiesAndStateMachine';
import {
  buildPublicOrganizationVerificationSummary,
  buildPublicProfessionalVerificationSummary,
  readProtectedEvidenceForPrincipal,
} from './privacyAndPublicProjections';
import {
  applyDisciplinaryCredentialTransition,
  createUnsubmittedCredentialDraft,
  createVerificationAuditRecord,
  decideCredentialVerificationReview,
  evaluateAndTransitionExpiredCredential,
  recomputeAggregateVerificationState,
  startCredentialVerificationReview,
  submitCredentialForReview,
} from './workflowAndExpirationEngine';
import type {
  AuthenticatedPrincipalContext,
  BusinessOrganizationProfileRecord,
  CredentialCategory,
  IssuingAuthorityCode,
  OfficialVerificationAuthorityMetadata,
  OrganizationMembershipReference,
  OrganizationMembershipRole,
  PrivateDocumentEvidenceItem,
  ProfessionalLicenseRecord,
  ProfessionalProfileRecord,
  PublicOrganizationVerificationSummary,
  PublicProfessionalVerificationSummary,
  ServiceMarketplaceProviderRef,
  VerificationAuditLogEntry,
  VerificationEvidenceRecord,
  VerificationMethodType,
  VerifiedEntityType,
} from './types';
import type { CityId } from '../../../src/types/models';

/**
 * Storage abstraction decoupling pure verification rules from database persistence.
 */
export interface ProfessionalVerificationRepository {
  saveProfessionalProfile(profile: ProfessionalProfileRecord): Promise<void>;
  getProfessionalProfileById(profileId: string): Promise<ProfessionalProfileRecord | null>;
  saveOrganizationProfile(org: BusinessOrganizationProfileRecord): Promise<void>;
  getOrganizationProfileById(organizationId: string): Promise<BusinessOrganizationProfileRecord | null>;
  saveMembership(membership: OrganizationMembershipReference): Promise<void>;
  getMembershipById(membershipId: string): Promise<OrganizationMembershipReference | null>;
  listMembershipsByProfile(profileId: string): Promise<ReadonlyArray<OrganizationMembershipReference>>;
  listMembershipsByOrganization(organizationId: string): Promise<ReadonlyArray<OrganizationMembershipReference>>;
  saveLicenseAndEvidence(
    license: ProfessionalLicenseRecord,
    evidence: VerificationEvidenceRecord
  ): Promise<void>;
  getLicenseById(credentialId: string): Promise<ProfessionalLicenseRecord | null>;
  getEvidenceByCredentialId(credentialId: string): Promise<VerificationEvidenceRecord | null>;
  listLicensesByProfileId(profileId: string): Promise<ReadonlyArray<ProfessionalLicenseRecord>>;
  listAllLicenses(): Promise<ReadonlyArray<ProfessionalLicenseRecord>>;
  appendAuditRecord(entry: VerificationAuditLogEntry): Promise<void>;
  listAuditHistoryForTarget(targetId: string): Promise<ReadonlyArray<VerificationAuditLogEntry>>;
}

/**
 * Deterministic in-memory repository for unit tests, local verification, and modular staging.
 */
export class InMemoryProfessionalVerificationRepository
  implements ProfessionalVerificationRepository
{
  private readonly profiles = new Map<string, ProfessionalProfileRecord>();
  private readonly organizations = new Map<string, BusinessOrganizationProfileRecord>();
  private readonly memberships = new Map<string, OrganizationMembershipReference>();
  private readonly licenses = new Map<string, ProfessionalLicenseRecord>();
  private readonly evidencesByCredential = new Map<string, VerificationEvidenceRecord>();
  private readonly auditLog: VerificationAuditLogEntry[] = [];

  async saveProfessionalProfile(profile: ProfessionalProfileRecord): Promise<void> {
    this.profiles.set(profile.profileId, {
      ...profile,
      coveredHoodIds: [...profile.coveredHoodIds],
      activeOrganizationIds: [...profile.activeOrganizationIds],
      credentialIds: [...profile.credentialIds],
    });
  }

  async getProfessionalProfileById(profileId: string): Promise<ProfessionalProfileRecord | null> {
    return this.profiles.get(profileId) ?? null;
  }

  async saveOrganizationProfile(org: BusinessOrganizationProfileRecord): Promise<void> {
    this.organizations.set(org.organizationId, {
      ...org,
      coveredHoodIds: [...org.coveredHoodIds],
      credentialIds: [...org.credentialIds],
    });
  }

  async getOrganizationProfileById(
    organizationId: string
  ): Promise<BusinessOrganizationProfileRecord | null> {
    return this.organizations.get(organizationId) ?? null;
  }

  async saveMembership(membership: OrganizationMembershipReference): Promise<void> {
    this.memberships.set(membership.membershipId, { ...membership });
  }

  async getMembershipById(membershipId: string): Promise<OrganizationMembershipReference | null> {
    return this.memberships.get(membershipId) ?? null;
  }

  async listMembershipsByProfile(
    profileId: string
  ): Promise<ReadonlyArray<OrganizationMembershipReference>> {
    return Array.from(this.memberships.values()).filter(
      (m) => m.professionalProfileId === profileId
    );
  }

  async listMembershipsByOrganization(
    organizationId: string
  ): Promise<ReadonlyArray<OrganizationMembershipReference>> {
    return Array.from(this.memberships.values()).filter(
      (m) => m.organizationId === organizationId
    );
  }

  async saveLicenseAndEvidence(
    license: ProfessionalLicenseRecord,
    evidence: VerificationEvidenceRecord
  ): Promise<void> {
    this.licenses.set(license.credentialId, { ...license });
    this.evidencesByCredential.set(license.credentialId, {
      ...evidence,
      privateDocuments: [...evidence.privateDocuments],
    });
  }

  async getLicenseById(credentialId: string): Promise<ProfessionalLicenseRecord | null> {
    return this.licenses.get(credentialId) ?? null;
  }

  async getEvidenceByCredentialId(
    credentialId: string
  ): Promise<VerificationEvidenceRecord | null> {
    return this.evidencesByCredential.get(credentialId) ?? null;
  }

  async listLicensesByProfileId(
    profileId: string
  ): Promise<ReadonlyArray<ProfessionalLicenseRecord>> {
    return Array.from(this.licenses.values()).filter((l) => l.profileId === profileId);
  }

  async listAllLicenses(): Promise<ReadonlyArray<ProfessionalLicenseRecord>> {
    return Array.from(this.licenses.values());
  }

  async appendAuditRecord(entry: VerificationAuditLogEntry): Promise<void> {
    this.auditLog.push({ ...entry });
  }

  async listAuditHistoryForTarget(
    targetId: string
  ): Promise<ReadonlyArray<VerificationAuditLogEntry>> {
    return this.auditLog.filter((a) => a.targetId === targetId);
  }
}

/**
 * Domain service orchestrating professional profiles, organizations, memberships,
 * credential review workflows, expiration sweeps, revocations, and public projections.
 */
export class ProfessionalVerificationService {
  constructor(private readonly repository: ProfessionalVerificationRepository) {}

  getOfficialAuthoritiesCatalog(): ReadonlyArray<OfficialVerificationAuthorityMetadata> {
    return Object.values(OFFICIAL_VERIFICATION_AUTHORITIES);
  }

  async createProfessionalProfile(params: {
    principal: AuthenticatedPrincipalContext;
    profileId: string;
    displayNameFa: string;
    entityType: ProfessionalProfileRecord['entityType'];
    primaryCityId: CityId;
    coveredHoodIds: ReadonlyArray<number>;
    specialtySummaryFa: string;
    experienceYears: number;
    serviceMarketplaceProviderRef?: ServiceMarketplaceProviderRef | null;
    createdAtIso?: string;
  }): Promise<ProfessionalProfileRecord> {
    if (!params.principal?.isAuthenticated || !params.principal.uid) {
      throw new Error('برای ایجاد نمایه حرفه‌ای، ورود به حساب کاربری الزامی است.');
    }
    const nowIso = params.createdAtIso ?? new Date().toISOString();
    const profile: ProfessionalProfileRecord = {
      profileId: params.profileId,
      ownerPrincipalUid: params.principal.uid,
      displayNameFa: params.displayNameFa.trim(),
      entityType: params.entityType,
      primaryCityId: params.primaryCityId,
      coveredHoodIds: [...params.coveredHoodIds],
      specialtySummaryFa: params.specialtySummaryFa.trim(),
      experienceYears: Math.max(0, Math.min(80, Math.round(params.experienceYears))),
      serviceMarketplaceProviderRef: params.serviceMarketplaceProviderRef ?? null,
      activeOrganizationIds: [],
      credentialIds: [],
      overallVerificationState: 'unsubmitted',
      createdAtIso: nowIso,
      updatedAtIso: nowIso,
    };
    await this.repository.saveProfessionalProfile(profile);
    await this.repository.appendAuditRecord(
      createVerificationAuditRecord({
        targetType: 'professional_profile',
        targetId: profile.profileId,
        actorPrincipalUid: params.principal.uid,
        actorRole: 'owner',
        previousState: null,
        nextState: 'unsubmitted',
        verificationMethod: null,
        reasonFa: 'ایجاد نمایه حرفه‌ای در وضعیت تاییدنشده اولیه.',
        occurredAtIso: nowIso,
      })
    );
    return profile;
  }

  async createBusinessOrganizationProfile(params: {
    principal: AuthenticatedPrincipalContext;
    organizationId: string;
    legalEntityNameFa: string;
    publicBrandNameFa: string;
    organizationType: BusinessOrganizationProfileRecord['organizationType'];
    registrationNumber?: string | null;
    primaryCityId: CityId;
    coveredHoodIds: ReadonlyArray<number>;
    serviceMarketplaceProviderRef?: ServiceMarketplaceProviderRef | null;
    createdAtIso?: string;
  }): Promise<BusinessOrganizationProfileRecord> {
    if (!params.principal?.isAuthenticated || !params.principal.uid) {
      throw new Error('برای ثبت نمایه سازمانی یا آژانس، ورود به حساب کاربری الزامی است.');
    }
    const nowIso = params.createdAtIso ?? new Date().toISOString();
    const org: BusinessOrganizationProfileRecord = {
      organizationId: params.organizationId,
      ownerPrincipalUid: params.principal.uid,
      legalEntityNameFa: params.legalEntityNameFa.trim(),
      publicBrandNameFa: params.publicBrandNameFa.trim(),
      organizationType: params.organizationType,
      registrationNumber: params.registrationNumber?.trim() || null,
      primaryCityId: params.primaryCityId,
      coveredHoodIds: [...params.coveredHoodIds],
      serviceMarketplaceProviderRef: params.serviceMarketplaceProviderRef ?? null,
      credentialIds: [],
      overallVerificationState: 'unsubmitted',
      createdAtIso: nowIso,
      updatedAtIso: nowIso,
    };
    await this.repository.saveOrganizationProfile(org);
    await this.repository.appendAuditRecord(
      createVerificationAuditRecord({
        targetType: 'organization_profile',
        targetId: org.organizationId,
        actorPrincipalUid: params.principal.uid,
        actorRole: 'owner',
        previousState: null,
        nextState: 'unsubmitted',
        verificationMethod: null,
        reasonFa: 'ایجاد نمایه سازمانی/آژانس در وضعیت تاییدنشده اولیه.',
        occurredAtIso: nowIso,
      })
    );
    return org;
  }

  async requestOrganizationMembership(params: {
    professionalPrincipal: AuthenticatedPrincipalContext;
    membershipId: string;
    professionalProfileId: string;
    organizationId: string;
    role: OrganizationMembershipRole;
    requestedAtIso?: string;
  }): Promise<OrganizationMembershipReference> {
    const profile = await this.repository.getProfessionalProfileById(params.professionalProfileId);
    if (!profile) throw new Error('نمایه حرفه‌ای یافت نشد.');
    if (profile.ownerPrincipalUid !== params.professionalPrincipal.uid) {
      throw new Error('فقط مالک نمایه حرفه‌ای مجاز به ثبت درخواست عضویت در سازمان است.');
    }
    const org = await this.repository.getOrganizationProfileById(params.organizationId);
    if (!org) throw new Error('سازمان یا آژانس مورد نظر یافت نشد.');

    const nowIso = params.requestedAtIso ?? new Date().toISOString();
    const membership: OrganizationMembershipReference = {
      membershipId: params.membershipId,
      professionalProfileId: profile.profileId,
      professionalPrincipalUid: profile.ownerPrincipalUid,
      organizationId: org.organizationId,
      role: params.role,
      membershipStatus: 'pending_organization_confirmation',
      confirmedByOrganizationUid: null,
      joinedAtIso: nowIso,
      updatedAtIso: nowIso,
      endedAtIso: null,
    };
    await this.repository.saveMembership(membership);
    await this.repository.appendAuditRecord(
      createVerificationAuditRecord({
        targetType: 'membership',
        targetId: membership.membershipId,
        actorPrincipalUid: params.professionalPrincipal.uid,
        actorRole: 'professional',
        previousState: null,
        nextState: membership.membershipStatus,
        verificationMethod: null,
        reasonFa: `ثبت درخواست عضویت در سازمان «${org.publicBrandNameFa}».`,
        occurredAtIso: nowIso,
      })
    );
    return membership;
  }

  async confirmOrganizationMembership(params: {
    organizationOwnerPrincipal: AuthenticatedPrincipalContext;
    membershipId: string;
    confirmedAtIso?: string;
  }): Promise<OrganizationMembershipReference> {
    const membership = await this.repository.getMembershipById(params.membershipId);
    if (!membership) throw new Error('درخواست عضویت یافت نشد.');
    const org = await this.repository.getOrganizationProfileById(membership.organizationId);
    if (!org) throw new Error('سازمان مرتبط یافت نشد.');
    if (org.ownerPrincipalUid !== params.organizationOwnerPrincipal.uid) {
      throw new Error('فقط مالک یا مدیر مجاز سازمان می‌تواند عضویت مشاور یا مهندس را تایید کند.');
    }

    const nowIso = params.confirmedAtIso ?? new Date().toISOString();
    const updated: OrganizationMembershipReference = {
      ...membership,
      membershipStatus: 'active_confirmed',
      confirmedByOrganizationUid: params.organizationOwnerPrincipal.uid,
      updatedAtIso: nowIso,
    };
    await this.repository.saveMembership(updated);

    const profile = await this.repository.getProfessionalProfileById(
      membership.professionalProfileId
    );
    if (profile && !profile.activeOrganizationIds.includes(org.organizationId)) {
      await this.repository.saveProfessionalProfile({
        ...profile,
        activeOrganizationIds: [...profile.activeOrganizationIds, org.organizationId],
        updatedAtIso: nowIso,
      });
    }

    await this.repository.appendAuditRecord(
      createVerificationAuditRecord({
        targetType: 'membership',
        targetId: updated.membershipId,
        actorPrincipalUid: params.organizationOwnerPrincipal.uid,
        actorRole: 'organization_owner',
        previousState: membership.membershipStatus,
        nextState: updated.membershipStatus,
        verificationMethod: null,
        reasonFa: 'تایید عضویت حرفه‌ای توسط مدیر سازمان.',
        occurredAtIso: nowIso,
      })
    );
    return updated;
  }

  async createCredentialDraft(params: {
    principal: AuthenticatedPrincipalContext;
    credentialId: string;
    targetProfileOrOrgId: string;
    entityType: VerifiedEntityType;
    credentialType: CredentialCategory;
    issuingAuthorityCode: IssuingAuthorityCode;
    credentialIdentifier: string;
    holderFullNameFa: string;
    linkedOrganizationId?: string | null;
    cityId: CityId;
    expirationDateIso?: string | null;
    createdAtIso?: string;
  }): Promise<ProfessionalLicenseRecord> {
    const nowIso = params.createdAtIso ?? new Date().toISOString();
    const profile = await this.repository.getProfessionalProfileById(params.targetProfileOrOrgId);
    const org = profile
      ? null
      : await this.repository.getOrganizationProfileById(params.targetProfileOrOrgId);

    const ownerUid = profile ? profile.ownerPrincipalUid : org?.ownerPrincipalUid;
    if (!ownerUid) {
      throw new Error('نمایه حرفه‌ای یا سازمانی هدف یافت نشد.');
    }
    if (ownerUid !== params.principal.uid) {
      throw new Error('کاربر تنها مجاز به ثبت مدرک برای نمایه متعلق به خود است.');
    }

    const { license, evidence, audit } = createUnsubmittedCredentialDraft({
      principal: params.principal,
      credentialId: params.credentialId,
      profileId: params.targetProfileOrOrgId,
      entityType: params.entityType,
      credentialType: params.credentialType,
      issuingAuthorityCode: params.issuingAuthorityCode,
      credentialIdentifier: params.credentialIdentifier,
      holderFullNameFa: params.holderFullNameFa,
      linkedOrganizationId: params.linkedOrganizationId,
      cityId: params.cityId,
      expirationDateIso: params.expirationDateIso,
      createdAtIso: nowIso,
    });

    await this.repository.saveLicenseAndEvidence(license, evidence);
    await this.repository.appendAuditRecord(audit);
    await this.syncTargetAggregateState(params.targetProfileOrOrgId, nowIso);
    return license;
  }

  async submitCredential(params: {
    principal: AuthenticatedPrincipalContext;
    credentialId: string;
    privateDocuments: ReadonlyArray<PrivateDocumentEvidenceItem>;
    expirationDateIso?: string | null;
    submittedAtIso?: string;
  }): Promise<ProfessionalLicenseRecord> {
    const license = await this.repository.getLicenseById(params.credentialId);
    const evidence = await this.repository.getEvidenceByCredentialId(params.credentialId);
    if (!license || !evidence) throw new Error('مدرک مورد نظر یافت نشد.');

    const nowIso = params.submittedAtIso ?? new Date().toISOString();
    const res = submitCredentialForReview({
      principal: params.principal,
      license,
      evidence,
      privateDocuments: params.privateDocuments,
      expirationDateIso: params.expirationDateIso,
      submittedAtIso: nowIso,
    });

    await this.repository.saveLicenseAndEvidence(res.license, res.evidence);
    await this.repository.appendAuditRecord(res.audit);
    await this.syncTargetAggregateState(res.license.profileId, nowIso);
    return res.license;
  }

  async startReview(params: {
    reviewerPrincipal: AuthenticatedPrincipalContext;
    credentialId: string;
    startedAtIso?: string;
  }): Promise<ProfessionalLicenseRecord> {
    const license = await this.repository.getLicenseById(params.credentialId);
    const evidence = await this.repository.getEvidenceByCredentialId(params.credentialId);
    if (!license || !evidence) throw new Error('مدرک مورد نظر یافت نشد.');

    const nowIso = params.startedAtIso ?? new Date().toISOString();
    const res = startCredentialVerificationReview({
      reviewerPrincipal: params.reviewerPrincipal,
      license,
      evidence,
      startedAtIso: nowIso,
    });

    await this.repository.saveLicenseAndEvidence(res.license, res.evidence);
    await this.repository.appendAuditRecord(res.audit);
    await this.syncTargetAggregateState(res.license.profileId, nowIso);
    return res.license;
  }

  async decideReview(params: {
    reviewerPrincipal: AuthenticatedPrincipalContext;
    credentialId: string;
    decision: 'verified' | 'rejected';
    verificationMethod: VerificationMethodType;
    officialVerificationUrl?: string | null;
    officialInquiryReferenceCode?: string | null;
    expirationDateIso?: string | null;
    internalReviewerNotesFa?: string | null;
    decisionReasonFa: string;
    reviewedAtIso?: string;
  }): Promise<ProfessionalLicenseRecord> {
    const license = await this.repository.getLicenseById(params.credentialId);
    const evidence = await this.repository.getEvidenceByCredentialId(params.credentialId);
    if (!license || !evidence) throw new Error('مدرک مورد نظر یافت نشد.');

    const nowIso = params.reviewedAtIso ?? new Date().toISOString();
    const res = decideCredentialVerificationReview({
      reviewerPrincipal: params.reviewerPrincipal,
      license,
      evidence,
      decision: params.decision,
      verificationMethod: params.verificationMethod,
      officialVerificationUrl: params.officialVerificationUrl,
      officialInquiryReferenceCode: params.officialInquiryReferenceCode,
      expirationDateIso: params.expirationDateIso,
      internalReviewerNotesFa: params.internalReviewerNotesFa,
      decisionReasonFa: params.decisionReasonFa,
      reviewedAtIso: nowIso,
    });

    await this.repository.saveLicenseAndEvidence(res.license, res.evidence);
    await this.repository.appendAuditRecord(res.audit);
    await this.syncTargetAggregateState(res.license.profileId, nowIso);
    return res.license;
  }

  async transitionDisciplinaryState(params: {
    actorPrincipal: AuthenticatedPrincipalContext;
    credentialId: string;
    targetState: 'suspended' | 'revoked' | 'verified';
    reasonFa: string;
    occurredAtIso?: string;
  }): Promise<ProfessionalLicenseRecord> {
    const license = await this.repository.getLicenseById(params.credentialId);
    const evidence = await this.repository.getEvidenceByCredentialId(params.credentialId);
    if (!license || !evidence) throw new Error('مدرک مورد نظر یافت نشد.');

    const nowIso = params.occurredAtIso ?? new Date().toISOString();
    const res = applyDisciplinaryCredentialTransition({
      actorPrincipal: params.actorPrincipal,
      license,
      evidence,
      targetState: params.targetState,
      reasonFa: params.reasonFa,
      occurredAtIso: nowIso,
    });

    await this.repository.saveLicenseAndEvidence(res.license, res.evidence);
    await this.repository.appendAuditRecord(res.audit);
    await this.syncTargetAggregateState(res.license.profileId, nowIso);
    return res.license;
  }

  async sweepAndExpireCredentials(referenceNowIso: string): Promise<ReadonlyArray<string>> {
    const allLicenses = await this.repository.listAllLicenses();
    const expiredCredentialIds: string[] = [];

    for (const license of allLicenses) {
      const evidence = await this.repository.getEvidenceByCredentialId(license.credentialId);
      if (!evidence) continue;
      const evaluated = evaluateAndTransitionExpiredCredential({
        license,
        evidence,
        referenceNowIso,
      });
      if (evaluated.didExpire && evaluated.audit) {
        await this.repository.saveLicenseAndEvidence(evaluated.license, evaluated.evidence);
        await this.repository.appendAuditRecord(evaluated.audit);
        await this.syncTargetAggregateState(license.profileId, referenceNowIso);
        expiredCredentialIds.push(license.credentialId);
      }
    }

    return expiredCredentialIds;
  }

  async getProtectedEvidence(params: {
    principal: AuthenticatedPrincipalContext | null | undefined;
    credentialId: string;
  }): Promise<{
    allowed: boolean;
    statusCode: 200 | 401 | 403;
    reasonFa: string | null;
    evidence: VerificationEvidenceRecord | null;
  }> {
    const evidence = await this.repository.getEvidenceByCredentialId(params.credentialId);
    if (!evidence) {
      throw new Error('پرونده شواهد مدرک یافت نشد.');
    }
    return readProtectedEvidenceForPrincipal({
      principal: params.principal,
      evidence,
    });
  }

  async getPublicProfessionalSummary(
    profileId: string,
    referenceNowIso = new Date().toISOString()
  ): Promise<PublicProfessionalVerificationSummary> {
    const profile = await this.repository.getProfessionalProfileById(profileId);
    if (!profile) throw new Error('نمایه حرفه‌ای یافت نشد.');

    const credentials = await this.repository.listLicensesByProfileId(profileId);
    const memberships = await this.repository.listMembershipsByProfile(profileId);

    const organizationsById = new Map<string, BusinessOrganizationProfileRecord>();
    const organizationCredentialsById = new Map<string, ReadonlyArray<ProfessionalLicenseRecord>>();

    for (const m of memberships) {
      const org = await this.repository.getOrganizationProfileById(m.organizationId);
      if (org) {
        organizationsById.set(org.organizationId, org);
        const orgCreds = await this.repository.listLicensesByProfileId(org.organizationId);
        organizationCredentialsById.set(org.organizationId, orgCreds);
      }
    }

    return buildPublicProfessionalVerificationSummary({
      profile,
      credentials,
      memberships,
      organizationsById,
      organizationCredentialsById,
      referenceNowIso,
    });
  }

  async getPublicOrganizationSummary(
    organizationId: string,
    referenceNowIso = new Date().toISOString()
  ): Promise<PublicOrganizationVerificationSummary> {
    const organization = await this.repository.getOrganizationProfileById(organizationId);
    if (!organization) throw new Error('نمایه سازمانی یافت نشد.');

    const credentials = await this.repository.listLicensesByProfileId(organizationId);
    const memberships = await this.repository.listMembershipsByOrganization(organizationId);
    const memberProfilesById = new Map<string, ProfessionalProfileRecord>();

    for (const m of memberships) {
      const prof = await this.repository.getProfessionalProfileById(m.professionalProfileId);
      if (prof) memberProfilesById.set(prof.profileId, prof);
    }

    return buildPublicOrganizationVerificationSummary({
      organization,
      credentials,
      confirmedMemberships: memberships,
      memberProfilesById,
      referenceNowIso,
    });
  }

  async getAuditHistoryForTarget(
    targetId: string
  ): Promise<ReadonlyArray<VerificationAuditLogEntry>> {
    return this.repository.listAuditHistoryForTarget(targetId);
  }

  private async syncTargetAggregateState(
    targetId: string,
    referenceNowIso: string
  ): Promise<void> {
    const creds = await this.repository.listLicensesByProfileId(targetId);
    const credentialIds = creds.map((c) => c.credentialId);
    const overallState = recomputeAggregateVerificationState(creds, referenceNowIso);

    const profile = await this.repository.getProfessionalProfileById(targetId);
    if (profile) {
      await this.repository.saveProfessionalProfile({
        ...profile,
        credentialIds,
        overallVerificationState: overallState,
        updatedAtIso: referenceNowIso,
      });
      return;
    }

    const org = await this.repository.getOrganizationProfileById(targetId);
    if (org) {
      await this.repository.saveOrganizationProfile({
        ...org,
        credentialIds,
        overallVerificationState: overallState,
        updatedAtIso: referenceNowIso,
      });
    }
  }
}

export const defaultProfessionalVerificationService = new ProfessionalVerificationService(
  new InMemoryProfessionalVerificationRepository()
);
