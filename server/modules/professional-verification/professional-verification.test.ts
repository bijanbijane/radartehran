/**
 * @file server/modules/professional-verification/professional-verification.test.ts
 * @description Self-Contained Domain Test Suite for Employee 12 — Professional Identity,
 * Organization, and Credential Verification Backend.
 * Covers identity ownership, anti-plausibility guards, unauthorized review & Separation of Duties,
 * status transitions, expiration, suspension & revocation, document privacy, official authority URL
 * validation, organization memberships, and audit integrity.
 */

import { describe, it } from 'node:test';
import * as assert from 'node:assert/strict';
import {
  InMemoryProfessionalVerificationRepository,
  OFFICIAL_VERIFICATION_AUTHORITIES,
  ProfessionalVerificationService,
  validateOfficialAuthorityVerificationUrl,
  validateVerificationStateTransition,
  type AuthenticatedPrincipalContext,
  type PrivateDocumentEvidenceItem,
} from './index';

const AGENT_PRINCIPAL: AuthenticatedPrincipalContext = {
  uid: 'uid-agent-101',
  email: 'agent101@example.com',
  isAuthenticated: true,
  isAdmin: false,
  roles: ['user', 'professional'],
  permissions: [
    'professional_verification:submit_own',
    'professional_verification:read_own_private',
  ],
};

const AGENCY_OWNER_PRINCIPAL: AuthenticatedPrincipalContext = {
  uid: 'uid-agency-owner-202',
  email: 'agency202@example.com',
  isAuthenticated: true,
  isAdmin: false,
  roles: ['user', 'professional'],
  permissions: [
    'professional_verification:submit_own',
    'professional_verification:read_own_private',
  ],
};

const OTHER_USER_PRINCIPAL: AuthenticatedPrincipalContext = {
  uid: 'uid-stranger-999',
  email: 'stranger@example.com',
  isAuthenticated: true,
  isAdmin: false,
  roles: ['user'],
  permissions: [],
};

const REVIEWER_PRINCIPAL: AuthenticatedPrincipalContext = {
  uid: 'uid-reviewer-501',
  email: 'reviewer501@radartehran.ir',
  isAuthenticated: true,
  isAdmin: false,
  roles: ['reviewer', 'compliance_officer'],
  permissions: [
    'professional_verification:review_credentials',
    'professional_verification:revoke_or_suspend',
    'professional_verification:audit_read',
  ],
};

function makePrivateDoc(
  id: string,
  uploaderUid: string,
  overrides: Partial<PrivateDocumentEvidenceItem> = {}
): PrivateDocumentEvidenceItem {
  return {
    evidenceItemId: id,
    documentType: 'license_scan',
    privateStorageObjectKey: `private-vault/credentials/${uploaderUid}/${id}.pdf`,
    sha256DigestHex: 'a'.repeat(64),
    mimeType: 'application/pdf',
    byteSize: 245_000,
    uploadedByUid: uploaderUid,
    uploadedAtIso: '2026-11-01T09:00:00.000Z',
    accessClassification: 'restricted_reviewer_only',
    ...overrides,
  };
}

