import assert from 'node:assert/strict';
import {
  ComplianceActorContext,
  ComplianceDomainError,
  createRegulatoryComplianceModule,
} from '../index';

const adminActor: ComplianceActorContext = {
  actorId: 'usr_comp_admin_1',
  actorRole: 'COMPLIANCE_ADMIN',
  organizationId: 'org_radar_1',
  tenantId: 'ten_radar_1',
  permissions: [
    'compliance.read',
    'compliance.jurisdiction.manage',
    'compliance.source.manage',
    'compliance.source.approve',
    'compliance.obligation.manage',
    'compliance.obligation.approve',
    'compliance.control.manage',
    'compliance.control.execute',
    'compliance.assessment.run',
    'compliance.assessment.approve',
    'compliance.evidence.submit',
    'compliance.evidence.verify',
    'compliance.exception.request',
    'compliance.exception.approve',
    'compliance.incident.manage',
    'compliance.remediation.manage',
    'compliance.report.export',
    'compliance.policy.manage',
  ],
  correlationId: 'corr_emp72_suite',
};

const approverActor: ComplianceActorContext = {
  ...adminActor,
  actorId: 'usr_comp_approver_2',
  actorRole: 'LEGAL_APPROVER',
};

const readOnlyActor: ComplianceActorContext = {
  actorId: 'usr_readonly_3',
  actorRole: 'AUDITOR',
  organizationId: 'org_radar_1',
  tenantId: 'ten_radar_1',
  permissions: ['compliance.read'],
};

