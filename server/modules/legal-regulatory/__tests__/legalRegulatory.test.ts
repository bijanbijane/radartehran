import assert from 'node:assert/strict';
import {
  CanonicalGeographyLookupAdapter,
  createLegalRegulatoryModuleFacade,
  DeterministicLegalRegulatoryStore,
  LegalRegulatoryActorContext,
  LegalRegulatoryError,
  ReadOnlyInMemoryPropertyContextAdapter,
} from '../index';

const ADMIN_ACTOR: LegalRegulatoryActorContext = {
  actorId: 'reviewer-legal-01',
  role: 'LEGAL_REVIEWER',
  isAuthenticated: true,
};
const PUBLIC_ACTOR: LegalRegulatoryActorContext = {
  actorId: 'anonymous',
  role: 'PUBLIC_READER',
  isAuthenticated: false,
};
const REGULAR_USER_ACTOR: LegalRegulatoryActorContext = {
  actorId: 'user-standard-99',
  role: 'AUTHENTICATED_USER',
  isAuthenticated: true,
};

async function runTests(): Promise<void> {
  const store = new DeterministicLegalRegulatoryStore();
  const geographyAdapter = new CanonicalGeographyLookupAdapter();
  const propertyAdapter = new ReadOnlyInMemoryPropertyContextAdapter([
    {
      propertyId: 'prop_tehran_punak_01',
      cityId: 'tehran',
      provinceId: 'tehran',
      districtNumber: 5,
      neighborhoodId: 'پونک',
      propertyCategory: 'RESIDENTIAL_APARTMENT',
      landUseCategory: 'RESIDENTIAL_TARAKOM_MOTAVASET',
      constructionStage: 'PRE_PERMIT_PLANNING',
      floorsCount: 6,
      plotAreaSqm: 320,
      isWornOutTextureBaftFarsoodeh: false,
      isNearActiveFaultLine: false,
    },
  ]);

  const { sourceAndProvisionService, applicabilityAndProfileService } = createLegalRegulatoryModuleFacade({
    store,
    geographyAdapter,
    propertyContextAdapter: propertyAdapter,
  });

  // 1. Regulatory source creation and validation + 13. Idempotent mutations
  const nationalSource = await sourceAndProvisionService.createRegulatorySource(
    {
      id: 'src_nat_building_m3',
      officialTitleFa: '[TEST FIXTURE] مبحث سوم مقررات ملی ساختمان - حفاظت ساختمان‌ها در برابر حریق',
      issuingAuthority: 'وزارت راه و شهرسازی',
      jurisdictionScope: { level: 'NATIONAL', countryCode: 'IR' },
      sourceCategory: 'NATIONAL_BUILDING_CODE_MABHAS',
      reliabilityTier: 'PRIMARY_OFFICIAL_STATUTE',
      verificationStatus: 'VERIFIED',
      officialReferenceNumber: 'SYNTH-MABHAS-3-1395',
      publicationDateIso: '2016-05-01',
      effectiveFromIso: '2016-09-01',
      verifiedOriginalSourceUrl: 'https://inbr.ir/synthetic-fixture-mabhas3',
      isSyntheticTestFixture: true,
      internalReviewerNotes: 'CONFIDENTIAL_REVIEWER_NOTE_DO_NOT_LEAK',
      restrictedAuditMetadata: { ticket: 'LEGAL-101' },
      idempotencyKey: 'idem-create-src-m3',
    },
    ADMIN_ACTOR,
  );
  assert.equal(nationalSource.id, 'src_nat_building_m3');
  assert.equal(nationalSource.version, 1);

  const replaySource = await sourceAndProvisionService.createRegulatorySource(
    {
      id: 'src_nat_building_m3',
      officialTitleFa: 'Duplicate call with same idempotency key',
      issuingAuthority: 'وزارت راه و شهرسازی',
      jurisdictionScope: { level: 'NATIONAL', countryCode: 'IR' },
      sourceCategory: 'NATIONAL_BUILDING_CODE_MABHAS',
      reliabilityTier: 'PRIMARY_OFFICIAL_STATUTE',
      officialReferenceNumber: 'SYNTH-MABHAS-3-1395',
      publicationDateIso: '2016-05-01',
      effectiveFromIso: '2016-09-01',
      idempotencyKey: 'idem-create-src-m3',
    },
    ADMIN_ACTOR,
  );
  assert.equal(replaySource.id, nationalSource.id);
  assert.equal(replaySource.version, 1);

  // 2. Invalid or incomplete source metadata rejection
  await assert.rejects(
    () =>
      sourceAndProvisionService.createRegulatorySource(
        {
          officialTitleFa: '',
          issuingAuthority: 'شهرداری تهران',
          jurisdictionScope: { level: 'NATIONAL', countryCode: 'IR' },
          sourceCategory: 'MUNICIPAL_COUNCIL_BYLAW',
          reliabilityTier: 'OFFICIAL_BYLAW_OR_DIRECTIVE',
          officialReferenceNumber: 'REF-INVALID',
          publicationDateIso: '2024-01-01',
          effectiveFromIso: '2023-01-01',
          effectiveToIso: '2022-01-01',
        },
        ADMIN_ACTOR,
      ),
    (err: unknown) => err instanceof LegalRegulatoryError && err.code === 'VALIDATION_ERROR',
  );

  await assert.rejects(
    () =>
      sourceAndProvisionService.createRegulatorySource(
        {
          officialTitleFa: 'Unverified source claiming verified status',
          issuingAuthority: 'Unknown Blog',
          jurisdictionScope: { level: 'NATIONAL', countryCode: 'IR' },
          sourceCategory: 'SECONDARY_LEGAL_COMMENTARY',
          reliabilityTier: 'UNVERIFIED_EXTERNAL_REFERENCE',
          verificationStatus: 'VERIFIED',
          officialReferenceNumber: 'BLOG-01',
          publicationDateIso: '2024-01-01',
          effectiveFromIso: '2024-01-01',
        },
        ADMIN_ACTOR,
      ),
    (err: unknown) => err instanceof LegalRegulatoryError && err.code === 'VALIDATION_ERROR',
  );

  // 3. Jurisdiction matching & 4. Geographic applicability via GeographyLookupAdapter
  await assert.rejects(
    () =>
      sourceAndProvisionService.createRegulatorySource(
        {
          officialTitleFa: 'Invalid Neighborhood in Tehran',
          issuingAuthority: 'شهرداری تهران',
          jurisdictionScope: {
            level: 'NEIGHBORHOOD',
            countryCode: 'IR',
            cityId: 'tehran',
            neighborhoodId: 'non_existent_hood_xyz',
          },
          sourceCategory: 'MUNICIPAL_DETAILED_PLAN_TARH_TAFSILI',
          reliabilityTier: 'OFFICIAL_BYLAW_OR_DIRECTIVE',
          officialReferenceNumber: 'TEH-BAD-HOOD',
          publicationDateIso: '2023-01-01',
          effectiveFromIso: '2023-02-01',
        },
        ADMIN_ACTOR,
      ),
    (err: unknown) => err instanceof LegalRegulatoryError && err.code === 'VALIDATION_ERROR',
  );

  const tehranDistrictSource = await sourceAndProvisionService.createRegulatorySource(
    {
      id: 'src_tehran_d5_tarh',
      officialTitleFa: '[TEST FIXTURE] ضوابط طرح تفصیلی منطقه ۵ شهرداری تهران - پونک',
      issuingAuthority: 'کمیسیون ماده ۵ شهر تهران',
      jurisdictionScope: {
        level: 'NEIGHBORHOOD',
        countryCode: 'IR',
        provinceId: 'tehran',
        cityId: 'tehran',
        districtNumber: 5,
        neighborhoodId: 'پونک',
      },
      sourceCategory: 'MUNICIPAL_DETAILED_PLAN_TARH_TAFSILI',
      reliabilityTier: 'OFFICIAL_BYLAW_OR_DIRECTIVE',
      verificationStatus: 'VERIFIED',
      officialReferenceNumber: 'SYNTH-TEH-D5-1400',
      publicationDateIso: '2021-03-21',
      effectiveFromIso: '2021-04-01',
      isSyntheticTestFixture: true,
    },
    ADMIN_ACTOR,
  );

  const docTehran = await sourceAndProvisionService.createRegulatoryDocument(
    {
      id: 'doc_tehran_d5_zoning',
      sourceId: tehranDistrictSource.id,
      documentCode: 'TARH-D5-R122',
      titleFa: 'دفترچه ضوابط پهنه سکونتی R122 منطقه ۵',
      documentCategory: 'LAND_USE_AND_ZONING',
      effectiveFromIso: '2021-04-01',
    },
    ADMIN_ACTOR,
  );

  // 5. Effective-date evaluation, 6. Historical version retrieval, 7. Amendment & repeal relationships
  const provZoning = await sourceAndProvisionService.createRegulatoryProvision(
    {
      id: 'prov_punak_r122_art1',
      documentId: docTehran.id,
      sourceId: tehranDistrictSource.id,
      hierarchyLevel: 'ARTICLE',
      provisionNumber: '1',
      citationLabel: 'بند ۱-۱ ضوابط پهنه R122 پونک (آزمایشی)',
      titleFa: 'حداکثر تعداد طبقات مجاز در پهنه R122 پونک',
      documentCategory: 'LAND_USE_AND_ZONING',
      originalTextVerbatim: 'حداکثر تعداد طبقات مجاز در قطعات بالای ۳۰۰ متر مربع، ۵ طبقه روی پیلوت می‌باشد.',
      verifiedExcerptText: 'حداکثر ۵ طبقه روی پیلوت برای قطعات بالای ۳۰۰ متر مربع.',
      humanVerifiedInterpretation: {
        interpretationText: 'در دوره ۱۴۰۰ تا ۱۴۰۲ سقف مجاز ۵ طبقه بوده است.',
        verifiedByLegalReviewerId: ADMIN_ACTOR.actorId,
        verifiedAtIso: '2021-04-10T00:00:00Z',
        scopeAndLimitationsNote: 'صرفاً برای گذرهای بالای ۱۲ متر.',
        citations: ['SYNTH-TEH-D5-1400'],
      },
      effectiveFromIso: '2021-04-01',
      internalReviewerNotes: 'INTERNAL_PROVISION_REVIEW_NOTE',
    },
    ADMIN_ACTOR,
  );

  const amendmentResult = await sourceAndProvisionService.recordRegulatoryChangeAndVersion(
    {
      targetProvisionId: provZoning.id,
      changeType: 'AMENDMENT',
      enactingSourceId: tehranDistrictSource.id,
      newOriginalTextVerbatim:
        'اصلاحیه ۱۴۰۲: حداکثر تعداد طبقات مجاز در قطعات بالای ۳۰۰ متر مربع با عرض گذر ۱۲ متر، ۶ طبقه روی پیلوت می‌باشد.',
      effectiveFromIso: '2023-06-01',
      changeSummary: 'افزایش سقف طبقات مجاز از ۵ به ۶ طبقه در اصلاحیه خرداد ۱۴۰۲',
      idempotencyKey: 'idem-amend-r122-v2',
    },
    ADMIN_ACTOR,
  );
  assert.equal(amendmentResult.updatedProvision.version, 2);
  assert.equal(amendmentResult.updatedProvision.versionHistory.length, 2);

  const historical2022 = await sourceAndProvisionService.getProvisionVersionAsOfDate(provZoning.id, '2022-01-15');
  assert.equal(historical2022.isInForceAtDate, true);
  assert.equal(historical2022.matchedSnapshot?.versionNumber, 1);
  assert.ok(historical2022.matchedSnapshot?.originalTextVerbatim.includes('۵ طبقه'));

  const historical2024 = await sourceAndProvisionService.getProvisionVersionAsOfDate(provZoning.id, '2024-01-15');
  assert.equal(historical2024.isInForceAtDate, true);
  assert.equal(historical2024.matchedSnapshot?.versionNumber, 2);
  assert.ok(historical2024.matchedSnapshot?.originalTextVerbatim.includes('۶ طبقه'));

  const tempProvision = await sourceAndProvisionService.createRegulatoryProvision(
    {
      id: 'prov_temp_levy_1401',
      documentId: docTehran.id,
      sourceId: tehranDistrictSource.id,
      hierarchyLevel: 'NOTE_TABSAREH',
      provisionNumber: 'تبصره ۲',
      citationLabel: 'تبصره ۲ عوارض موقت ۱۴۰۱',
      titleFa: 'بخشودگی موقت عوارض نوسازی',
      documentCategory: 'TAX_AND_MUNICIPAL_LEVIES',
      originalTextVerbatim: 'متن آزمایشی عوارض موقت سال ۱۴۰۱.',
      lifecycleStatus: 'TEMPORARY_IN_FORCE',
      effectiveFromIso: '2022-03-21',
    },
    ADMIN_ACTOR,
  );

  await sourceAndProvisionService.recordRegulatoryChangeAndVersion(
    {
      targetProvisionId: tempProvision.id,
      changeType: 'REPEAL',
      enactingSourceId: tehranDistrictSource.id,
      effectiveFromIso: '2023-03-21',
      repealedAtIso: '2023-03-21',
      changeSummary: 'لغو تبصره موقت در پایان سال ۱۴۰۱',
    },
    ADMIN_ACTOR,
  );
  const afterRepealLookup = await sourceAndProvisionService.getProvisionVersionAsOfDate(tempProvision.id, '2024-01-01');
  assert.equal(afterRepealLookup.isInForceAtDate, false);

  // 8. Conflicting regulatory provisions detection and reporting
  const docNationalSafety = await sourceAndProvisionService.createRegulatoryDocument(
    {
      id: 'doc_nat_m3',
      sourceId: nationalSource.id,
      documentCode: 'MABHAS-03',
      titleFa: 'ضوابط ایمنی حریق ساختمان‌های بلندمرتبه',
      documentCategory: 'BUILDING_CODE_SAFETY',
      effectiveFromIso: '2016-09-01',
    },
    ADMIN_ACTOR,
  );

  const provNationalFire = await sourceAndProvisionService.createRegulatoryProvision(
    {
      id: 'prov_nat_m3_stairwell',
      documentId: docNationalSafety.id,
      sourceId: nationalSource.id,
      hierarchyLevel: 'ARTICLE',
      provisionNumber: '3-8-2',
      citationLabel: 'مبحث ۳ بند ۳-۸-۲ (آزمایشی)',
      titleFa: 'الزام دو راه پله فرار مجزا در ساختمان‌های ۶ طبقه و بالاتر',
      documentCategory: 'BUILDING_CODE_SAFETY',
      originalTextVerbatim: 'در تمامی ساختمان‌های مسکونی ۶ طبقه و بیشتر تعبیه دو دستگاه پله فرار الزامی است.',
      effectiveFromIso: '2016-09-01',
    },
    ADMIN_ACTOR,
  );

  const registeredConflict = await sourceAndProvisionService.registerProvisionConflict(
    {
      id: 'conf_punak_vs_m3',
      provisionIdA: provZoning.id,
      provisionIdB: provNationalFire.id,
      conflictSeverity: 'OVERLAPPING_JURISDICTION_AMBIGUITY',
      conflictDescription: 'تعارض اجرایی میان افزایش طبقه ششم در قطعات ۳۰۰ متری پونک و الزام فضای دو باکس پله مبحث سوم.',
      higherAuthorityProvisionId: provNationalFire.id,
    },
    ADMIN_ACTOR,
  );
  assert.equal(registeredConflict.status, 'OPEN_UNRESOLVED');

  await applicabilityAndProfileService.createApplicabilityRule(
    {
      id: 'rule_punak_r122_density',
      provisionId: provZoning.id,
      sourceId: tehranDistrictSource.id,
      ruleName: 'ضابطه تراکم ۶ طبقه پونک R122',
      conditions: {
        requiredPropertyCategories: ['RESIDENTIAL_APARTMENT'],
        requiredLandUseCategories: ['RESIDENTIAL_TARAKOM_MOTAVASET'],
        minPlotAreaSqm: 300,
        maxFloors: 6,
        requiredContextFields: ['propertyCategory', 'landUseCategory', 'plotAreaSqm', 'floorsCount'],
      },
      restrictionOrObligationSummary: 'حداکثر ۶ طبقه مسکونی در قطعات حداقل ۳۰۰ متر مربع پونک مجاز است.',
      mandatoryClassification: 'MANDATORY_STATUTORY',
      effectiveFromIso: '2021-04-01',
    },
    ADMIN_ACTOR,
  );

  await applicabilityAndProfileService.createApplicabilityRule(
    {
      id: 'rule_nat_m3_fire_stairs',
      provisionId: provNationalFire.id,
      sourceId: nationalSource.id,
      ruleName: 'الزام پله فرار دوم ساختمان‌های ۶ طبقه و بالاتر',
      conditions: {
        requiredPropertyCategories: ['RESIDENTIAL_APARTMENT'],
        minFloors: 6,
        requiresFaultLineProximity: false,
        requiredContextFields: ['propertyCategory', 'floorsCount', 'isNearActiveFaultLine'],
      },
      restrictionOrObligationSummary: 'نصب سیستم اعلام و اطفای حریق و دو راه پله مجزا الزامی است.',
      mandatoryClassification: 'MANDATORY_STATUTORY',
      effectiveFromIso: '2016-09-01',
    },
    ADMIN_ACTOR,
  );

  await applicabilityAndProfileService.createComplianceRequirement(
    {
      id: 'comp_req_fire_cert',
      requirementCode: 'ATASH-NESHANI-M3',
      sourceId: nationalSource.id,
      provisionId: provNationalFire.id,
      applicablePropertyCategories: ['RESIDENTIAL_APARTMENT'],
      applicableTransactionContexts: ['SALE_TRANSFER', 'PRE_SALE_PISH_FOROOSH'],
      titleFa: 'گواهی تاییدیه ایمنی سازمان آتش‌نشانی پیش از پایان کار',
      requirementDescription: 'اخذ تاییدیه رسمی سازمان آتش‌نشانی برای ساختمان‌های ۶ طبقه و بالاتر.',
      mandatoryVersionClassification: 'MANDATORY_STATUTORY',
      requiredEvidenceTypes: ['OFFICIAL_FIRE_DEPARTMENT_CLEARANCE_CERTIFICATE', 'PAYAN_KAR_ENDORSEMENT'],
      verificationMethodDescription: 'استعلام سیستمی از سامانه شهرسازی و سازمان آتش‌نشانی.',
      responsibleAuthorityName: 'سازمان آتش‌نشانی و خدمات ایمنی شهرداری',
      effectiveFromIso: '2016-09-01',
      internalReviewerNotes: 'RESTRICTED_COMPLIANCE_NOTE',
    },
    ADMIN_ACTOR,
  );

  // 9. Requirement vs compliance distinction & 6/8. Property Regulatory Profile
  const fullProfile = await applicabilityAndProfileService.buildPropertyRegulatoryProfile(
    { propertyId: 'prop_tehran_punak_01', transactionContext: 'SALE_TRANSFER', asOfDateIso: '2025-01-10' },
    PUBLIC_ACTOR,
  );
  assert.equal(fullProfile.resolvedGeography.geographyVerified, true);
  assert.equal(fullProfile.resolvedGeography.neighborhoodNameFa, 'پونک');
  assert.equal(fullProfile.landUseRestrictions[0].outcomeState, 'CONFIRMED_APPLICABLE');
  assert.equal(fullProfile.buildingUseAndSafetyRules[0].outcomeState, 'CONFIRMED_APPLICABLE');
  assert.equal(fullProfile.detectedRegulatoryConflicts.length, 1);
  assert.equal(fullProfile.applicableComplianceRequirements[0].complianceEstablished, false);
  assert.equal('internalReviewerNotes' in fullProfile.applicableComplianceRequirements[0].requirement, false);

  // 10. Missing-data uncertainty handling
  const partialProfile = await applicabilityAndProfileService.buildPropertyRegulatoryProfile(
    { cityId: 'tehran', neighborhoodId: 'پونک', propertyCategory: 'RESIDENTIAL_APARTMENT', asOfDateIso: '2025-01-10' },
    PUBLIC_ACTOR,
  );
  assert.equal(partialProfile.landUseRestrictions[0].outcomeState, 'POTENTIALLY_APPLICABLE_NEEDS_INFO');
  assert.ok(partialProfile.landUseRestrictions[0].missingRequiredFields.includes('plotAreaSqm'));
  assert.ok(partialProfile.incompleteOrMissingDataWarnings.length > 0);

  const karajProfile = await applicabilityAndProfileService.buildPropertyRegulatoryProfile(
    {
      cityId: 'karaj',
      neighborhoodId: 'گوهردشت',
      propertyCategory: 'RESIDENTIAL_APARTMENT',
      floorsCount: 3,
      isNearActiveFaultLine: false,
      asOfDateIso: '2025-01-10',
    },
    PUBLIC_ACTOR,
  );
  assert.equal(karajProfile.landUseRestrictions.length, 0);
  assert.equal(karajProfile.buildingUseAndSafetyRules.length, 0);

  // 11. Unauthorized administrative operations rejection (401 and 403)
  await assert.rejects(
    () =>
      sourceAndProvisionService.createRegulatorySource(
        {
          officialTitleFa: 'Unauthorized attempt',
          issuingAuthority: 'None',
          jurisdictionScope: { level: 'NATIONAL', countryCode: 'IR' },
          sourceCategory: 'NATIONAL_STATUTE',
          reliabilityTier: 'PRIMARY_OFFICIAL_STATUTE',
          officialReferenceNumber: 'UNAUTH-1',
          publicationDateIso: '2024-01-01',
          effectiveFromIso: '2024-01-01',
        },
        PUBLIC_ACTOR,
      ),
    (err: unknown) => err instanceof LegalRegulatoryError && err.statusCode === 401,
  );

  await assert.rejects(
    () => sourceAndProvisionService.verifyRegulatorySource(nationalSource.id, 'Regular user', REGULAR_USER_ACTOR),
    (err: unknown) => err instanceof LegalRegulatoryError && err.statusCode === 403,
  );

  // 12. Public vs restricted data access & unverified draft isolation
  const publicSourceView = await sourceAndProvisionService.getRegulatorySourceForViewer(nationalSource.id, PUBLIC_ACTOR);
  assert.equal('internalReviewerNotes' in publicSourceView, false);
  assert.equal('restrictedAuditMetadata' in publicSourceView, false);

  const adminSourceView = await sourceAndProvisionService.getRegulatorySourceForViewer(nationalSource.id, ADMIN_ACTOR);
  assert.equal(
    (adminSourceView as typeof nationalSource).internalReviewerNotes,
    'CONFIDENTIAL_REVIEWER_NOTE_DO_NOT_LEAK',
  );

  const unverifiedDraftSource = await sourceAndProvisionService.createRegulatorySource(
    {
      id: 'src_unverified_draft_01',
      officialTitleFa: 'پیش‌نویس تایید نشده بخشنامه آزمایشی',
      issuingAuthority: 'شهرداری',
      jurisdictionScope: { level: 'NATIONAL', countryCode: 'IR' },
      sourceCategory: 'SECONDARY_LEGAL_COMMENTARY',
      reliabilityTier: 'UNVERIFIED_EXTERNAL_REFERENCE',
      officialReferenceNumber: 'DRAFT-UNVERIFIED-01',
      publicationDateIso: '2025-01-01',
      effectiveFromIso: '2025-01-01',
    },
    ADMIN_ACTOR,
  );
  await assert.rejects(
    () => sourceAndProvisionService.getRegulatorySourceForViewer(unverifiedDraftSource.id, PUBLIC_ACTOR),
    (err: unknown) => err instanceof LegalRegulatoryError && err.statusCode === 403,
  );

  // 14. Pagination limits and cursor traversal
  const page1 = await applicabilityAndProfileService.searchProvisions({ limit: 1 }, PUBLIC_ACTOR);
  assert.equal(page1.items.length, 1);
  assert.equal(page1.limit, 1);
  assert.ok(page1.nextCursor !== null);

  const page2 = await applicabilityAndProfileService.searchProvisions(
    { limit: 500, cursor: page1.nextCursor },
    PUBLIC_ACTOR,
  );
  assert.equal(page2.limit, 100);
  assert.equal(page2.items.length, 1);
  assert.notEqual(page2.items[0].id, page1.items[0].id);

  // 15. Persistence failures and optimistic concurrency conflict handling
  store.simulateNextWriteFailure(1);
  await assert.rejects(
    () => sourceAndProvisionService.verifyRegulatorySource(tehranDistrictSource.id, 'Outage test', ADMIN_ACTOR),
    (err: unknown) =>
      err instanceof LegalRegulatoryError && err.code === 'PERSISTENCE_UNAVAILABLE' && err.statusCode === 503,
  );

  await assert.rejects(
    () => sourceAndProvisionService.verifyRegulatorySource(tehranDistrictSource.id, 'Stale version', ADMIN_ACTOR, 999),
    (err: unknown) =>
      err instanceof LegalRegulatoryError && err.code === 'CONCURRENT_MODIFICATION_CONFLICT' && err.statusCode === 409,
  );

  // 16. AI-generated content remaining non-authoritative
  const aiSummary = await applicabilityAndProfileService.recordNonAuthoritativeAiSuggestion(
    {
      targetEntityType: 'PROVISION',
      targetEntityId: provZoning.id,
      targetEntityVersion: 2,
      summaryText: 'خلاصه کمکی هوش مصنوعی (غیرمعتبر از نظر حقوقی): حداکثر ۶ طبقه در پونک مجاز است.',
      suggestedCategoryTags: ['تراکم', 'پونک'],
      modelIdentifier: 'gemini-2.5-flash',
      promptTemplateVersion: 'legal-summarizer-v1.0',
    },
    ADMIN_ACTOR,
  );
  assert.equal(aiSummary.isAuthoritative, false);
  assert.equal(aiSummary.requiresHumanReview, true);

  const provAfterAi = await sourceAndProvisionService.getProvisionForViewer(provZoning.id, ADMIN_ACTOR);
  assert.ok(provAfterAi.originalTextVerbatim.includes('اصلاحیه ۱۴۰۲'));
  assert.equal(provAfterAi.nonAuthoritativeAiSummary?.isAuthoritative, false);

  await assert.rejects(
    () =>
      applicabilityAndProfileService.recordNonAuthoritativeAiSuggestion(
        {
          targetEntityType: 'PROVISION',
          targetEntityId: provZoning.id,
          targetEntityVersion: 3,
          summaryText: 'Illegal authoritative AI override',
          modelIdentifier: 'gemini-2.5-flash',
          promptTemplateVersion: 'v1',
          attemptSetAuthoritative: true,
        },
        ADMIN_ACTOR,
      ),
    (err: unknown) =>
      err instanceof LegalRegulatoryError && err.code === 'AUTHORITATIVE_AI_VIOLATION' && err.statusCode === 422,
  );

  // 17. Prevention of direct writes into other modules' data
  assert.throws(
    () => propertyAdapter.attemptProhibitedExternalWrite('prop_tehran_punak_01'),
    (err: unknown) =>
      err instanceof LegalRegulatoryError && err.code === 'CROSS_MODULE_WRITE_PROHIBITED' && err.statusCode === 403,
  );

  console.log('✅ [LEGAL & REGULATORY INTELLIGENCE MODULE] All 17 test scenarios passed.');
}

runTests().catch((err) => {
  console.error('❌ [LEGAL & REGULATORY INTELLIGENCE MODULE] Test suite failed:', err);
  process.exit(1);
});