describe('Employee 12 — Professional Identity & Credential Verification Backend', () => {
  // =========================================================================
  // 1. Identity Ownership & Plausibility-Only Anti-Verification Invariants
  // =========================================================================
  describe('Identity Ownership & Anti-Plausibility Verification Guards', () => {
    it('prevents a principal from creating or submitting credentials for another user profile', async () => {
      const service = new ProfessionalVerificationService(
        new InMemoryProfessionalVerificationRepository()
      );

      await service.createProfessionalProfile({
        principal: AGENT_PRINCIPAL,
        profileId: 'prof-agent-101',
        displayNameFa: 'مهندس علی رضایی',
        entityType: 'real_estate_agent',
        primaryCityId: 'tehran',
        coveredHoodIds: [1, 3],
        specialtySummaryFa: 'کارشناس املاک مسکونی منطقه ۱ و ۲',
        experienceYears: 8,
        createdAtIso: '2026-11-01T08:00:00.000Z',
      });

      await assert.rejects(
        async () => {
          await service.createCredentialDraft({
            principal: OTHER_USER_PRINCIPAL,
            credentialId: 'cred-impersonated',
            targetProfileOrOrgId: 'prof-agent-101',
            entityType: 'real_estate_agent',
            credentialType: 'real_estate_specialist_certificate',
            issuingAuthorityCode: 'tehran_real_estate_union',
            credentialIdentifier: '1402-889900',
            holderFullNameFa: 'مهندس علی رضایی',
            cityId: 'tehran',
          });
        },
        /متعلق به خود/
      );
    });

    it('never marks a profile or credential verified merely because a license number or document is submitted', async () => {
      const service = new ProfessionalVerificationService(
        new InMemoryProfessionalVerificationRepository()
      );

      await service.createProfessionalProfile({
        principal: AGENT_PRINCIPAL,
        profileId: 'prof-agent-101',
        displayNameFa: 'مهندس علی رضایی',
        entityType: 'engineer',
        primaryCityId: 'tehran',
        coveredHoodIds: [3],
        specialtySummaryFa: 'مهندس ناظر سازه',
        experienceYears: 10,
      });

      const draft = await service.createCredentialDraft({
        principal: AGENT_PRINCIPAL,
        credentialId: 'cred-eng-1',
        targetProfileOrOrgId: 'prof-agent-101',
        entityType: 'engineer',
        credentialType: 'engineering_organization_employment_license',
        issuingAuthorityCode: 'construction_engineering_org_irceo',
        credentialIdentifier: '10-100-98765',
        holderFullNameFa: 'علی رضایی',
        cityId: 'tehran',
        expirationDateIso: '2027-11-01T00:00:00.000Z',
        createdAtIso: '2026-11-01T08:30:00.000Z',
      });

      assert.equal(draft.status, 'unsubmitted');
      assert.equal(draft.verificationMethod, 'unverified_submission');

      const submitted = await service.submitCredential({
        principal: AGENT_PRINCIPAL,
        credentialId: 'cred-eng-1',
        privateDocuments: [makePrivateDoc('doc-1', AGENT_PRINCIPAL.uid)],
        submittedAtIso: '2026-11-01T09:15:00.000Z',
      });

      assert.equal(submitted.status, 'pending');
      assert.equal(submitted.verificationMethod, 'unverified_submission');

      const publicSummary = await service.getPublicProfessionalSummary(
        'prof-agent-101',
        '2026-11-01T10:00:00.000Z'
      );
      assert.equal(publicSummary.isCurrentlyVerified, false);
      assert.equal(publicSummary.publicVerificationStatus, 'pending');
      assert.equal(publicSummary.verifiedCredentialsSummary.length, 0);
    });
  });

  // =========================================================================
  // 2. Unauthorized Review & Separation of Duties (SoD)
  // =========================================================================
  describe('Unauthorized Review & Separation of Duties (SoD)', () => {
    it('blocks non-reviewers from reviewing credentials and blocks a reviewer from self-approving their own credential', async () => {
      const service = new ProfessionalVerificationService(
        new InMemoryProfessionalVerificationRepository()
      );

      // Reviewer creates their own professional profile & credential
      await service.createProfessionalProfile({
        principal: REVIEWER_PRINCIPAL,
        profileId: 'prof-reviewer-own',
        displayNameFa: 'بازرس دارای پروانه شخصی',
        entityType: 'architect',
        primaryCityId: 'tehran',
        coveredHoodIds: [2],
        specialtySummaryFa: 'طراحی معماری',
        experienceYears: 12,
      });

      await service.createCredentialDraft({
        principal: REVIEWER_PRINCIPAL,
        credentialId: 'cred-self-review',
        targetProfileOrOrgId: 'prof-reviewer-own',
        entityType: 'architect',
        credentialType: 'engineering_organization_employment_license',
        issuingAuthorityCode: 'construction_engineering_org_irceo',
        credentialIdentifier: '10-200-54321',
        holderFullNameFa: 'بازرس دارای پروانه شخصی',
        cityId: 'tehran',
        expirationDateIso: '2027-06-01T00:00:00.000Z',
        createdAtIso: '2026-11-01T08:00:00.000Z',
      });

      await service.submitCredential({
        principal: REVIEWER_PRINCIPAL,
        credentialId: 'cred-self-review',
        privateDocuments: [makePrivateDoc('doc-self', REVIEWER_PRINCIPAL.uid)],
        submittedAtIso: '2026-11-01T09:05:00.000Z',
      });

      // 1. Unprivileged user cannot start review
      await assert.rejects(
        async () => {
          await service.startReview({
            reviewerPrincipal: OTHER_USER_PRINCIPAL,
            credentialId: 'cred-self-review',
          });
        },
        /بازرسان مجاز/
      );

      // 2. Reviewer cannot review their own credential (SoD conflict of interest)
      await assert.rejects(
        async () => {
          await service.startReview({
            reviewerPrincipal: REVIEWER_PRINCIPAL,
            credentialId: 'cred-self-review',
          });
        },
        /Separation of Duties/
      );
    });
  });

  // =========================================================================
  // 3. Explicit State Machine, Review Methods & Official Authority URLs
  // =========================================================================
  describe('Verification Workflow, Official Authorities & Method Distinction', () => {
    it('enforces state machine transitions, validates official authority HTTPS URLs, and distinguishes manual review vs official registry cross-check', async () => {
      assert.equal(validateVerificationStateTransition('unsubmitted', 'verified').allowed, false);
      assert.equal(validateVerificationStateTransition('pending', 'verified').allowed, false);
      assert.equal(validateVerificationStateTransition('under_review', 'verified').allowed, true);
      assert.equal(validateVerificationStateTransition('revoked', 'verified').allowed, false);

      // Official authority catalog must never claim automated live APIs
      for (const auth of Object.values(OFFICIAL_VERIFICATION_AUTHORITIES)) {
        assert.equal(auth.hasAuthorizedAutomatedApi, false);
      }

      // Phishing or HTTP URLs must be rejected
      assert.equal(
        validateOfficialAuthorityVerificationUrl(
          'iran_business_licenses_portal_mojavez',
          'http://mojavez.ir/inquiry/123'
        ).valid,
        false
      );
      assert.equal(
        validateOfficialAuthorityVerificationUrl(
          'iran_business_licenses_portal_mojavez',
          'https://mojavez.ir.evil.example.com/inquiry/123'
        ).valid,
        false
      );
      assert.equal(
        validateOfficialAuthorityVerificationUrl(
          'iran_business_licenses_portal_mojavez',
          'https://qr.mojavez.ir/track/998877'
        ).valid,
        true
      );

      const service = new ProfessionalVerificationService(
        new InMemoryProfessionalVerificationRepository()
      );

      await service.createProfessionalProfile({
        principal: AGENT_PRINCIPAL,
        profileId: 'prof-101',
        displayNameFa: 'سارا احمدی',
        entityType: 'real_estate_agent',
        primaryCityId: 'tehran',
        coveredHoodIds: [3, 4],
        specialtySummaryFa: 'مشاور تخصصی سعادت‌آباد و شهرک غرب',
        experienceYears: 7,
      });

      await service.createCredentialDraft({
        principal: AGENT_PRINCIPAL,
        credentialId: 'cred-101',
        targetProfileOrOrgId: 'prof-101',
        entityType: 'real_estate_agent',
        credentialType: 'real_estate_union_business_license',
        issuingAuthorityCode: 'iran_business_licenses_portal_mojavez',
        credentialIdentifier: '140399887766',
        holderFullNameFa: 'سارا احمدی',
        cityId: 'tehran',
        expirationDateIso: '2027-05-01T00:00:00.000Z',
        createdAtIso: '2026-11-01T08:00:00.000Z',
      });

      await service.submitCredential({
        principal: AGENT_PRINCIPAL,
        credentialId: 'cred-101',
        privateDocuments: [makePrivateDoc('doc-101', AGENT_PRINCIPAL.uid)],
        submittedAtIso: '2026-11-01T09:10:00.000Z',
      });

      await service.startReview({
        reviewerPrincipal: REVIEWER_PRINCIPAL,
        credentialId: 'cred-101',
        startedAtIso: '2026-11-02T10:00:00.000Z',
      });

      // Reject attempt to verify with 'unverified_submission'
      await assert.rejects(
        async () => {
          await service.decideReview({
            reviewerPrincipal: REVIEWER_PRINCIPAL,
            credentialId: 'cred-101',
            decision: 'verified',
            verificationMethod: 'unverified_submission',
            decisionReasonFa: 'تایید بدون روش مشخص',
          });
        },
        /روش بازبینی/
      );

      // Verify with official_authority_registry_cross_check and valid Mojavez HTTPS link
      const verified = await service.decideReview({
        reviewerPrincipal: REVIEWER_PRINCIPAL,
        credentialId: 'cred-101',
        decision: 'verified',
        verificationMethod: 'official_authority_registry_cross_check',
        officialVerificationUrl: 'https://qr.mojavez.ir/track/140399887766',
        officialInquiryReferenceCode: 'INQ-1403-9988',
        internalReviewerNotesFa: 'یادداشت داخلی محرمانه بازرس: تطبیق با کارت ملی انجام شد.',
        decisionReasonFa: 'استعلام شناسه یکتای مجوز در درگاه ملی مجوزها انجام و اصالت تایید شد.',
        reviewedAtIso: '2026-11-02T11:00:00.000Z',
      });

      assert.equal(verified.status, 'verified');
      assert.equal(verified.verificationMethod, 'official_authority_registry_cross_check');
    });
  });

  // =========================================================================
  // 4. Expiration, Suspension, Revocation & Audit Trail Integrity
  // =========================================================================
  describe('Expiration, Suspension, Revocation & Audit History', () => {
    it('tracks credential expiration, supports suspension/reinstatement/revocation, and records cryptographic audit entries', async () => {
      const service = new ProfessionalVerificationService(
        new InMemoryProfessionalVerificationRepository()
      );

      await service.createProfessionalProfile({
        principal: AGENT_PRINCIPAL,
        profileId: 'prof-lifecycle',
        displayNameFa: 'رضا کاظمی',
        entityType: 'contractor',
        primaryCityId: 'karaj',
        coveredHoodIds: [101],
        specialtySummaryFa: 'پیمانکار ابنیه و اسکلت بتنی',
        experienceYears: 14,
      });

      await service.createCredentialDraft({
        principal: AGENT_PRINCIPAL,
        credentialId: 'cred-life-1',
        targetProfileOrOrgId: 'prof-lifecycle',
        entityType: 'contractor',
        credentialType: 'construction_legal_entity_grade_certificate',
        issuingAuthorityCode: 'plan_and_budget_org_sajat',
        credentialIdentifier: 'SJ-99112233',
        holderFullNameFa: 'رضا کاظمی',
        cityId: 'karaj',
        expirationDateIso: '2026-12-01T00:00:00.000Z',
        createdAtIso: '2026-11-01T08:00:00.000Z',
      });

      await service.submitCredential({
        principal: AGENT_PRINCIPAL,
        credentialId: 'cred-life-1',
        privateDocuments: [makePrivateDoc('doc-life', AGENT_PRINCIPAL.uid)],
        submittedAtIso: '2026-11-01T09:10:00.000Z',
      });

      await service.startReview({
        reviewerPrincipal: REVIEWER_PRINCIPAL,
        credentialId: 'cred-life-1',
        startedAtIso: '2026-11-02T09:00:00.000Z',
      });

      await service.decideReview({
        reviewerPrincipal: REVIEWER_PRINCIPAL,
        credentialId: 'cred-life-1',
        decision: 'verified',
        verificationMethod: 'manual_document_review',
        decisionReasonFa: 'گواهی صلاحیت پیمانکاری بررسی و تایید شد.',
        reviewedAtIso: '2026-11-02T10:00:00.000Z',
      });

      // Suspend credential
      const suspended = await service.transitionDisciplinaryState({
        actorPrincipal: REVIEWER_PRINCIPAL,
        credentialId: 'cred-life-1',
        targetState: 'suspended',
        reasonFa: 'تعلیق موقت جهت بررسی گزارش مغایرت بیمه‌ای پروژه.',
        occurredAtIso: '2026-11-03T10:00:00.000Z',
      });
      assert.equal(suspended.status, 'suspended');

      const summaryWhileSuspended = await service.getPublicProfessionalSummary(
        'prof-lifecycle',
        '2026-11-03T12:00:00.000Z'
      );
      assert.equal(summaryWhileSuspended.isCurrentlyVerified, false);
      assert.equal(summaryWhileSuspended.publicVerificationStatus, 'suspended');

      // Reinstate suspended credential back to verified
      const reinstated = await service.transitionDisciplinaryState({
        actorPrincipal: REVIEWER_PRINCIPAL,
        credentialId: 'cred-life-1',
        targetState: 'verified',
        reasonFa: 'رفع تعلیق پس از ارائه مفاصاحساب معتبر.',
        occurredAtIso: '2026-11-04T10:00:00.000Z',
      });
      assert.equal(reinstated.status, 'verified');

      // Sweep expiration after 2026-12-01
      const expiredIds = await service.sweepAndExpireCredentials('2026-12-05T00:00:00.000Z');
      assert.deepEqual(expiredIds, ['cred-life-1']);

      const summaryAfterExpiry = await service.getPublicProfessionalSummary(
        'prof-lifecycle',
        '2026-12-05T00:00:00.000Z'
      );
      assert.equal(summaryAfterExpiry.isCurrentlyVerified, false);
      assert.equal(summaryAfterExpiry.publicVerificationStatus, 'expired');

      // Revoke expired credential
      const revoked = await service.transitionDisciplinaryState({
        actorPrincipal: REVIEWER_PRINCIPAL,
        credentialId: 'cred-life-1',
        targetState: 'revoked',
        reasonFa: 'ابطال نهایی پروانه به دستور مرجع صادرکننده.',
        occurredAtIso: '2026-12-06T10:00:00.000Z',
      });
      assert.equal(revoked.status, 'revoked');

      const audits = await service.getAuditHistoryForTarget('cred-life-1');
      assert.equal(audits.length, 8); // unsubmitted -> pending -> under_review -> verified -> suspended -> verified -> expired -> revoked
      assert.ok(audits.every((a) => /^[a-f0-9]{64}$/.test(a.integrityHashHex)));
    });
  });

  // =========================================================================
  // 5. Document Privacy, Public Summary Redaction & Organization Memberships
  // =========================================================================
  describe('Document Privacy, Minimum-Disclosure Public Summaries & Organization Memberships', () => {
    it('protects private evidence from public/unauthorized access and exposes only redacted public summaries with organization & marketplace links', async () => {
      const service = new ProfessionalVerificationService(
        new InMemoryProfessionalVerificationRepository()
      );

      // Create Agency Organization linked to Service Marketplace provider
      await service.createBusinessOrganizationProfile({
        principal: AGENCY_OWNER_PRINCIPAL,
        organizationId: 'org-agency-202',
        legalEntityNameFa: 'شرکت خدمات ملکی نگین سعادت‌آباد (سهامی خاص)',
        publicBrandNameFa: 'مسکن نگین سعادت‌آباد',
        organizationType: 'real_estate_agency',
        registrationNumber: '554433',
        primaryCityId: 'tehran',
        coveredHoodIds: [3, 4],
        serviceMarketplaceProviderRef: {
          serviceProviderId: 'smp-agency-202',
          providerCategory: 'real_estate_agency',
          cityId: 'tehran',
          coveredHoodIds: [3, 4],
          linkedSponsorSlotId: 'sponsor-hood-3',
        },
      });

      // Verify Agency License
      await service.createCredentialDraft({
        principal: AGENCY_OWNER_PRINCIPAL,
        credentialId: 'cred-agency-202',
        targetProfileOrOrgId: 'org-agency-202',
        entityType: 'real_estate_agency',
        credentialType: 'real_estate_union_business_license',
        issuingAuthorityCode: 'tehran_real_estate_union',
        credentialIdentifier: '0456789123',
        holderFullNameFa: 'مسکن نگین سعادت‌آباد',
        cityId: 'tehran',
        expirationDateIso: '2028-01-01T00:00:00.000Z',
        createdAtIso: '2026-11-01T08:00:00.000Z',
      });

      await service.submitCredential({
        principal: AGENCY_OWNER_PRINCIPAL,
        credentialId: 'cred-agency-202',
        privateDocuments: [makePrivateDoc('doc-agency-scan', AGENCY_OWNER_PRINCIPAL.uid)],
        submittedAtIso: '2026-11-01T09:30:00.000Z',
      });

      await service.startReview({
        reviewerPrincipal: REVIEWER_PRINCIPAL,
        credentialId: 'cred-agency-202',
        startedAtIso: '2026-11-02T09:00:00.000Z',
      });

      await service.decideReview({
        reviewerPrincipal: REVIEWER_PRINCIPAL,
        credentialId: 'cred-agency-202',
        decision: 'verified',
        verificationMethod: 'official_authority_registry_cross_check',
        officialVerificationUrl: 'https://iranamlaak.ir/license-inquiry/0456789123',
        internalReviewerNotesFa: 'SECRET_INTERNAL_REVIEWER_NOTE_DO_NOT_LEAK',
        decisionReasonFa: 'پروانه کسب اتحادیه املاک تهران استعلام و تایید شد.',
        reviewedAtIso: '2026-11-02T10:00:00.000Z',
      });

      // Create Agent Profile & Confirm Membership in Agency
      await service.createProfessionalProfile({
        principal: AGENT_PRINCIPAL,
        profileId: 'prof-agent-101',
        displayNameFa: 'امیرحسین نادری',
        entityType: 'real_estate_agent',
        primaryCityId: 'tehran',
        coveredHoodIds: [3],
        specialtySummaryFa: 'کارشناس فروش آپارتمان نوساز',
        experienceYears: 6,
        serviceMarketplaceProviderRef: {
          serviceProviderId: 'smp-agent-101',
          providerCategory: 'real_estate_agent',
          cityId: 'tehran',
          coveredHoodIds: [3],
          linkedSponsorSlotId: null,
        },
      });

      await service.requestOrganizationMembership({
        professionalPrincipal: AGENT_PRINCIPAL,
        membershipId: 'mem-101-202',
        professionalProfileId: 'prof-agent-101',
        organizationId: 'org-agency-202',
        role: 'affiliated_agent',
        requestedAtIso: '2026-11-02T11:00:00.000Z',
      });

      await service.confirmOrganizationMembership({
        organizationOwnerPrincipal: AGENCY_OWNER_PRINCIPAL,
        membershipId: 'mem-101-202',
        confirmedAtIso: '2026-11-02T12:00:00.000Z',
      });

      // Privacy check 1: Anonymous / null principal gets 401
      const anonRead = await service.getProtectedEvidence({
        principal: null,
        credentialId: 'cred-agency-202',
      });
      assert.equal(anonRead.allowed, false);
      assert.equal(anonRead.statusCode, 401);
      assert.equal(anonRead.evidence, null);

      // Privacy check 2: Unrelated user gets 403
      const strangerRead = await service.getProtectedEvidence({
        principal: OTHER_USER_PRINCIPAL,
        credentialId: 'cred-agency-202',
      });
      assert.equal(strangerRead.allowed, false);
      assert.equal(strangerRead.statusCode, 403);
      assert.equal(strangerRead.evidence, null);

      // Privacy check 3: Owner and Reviewer can access private evidence
      const ownerRead = await service.getProtectedEvidence({
        principal: AGENCY_OWNER_PRINCIPAL,
        credentialId: 'cred-agency-202',
      });
      assert.equal(ownerRead.allowed, true);
      assert.equal(ownerRead.evidence?.privateDocuments.length, 1);

      // Public Summary check: Must mask identifier and strip all private keys/notes
      const orgSummary = await service.getPublicOrganizationSummary(
        'org-agency-202',
        '2026-11-03T00:00:00.000Z'
      );
      assert.equal(orgSummary.isCurrentlyVerified, true);
      assert.equal(orgSummary.serviceMarketplaceProviderId, 'smp-agency-202');
      assert.equal(
        orgSummary.verifiedCredentialsSummary[0].maskedCredentialIdentifier,
        '04***23'
      );

      const serializedSummary = JSON.stringify(orgSummary);
      assert.equal(serializedSummary.includes('private-vault'), false);
      assert.equal(serializedSummary.includes('SECRET_INTERNAL_REVIEWER_NOTE'), false);
      assert.equal(serializedSummary.includes('0456789123'), false);

      const agentSummary = await service.getPublicProfessionalSummary(
        'prof-agent-101',
        '2026-11-03T00:00:00.000Z'
      );
      assert.equal(agentSummary.affiliatedOrganizations.length, 1);
      assert.equal(agentSummary.affiliatedOrganizations[0].publicBrandNameFa, 'مسکن نگین سعادت‌آباد');
      assert.equal(agentSummary.affiliatedOrganizations[0].isOrganizationVerified, true);
    });
  });
});
