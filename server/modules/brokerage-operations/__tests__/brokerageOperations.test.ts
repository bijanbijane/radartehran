import assert from 'node:assert/strict';
import {
  BrokerageActorContext, BrokerageOpsError,
  createBrokerageOperationsModuleFacade, InMemoryBrokerageOperationsStore,
} from '../index';
const orgAdmin: BrokerageActorContext = {
  userId: 'user_org_admin_1', role: 'ORG_ADMIN',
  organizationId: 'borg_teh_01', };
const otherOrgAdmin: BrokerageActorContext = {
  userId: 'user_other_org_admin', role: 'ORG_ADMIN',
  organizationId: 'borg_other_99', };
const verifierActor: BrokerageActorContext = {
  userId: 'user_compliance_verifier_1', role: 'COMPLIANCE_VERIFIER',
};
const supervisorActor: BrokerageActorContext = {
  userId: 'user_supervisor_1', role: 'SUPERVISOR',
  organizationId: 'borg_teh_01', professionalProfileId: 'bprof_sup_1',
};
const clientActor: BrokerageActorContext = {
  userId: 'client_seller_101', role: 'CLIENT',
};
async function expectBrokerageError(
  fn: () => Promise<unknown>, expectedCode: string
): Promise<BrokerageOpsError> {
  try {
    await fn();
    assert.fail(`Expected BrokerageOpsError(${expectedCode}) but succeeded`);
  } catch (err) {
    assert.ok(err instanceof BrokerageOpsError, `Expected BrokerageOpsError, got ${String(err)}`);
    assert.equal(err.code, expectedCode);
    return err;
  }
}
async function runTests() {
  console.log('Running Real Estate Brokerage & Agency Operations 33-scenario test suite...');
  const store = new InMemoryBrokerageOperationsStore();
  const facade = createBrokerageOperationsModuleFacade({ store });
  // 1. Brokerage organization creation (+ 30. Idempotency)
  const org = await facade.registerBrokerageOrganization(orgAdmin, {
    id: 'borg_teh_01', officialRegisteredName: 'Alborz Atlas Real Estate Brokerage Co. (Synthetic Fixture)',
    displayName: 'Alborz Atlas Agency', organizationType: 'BROKERAGE_COMPANY',
    registrationReference: 'REG-SYNTH-1001',
    jurisdiction: { citySlug: 'tehran', districtCode: '2', neighborhoodIdOrSlug: 'پونک' },
    contactInfo: { phone: '+982144001122', email: 'info@alborzatlas.example' },
    sourceProvenance: 'Synthetic registration document', idempotencyKey: 'idem_org_teh_01',
    isSyntheticTestFixture: true, });
  assert.equal(org.id, 'borg_teh_01');
  assert.equal(org.verificationStatus, 'DOCUMENTED');
  const idemOrg = await facade.registerBrokerageOrganization(orgAdmin, {
    displayName: 'Duplicate Call', organizationType: 'BROKERAGE_COMPANY',
    jurisdiction: { citySlug: 'tehran' },
    contactInfo: { phone: '+982144001122', email: 'info@alborzatlas.example' },
    sourceProvenance: 'Synthetic', idempotencyKey: 'idem_org_teh_01',
  });
  assert.equal(idemOrg.id, org.id);
  // 2. Invalid organization metadata
  await expectBrokerageError(
    () =>
      facade.registerBrokerageOrganization(orgAdmin, {
        displayName: 'Invalid Email Org', organizationType: 'INDEPENDENT_REAL_ESTATE_AGENCY',
        jurisdiction: { citySlug: 'tehran' }, contactInfo: { phone: '+982144001122', email: 'not-an-email' },
        sourceProvenance: 'Self-reported', }),
    'VALIDATION_FAILED'
  );
  // 3. Branch creation and parent organization validation
  await expectBrokerageError(
    () =>
      facade.registerAgencyBranch(orgAdmin, {
        parentOrganizationId: 'borg_nonexistent', branchName: 'Orphan Branch',
        addressReference: 'addr_1', jurisdiction: { citySlug: 'tehran' },
        contactInfo: { phone: '+982144001123', email: 'branch@alborzatlas.example' }, }),
    'RESOURCE_NOT_FOUND'
  );
  const branch1 = await facade.registerAgencyBranch(orgAdmin, {
    id: 'bbr_punak_01', parentOrganizationId: org.id,
    branchName: 'Punak Central Branch', addressReference: 'addr_teh_punak_01',
    jurisdiction: { citySlug: 'tehran', districtCode: '2', neighborhoodIdOrSlug: 'پونک' },
    contactInfo: { phone: '+982144001123', email: 'punak@alborzatlas.example' },
    isSyntheticTestFixture: true, });
  const branch2 = await facade.registerAgencyBranch(orgAdmin, {
    id: 'bbr_saadat_02', parentOrganizationId: org.id,
    branchName: 'Saadat Abad Branch', addressReference: 'addr_teh_saadat_02',
    jurisdiction: { citySlug: 'tehran', districtCode: '2' },
    contactInfo: { phone: '+982144001124', email: 'saadat@alborzatlas.example' },
    isSyntheticTestFixture: true, });
  assert.equal(branch1.parentOrganizationId, org.id);
  // 4. Branch jurisdiction references validation
  await expectBrokerageError(
    () =>
      facade.registerAgencyBranch(orgAdmin, {
        parentOrganizationId: org.id, branchName: 'Invalid City Branch',
        addressReference: 'addr_unknown', jurisdiction: { citySlug: 'invalid_city_xyz' },
        contactInfo: { phone: '+982144001125', email: 'bad@alborzatlas.example' }, }),
    'JURISDICTION_MISMATCH'
  );
  // 5. Professional profile creation (distinguished from license verification)
  const agentProfile1 = await facade.registerProfessionalProfile(orgAdmin, {
    id: 'bprof_agent_1', userIdentityRef: 'user_agent_1',
    displayName: 'Sara Rahimi (Synthetic Agent)', professionalRole: 'REAL_ESTATE_AGENT',
    specializations: ['RESIDENTIAL_SALES'], privateContactEmail: 'sara.private@example.com',
    isSyntheticTestFixture: true, });
  const agentProfile2 = await facade.registerProfessionalProfile(orgAdmin, {
    id: 'bprof_agent_2', userIdentityRef: 'user_agent_2',
    displayName: 'Kaveh Tehrani (Synthetic Agent)', professionalRole: 'LICENSED_BROKER',
    isSyntheticTestFixture: true, });
  assert.equal(agentProfile1.profileVerificationStatus, 'UNVERIFIED');
  // 6. Qualification status validation (self-reported / pending does not grant verified eligibility)
  const qual1 = await facade.addQualificationReference(orgAdmin, {
    id: 'bqual_agent_1', professionalProfileId: agentProfile1.id,
    qualificationCategory: 'REAL_ESTATE_BROKERAGE_CERTIFICATE',
    issuingAuthorityRef: 'Tehran Real Estate Union (Synthetic Ref)',
    licenseOrCertificateNumber: 'LIC-SYNTH-2026-01', jurisdiction: { citySlug: 'tehran' },
    issueDateIso: '2025-01-01T00:00:00.000Z', expirationDateIso: '2027-01-01T00:00:00.000Z',
    supportingEvidenceIds: ['ev_qual_doc_1'], isSyntheticTestFixture: true,
  });
  await facade.submitQualificationForVerification(orgAdmin, qual1.id, ['ev_qual_doc_1']);
  await expectBrokerageError(
    () => facade.verifyProfessionalLicensedEligibility(agentProfile1.id, 'tehran', '2026-06-01T00:00:00.000Z'),
    'QUALIFICATION_NOT_VERIFIED_OR_EXPIRED'
  );
  await facade.recordAuthorizedQualificationVerification(verifierActor, {
    qualificationId: qual1.id, newStatus: 'VERIFIED',
    verificationMethod: 'Registry cross-check', notes: 'Verified synthetic license.',
  });
  const eligOk = await facade.verifyProfessionalLicensedEligibility(
    agentProfile1.id, 'tehran',
    '2026-06-01T00:00:00.000Z'
  );
  assert.equal(eligOk.eligible, true);
  // Also verify license in Tehran does NOT apply to Karaj
  await expectBrokerageError(
    () => facade.verifyProfessionalLicensedEligibility(agentProfile1.id, 'karaj', '2026-06-01T00:00:00.000Z'),
    'QUALIFICATION_NOT_VERIFIED_OR_EXPIRED'
  );
  // 7. Expired license handling
  await expectBrokerageError(
    () => facade.verifyProfessionalLicensedEligibility(agentProfile1.id, 'tehran', '2028-01-01T00:00:00.000Z'),
    'QUALIFICATION_NOT_VERIFIED_OR_EXPIRED'
  );
  // 8. Organization-agent affiliation & branch transfer
  const aff1 = await facade.createOrganizationAgentAffiliation(orgAdmin, {
    id: 'baff_agent_1', organizationId: org.id,
    branchId: branch1.id, professionalProfileId: agentProfile1.id,
    roleWithinOrganization: 'REAL_ESTATE_AGENT',
    authorityPermissions: ['HANDLE_LISTINGS', 'MANAGE_ENGAGEMENTS'], });
  const aff2 = await facade.createOrganizationAgentAffiliation(orgAdmin, {
    id: 'baff_agent_2', organizationId: org.id,
    branchId: branch1.id, professionalProfileId: agentProfile2.id,
    roleWithinOrganization: 'LICENSED_BROKER', authorityPermissions: ['HANDLE_LISTINGS'],
  });
  assert.equal(aff1.affiliationStatus, 'ACTIVE');
  // 9. Unauthorized branch access (branch manager of branch1 cannot close branch2)
  const branch1MgrActor: BrokerageActorContext = {
    userId: 'user_bm_1', role: 'BRANCH_MANAGER',
    organizationId: org.id, branchId: branch1.id,
  };
  await expectBrokerageError(
    () =>
      facade.closeOrSuspendBranch(branch1MgrActor, {
        branchId: branch2.id, targetStatus: 'SUSPENDED',
        reason: 'Attempted cross-branch suspension', }),
    'UNAUTHORIZED_BRANCH_ACCESS'
  );
  // 10. Affiliation termination and permission removal
  const terminatedAff2 = await facade.suspendOrTerminateAffiliation(orgAdmin, {
    affiliationId: aff2.id, targetStatus: 'TERMINATED',
    reason: 'End of contract', });
  assert.equal(terminatedAff2.affiliationStatus, 'TERMINATED');
  assert.equal(terminatedAff2.authorityPermissions.length, 0);
  // Re-create active affiliation for agent 2 on branch 1 so we can test reassignment later, and create a 3rd terminated profile for eligibility failure test
  const agentProfile3 = await facade.registerProfessionalProfile(orgAdmin, {
    id: 'bprof_agent_3_term', userIdentityRef: 'user_agent_3',
    displayName: 'Terminated Agent', professionalRole: 'REAL_ESTATE_AGENT',
    isSyntheticTestFixture: true, });
  const aff3 = await facade.createOrganizationAgentAffiliation(orgAdmin, {
    organizationId: org.id, branchId: branch1.id,
    professionalProfileId: agentProfile3.id, roleWithinOrganization: 'REAL_ESTATE_AGENT',
    authorityPermissions: ['HANDLE_LISTINGS'], });
  await facade.suspendOrTerminateAffiliation(orgAdmin, {
    affiliationId: aff3.id, targetStatus: 'TERMINATED',
    reason: 'Terminated before assignment', });
  const activeAff2 = await facade.createOrganizationAgentAffiliation(orgAdmin, {
    organizationId: org.id, branchId: branch1.id,
    professionalProfileId: agentProfile2.id, roleWithinOrganization: 'LICENSED_BROKER',
    authorityPermissions: ['HANDLE_LISTINGS'], });
  assert.equal(activeAff2.affiliationStatus, 'ACTIVE');
  // 11. Mandate creation
  const mandate = await facade.createRepresentationMandate(orgAdmin, {
    id: 'bmand_sell_01', clientPartyId: clientActor.userId,
    organizationId: org.id, assignedProfessionalProfileId: agentProfile1.id,
    propertyId: 'prop_teh_101', mandateCategory: 'SELLER_REPRESENTATION',
    serviceScopeSummary: 'Market residential apartment in Punak', exclusivity: 'EXCLUSIVE_AGENCY',
    geographicOrAssetScope: 'Tehran District 2 Punak', effectiveStartIso: '2026-01-01T00:00:00.000Z',
    expirationDateIso: '2026-12-31T00:00:00.000Z', isSyntheticTestFixture: true,
  });
  assert.equal(mandate.status, 'MANDATE_DRAFT');
  assert.equal(mandate.grantsTransactionExecutionAuthority, false);
  // 14 & 15. Representation authority scope & unauthorized actions outside mandate scope / before acceptance
  await facade.recordAuthorityScope(orgAdmin, {
    mandateId: mandate.id, authorizedAction: 'PUBLISH_OR_PROMOTE_LISTING',
    effectiveStartIso: '2026-01-01T00:00:00.000Z', });
  // 12. Client acceptance validation (cannot exercise authority before client accepts; non-client cannot accept)
  await expectBrokerageError(
    () => facade.verifyMandateActionPermission(mandate.id, 'PUBLISH_OR_PROMOTE_LISTING', '2026-06-01T00:00:00.000Z'),
    'CLIENT_ACCEPTANCE_REQUIRED'
  );
  await expectBrokerageError(
    () => facade.acceptOrTerminateMandate(orgAdmin, { mandateId: mandate.id, targetStatus: 'ACCEPTED_BY_CLIENT' }),
    'CLIENT_ACCEPTANCE_REQUIRED'
  );
  const acceptedMandate = await facade.acceptOrTerminateMandate(clientActor, {
    mandateId: mandate.id, targetStatus: 'ACCEPTED_BY_CLIENT',
  });
  assert.equal(acceptedMandate.status, 'ACCEPTED_BY_CLIENT');
  const permCheck = await facade.verifyMandateActionPermission(
    mandate.id, 'PUBLISH_OR_PROMOTE_LISTING',
    '2026-06-01T00:00:00.000Z'
  );
  assert.equal(permCheck.permitted, true);
  // 15. Unauthorized action outside scope & restricted action never inferred
  await expectBrokerageError(
    () => facade.verifyMandateActionPermission(mandate.id, 'COORDINATE_NEGOTIATIONS', '2026-06-01T00:00:00.000Z'),
    'OUTSIDE_MANDATE_AUTHORITY_SCOPE'
  );
  await expectBrokerageError(
    () => facade.verifyMandateActionPermission(mandate.id, 'SIGN_CONTRACT_ON_BEHALF_OF_CLIENT', '2026-06-01T00:00:00.000Z'),
    'RESTRICTED_AUTHORITY_NOT_INFERRED'
  );
  await expectBrokerageError(
    () =>
      facade.recordAuthorityScope(orgAdmin, {
        mandateId: mandate.id, authorizedAction: 'SIGN_CONTRACT_ON_BEHALF_OF_CLIENT',
        effectiveStartIso: '2026-01-01T00:00:00.000Z', verificationStatus: 'UNVERIFIED',
      }), 'RESTRICTED_AUTHORITY_NOT_INFERRED'
  );
  // 13. Mandate expiration
  await expectBrokerageError(
    () => facade.verifyMandateActionPermission(mandate.id, 'PUBLISH_OR_PROMOTE_LISTING', '2027-02-01T00:00:00.000Z'),
    'MANDATE_EXPIRED_OR_INACTIVE'
  );
  // 19. Professional assignment eligibility (terminated agentProfile3 rejected)
  await expectBrokerageError(
    () =>
      facade.createAgentAssignment(orgAdmin, {
        organizationId: org.id, branchId: branch1.id,
        professionalProfileId: agentProfile3.id, mandateId: mandate.id,
        assignmentType: 'PROPERTY_MARKETING', responsibilitiesSummary: 'Should fail for terminated agent',
        startDateIso: '2026-06-01T00:00:00.000Z', }),
    'AFFILIATION_INACTIVE_OR_TERMINATED'
  );
  // 16. Assignment creation
  const assignment = await facade.createAgentAssignment(orgAdmin, {
    id: 'basg_01', organizationId: org.id,
    branchId: branch1.id, professionalProfileId: agentProfile1.id,
    mandateId: mandate.id, assignmentType: 'PROPERTY_MARKETING',
    responsibilitiesSummary: 'Prepare marketing dossier and coordinate viewings',
    startDateIso: '2026-06-01T00:00:00.000Z', });
  assert.equal(assignment.workloadStatus, 'ASSIGNED_PENDING');
  // 17. Assignment acceptance and rejection
  const rejectedAsg = await facade.acceptOrRejectAssignment(orgAdmin, {
    assignmentId: assignment.id, decision: 'REJECTED',
  });
  assert.equal(rejectedAsg.workloadStatus, 'REJECTED');
  // 18. Reassignment history
  const reassigned = await facade.reassignProfessional(orgAdmin, {
    assignmentId: assignment.id, newProfessionalProfileId: agentProfile2.id,
    reason: 'Workload balancing to Kaveh', });
  assert.equal(reassigned.professionalProfileId, agentProfile2.id);
  assert.equal(reassigned.reassignmentHistory.length, 1);
  await facade.acceptOrRejectAssignment(orgAdmin, {
    assignmentId: assignment.id, decision: 'COMPLETED',
  });
  // 20, 21, 23. Commission agreement versioning, proposed vs accepted terms, percentage & fixed-fee calculation
  const commAgreement = await facade.createCommissionAgreement(orgAdmin, {
    id: 'bcomm_01', mandateId: mandate.id,
    organizationId: org.id, professionalProfileId: agentProfile2.id,
    payerPartyId: clientActor.userId, beneficiaryIds: [org.id, agentProfile2.id],
    compensationModel: 'PERCENTAGE_COMMISSION', ratePercentage: 1.0,
    applicableTransactionType: 'SALE', calculationBasisDescription: '1% of verified sale price',
    earningConditions: 'Upon registered transfer', paymentDueConditions: 'At closing',
    effectiveStartIso: '2026-01-01T00:00:00.000Z', isSyntheticTestFixture: true,
  });
  assert.equal(commAgreement.lifecycleState, 'PROPOSED_TERMS');
  // Cannot calculate earned commission while still PROPOSED_TERMS
  await expectBrokerageError(
    () =>
      facade.calculateCommissionReference(orgAdmin, {
        commissionAgreementId: commAgreement.id, baseTransactionAmountRials: 100_000_000_000,
      }), 'VALIDATION_FAILED'
  );
  // Amend to ACCEPTED_AGREEMENT with 1.5% rate (preserving v1 in versionHistory)
  const amendedComm = await facade.amendCommissionAgreement(orgAdmin, {
    commissionAgreementId: commAgreement.id, newLifecycleState: 'ACCEPTED_AGREEMENT',
    ratePercentage: 1.5, reason: 'Client accepted 1.5% full-service package',
  });
  assert.equal(amendedComm.version, 2);
  assert.equal(amendedComm.versionHistory.length, 2);
  assert.equal(amendedComm.versionHistory[0].ratePercentage, 1.0);
  const calcComm = await facade.calculateCommissionReference(orgAdmin, {
    commissionAgreementId: commAgreement.id, baseTransactionAmountRials: 100_000_000_000,
  });
  assert.equal(calcComm.financialSeparation.calculatedAmountRials, 1_500_000_000);
  // Also test fixed-fee calculation
  const fixedComm = await facade.createCommissionAgreement(orgAdmin, {
    mandateId: mandate.id, organizationId: org.id,
    payerPartyId: clientActor.userId, beneficiaryIds: [org.id],
    compensationModel: 'FIXED_FEE', fixedAmountRials: 250_000_000,
    applicableTransactionType: 'CONSULTATION', calculationBasisDescription: 'Fixed advisory fee',
    earningConditions: 'Delivery of report', paymentDueConditions: 'Within 7 days',
    effectiveStartIso: '2026-01-01T00:00:00.000Z', isSyntheticTestFixture: true,
  });
  await facade.amendCommissionAgreement(orgAdmin, {
    commissionAgreementId: fixedComm.id, newLifecycleState: 'ACCEPTED_AGREEMENT',
    reason: 'Accepted fixed fee', });
  const calcFixed = await facade.calculateCommissionReference(orgAdmin, {
    commissionAgreementId: fixedComm.id, baseTransactionAmountRials: 0,
  });
  assert.equal(calcFixed.financialSeparation.calculatedAmountRials, 250_000_000);
  // 22. Commission allocation validation (reject < 100% residual; accept 100%)
  await expectBrokerageError(
    () =>
      facade.recordInternalCommissionAllocation(orgAdmin, {
        commissionAgreementId: commAgreement.id, allocations: [
          {
            beneficiaryId: org.id, beneficiaryRole: 'ORGANIZATION',
            allocationMethod: 'PERCENTAGE', percentageOrAmount: 50,
            calculationBasis: 'Gross commission', approvalStatus: 'APPROVED',
            supportingAgreementRef: 'split_policy_2026', },
          {
            beneficiaryId: agentProfile2.id, beneficiaryRole: 'LEAD_AGENT',
            allocationMethod: 'PERCENTAGE', percentageOrAmount: 40,
            calculationBasis: 'Gross commission', approvalStatus: 'APPROVED',
            supportingAgreementRef: 'split_policy_2026', },
        ], }),
    'INVALID_ALLOCATION_TOTAL'
  );
  const allocatedComm = await facade.recordInternalCommissionAllocation(orgAdmin, {
    commissionAgreementId: commAgreement.id, allocations: [
      {
        beneficiaryId: org.id, beneficiaryRole: 'ORGANIZATION',
        allocationMethod: 'PERCENTAGE', percentageOrAmount: 60,
        calculationBasis: 'Gross commission', approvalStatus: 'APPROVED',
        supportingAgreementRef: 'split_policy_2026', },
      {
        beneficiaryId: agentProfile2.id, beneficiaryRole: 'LEAD_AGENT',
        allocationMethod: 'PERCENTAGE', percentageOrAmount: 40,
        calculationBasis: 'Gross commission', approvalStatus: 'APPROVED',
        supportingAgreementRef: 'split_policy_2026', },
    ], });
  assert.equal(allocatedComm.allocations.length, 2);
  // 24. Payment confirmation validation
  await expectBrokerageError(
    () =>
      facade.recordCommissionPaymentStatus(orgAdmin, {
        commissionAgreementId: commAgreement.id, claimType: 'AUTHORITATIVELY_CONFIRMED',
        amountRials: 1_500_000_000, paymentReceiptRef: 'UNVERIFIED-AGENT-CLAIM',
      }), 'UNVERIFIED_PAYMENT_CONFIRMATION_REJECTED'
  );
  const paidComm = await facade.recordCommissionPaymentStatus(orgAdmin, {
    commissionAgreementId: commAgreement.id, claimType: 'AUTHORITATIVELY_CONFIRMED',
    amountRials: 1_500_000_000, paymentReceiptRef: 'PAY-VERIFIED-9001',
  });
  assert.equal(paidComm.lifecycleState, 'PAYMENT_CONFIRMED');
  // 25 & 26. Client engagement access controls & consent-aware communication references
  const engagement = await facade.createClientEngagement(orgAdmin, {
    id: 'beng_01', clientPartyId: 'client_buyer_555',
    organizationId: org.id, assignedProfessionalProfileId: agentProfile1.id,
    engagementCategory: 'BUYER_INQUIRY', originChannel: 'ORGANIC_SEARCH',
    communicationConsent: {
      consentGranted: true, allowedChannels: ['IN_APP_NOTIFICATION'],
      consentReferenceId: 'consent_ref_555', },
  });
  const unassignedAgentActor: BrokerageActorContext = {
    userId: 'user_agent_2', role: 'PROFESSIONAL_AGENT',
    organizationId: org.id, professionalProfileId: agentProfile2.id,
  };
  await expectBrokerageError(
    () => facade.retrieveClientEngagement(unassignedAgentActor, engagement.id), 'INSUFFICIENT_PRIVILEGE'
  );
  // SMS is not in allowedChannels -> rejected
  await expectBrokerageError(
    () =>
      facade.recordConsentAwareContactAttempt(orgAdmin, {
        engagementId: engagement.id, channel: 'SMS',
        summary: 'Unsolicited SMS attempt', }),
    'COMMUNICATION_CONSENT_REQUIRED'
  );
  const contactedEng = await facade.recordConsentAwareContactAttempt(orgAdmin, {
    engagementId: engagement.id, channel: 'IN_APP_NOTIFICATION',
    summary: 'Sent approved in-app viewing follow-up', });
  assert.equal(contactedEng.interactionNotes.length, 1);
  // 27. Supervisor authorization & Trust & Safety escalation
  await expectBrokerageError(
    () =>
      facade.recordSupervisionReview(unassignedAgentActor, {
        organizationId: org.id, targetType: 'MANDATE',
        targetId: mandate.id, reviewScopeSummary: 'Agent trying to act as supervisor',
        findingsSummary: 'None', reviewStatus: 'OPEN',
      }), 'INSUFFICIENT_PRIVILEGE'
  );
  const supReview = await facade.recordSupervisionReview(supervisorActor, {
    organizationId: org.id, targetType: 'MANDATE',
    targetId: mandate.id, reviewScopeSummary: 'Routine mandate compliance audit',
    findingsSummary: 'Suspected misrepresentation escalated to Trust & Safety',
    reviewStatus: 'ESCALATED_TO_TRUST_AND_SAFETY', escalateToTrustAndSafety: true,
  });
  assert.ok(supReview.escalatedTrustAndSafetyCaseRef?.startsWith('ts_case_'));
  // 28. Operational reporting calculation accuracy
  const report = await facade.retrieveOrganizationOperationalSummary(orgAdmin, org.id, {
    fromIso: '2026-01-01T00:00:00.000Z', toIso: '2026-12-31T00:00:00.000Z',
  });
  assert.equal(report.metrics.activeAgentCount.value, 2);
  assert.equal(report.metrics.activeBranchCount.value, 2);
  assert.equal(report.metrics.activeMandatesCount.value, 1);
  assert.equal(report.metrics.assignmentCompletionRatePercent.value, 100);
  assert.equal(report.metrics.confirmedCommissionTotalRials.value, 1_500_000_000);
  // 29. Privacy and restricted information access (cross-org denied; public profile strips privateContactEmail)
  await expectBrokerageError(
    () => facade.retrieveBrokerageOrganization(otherOrgAdmin, org.id), 'CROSS_ORGANIZATION_ACCESS_DENIED'
  );
  const publicProf = await facade.retrievePublicProfessionalProfile(agentProfile1.id);
  assert.equal('privateContactEmail' in publicProf, false);
  // 31. Concurrency conflicts
  await expectBrokerageError(
    () =>
      facade.updateOrganizationMetadata(orgAdmin, {
        organizationId: org.id, displayName: 'Stale Version Update',
        expectedVersion: 1, // current version is 3 after 2 branch additions
      }), 'CONCURRENCY_VERSION_CONFLICT'
  );
  // 32. Persistence failure handling
  store.triggerNextWriteFailure();
  await expectBrokerageError(
    () =>
      facade.updateOrganizationMetadata(orgAdmin, {
        organizationId: org.id, displayName: 'Should Fail On Disk/DB Write',
      }), 'PERSISTENCE_FAILURE'
  );
  const unchangedOrg = await facade.retrieveBrokerageOrganization(orgAdmin, org.id);
  assert.equal(unchangedOrg.displayName, 'Alborz Atlas Agency');
  // 33. Prevention of cross-module direct writes
  await expectBrokerageError(
    () => facade.adapters.externalWriteGuard.attemptDirectExternalModuleWrite('server/modules/bargains'),
    'INSUFFICIENT_PRIVILEGE'
  );
  console.log('All 33 Real Estate Brokerage & Agency Operations test scenarios passed!');
}
runTests().catch((err) => {
  console.error(err);
  process.exit(1);
});
