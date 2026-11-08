import assert from 'node:assert/strict';
import { createPropertyPermitsModuleFacade, PermitActorContext, PermitError } from '../index';
const complianceAdmin: PermitActorContext = { actorId: 'admin_compliance_01', role: 'REGULATORY_COMPLIANCE_ADMIN' };
const caseOfficer: PermitActorContext = { actorId: 'officer_tehran_01', role: 'PERMIT_CASE_OFFICER' };
const ownerPartyId = 'owner_party_101';
const ownerActor: PermitActorContext = { actorId: ownerPartyId, role: 'PROPERTY_OWNER' };
const repPartyId = 'rep_architect_202';
const repActor: PermitActorContext = { actorId: repPartyId, role: 'AUTHORIZED_REPRESENTATIVE' };
const unrelatedActor: PermitActorContext = { actorId: 'stranger_999', role: 'APPLICANT' };
async function expectPermitError(fn: () => Promise<unknown>, expectedCode: string): Promise<PermitError> {
  try {
    await fn();
    assert.fail(`Expected PermitError(${expectedCode}) but operation succeeded`);
  } catch (err) {
    assert.ok(err instanceof PermitError, `Expected PermitError instance, got: ${String(err)}`);
    assert.equal(err.code, expectedCode);
    return err;
  }
}
async function runTests() {
  console.log('Running Property Permits & Regulatory Approvals Backend 30-scenario test suite...');
  const facade = createPropertyPermitsModuleFacade({
    useFirestore: false, adapters: {
      propertyAndOwnership: {
        async verifyApplicantStanding(params) {
          if (params.applicantPartyId === 'unauthorized_applicant') {
            return { propertyExists: true, hasVerifiedOrDocumentedStanding: false, standingSummary: 'No standing' };
          }
          return { propertyExists: true, hasVerifiedOrDocumentedStanding: true, standingSummary: 'Verified standing' };
        }, },
      paymentReference: {
        async verifyOfficialReceiptReference(params) {
          return {
            verifiedByAuthoritativeSource: params.externalPaymentReferenceNumber.startsWith('AUTH-RECEIPT-'),
            verificationNotes: 'Synthetic treasury verification check', };
        }, },
    }, });
  // 1. Authority registration and jurisdiction mapping
  const municipalAuth = await facade.registerAuthorityReference(complianceAdmin, {
    id: 'auth_teh_d2_muni',
    name: 'Tehran District 2 Municipal Urban Planning Directorate (Synthetic Test Fixture)',
    authorityCategory: 'MUNICIPAL_AUTHORITY',
    jurisdictionScope: { citySlug: 'tehran', districtCodes: ['2'], neighborhoodIdsOrSlugs: ['1', 'پونک'] },
    authorizedPermitCategories: [
      'NEW_CONSTRUCTION_PERMIT', 'STRUCTURAL_RENOVATION_PERMIT',
      'RECONSTRUCTION_PERMIT', 'ZONING_COMPLIANCE_APPROVAL',
      'COMPLETION_CERTIFICATE', 'OCCUPANCY_PERMIT',
    ], isSyntheticTestFixture: true,
  });
  assert.equal(municipalAuth.jurisdictionScope.citySlug, 'tehran');
  // 2. Rejecting authority permit category mismatch & jurisdiction mismatch
  await expectPermitError(
    () =>
      facade.createPermitApplication(ownerActor, {
        permitCategory: 'HERITAGE_ALTERATION_APPROVAL', issuingAuthorityId: municipalAuth.id,
        subjectRef: { propertyId: 'prop_teh_101', citySlug: 'tehran', districtCode: '2', neighborhoodIdOrSlug: 'پونک' },
        applicantRelationship: 'PROPERTY_OWNER',
        requestedScopeSummary: 'Heritage facade alteration not empowered on municipal authority',
        isSyntheticTestFixture: true, }),
    'AUTHORITY_NOT_EMPOWERED_FOR_CATEGORY'
  );
  await expectPermitError(
    () =>
      facade.createPermitApplication(ownerActor, {
        permitCategory: 'NEW_CONSTRUCTION_PERMIT', issuingAuthorityId: municipalAuth.id,
        subjectRef: { propertyId: 'prop_karaj_101', citySlug: 'karaj' }, applicantRelationship: 'PROPERTY_OWNER',
        requestedScopeSummary: 'Construction in Karaj sent to Tehran District 2 authority',
        isSyntheticTestFixture: true, }),
    'JURISDICTION_MISMATCH'
  );
  // 3. Permit application creation in DRAFT state
  const draftApp = await facade.createPermitApplication(ownerActor, {
    id: 'papp_construct_01', permitCategory: 'NEW_CONSTRUCTION_PERMIT',
    issuingAuthorityId: municipalAuth.id, subjectRef: {
      propertyId: 'prop_teh_101', parcelId: 'parcel_teh_101',
      developmentProjectId: 'proj_teh_101', citySlug: 'tehran',
      districtCode: '2', neighborhoodIdOrSlug: 'پونک',
    }, applicantPartyId: ownerPartyId,
    applicantRelationship: 'PROPERTY_OWNER', representativePartyId: repPartyId,
    requestedScopeSummary: '5-story residential building with 10 units', requirementChecklist: [
      { requirementId: 'req_arch_plan', title: 'Architectural Blueprint Set', mandatory: true, submittedEvidenceIds: [] },
      { requirementId: 'req_soil_report', title: 'Geotechnical Soil Test Report', mandatory: true, submittedEvidenceIds: [] },
    ], isSyntheticTestFixture: true,
  });
  assert.equal(draftApp.workflowStatus, 'DRAFT');
  assert.equal(draftApp.isIssuedPermitRecord, false);
  assert.equal(draftApp.requirementChecklist[0].status, 'REQUIRED_MISSING');
  // 4. Requirement checklist validation and missing-document tracking
  await expectPermitError(
    () => facade.updateDraftApplication(ownerActor, { applicationId: draftApp.id, markReadyForSubmission: true }),
    'VALIDATION_FAILED'
  );
  // 5. Rejecting automatic approval when all checklist documents are uploaded
  const readyApp = await facade.updateDraftApplication(repActor, {
    applicationId: draftApp.id, submittedChecklistRequirementIds: [
      { requirementId: 'req_arch_plan', submittedEvidenceIds: ['ev_arch_01'] },
      { requirementId: 'req_soil_report', submittedEvidenceIds: ['ev_soil_01'] }, ],
    markReadyForSubmission: true, });
  assert.equal(readyApp.workflowStatus, 'READY_FOR_SUBMISSION');
  assert.notEqual(readyApp.workflowStatus, 'APPROVED');
  assert.equal(readyApp.requirementChecklist[0].status, 'SUBMITTED_UNREVIEWED');
  // 6. Recording manual application submission vs confirmed authority acknowledgment (+ 28. idempotency)
  const submittedApp = await facade.recordApplicationSubmission(ownerActor, {
    applicationId: readyApp.id, submissionChannel: 'MANUALLY_REPORTED_BY_APPLICANT',
    idempotencyKey: 'idem_submit_papp_construct_01', });
  assert.equal(submittedApp.workflowStatus, 'SUBMITTED');
  assert.equal(submittedApp.submissionChannel, 'MANUALLY_REPORTED_BY_APPLICANT');
  const duplicateIdempotentCall = await facade.recordApplicationSubmission(ownerActor, {
    applicationId: readyApp.id, submissionChannel: 'MANUALLY_REPORTED_BY_APPLICANT',
    idempotencyKey: 'idem_submit_papp_construct_01', });
  assert.equal(duplicateIdempotentCall.id, submittedApp.id);
  // 7. Preventing duplicate active applications for the same scope
  const secondDraft = await facade.createPermitApplication(ownerActor, {
    permitCategory: 'NEW_CONSTRUCTION_PERMIT', issuingAuthorityId: municipalAuth.id,
    subjectRef: { propertyId: 'prop_teh_101', citySlug: 'tehran', districtCode: '2', neighborhoodIdOrSlug: 'پونک' },
    applicantRelationship: 'PROPERTY_OWNER',
    requestedScopeSummary: 'Duplicate construction application on same property',
    isSyntheticTestFixture: true, });
  const secondReady = await facade.updateDraftApplication(ownerActor, {
    applicationId: secondDraft.id, markReadyForSubmission: true,
  });
  await expectPermitError(
    () =>
      facade.recordApplicationSubmission(ownerActor, {
        applicationId: secondReady.id, submissionChannel: 'MANUALLY_REPORTED_BY_APPLICANT',
      }), 'DUPLICATE_ACTIVE_APPLICATION'
  );
  // Applicant cannot self-acknowledge
  await expectPermitError(
    () =>
      facade.recordAuthorityAcknowledgment(ownerActor, {
        applicationId: submittedApp.id, externalApplicationReferenceNumber: 'TEH-D2-1405-001',
      }), 'APPLICANT_CANNOT_SELF_APPROVE'
  );
  const ackApp = await facade.recordAuthorityAcknowledgment(caseOfficer, {
    applicationId: submittedApp.id, externalApplicationReferenceNumber: 'TEH-D2-1405-001',
    moveToUnderReview: true, });
  assert.equal(ackApp.workflowStatus, 'UNDER_REVIEW');
  // 8. Additional-information request and applicant response workflow
  const infoReqApp = await facade.recordAdditionalInformationRequest(caseOfficer, {
    applicationId: ackApp.id, authorityReferenceNumber: 'TEH-D2-RFI-09',
    requestSummary: 'Provide revised seismic shear wall calculation sheet.', });
  assert.equal(infoReqApp.workflowStatus, 'ADDITIONAL_INFORMATION_REQUIRED');
  const resubmittedApp = await facade.recordApplicantResponse(repActor, {
    applicationId: infoReqApp.id, exchangeId: infoReqApp.additionalInfoExchanges[0].id,
    applicantResponseSummary: 'Uploaded structural engineer stamped calculation sheet.',
    responseEvidenceIds: ['ev_seismic_02'], });
  assert.equal(resubmittedApp.workflowStatus, 'RESUBMITTED');
  // 10. Rejecting transition to APPROVED without decision reference and evidence
  await expectPermitError(
    () =>
      facade.recordOfficialDecision(caseOfficer, {
        applicationId: resubmittedApp.id, decisionOutcome: 'APPROVED',
        officialDecisionReferenceNumber: 'DEC-1405-777', decisionDateIso: '2026-05-01T10:00:00.000Z',
        decisionSummary: 'Approved without evidence array', supportingEvidenceIds: [],
      }), 'MISSING_OFFICIAL_DECISION_REFERENCE'
  );
  // 9. Recording official approval decision with decision reference and evidence
  const approvedApp = await facade.recordOfficialDecision(caseOfficer, {
    applicationId: resubmittedApp.id, decisionOutcome: 'APPROVED',
    officialDecisionReferenceNumber: 'DEC-1405-777', decisionDateIso: '2026-05-01T10:00:00.000Z',
    decisionSummary: 'Approved 5-story residential construction permit.',
    supportingEvidenceIds: ['ev_decision_pdf_01'], });
  assert.equal(approvedApp.workflowStatus, 'APPROVED');
  // 11. Creating an issued permit record linked to an approved application (+ 28. idempotency)
  const issuedPermit = await facade.registerIssuedPermit(caseOfficer, {
    id: 'prm_construct_01', officialPermitNumber: 'PRM-TEH-D2-1405-888',
    permitCategory: 'NEW_CONSTRUCTION_PERMIT', issuingAuthorityId: municipalAuth.id,
    originatingApplicationId: approvedApp.id, subjectRef: approvedApp.subjectRef,
    holderPartyIds: [ownerPartyId],
    approvedScopeSummary: '5-story residential building, total built area 1,850 sqm',
    issueDateIso: '2026-05-02T08:00:00.000Z', effectiveStartDateIso: '2026-05-05T00:00:00.000Z',
    expirationDateIso: '2028-05-05T00:00:00.000Z', officialDecisionStatus: 'APPROVED',
    sourceVerificationStatus: 'INDEPENDENTLY_VERIFIED_OFFICIAL_SOURCE', supportingEvidence: [
      {
        evidenceId: 'ev_permit_deed_01', documentType: 'MUNICIPAL_CONSTRUCTION_PERMIT',
        title: 'Official Construction Permit PDF', verificationStatus: 'INDEPENDENTLY_VERIFIED_OFFICIAL_SOURCE',
        uploadedByActorId: caseOfficer.actorId, uploadedAtIso: '2026-05-02T08:00:00.000Z',
      }, ],
    idempotencyKey: 'idem_reg_permit_01', isSyntheticTestFixture: true,
  });
  assert.equal(issuedPermit.isIssuedPermitRecord, true);
  assert.equal(issuedPermit.multiDimensionalStatus.permitValidityStatus, 'VALID_VERIFIED_ACTIVE');
  // 12. Keeping application records and issued permit records distinct
  const reloadedApp = await facade.retrievePermitApplication(ownerActor, approvedApp.id);
  assert.equal(reloadedApp.isIssuedPermitRecord, false);
  assert.equal(reloadedApp.resultingPermitId, issuedPermit.id);
  assert.notEqual(reloadedApp.id, issuedPermit.id);
  // 13. Permit validity evaluation before effective start date (`NOT_YET_EFFECTIVE`)
  const preStartEval = await facade.evaluatePermitValidity(ownerActor, issuedPermit.id, '2026-05-03T00:00:00.000Z');
  assert.equal(preStartEval.multiDimensionalStatus.permitValidityStatus, 'NOT_YET_EFFECTIVE');
  assert.equal(preStartEval.isEstablishableAsOfficialValidPermit, false);
  // 14. Permit validity evaluation during active validity window
  const activeEval = await facade.evaluatePermitValidity(ownerActor, issuedPermit.id, '2026-08-01T00:00:00.000Z');
  assert.equal(activeEval.multiDimensionalStatus.permitValidityStatus, 'VALID_VERIFIED_ACTIVE');
  assert.equal(activeEval.isEstablishableAsOfficialValidPermit, true);
  // 15. Permit validity evaluation after expiration date (`EXPIRED`)
  const expiredEval = await facade.evaluatePermitValidity(ownerActor, issuedPermit.id, '2029-01-01T00:00:00.000Z');
  assert.equal(expiredEval.multiDimensionalStatus.permitValidityStatus, 'EXPIRED');
  assert.equal(expiredEval.isEstablishableAsOfficialValidPermit, false);
  // Unverified PDF scan with future expiration date NEVER yields VALID_VERIFIED_ACTIVE
  const unverifiedPermit = await facade.registerIssuedPermit(ownerActor, {
    officialPermitNumber: 'CLAIM-ONLY-999', permitCategory: 'STRUCTURAL_RENOVATION_PERMIT',
    issuingAuthorityId: municipalAuth.id, subjectRef: approvedApp.subjectRef,
    holderPartyIds: [ownerPartyId],
    approvedScopeSummary: 'Owner uploaded unverified PDF scan claiming approval',
    issueDateIso: '2026-05-01T00:00:00.000Z', effectiveStartDateIso: '2026-05-01T00:00:00.000Z',
    expirationDateIso: '2030-05-01T00:00:00.000Z', officialDecisionStatus: 'APPROVED',
    sourceVerificationStatus: 'DOCUMENTED_UNVERIFIED', supportingEvidence: [
      {
        evidenceId: 'ev_unverified_scan', documentType: 'PDF_SCAN',
        title: 'Unverified PDF', verificationStatus: 'DOCUMENTED_UNVERIFIED',
        uploadedByActorId: ownerPartyId, uploadedAtIso: '2026-05-01T00:00:00.000Z',
      }, ],
    isSyntheticTestFixture: true, });
  const unverifiedEval = await facade.evaluatePermitValidity(ownerActor, unverifiedPermit.id, '2026-08-01T00:00:00.000Z');
  assert.equal(unverifiedEval.multiDimensionalStatus.permitValidityStatus, 'DOCUMENTED_BUT_UNVERIFIED');
  assert.equal(unverifiedEval.isEstablishableAsOfficialValidPermit, false);
  // 16. Registering permit conditions and tracking pre-commencement / pre-occupancy obligations
  const preOccCondition = await facade.registerPermitCondition(caseOfficer, {
    id: 'pcond_fire_exit_01', permitId: issuedPermit.id,
    conditionCode: 'COND-FIRE-STAIR-PRESSURIZATION',
    description: 'Install positive pressure ventilation in stairwell before occupancy.',
    timingCategory: 'PRE_OCCUPANCY', responsiblePartyId: ownerPartyId,
    dueDateIso: '2027-12-01T00:00:00.000Z', fulfillmentStatus: 'STATED_IN_OFFICIAL_DECISION_PENDING',
    blocksCompletionOrOccupancy: true, isSyntheticTestFixture: true,
  });
  assert.equal(preOccCondition.blocksCompletionOrOccupancy, true);
  // 17. Distinguishing holder-reported condition fulfillment from verified fulfillment
  const holderReportedCond = await facade.recordConditionFulfillment(ownerActor, {
    conditionId: preOccCondition.id, fulfillmentStatus: 'REPORTED_FULFILLED_BY_HOLDER',
    supportingEvidenceIds: ['ev_contractor_invoice_01'], });
  assert.equal(holderReportedCond.fulfillmentStatus, 'REPORTED_FULFILLED_BY_HOLDER');
  await expectPermitError(
    () =>
      facade.recordConditionFulfillment(ownerActor, {
        conditionId: preOccCondition.id, fulfillmentStatus: 'FULFILLMENT_INDEPENDENTLY_VERIFIED',
      }), 'INSUFFICIENT_ROLE_PRIVILEGE'
  );
  const verifiedCond = await facade.recordConditionFulfillment(caseOfficer, {
    conditionId: preOccCondition.id, fulfillmentStatus: 'FULFILLMENT_INDEPENDENTLY_VERIFIED',
    supportingEvidenceIds: ['ev_fire_authority_cert_01'],
    verificationNotes: 'Verified against Fire & Safety Authority clearance certificate.', });
  assert.equal(verifiedCond.fulfillmentStatus, 'FULFILLMENT_INDEPENDENTLY_VERIFIED');
  // 18. Permit amendment request without mutating original approved permit
  const amendReq = await facade.submitAmendmentOrRenewalRequest(ownerActor, {
    id: 'pamend_ext_01', targetPermitId: issuedPermit.id,
    requestType: 'EXTENSION',
    requestedChangesSummary: 'Extend construction permit validity by 1 year to 2029-05-05',
    requestedNewExpirationDateIso: '2029-05-05T00:00:00.000Z',
    supportingEvidenceIds: ['ev_ext_request_letter'], });
  assert.equal(amendReq.requestStatus, 'REQUESTED_PENDING_AUTHORITY');
  const permitBeforeAmendDecision = await facade.retrievePermitRecord(ownerActor, issuedPermit.id, '2026-08-01T00:00:00.000Z');
  assert.equal(permitBeforeAmendDecision.expirationDateIso, '2028-05-05T00:00:00.000Z');
  assert.equal(permitBeforeAmendDecision.version, 1);
  // 19. Recording approved amendment or renewal while preserving prior version history
  const { amendmentRecord, updatedPermit } = await facade.recordAmendmentOrRenewalDecision(caseOfficer, {
    requestId: amendReq.id, decisionOutcome: 'APPROVED_BY_AUTHORITY',
    authorityDecisionReference: 'EXT-DEC-1406-112', supportingEvidenceIds: ['ev_ext_approval_pdf'],
  });
  assert.equal(amendmentRecord.requestStatus, 'APPROVED_BY_AUTHORITY');
  assert.equal(updatedPermit.expirationDateIso, '2029-05-05T00:00:00.000Z');
  assert.equal(updatedPermit.version, 2);
  assert.equal(updatedPermit.statusHistory.length, 2);
  // 21. Registering inspection records and distinguishing applicant-reported vs official outcomes
  const inspection = await facade.registerOfficialInspection(ownerActor, {
    id: 'pinsp_foundation_01', permitId: issuedPermit.id,
    inspectionStage: 'FOUNDATION_INSPECTION', scheduledDateIso: '2026-09-10T09:00:00.000Z',
    inspectingAuthorityId: municipalAuth.id, verificationStatus: 'REPORTED_COMPLETED_BY_APPLICANT',
    findingsSummary: 'Applicant reports foundation rebar inspection completed.',
    isSyntheticTestFixture: true, });
  assert.equal(inspection.verificationStatus, 'REPORTED_COMPLETED_BY_APPLICANT');
  // 22. Rejecting official inspection pass without authority reference and evidence
  await expectPermitError(
    () =>
      facade.recordInspectionOutcome(caseOfficer, {
        inspectionId: inspection.id, verificationStatus: 'OFFICIAL_RESULT_PASSED',
        findingsSummary: 'Attempted pass without official reference', followUpRequired: false,
      }), 'UNVERIFIED_INSPECTION_PASS_REJECTED'
  );
  const passedInspection = await facade.recordInspectionOutcome(caseOfficer, {
    inspectionId: inspection.id, verificationStatus: 'OFFICIAL_RESULT_PASSED',
    officialInspectionReference: 'INSP-TEH-D2-901',
    findingsSummary: 'Foundation rebar and concrete grade verified compliant.', followUpRequired: false,
    supportingEvidenceIds: ['ev_insp_report_901'], });
  assert.equal(passedInspection.verificationStatus, 'OFFICIAL_RESULT_PASSED');
  // 23. Recording fee assessments and distinguishing estimated vs officially assessed fees
  const estimatedFee = await facade.registerFeeAssessment(ownerActor, {
    permitId: issuedPermit.id, feeType: 'Estimated Municipal Infrastructure Levy',
    amountRials: 1_500_000_000, issuingAuthorityId: municipalAuth.id,
    feeStatus: 'ESTIMATED_FEE', isSyntheticTestFixture: true,
  });
  assert.equal(estimatedFee.feeStatus, 'ESTIMATED_FEE');
  assert.equal(estimatedFee.processedByPlatform, false);
  const officialFee = await facade.registerFeeAssessment(caseOfficer, {
    id: 'pfee_official_01', permitId: issuedPermit.id,
    feeType: 'Official Construction Density & Tolls Assessment', amountRials: 1_620_000_000,
    issuingAuthorityId: municipalAuth.id, feeStatus: 'OFFICIALLY_ASSESSED_OUTSTANDING',
    officialAssessmentReference: 'ASSESS-1405-550', dueDateIso: '2026-06-15T00:00:00.000Z',
    isSyntheticTestFixture: true, });
  assert.equal(officialFee.feeStatus, 'OFFICIALLY_ASSESSED_OUTSTANDING');
  // 24. Rejecting unverified payment claims as confirmed payment
  const applicantReportedFee = await facade.recordFeePaymentReference(ownerActor, {
    feeId: officialFee.id, paymentClaimType: 'REPORTED_PAID_BY_APPLICANT_UNVERIFIED',
    externalPaymentReferenceNumber: 'MANUAL-CLAIM-123', });
  assert.equal(applicantReportedFee.feeStatus, 'REPORTED_PAID_BY_APPLICANT_UNVERIFIED');
  await expectPermitError(
    () =>
      facade.recordFeePaymentReference(caseOfficer, {
        feeId: officialFee.id, paymentClaimType: 'CONFIRMED_PAID_BY_AUTHORITATIVE_SOURCE',
        externalPaymentReferenceNumber: 'UNVERIFIED-REF-000', receiptEvidenceIds: [],
      }), 'UNVERIFIED_PAYMENT_CLAIM_REJECTED'
  );
  const confirmedFee = await facade.recordFeePaymentReference(caseOfficer, {
    feeId: officialFee.id, paymentClaimType: 'CONFIRMED_PAID_BY_AUTHORITATIVE_SOURCE',
    externalPaymentReferenceNumber: 'AUTH-RECEIPT-8844', receiptEvidenceIds: ['ev_treasury_receipt_8844'],
  });
  assert.equal(confirmedFee.feeStatus, 'CONFIRMED_PAID_BY_AUTHORITATIVE_SOURCE');
  // 25. Upcoming and overdue deadline detection
  await facade.registerDeadline(caseOfficer, {
    id: 'pdead_official_01', targetType: 'PERMIT',
    targetId: issuedPermit.id, propertyId: 'prop_teh_101',
    deadlineClassification: 'OFFICIAL_AUTHORITY_DEADLINE',
    title: 'Submit Foundation Concrete Lab Results within 30 Days', dueDateIso: '2026-07-01T00:00:00.000Z',
    recipientPartyId: ownerPartyId, });
  await facade.registerDeadline(ownerActor, {
    id: 'pdead_reminder_02', targetType: 'CONDITION',
    targetId: preOccCondition.id, propertyId: 'prop_teh_101',
    deadlineClassification: 'INTERNAL_CONFIGURED_REMINDER',
    title: 'Internal Reminder: Order stairwell pressurization fan', dueDateIso: '2027-06-01T00:00:00.000Z',
    recipientPartyId: ownerPartyId, });
  const deadlinesAsOfAug2026 = await facade.retrieveUpcomingAndOverdueDeadlines(
    ownerActor, 'prop_teh_101',
    '2026-08-01T00:00:00.000Z'
  );
  assert.equal(deadlinesAsOfAug2026.overdue.length, 1);
  assert.equal(deadlinesAsOfAug2026.overdue[0].id, 'pdead_official_01');
  assert.equal(deadlinesAsOfAug2026.overdue[0].dueDateIso, '2026-07-01T00:00:00.000Z');
  assert.equal(deadlinesAsOfAug2026.upcomingAndDueSoon.length, 1);
  // 26. Property and development-project permit profile aggregation
  const profile = await facade.retrievePropertyAndProjectPermitProfile(
    ownerActor, 'prop_teh_101',
    '2026-08-01T00:00:00.000Z'
  );
  assert.equal(profile.propertyId, 'prop_teh_101');
  assert.ok(profile.applications.length >= 1);
  assert.ok(profile.permits.length >= 1);
  assert.equal(profile.conditionsByPermitId[issuedPermit.id].length, 1);
  assert.equal(profile.inspections.length, 1);
  assert.equal(profile.fees.length, 2);
  // 27. Authorization failures for unauthorized applicants, representatives, and viewers
  await expectPermitError(
    () =>
      facade.createPermitApplication(unrelatedActor, {
        permitCategory: 'NEW_CONSTRUCTION_PERMIT', issuingAuthorityId: municipalAuth.id,
        subjectRef: approvedApp.subjectRef, applicantPartyId: 'unauthorized_applicant',
        applicantRelationship: 'PROPERTY_OWNER',
        requestedScopeSummary: 'Unauthorized person attempting to apply as owner', isSyntheticTestFixture: true,
      }), 'UNAUTHORIZED_APPLICANT_RELATIONSHIP'
  );
  await expectPermitError(() => facade.retrievePermitApplication(unrelatedActor, approvedApp.id), 'INSUFFICIENT_ROLE_PRIVILEGE');
  await expectPermitError(() => facade.retrievePermitRecord(unrelatedActor, issuedPermit.id), 'INSUFFICIENT_ROLE_PRIVILEGE');
  // 20. Permit suspension and revocation workflows with status history
  const suspendedPermit = await facade.recordSuspensionOrRevocation(caseOfficer, {
    permitId: issuedPermit.id, actionType: 'SUSPENDED',
    authorityDecisionReference: 'SUSP-TEH-D2-099', reasonSummary: 'Temporary crane safety violation order.',
    supportingEvidenceIds: ['ev_suspension_notice_099'], });
  assert.equal(suspendedPermit.officialDecisionStatus, 'SUSPENDED');
  assert.equal(suspendedPermit.multiDimensionalStatus.permitValidityStatus, 'INVALID_SUSPENDED_OR_REVOKED');
  const revokedPermit = await facade.recordSuspensionOrRevocation(caseOfficer, {
    permitId: issuedPermit.id, actionType: 'REVOKED',
    authorityDecisionReference: 'REV-TEH-D2-100',
    reasonSummary: 'Revoked by Article 100 Municipal Commission ruling.',
    supportingEvidenceIds: ['ev_revocation_ruling_100'], });
  assert.equal(revokedPermit.officialDecisionStatus, 'REVOKED');
  assert.equal(revokedPermit.multiDimensionalStatus.permitValidityStatus, 'INVALID_SUSPENDED_OR_REVOKED');
  assert.equal(revokedPermit.statusHistory.length, 4);
  // 29. Safe handling of unknown or disputed official status
  const disputedPermit = await facade.registerIssuedPermit(caseOfficer, {
    officialPermitNumber: 'PRM-DISPUTED-404', permitCategory: 'ZONING_COMPLIANCE_APPROVAL',
    issuingAuthorityId: municipalAuth.id, subjectRef: approvedApp.subjectRef,
    holderPartyIds: [ownerPartyId],
    approvedScopeSummary: 'Zoning approval subject to administrative court challenge',
    issueDateIso: '2026-03-01T00:00:00.000Z', effectiveStartDateIso: '2026-03-01T00:00:00.000Z',
    expirationDateIso: '2028-03-01T00:00:00.000Z', officialDecisionStatus: 'APPROVED',
    sourceVerificationStatus: 'DISPUTED', supportingEvidence: [
      {
        evidenceId: 'ev_disputed_01', documentType: 'COURT_CHALLENGE_NOTICE',
        title: 'Administrative Court Stay Notice', verificationStatus: 'DISPUTED',
        uploadedByActorId: caseOfficer.actorId, uploadedAtIso: '2026-04-01T00:00:00.000Z',
      }, ],
    isSyntheticTestFixture: true, });
  const disputedEval = await facade.evaluatePermitValidity(ownerActor, disputedPermit.id, '2026-08-01T00:00:00.000Z');
  assert.equal(disputedEval.multiDimensionalStatus.permitValidityStatus, 'DISPUTED');
  assert.equal(disputedEval.isEstablishableAsOfficialValidPermit, false);
  // 30. Audit event generation for sensitive permit and decision mutations
  const appAuditEvents = await facade.store.listAuditEventsByTarget(approvedApp.id, 50);
  assert.ok(appAuditEvents.length >= 4);
  const permitAuditEvents = await facade.store.listAuditEventsByTarget(issuedPermit.id, 50);
  assert.ok(permitAuditEvents.length >= 1);
  console.log('All 30 Property Permits & Regulatory Approvals test scenarios passed!');
}
runTests().catch((err) => {
  console.error(err);
  process.exit(1);
});
