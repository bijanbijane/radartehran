/**
 * @file server/modules/property-due-diligence/__tests__/propertyDueDiligence.test.ts
 * @description Automated Test Suite for the Property Due Diligence & Inspection Intelligence Backend Module.
 */

import assert from 'node:assert/strict';
import {
  createPropertyDueDiligenceModule,
  DurableDueDiligenceStore,
  BufferedDueDiligenceEventSink,
  DueDiligenceError,
} from '../index';

async function runPropertyDueDiligenceTests() {
  console.log('[TEST] Running Property Due Diligence & Inspection Intelligence Test Suite...');
  let suitesPassed = 0;

  function buildHarness() {
    const store = new DurableDueDiligenceStore();
    const eventSink = new BufferedDueDiligenceEventSink();
    const facade = createPropertyDueDiligenceModule({ store, eventSink });
    return { facade, store, eventSink };
  }

  // 1. Assessment Lifecycle, State Transitions, & Completion Requirements
  {
    const { facade } = buildHarness();
    const asmt = await facade.assessmentService.createAssessment('requester_1', {
      assessmentType: 'purchase_due_diligence',
      propertyReference: 'prop_tehran_1001',
      appointmentReferences: ['completed_appt_55'],
      requestingOrganizationId: 'org_alpha',
      includedWorkstreams: ['structural_review', 'electrical_review', 'legal_document_checklist'],
      objectives: ['Evaluate structural integrity and review ownership document copies prior to purchase offer'],
      idempotencyKey: 'idem_create_1',
    });

    assert.equal(asmt.status, 'requested');
    assert.equal(asmt.scope.version, 1);

    // Idempotent replay returns identical assessment ID
    const replay = await facade.assessmentService.createAssessment('requester_1', {
      assessmentType: 'purchase_due_diligence',
      propertyReference: 'prop_tehran_1001',
      includedWorkstreams: ['structural_review'],
      objectives: ['Different payload'],
      idempotencyKey: 'idem_create_1',
    });
    assert.equal(replay.id, asmt.id);

    // Invalid state transition (requested -> completed directly) must fail
    await assert.rejects(
      () => facade.assessmentService.transitionAssessmentStatus('requester_1', asmt.id, 'completed'),
      (err: unknown) => err instanceof DueDiligenceError && err.code === 'INVALID_STATE_TRANSITION',
    );

    // Update scope preserves version increment
    const updatedScopeAsmt = await facade.assessmentService.updateAssessmentScope('requester_1', asmt.id, {
      includedWorkstreams: ['structural_review', 'electrical_review'],
      objectives: ['Updated scope before inspection start'],
    });
    assert.equal(updatedScopeAsmt.scope.version, 2);

    // Assign coordinator & specialists
    await facade.assessmentService.assignReviewer('requester_1', asmt.id, 'coord_1', 'assessment_coordinator', 'verified_prov_10');
    await facade.assessmentService.assignReviewer('coord_1', asmt.id, 'struct_eng_1', 'structural_specialist', 'verified_prov_20');
    const assignedAsmt = await facade.assessmentService.assignReviewer('coord_1', asmt.id, 'unverified_elec_1', 'electrical_specialist', 'self_declared_prov_99');

    assert.equal(assignedAsmt.status, 'assigned');
    const structRev = assignedAsmt.assignedReviewers.find((r) => r.reviewerUid === 'struct_eng_1');
    const elecRev = assignedAsmt.assignedReviewers.find((r) => r.reviewerUid === 'unverified_elec_1');
    assert.equal(structRev?.qualificationVerifiedByRegistry, true);
    assert.equal(elecRev?.qualificationVerifiedByRegistry, false);

    // Create mandatory workstreams
    const ws1 = await facade.assessmentService.createWorkstream('coord_1', {
      assessmentId: asmt.id,
      workstreamType: 'structural_review',
      description: 'Inspect columns, beams, and visible settlement',
      assignedReviewerUid: 'struct_eng_1',
      assignedReviewerRole: 'structural_specialist',
      isMandatory: true,
    });
    const ws2 = await facade.assessmentService.createWorkstream('coord_1', {
      assessmentId: asmt.id,
      workstreamType: 'electrical_review',
      description: 'Inspect main distribution panel and grounding',
      assignedReviewerUid: 'unverified_elec_1',
      assignedReviewerRole: 'electrical_specialist',
      isMandatory: true,
    });

    await facade.assessmentService.transitionAssessmentStatus('coord_1', asmt.id, 'in_progress');
    await facade.assessmentService.transitionAssessmentStatus('coord_1', asmt.id, 'under_review');

    // Cannot complete assessment while mandatory workstreams remain incomplete
    await assert.rejects(
      () => facade.assessmentService.transitionAssessmentStatus('coord_1', asmt.id, 'completed'),
      (err: unknown) => err instanceof DueDiligenceError && err.code === 'MANDATORY_WORKSTREAMS_INCOMPLETE',
    );

    // Complete ws1, mark ws2 unavailable with reason (e.g. locked utility room)
    await facade.assessmentService.updateWorkstreamStatus('struct_eng_1', ws1.id, {
      status: 'completed',
      reviewOutcome: 'findings_identified',
      evidenceCompletenessState: 'complete',
    });
    await facade.assessmentService.updateWorkstreamStatus('unverified_elec_1', ws2.id, {
      status: 'unavailable',
      unavailableReason: 'Main electrical room was locked by building management during visit.',
      reviewOutcome: 'not_assessed',
    });

    const completedAsmt = await facade.assessmentService.transitionAssessmentStatus('coord_1', asmt.id, 'completed');
    assert.equal(completedAsmt.status, 'completed');
    assert.ok(completedAsmt.actualCompletionDateIso);
    suitesPassed++;
    console.log('✓ 1. Assessment lifecycle, scope versioning, and completion guards passed');
  }

  // 2. Checklist Template Versioning, Historical Preservation, Conditional Items, & Concurrent Responses
  {
    const { facade } = buildHarness();
    const tplV1 = await facade.assessmentService.createOrPublishChecklistTemplate('coord_1', {
      templateId: 'tpl_struct_std',
      name: 'Standard Structural & Moisture Checklist',
      assessmentCategory: 'technical_inspection',
      applicablePropertyTypes: ['apartment'],
      applicableBuildingCategories: ['concrete_frame'],
      publishImmediately: true,
      items: [
        {
          itemId: 'chk_cracks_observed',
          section: 'structural',
          title: 'Are visible shear or settlement cracks present on load-bearing columns?',
          instructions: 'Inspect basement and parking columns.',
          required: true,
          requiresEvidenceOnNegative: true,
          allowedResponseTypes: ['observed_not_observed', 'not_inspected'],
        },
        {
          itemId: 'chk_crack_width_mm',
          section: 'structural',
          title: 'Measured maximum crack width (mm)',
          instructions: 'Measure with crack gauge if cracks are observed.',
          required: false,
          requiresEvidenceOnNegative: false,
          allowedResponseTypes: ['numeric_measurement', 'not_applicable'],
          expectedUnit: 'mm',
          conditionalOnItemId: 'chk_cracks_observed',
          conditionalExpectedValue: true,
        },
      ],
    });
    assert.equal(tplV1.version, 1);

    const asmt = await facade.assessmentService.createAssessment('requester_1', {
      assessmentType: 'technical_inspection',
      propertyReference: 'prop_tehran_2002',
      includedWorkstreams: ['structural_review'],
      objectives: ['Technical inspection'],
    });
    await facade.assessmentService.assignReviewer('requester_1', asmt.id, 'coord_1', 'assessment_coordinator');
    await facade.assessmentService.assignReviewer('coord_1', asmt.id, 'struct_1', 'structural_specialist');

    const ws = await facade.assessmentService.createWorkstream('coord_1', {
      assessmentId: asmt.id,
      workstreamType: 'structural_review',
      description: 'Structural checklist v1',
      assignedReviewerUid: 'struct_1',
      assignedReviewerRole: 'structural_specialist',
      checklistTemplateId: tplV1.id,
      checklistTemplateVersion: tplV1.version,
    });

    // Publish v2 of the same template -> existing workstream must retain v1!
    const tplV2 = await facade.assessmentService.createOrPublishChecklistTemplate('coord_1', {
      templateId: 'tpl_struct_std',
      name: 'Standard Structural Checklist v2 (Expanded)',
      assessmentCategory: 'technical_inspection',
      applicablePropertyTypes: ['apartment'],
      applicableBuildingCategories: ['concrete_frame'],
      publishImmediately: true,
      items: [...tplV1.items, {
        itemId: 'chk_new_v2_only',
        section: 'structural',
        title: 'New V2 item',
        instructions: 'V2 only',
        required: true,
        requiresEvidenceOnNegative: false,
        allowedResponseTypes: ['pass_fail'],
      }],
    });
    assert.equal(tplV2.version, 2);

    const boundTpl = await facade.assessmentService.getChecklistTemplateForWorkstream(ws);
    assert.equal(boundTpl?.version, 1);
    assert.equal(boundTpl?.items.length, 2);

    // Conditional item check: recording numeric crack width before parent chk_cracks_observed=true fails
    await assert.rejects(
      () =>
        facade.assessmentService.recordChecklistResponse('struct_1', {
          assessmentId: asmt.id,
          workstreamId: ws.id,
          itemId: 'chk_crack_width_mm',
          responseType: 'numeric_measurement',
          value: 1.5,
          unit: 'mm',
          classification: 'deficiency_noted',
          reasonIfIncompleteOrNegative: 'Hairline crack',
        }),
      (err: unknown) => err instanceof DueDiligenceError && err.code === 'CONDITIONAL_PREREQUISITE_NOT_MET',
    );

    // Record deficiency without evidence on item where requiresEvidenceOnNegative=true -> auto-classifies as evidence_missing
    const r1 = await facade.assessmentService.recordChecklistResponse('struct_1', {
      assessmentId: asmt.id,
      workstreamId: ws.id,
      itemId: 'chk_cracks_observed',
      responseType: 'observed_not_observed',
      value: true,
      classification: 'deficiency_noted',
      reasonIfIncompleteOrNegative: 'Diagonal crack on parking pillar B2',
    });
    assert.equal(r1.classification, 'evidence_missing');

    // Now conditional child item can be recorded with valid unit
    const r2 = await facade.assessmentService.recordChecklistResponse('struct_1', {
      assessmentId: asmt.id,
      workstreamId: ws.id,
      itemId: 'chk_crack_width_mm',
      responseType: 'numeric_measurement',
      value: 2.4,
      unit: 'mm',
      classification: 'deficiency_noted',
      reasonIfIncompleteOrNegative: 'Exceeds 2mm threshold',
    });
    assert.equal(r2.value, 2.4);

    // Correcting response preserves response history and checks optimistic concurrency version
    const corrected = await facade.assessmentService.correctChecklistResponse('struct_1', r2.id, {
      newValue: 2.1,
      newClassification: 'deficiency_noted',
      correctionReason: 'Recalibrated digital caliper reading',
      expectedVersion: r2.version,
    });
    assert.equal(corrected.value, 2.1);
    assert.equal(corrected.history.length, 1);
    assert.equal(corrected.history[0].previousValue, 2.4);

    // Stale expectedVersion fails with CONCURRENT_MODIFICATION_CONFLICT
    await assert.rejects(
      () =>
        facade.assessmentService.correctChecklistResponse('struct_1', r2.id, {
          newValue: 1.9,
          newClassification: 'satisfactory',
          correctionReason: 'Stale write attempt',
          expectedVersion: 1,
        }),
      (err: unknown) => err instanceof DueDiligenceError && err.code === 'CONCURRENT_MODIFICATION_CONFLICT',
    );
    suitesPassed++;
    console.log('✓ 2. Checklist template versioning, conditional items, and concurrency guards passed');
  }

  // 3. Findings, Undetermined Severity, AI Review Boundary, & Risk Register
  {
    const { facade } = buildHarness();
    const asmt = await facade.assessmentService.createAssessment('requester_1', {
      assessmentType: 'purchase_due_diligence',
      propertyReference: 'prop_tehran_3003',
      includedWorkstreams: ['structural_review', 'plumbing_review'],
      objectives: ['Inspect structure and plumbing'],
    });
    await facade.assessmentService.assignReviewer('requester_1', asmt.id, 'coord_1', 'assessment_coordinator');
    await facade.assessmentService.assignReviewer('coord_1', asmt.id, 'struct_1', 'structural_specialist');
    await facade.assessmentService.assignReviewer('coord_1', asmt.id, 'plumb_1', 'mechanical_specialist');

    const wsStruct = await facade.assessmentService.createWorkstream('coord_1', {
      assessmentId: asmt.id,
      workstreamType: 'structural_review',
      description: 'Structural workstream',
      assignedReviewerUid: 'struct_1',
    });
    const wsPlumb = await facade.assessmentService.createWorkstream('coord_1', {
      assessmentId: asmt.id,
      workstreamType: 'plumbing_review',
      description: 'Plumbing workstream',
      assignedReviewerUid: 'plumb_1',
    });

    // Plumbing specialist cannot write findings into structural specialist's workstream
    await assert.rejects(
      () =>
        facade.findingsAndReviewsService.createFinding('plumb_1', {
          assessmentId: asmt.id,
          workstreamId: wsStruct.id,
          category: 'Structural',
          title: 'Cross-workstream attempt',
          description: 'Should be blocked',
          locationWithinProperty: 'Basement',
          observedCondition: 'Crack',
          observationBasis: 'observed_damage',
          severity: 'minor',
          recommendedNextStep: 'None',
        }),
      (err: unknown) => err instanceof DueDiligenceError && err.code === 'WORKSTREAM_OWNERSHIP_MISMATCH',
    );

    // Major finding without evidence or explanation must fail
    await assert.rejects(
      () =>
        facade.findingsAndReviewsService.createFinding('struct_1', {
          assessmentId: asmt.id,
          workstreamId: wsStruct.id,
          category: 'Structural',
          title: 'Major beam deflection',
          description: 'Visible deflection on span 3',
          locationWithinProperty: 'Parking level -1',
          observedCondition: 'Deflection observed',
          observationBasis: 'observed_damage',
          severity: 'major',
          recommendedNextStep: 'Structural engineering load calculation',
        }),
      (err: unknown) => err instanceof DueDiligenceError && err.code === 'EVIDENCE_OR_EXPLANATION_REQUIRED',
    );

    // Major AI-suggested finding without human confirmation must fail
    await assert.rejects(
      () =>
        facade.findingsAndReviewsService.createFinding('struct_1', {
          assessmentId: asmt.id,
          workstreamId: wsStruct.id,
          category: 'Structural',
          title: 'AI-detected crack',
          description: 'Model candidate output',
          locationWithinProperty: 'Wall',
          observedCondition: 'Line on image',
          observationBasis: 'suspected_damage',
          severity: 'major',
          evidenceUnavailableExplanation: 'Camera blur',
          recommendedNextStep: 'Inspect on site',
          authoredByAiSuggestion: true,
        }),
      (err: unknown) => err instanceof DueDiligenceError && err.code === 'HUMAN_CONFIRMATION_REQUIRED_FOR_AI_FINDING',
    );

    // Create finding with undetermined severity (suspected concealed pipe corrosion)
    const fUndetermined = await facade.findingsAndReviewsService.createFinding('plumb_1', {
      assessmentId: asmt.id,
      workstreamId: wsPlumb.id,
      category: 'Plumbing',
      title: 'Suspected sub-floor dampness near riser shaft',
      description: 'Efflorescence visible on baseboard; riser shaft concealed behind tiled wall.',
      locationWithinProperty: 'Master bathroom wall',
      observedCondition: 'Surface dampness without direct pipe visibility',
      observationBasis: 'suspected_damage',
      severity: 'undetermined',
      recommendedNextStep: 'Borescope inspection with owner permission',
    });
    assert.equal(fUndetermined.severity, 'undetermined');

    // Create risk register entry distinguishing missing_information_uncertainty from observed_defect
    const riskEntry = await facade.riskAndReportingService.createRiskRegisterEntry('plumb_1', {
      assessmentId: asmt.id,
      relatedFindingId: fUndetermined.id,
      riskCategory: 'moisture_and_water_damage',
      riskBasis: 'missing_information_uncertainty',
      description: 'Concealed riser shaft could not be destructively opened during non-invasive visual inspection.',
      severity: 'moderate',
      likelihoodClassification: 'indeterminate',
      impactClassification: 'moderate',
      requiredFollowUp: 'Request maintenance logs or thermal imaging access',
    });
    assert.equal(riskEntry.riskBasis, 'missing_information_uncertainty');
    suitesPassed++;
    console.log('✓ 3. Findings, workstream isolation, AI confirmation guard, and risk register passed');
  }

  // 4. Evidence Provenance, Separation of Duties, Privacy, & Legal Document Review Boundaries
  {
    const { facade } = buildHarness();
    const asmt = await facade.assessmentService.createAssessment('requester_1', {
      assessmentType: 'purchase_due_diligence',
      propertyReference: 'prop_tehran_4004',
      includedWorkstreams: ['legal_document_checklist', 'technical_inspection'],
      objectives: ['Legal document checklist and technical inspection'],
    });
    await facade.assessmentService.assignReviewer('requester_1', asmt.id, 'coord_1', 'assessment_coordinator');
    await facade.assessmentService.assignReviewer('coord_1', asmt.id, 'doc_rev_1', 'document_reviewer');
    await facade.assessmentService.assignReviewer('coord_1', asmt.id, 'tech_rev_1', 'technical_inspector');

    const evUser = await facade.findingsAndReviewsService.submitEvidence('requester_1', {
      assessmentId: asmt.id,
      mediaReferenceId: 'media_deed_scan_001',
      evidenceType: 'official_document_copy',
      sourceClassification: 'user_provided',
      description: 'Scanned copy of single-page deed supplied by seller',
      privacyClassification: 'confidential_legal_financial',
    });
    assert.equal(evUser.verificationStatus, 'uploaded_unverified');

    // Separation of duties: requester_1 cannot self-verify their own user-provided evidence
    await assert.rejects(
      () =>
        facade.findingsAndReviewsService.reviewEvidence('requester_1', evUser.id, {
          verificationStatus: 'independently_verified',
        }),
      (err: unknown) => err instanceof DueDiligenceError && err.code === 'SEPARATION_OF_DUTIES_VIOLATION',
    );

    // Privacy boundary: technical_inspector cannot view confidential_legal_financial evidence
    await assert.rejects(
      () => facade.findingsAndReviewsService.getEvidenceAuthorized('tech_rev_1', evUser.id),
      (err: unknown) => err instanceof DueDiligenceError && err.code === 'CONFIDENTIAL_EVIDENCE_RESTRICTED',
    );

    // Authorized document_reviewer can view confidential evidence
    const viewedEv = await facade.findingsAndReviewsService.getEvidenceAuthorized('doc_rev_1', evUser.id);
    assert.equal(viewedEv.id, evUser.id);

    // Submit legal document for review
    const docReview = await facade.findingsAndReviewsService.submitDocumentForReview('requester_1', {
      assessmentId: asmt.id,
      documentCategory: 'ownership_document_copy',
      mediaReferenceId: 'media_deed_scan_001',
      statedIssuingAuthority: 'State Organization for Registration of Deeds and Properties (as printed on copy)',
      visibleDocumentIdentifier: 'SER-998877',
    });
    assert.equal(docReview.isCopyNotOfficialRegistry, true);
    assert.equal(docReview.reviewStatus, 'supplied');

    // Legal review guard: cannot claim 'independently_verified' without external_authorized_registry_adapter and reference
    await assert.rejects(
      () =>
        facade.findingsAndReviewsService.recordDocumentReviewResult('doc_rev_1', docReview.id, {
          reviewStatus: 'independently_verified',
          verificationMethod: 'visual_copy_inspection_only',
          reviewerNotes: 'Looks fine on PDF',
        }),
      (err: unknown) => err instanceof DueDiligenceError && err.code === 'UNSUPPORTED_OWNERSHIP_VERIFICATION',
    );

    // Properly record visual copy inspection where official registry verification is unavailable
    const reviewedDoc = await facade.findingsAndReviewsService.recordDocumentReviewResult('doc_rev_1', docReview.id, {
      reviewStatus: 'verification_unavailable',
      verificationMethod: 'visual_copy_inspection_only',
      reviewerNotes: 'Document copy visually legible; direct government title registry verification unavailable.',
    });
    assert.equal(reviewedDoc.reviewStatus, 'verification_unavailable');
    assert.equal(reviewedDoc.history.length, 2);
    suitesPassed++;
    console.log('✓ 4. Evidence provenance, separation of duties, privacy, and legal document boundaries passed');
  }

  // 5. Financial, Geographic/Environmental, Measurements, & Remediation Verification
  {
    const { facade } = buildHarness();
    const asmt = await facade.assessmentService.createAssessment('requester_1', {
      assessmentType: 'investment_due_diligence',
      propertyReference: 'prop_tehran_5005',
      includedWorkstreams: ['financial_document_review', 'geographic_review', 'technical_inspection'],
      objectives: ['Investment cashflow evidence, location context, and measurements'],
      reportingCurrency: 'IRT',
    });
    await facade.assessmentService.assignReviewer('requester_1', asmt.id, 'coord_1', 'assessment_coordinator');
    await facade.assessmentService.assignReviewer('coord_1', asmt.id, 'fin_rev_1', 'financial_reviewer');
    await facade.assessmentService.assignReviewer('coord_1', asmt.id, 'tech_rev_1', 'technical_inspector');

    const wsTech = await facade.assessmentService.createWorkstream('coord_1', {
      assessmentId: asmt.id,
      workstreamType: 'technical_inspection',
      description: 'Technical inspection',
      assignedReviewerUid: 'tech_rev_1',
    });

    // Financial record preserves original currency and obligation type
    const finRec = await facade.findingsAndReviewsService.recordFinancialEvidenceReview('fin_rev_1', {
      assessmentId: asmt.id,
      recordCategory: 'reported_rental_income',
      amount: 45_000_000,
      originalCurrency: 'IRT',
      reportingPeriodStartIso: '2026-01-01T00:00:00.000Z',
      reportingPeriodEndIso: '2026-10-01T00:00:00.000Z',
      frequency: 'recurring_monthly',
      obligationType: 'unverified_reported_estimate',
      verificationStatus: 'reported_unverified',
      evidenceIds: [],
      notes: 'Owner-stated monthly rent; bank deposit receipts not supplied.',
    });
    assert.equal(finRec.originalCurrency, 'IRT');
    assert.equal(finRec.obligationType, 'unverified_reported_estimate');

    // Geographic observation flags stale dataset when older than 365 days
    const geoObs = await facade.findingsAndReviewsService.recordGeographicEnvironmentalObservation('tech_rev_1', {
      assessmentId: asmt.id,
      canonicalCityId: 'tehran',
      canonicalNeighborhoodId: 3,
      category: 'environmental_observation',
      sourceType: 'official_dataset_reference',
      datasetSourceName: 'Municipal Noise & Traffic Survey 2023',
      datasetPublishedAtIso: '2023-05-01T00:00:00.000Z',
      observationSummary: 'Adjacent to secondary arterial street.',
      verificationStatus: 'verified_dataset',
    });
    assert.equal(geoObs.isStaleDataset, true);

    // Technical measurement preserves original unit and never claims certification without certificationEvidenceId
    const msr = await facade.findingsAndReviewsService.recordTechnicalMeasurement('tech_rev_1', {
      assessmentId: asmt.id,
      measurementType: 'moisture_reading',
      originalValue: 18.4,
      originalUnit: '% WME',
      measurementMethod: 'instrument_reading',
      instrumentReference: 'Protimeter-MMS3',
      notes: 'Measured along north bedroom skirting board',
    });
    assert.equal(msr.originalUnit, '% WME');
    assert.equal(msr.isCertifiedMeasurement, false);

    // Create finding & remediation recommendation
    const finding = await facade.findingsAndReviewsService.createFinding('tech_rev_1', {
      assessmentId: asmt.id,
      workstreamId: wsTech.id,
      category: 'Waterproofing',
      title: 'Parapet flashing sealant degradation',
      description: 'Sealant along roof parapet has separated.',
      locationWithinProperty: 'Main roof north parapet',
      observedCondition: 'Open joint along flashing',
      observationBasis: 'observed_damage',
      severity: 'moderate',
      recommendedNextStep: 'Reseal parapet flashing and re-inspect',
    });

    const rem = await facade.riskAndReportingService.createRemediationRecommendation('tech_rev_1', {
      assessmentId: asmt.id,
      findingId: finding.id,
      actionDescription: 'Apply elastomeric sealant to parapet flashing joint',
      externalPropertyManagementRef: 'pm_task_ref_77',
      priority: 'high',
    });
    assert.equal(rem.status, 'recommended');

    // Report completion (completed_awaiting_review) is distinct from verified_resolved
    const reportedRem = await facade.riskAndReportingService.recordRemediationProgressOrCompletion('requester_1', rem.id, {
      status: 'completed_awaiting_review',
    });
    assert.equal(reportedRem.status, 'completed_awaiting_review');
    assert.equal(reportedRem.verifiedByReviewerUid, undefined);

    // Reviewer cannot mark verified_resolved without completion evidence
    await assert.rejects(
      () =>
        facade.riskAndReportingService.verifyRemediationOutcome('tech_rev_1', rem.id, {
          verifiedResolved: true,
          completionEvidenceIds: [],
        }),
      (err: unknown) => err instanceof DueDiligenceError && err.code === 'COMPLETION_EVIDENCE_REQUIRED',
    );

    const evAfterRepair = await facade.findingsAndReviewsService.submitEvidence('tech_rev_1', {
      assessmentId: asmt.id,
      findingId: finding.id,
      mediaReferenceId: 'media_roof_repaired_01',
      evidenceType: 'inspection_photograph',
      sourceClassification: 'inspector_captured',
      description: 'Post-remediation photo of resealed parapet joint',
    });

    const verifiedRem = await facade.riskAndReportingService.verifyRemediationOutcome('tech_rev_1', rem.id, {
      verifiedResolved: true,
      completionEvidenceIds: [evAfterRepair.id],
    });
    assert.equal(verifiedRem.status, 'verified_resolved');

    // Original historical finding is preserved and marked verified_resolved
    const updatedFinding = await facade.store.getFindingById(finding.id);
    assert.ok(updatedFinding);
    assert.equal(updatedFinding.remediationStatus, 'verified_resolved');
    assert.equal(updatedFinding.history.length, 2);
    suitesPassed++;
    console.log('✓ 5. Financial, geographic, measurements, and remediation verification workflows passed');
  }

  // 6. Reviewer Disagreements, Report Versioning, Evidence Locking, & Supersession
  {
    const { facade } = buildHarness();
    const asmt = await facade.assessmentService.createAssessment('requester_1', {
      assessmentType: 'purchase_due_diligence',
      propertyReference: 'prop_tehran_6006',
      includedWorkstreams: ['structural_review', 'electrical_review'],
      objectives: ['Full pre-purchase inspection'],
    });
    await facade.assessmentService.assignReviewer('requester_1', asmt.id, 'coord_1', 'assessment_coordinator', 'verified_prov_1');
    await facade.assessmentService.assignReviewer('coord_1', asmt.id, 'struct_1', 'structural_specialist', 'verified_prov_2');
    await facade.assessmentService.assignReviewer('coord_1', asmt.id, 'struct_2', 'structural_specialist');

    const wsStruct = await facade.assessmentService.createWorkstream('coord_1', {
      assessmentId: asmt.id,
      workstreamType: 'structural_review',
      description: 'Structural review',
      assignedReviewerUid: 'struct_1',
    });
    const wsElec = await facade.assessmentService.createWorkstream('coord_1', {
      assessmentId: asmt.id,
      workstreamType: 'electrical_review',
      description: 'Electrical review (left incomplete to test incomplete scope disclosure)',
      isMandatory: false,
    });
    assert.ok(wsElec.id);

    const evPhoto = await facade.findingsAndReviewsService.submitEvidence('struct_1', {
      assessmentId: asmt.id,
      workstreamId: wsStruct.id,
      mediaReferenceId: 'media_column_photo_1',
      evidenceType: 'inspection_photograph',
      sourceClassification: 'inspector_captured',
      description: 'Photo of basement column C4',
    });

    const finding = await facade.findingsAndReviewsService.createFinding('struct_1', {
      assessmentId: asmt.id,
      workstreamId: wsStruct.id,
      category: 'Structural',
      title: 'Plaster spalling on column C4',
      description: 'Surface plaster spalling',
      locationWithinProperty: 'Basement parking',
      observedCondition: 'Spalling of cover plaster',
      observationBasis: 'observed_damage',
      evidenceIds: [evPhoto.id],
      severity: 'minor',
      recommendedNextStep: 'Patch plaster and monitor',
    });

    // Record conflicting reviewer observation
    const conflict = await facade.riskAndReportingService.recordReviewerDisagreement('struct_2', {
      assessmentId: asmt.id,
      workstreamId: wsStruct.id,
      findingOrItemId: finding.id,
      primaryReviewerUid: 'struct_1',
      primaryPosition: 'Minor surface plaster spalling only.',
      dissentingPosition: 'Recommend core test to rule out rebar corrosion.',
    });
    assert.equal(conflict.status, 'open_conflict');

    // Generate draft v1 report
    const draftV1 = await facade.riskAndReportingService.generateDraftReport('coord_1', asmt.id);
    assert.equal(draftV1.reportVersion, 1);
    assert.equal(draftV1.status, 'draft');
    assert.ok(draftV1.incompleteWorkstreamIds.includes(wsElec.id));
    assert.ok(draftV1.outstandingUncertainties.length > 0);
    assert.ok(draftV1.mandatoryLegalAndTechnicalDisclaimer.includes('NOT a legal opinion'));

    // Cannot publish report while reviewer disagreement is unresolved
    await assert.rejects(
      () => facade.riskAndReportingService.publishReportVersion('coord_1', asmt.id, 1),
      (err: unknown) => err instanceof DueDiligenceError && err.code === 'UNRESOLVED_REVIEWER_CONFLICTS',
    );

    // Resolve conflict via coordinator
    await facade.riskAndReportingService.resolveReviewerDisagreement(
      'coord_1',
      conflict.id,
      'Both positions noted in report; non-destructive cover-meter check added to recommendations.',
    );

    // Publish v1 report
    const pubV1 = await facade.riskAndReportingService.publishReportVersion('coord_1', asmt.id, 1);
    assert.equal(pubV1.status, 'published');

    // Evidence referenced in published report v1 is now locked against rejection/invalidation
    await assert.rejects(
      () =>
        facade.findingsAndReviewsService.reviewEvidence('coord_1', evPhoto.id, {
          verificationStatus: 'rejected',
          note: 'Attempt to reject locked evidence',
        }),
      (err: unknown) => err instanceof DueDiligenceError && err.code === 'EVIDENCE_LOCKED_IN_PUBLISHED_REPORT',
    );

    // Generate and publish v2 report -> v1 is automatically marked 'superseded'
    const draftV2 = await facade.riskAndReportingService.generateDraftReport('coord_1', asmt.id);
    assert.equal(draftV2.reportVersion, 2);
    const pubV2 = await facade.riskAndReportingService.publishReportVersion('coord_1', asmt.id, 2);
    assert.equal(pubV2.status, 'published');

    const historicalV1 = await facade.riskAndReportingService.getPublishedReport('requester_1', asmt.id, 1);
    assert.equal(historicalV1.status, 'superseded');
    assert.equal(historicalV1.supersededByVersion, 2);
    suitesPassed++;
    console.log('✓ 6. Reviewer disagreements, report versioning, evidence locking, and supersession passed');
  }

  // 7. Quality Controls, Cross-Org Isolation, Persistence Failures, Pagination, & Account Deletion
  {
    const { facade, store, eventSink } = buildHarness();
    const asmt = await facade.assessmentService.createAssessment('requester_org_a', {
      assessmentType: 'rental_due_diligence',
      propertyReference: 'prop_tehran_7007',
      requestingOrganizationId: 'org_a',
      includedWorkstreams: ['interior_condition_review'],
      objectives: ['Pre-rental handover condition check'],
    });

    // Cross-organization isolation check
    await assert.rejects(
      () => facade.assessmentService.getAssessment('stranger_user', asmt.id, 'org_b'),
      (err: unknown) => err instanceof DueDiligenceError && err.code === 'CROSS_ORG_ACCESS_DENIED',
    );

    // Quality control evaluation distinguishes completeness from verification
    const qc = await facade.riskAndReportingService.evaluateAssessmentQualityControls('requester_org_a', asmt.id);
    assert.equal(qc.isScopeFullyCompleted, true);
    assert.equal(qc.isFullyVerifiedAssessment, false);

    // Simulated persistence failure and safe retry
    store.simulateNextWriteFailure = true;
    await assert.rejects(
      () =>
        facade.assessmentService.assignReviewer('requester_org_a', asmt.id, 'coord_a', 'assessment_coordinator'),
      (err: unknown) => err instanceof DueDiligenceError && err.code === 'PERSISTENCE_UNAVAILABLE',
    );
    // Retry succeeds cleanly
    const afterRetry = await facade.assessmentService.assignReviewer('requester_org_a', asmt.id, 'coord_a', 'assessment_coordinator');
    assert.equal(afterRetry.assignedReviewers.length, 1);

    // Audit history cursor pagination
    const auditPage1 = await facade.retrieveAssessmentAuditHistory('requester_org_a', asmt.id, { limit: 1 });
    assert.equal(auditPage1.items.length, 1);
    assert.equal(auditPage1.hasMore, true);
    assert.ok(auditPage1.nextCursor);

    const auditPage2 = await facade.retrieveAssessmentAuditHistory('requester_org_a', asmt.id, {
      limit: 1,
      cursor: auditPage1.nextCursor,
    });
    assert.equal(auditPage2.items.length, 1);
    assert.notEqual(auditPage1.items[0].id, auditPage2.items[0].id);

    // Account export & deletion integration
    const exported = await facade.exportUserData('requester_org_a');
    assert.equal(exported.requestedAssessments.length, 1);

    const delResult = await facade.handleAccountDeletion('requester_org_a', 'User requested account deletion');
    assert.equal(delResult.anonymizedAssessmentsCount, 1);

    // Domain events published with stable IDs and schema version
    assert.ok(eventSink.events.length >= 2);
    assert.equal(eventSink.events[0].schemaVersion, '2026-11.due-diligence.v1');
    suitesPassed++;
    console.log('✓ 7. Quality controls, cross-org isolation, retry safety, pagination, and account deletion passed');
  }

  console.log(`\n🎉 ALL ${suitesPassed} PROPERTY DUE DILIGENCE TEST SUITES PASSED!\n`);
}

runPropertyDueDiligenceTests().catch((err) => {
  console.error('❌ Property Due Diligence test suite failed:', err);
  process.exit(1);
});