async function runTests(): Promise<void> {
  const mod = createRegulatoryComplianceModule();

  // 1. Jurisdiction hierarchy & unresolved applicability fallback
  const country = mod.jurisdictionsAndObligations.registerJurisdiction(adminActor, {
    code: 'IR',
    name: 'Iran',
    level: 'COUNTRY',
    effectiveFrom: '2025-01-01T00:00:00.000Z',
  });
  const city = mod.jurisdictionsAndObligations.registerJurisdiction(adminActor, {
    code: 'IR-THR',
    name: 'Tehran',
    level: 'CITY',
    parentJurisdictionId: country.id,
    effectiveFrom: '2025-01-01T00:00:00.000Z',
  });
  const authority = mod.jurisdictionsAndObligations.registerRegulatoryAuthority(adminActor, {
    name: 'Tehran Real Estate Union & Regulatory Board',
    jurisdictionId: city.id,
    domainScope: ['BROKERAGE', 'LISTINGS', 'TRANSACTIONS'],
    officialPortalUrl: 'https://iranamlaak.ir',
  });

  const unknownApplicability = mod.jurisdictionsAndObligations.evaluateObligationApplicability(adminActor, {
    jurisdictionId: 'jur_non_existent',
    platformModule: 'real-estate-transactions',
  });
  assert.equal(unknownApplicability.status, 'UNRESOLVED_OR_REVIEW_REQUIRED');

  // 2. Reject unverified AI summaries / search snippets as authoritative legal sources
  assert.throws(
    () =>
      mod.jurisdictionsAndObligations.registerRegulatorySource(adminActor, {
        title: 'Blog Snippet',
        issuingAuthorityId: authority.id,
        jurisdictionId: city.id,
        sourceType: 'SEARCH_ENGINE_SNIPPET',
        externalReferenceCode: 'SNIP-1',
        officialCitation: 'Unverified web snippet',
        publicationDate: '2026-01-01T00:00:00.000Z',
        effectiveDate: '2026-01-01T00:00:00.000Z',
        versionLabel: 'v1',
        summaryNotes: 'Not authoritative',
      }),
    (err: unknown) => err instanceof ComplianceDomainError && err.code === 'DISALLOWED_AUTHORITATIVE_LEGAL_SOURCE',
  );

  // 3. Register official regulatory source & enforce approval before creating obligations
  const source = mod.jurisdictionsAndObligations.registerRegulatorySource(adminActor, {
    title: 'Real Estate Electronic Transaction Recordkeeping Directive 1405',
    issuingAuthorityId: authority.id,
    jurisdictionId: country.id,
    sourceType: 'REGULATORY_AUTHORITY_PUBLICATION',
    externalReferenceCode: 'DIR-1405-09',
    officialCitation: 'Official Gazette #22911',
    publicationDate: '2026-02-01T00:00:00.000Z',
    effectiveDate: '2026-03-01T00:00:00.000Z',
    versionLabel: '2026.1',
    summaryNotes: 'Mandates verified broker identity and 10-year transaction record retention.',
  });

  assert.throws(
    () =>
      mod.jurisdictionsAndObligations.createObligation(adminActor, {
        code: 'OBL-BROKER-KYC',
        title: 'Broker Identity & License Verification',
        description: 'Verify broker license before publishing listings.',
        category: 'BROKER_AND_AGENCY_LICENSING',
        regulatorySourceId: source.id,
        jurisdictionId: country.id,
        applicabilityCriteria: {
          jurisdictionIds: [country.id],
          businessActivities: ['BROKERAGE'],
          platformModules: ['brokerage-operations'],
          organizationTypes: ['AGENCY'],
          transactionCategories: ['SALE'],
          propertyCategories: ['RESIDENTIAL'],
          customerRelationships: ['AGENT'],
          dataProcessingActivities: ['KYC'],
        },
        mandatoryLevel: 'MANDATORY',
        severity: 'HIGH',
        responsibleOwnerRole: 'COMPLIANCE_OFFICER',
        reviewFrequencyDays: 90,
        evidenceRequirements: ['VERIFIED_LICENSE_CERTIFICATE'],
        effectiveStartDate: '2026-03-01T00:00:00.000Z',
      }),
    (err: unknown) => err instanceof ComplianceDomainError && err.code === 'UNAPPROVED_REGULATORY_SOURCE',
  );

  mod.jurisdictionsAndObligations.approveRegulatorySource(approverActor, source.id, 'Verified against Official Gazette');

  const obligation = mod.jurisdictionsAndObligations.createObligation(adminActor, {
    code: 'OBL-BROKER-KYC',
    title: 'Broker Identity & License Verification',
    description: 'Verify broker license before publishing listings.',
    category: 'BROKER_AND_AGENCY_LICENSING',
    regulatorySourceId: source.id,
    jurisdictionId: country.id,
    applicabilityCriteria: {
      jurisdictionIds: [country.id],
      businessActivities: ['BROKERAGE'],
      platformModules: ['brokerage-operations'],
      organizationTypes: ['AGENCY'],
      transactionCategories: ['SALE'],
      propertyCategories: ['RESIDENTIAL'],
      customerRelationships: ['AGENT'],
      dataProcessingActivities: ['KYC'],
    },
    mandatoryLevel: 'MANDATORY',
    severity: 'HIGH',
    responsibleOwnerRole: 'COMPLIANCE_OFFICER',
    reviewFrequencyDays: 90,
    evidenceRequirements: ['VERIFIED_LICENSE_CERTIFICATE'],
    effectiveStartDate: '2026-03-01T00:00:00.000Z',
  });
  mod.jurisdictionsAndObligations.transitionObligationStatus(approverActor, obligation.id, 'ACTIVE', 'Activated v1');

  // Applicability resolution across parent-child jurisdiction (country obligation applies to city)
  const appResult = mod.jurisdictionsAndObligations.evaluateObligationApplicability(adminActor, {
    jurisdictionId: city.id,
    businessActivity: 'BROKERAGE',
    platformModule: 'brokerage-operations',
  });
  assert.equal(appResult.status, 'APPLICABLE');
  assert.equal(appResult.applicableObligations.length, 1);

  // 4. Control registration blocks unverified functional binding from claiming IMPLEMENTED_AND_VERIFIED
  assert.throws(
    () =>
      mod.controlsAndAssessments.registerControl(adminActor, {
        code: 'CTRL-UNBOUND',
        title: 'Config-Only Control',
        description: 'No actual service binding',
        controlType: 'PREVENTIVE',
        ownerRole: 'SEC_OPS',
        targetModule: 'brokerage-operations',
        targetServiceFunctionality: 'none',
        executionFrequencyDays: 30,
        expectedEvidenceTypes: ['LICENSE_CHECK'],
        passFailReviewCriteria: 'Must verify license',
        failureEscalationPolicy: 'Block broker',
        implementationStatus: 'IMPLEMENTED_AND_VERIFIED',
        functionalBindingVerified: false,
      }),
    (err: unknown) => err instanceof ComplianceDomainError && err.code === 'UNVERIFIED_CONTROL_IMPLEMENTATION',
  );

  const control = mod.controlsAndAssessments.registerControl(adminActor, {
    code: 'CTRL-BROKER-LIC-01',
    title: 'Automated Broker License Gate',
    description: 'Verifies active broker license via Employee 46 brokerage registry',
    controlType: 'PREVENTIVE',
    ownerRole: 'COMPLIANCE_OPS',
    targetModule: 'brokerage-operations',
    targetServiceFunctionality: 'BrokerageService.verifyLicenseActive',
    executionFrequencyDays: 30,
    expectedEvidenceTypes: ['VERIFIED_LICENSE_CERTIFICATE'],
    passFailReviewCriteria: 'Active license status confirmed',
    failureEscalationPolicy: 'Escalate to compliance case',
    implementationStatus: 'IMPLEMENTED_AND_VERIFIED',
    functionalBindingVerified: true,
  });
  mod.controlsAndAssessments.mapObligationToControl(adminActor, obligation.id, control.id, 'PRIMARY');

  // 5. Assessment before evidence/execution is NON_COMPLIANT (never inferred from absence of incidents)
  const initialAssessment = mod.controlsAndAssessments.runComplianceAssessment(adminActor, {
    scopeType: 'BROKER',
    targetEntityId: 'brk_101',
    obligationId: obligation.id,
  });
  assert.equal(initialAssessment.determinationState, 'NON_COMPLIANT');

  // 6. Exception separation-of-duties & EXCEPTION_APPROVED (never reported as COMPLIANT)
  const exc = mod.controlsAndAssessments.requestException(adminActor, {
    affectedObligationId: obligation.id,
    affectedControlId: control.id,
    scopeEntityType: 'BROKER',
    scopeEntityId: 'brk_101',
    businessJustification: 'Renewal certificate awaiting notary stamp',
    riskAssessment: 'Low short-term risk with manual supervision',
    compensatingControls: ['Supervisor co-signature'],
    effectiveStartDate: '2026-01-01T00:00:00.000Z',
    expirationDate: '2027-06-01T00:00:00.000Z',
  });
  assert.throws(
    () => mod.controlsAndAssessments.decideException(adminActor, exc.id, 'APPROVED', 'Self-approval attempt'),
    (err: unknown) => err instanceof ComplianceDomainError && err.code === 'SEPARATION_OF_DUTIES_VIOLATION',
  );
  mod.controlsAndAssessments.decideException(approverActor, exc.id, 'APPROVED', 'Approved by independent legal reviewer');

  const excAssessment = mod.controlsAndAssessments.runComplianceAssessment(adminActor, {
    scopeType: 'BROKER',
    targetEntityId: 'brk_101',
    obligationId: obligation.id,
    evaluationTimestampIso: '2026-11-08T00:00:00.000Z',
  });
  assert.equal(excAssessment.determinationState, 'EXCEPTION_APPROVED');

  // 7. Submit & verify fresh evidence + passing control execution -> COMPLIANT
  const evidence = mod.controlsAndAssessments.submitEvidenceReference(adminActor, {
    evidenceType: 'VERIFIED_LICENSE_CERTIFICATE',
    sourceModule: 'employee-63-documents',
    sourceRecordId: 'doc_lic_101',
    obligationIds: [obligation.id],
    controlIds: [control.id],
    validFrom: '2026-01-01T00:00:00.000Z',
    validUntil: '2027-01-01T00:00:00.000Z',
    freshnessWindowDays: 365,
    immutableDigest: 'sha256:9f86d081884c7d659a2feaa0c55ad015',
    summary: 'Verified license certificate for brk_101',
  });
  mod.controlsAndAssessments.verifyEvidenceReference(approverActor, evidence.id, 'VERIFIED');
  mod.controlsAndAssessments.recordControlExecution(adminActor, {
    controlId: control.id,
    targetEntityType: 'BROKER',
    targetEntityId: 'brk_101',
    executionMode: 'AUTOMATED',
    outcome: 'PASSED',
    evidenceReferenceIds: [evidence.id],
    findingsSummary: 'License verified active',
  });

  const compliantAssessment = mod.controlsAndAssessments.runComplianceAssessment(adminActor, {
    scopeType: 'BROKER',
    targetEntityId: 'brk_101',
    obligationId: obligation.id,
    evaluationTimestampIso: '2026-11-08T00:00:00.000Z',
  });
  assert.equal(compliantAssessment.determinationState, 'COMPLIANT');

  // 8. Expired evidence invalidates compliance (never silently satisfies obligation)
  const expiredAssessment = mod.controlsAndAssessments.runComplianceAssessment(adminActor, {
    scopeType: 'BROKER',
    targetEntityId: 'brk_101',
    obligationId: obligation.id,
    evaluationTimestampIso: '2027-08-01T00:00:00.000Z',
  });
  assert.equal(expiredAssessment.determinationState, 'EXPIRED');

  // 9. Obligation version supersession preserves historical assessment version reference
  const newVer = mod.jurisdictionsAndObligations.createNewObligationVersion(adminActor, obligation.id, {
    title: 'Broker Identity, License & Biometric Verification v2',
    description: 'Updated requirement adding biometric check.',
    applicabilityCriteria: obligation.applicabilityCriteria,
    evidenceRequirements: ['VERIFIED_LICENSE_CERTIFICATE', 'BIOMETRIC_ATTESTATION'],
    effectiveStartDate: '2026-12-01T00:00:00.000Z',
    changeReason: 'Amended regulatory circular',
  });
  assert.equal(newVer.versionNumber, 2);
  assert.equal(compliantAssessment.obligationVersionNumber, 1);

  // 10. AI-extracted regulatory change candidate remains UNVERIFIED_CANDIDATE until human review
  const aiChange = mod.casesIncidentsAndRemediation.registerRegulatoryChange(adminActor, {
    regulatorySourceId: source.id,
    title: 'AI-parsed amendment candidate',
    changeSummary: 'Extracted via NLP parser',
    impactedJurisdictionIds: [country.id],
    impactedObligationIds: [obligation.id],
    impactedModules: ['brokerage-operations'],
    aiGeneratedCandidate: true,
    effectiveDate: '2027-01-01T00:00:00.000Z',
  });
  assert.equal(aiChange.candidateVerificationStatus, 'UNVERIFIED_CANDIDATE');
  assert.equal(aiChange.status, 'REVIEW_REQUIRED');

  // 11. Incident reporting never auto-declares reportable breach or auto-notifies regulator
  const incident = mod.casesIncidentsAndRemediation.reportComplianceIncident(adminActor, {
    title: 'Suspicious crawler scraping attempt',
    category: 'CRAWLER_VIOLATION',
    severity: 'HIGH',
    affectedModules: ['crawler-ingestion'],
    affectedJurisdictionIds: [country.id],
    linkedObligationIds: [obligation.id],
    containmentActions: ['Rate limit IP block'],
    evidenceReferenceIds: [evidence.id],
  });
  assert.equal(incident.legalReportabilityStatus, 'REQUIRES_HUMAN_LEGAL_DETERMINATION');
  assert.equal(incident.externalRegulatorNotificationSent, false);

  // 12. Corrective action requires validation evidence before COMPLETED
  const capa = mod.casesIncidentsAndRemediation.createCorrectiveAction(adminActor, {
    title: 'Update broker license renewal webhook',
    rootCauseCategory: 'STALE_EVIDENCE_SYNC',
    remediationPlan: 'Add daily expiration check',
    linkedObligationId: obligation.id,
    ownerActorId: adminActor.actorId,
    dueDate: '2026-12-31T00:00:00.000Z',
  });
  assert.throws(
    () => mod.casesIncidentsAndRemediation.transitionCorrectiveAction(adminActor, capa.id, 'COMPLETED', []),
    (err: unknown) => err instanceof ComplianceDomainError && err.code === 'REMEDIATION_VALIDATION_EVIDENCE_REQUIRED',
  );
  const completedCapa = mod.casesIncidentsAndRemediation.transitionCorrectiveAction(adminActor, capa.id, 'COMPLETED', [
    evidence.id,
  ]);
  assert.equal(completedCapa.status, 'COMPLETED');

  // 13. RBAC enforcement on unauthorized actor
  assert.throws(
    () =>
      mod.jurisdictionsAndObligations.transitionObligationStatus(
        readOnlyActor,
        obligation.id,
        'RETIRED',
        'Unauthorized attempt',
      ),
    (err: unknown) => err instanceof ComplianceDomainError && err.code === 'UNAUTHORIZED_COMPLIANCE_OPERATION',
  );

  console.log('PASSED: regulatoryCompliance.test.ts (13 comprehensive Employee 72 compliance governance test groups)');
}

runTests().catch((err) => {
  console.error(err);
  process.exit(1);
});
