/**
 * Comprehensive Automated Tests for Property Insurance & Coverage Intelligence Module
 * (`server/modules/property-insurance/__tests__/propertyInsurance.test.ts`)
 * Exclusive ownership: `server/modules/property-insurance/`
 */

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
  createPropertyInsuranceService,
  InMemoryPropertyInsuranceRepository,
  InsuranceDomainEvent,
  InsuranceEventOutboxPublisher
} from '../index.js';

describe('Property Insurance Module - Comprehensive Test Suite', () => {
  const publishedEvents: InsuranceDomainEvent[] = [];
  const testPublisher: InsuranceEventOutboxPublisher = {
    publish: async (event) => {
      publishedEvents.push(event);
    }
  };

  function setup() {
    publishedEvents.length = 0;
    const repo = new InMemoryPropertyInsuranceRepository();
    const service = createPropertyInsuranceService({
      repository: repo,
      outboxPublisher: testPublisher
    });
    return { repo, service };
  }

  it('manages insurance institutions, products, and version increments with CAS', async () => {
    const { service } = setup();

    // 1. Register institution
    const inst = await service.registerInstitution({
      institutionId: 'insurer-iran',
      nameFa: 'بیمه ایران',
      nameEn: 'Iran Insurance Co',
      category: 'general_insurer',
      jurisdiction: 'IR',
      regulatoryCode: 'CENTRAL-INS-001',
      verificationStatus: 'verified',
      lastVerifiedTimestampIso: new Date().toISOString()
    });

    assert.equal(inst.institutionId, 'insurer-iran');
    assert.equal(publishedEvents.length, 1);
    assert.equal(publishedEvents[0].eventType, 'property_insurance.institution.created');

    // 2. Create product
    const product = await service.createProduct({
      productId: 'prod-fire-residential',
      institutionId: 'insurer-iran',
      productNameFa: 'بیمه جامع آتش‌سوزی و خطرات تبعی منازل مسکونی',
      category: 'residential_building',
      jurisdiction: 'IR',
      currency: 'IRR',
      eligiblePropertyCategories: ['residential_apartment', 'residential_villa'],
      eligibleConstructionTypes: ['steel_frame', 'reinforced_concrete'],
      coverages: [
        {
          coverageId: 'cov-fire',
          category: 'fire_and_explosion',
          nameFa: 'پوشش آتش‌سوزی، صاعقه و انفجار',
          descriptionFa: 'پوشش استاندارد خسارت‌های ناشی از آتش‌سوزی، صاعقه و انفجار اعیان و اثاثیه',
          isStandard: true,
          isAggregateLimit: false,
          coverageBasis: 'replacement_cost',
          currency: 'IRR'
        },
        {
          coverageId: 'cov-earthquake',
          category: 'earthquake_and_volcano',
          nameFa: 'زلزله و آتشفشان',
          descriptionFa: 'پوشش خسارات مستقیم ناشی از زلزله',
          isStandard: false,
          isAggregateLimit: false,
          coverageBasis: 'replacement_cost',
          currency: 'IRR'
        }
      ],
      deductibles: [
        {
          deductibleId: 'ded-quake',
          coverageCategory: 'earthquake_and_volcano',
          type: 'percentage_of_loss',
          percentageRate: 15.0,
          currency: 'IRR'
        }
      ],
      exclusions: [
        {
          exclusionId: 'ex-war',
          category: 'general_exceptions',
          titleFa: 'جنگ و شورش',
          originalWordingFa: 'خسارت‌های ناشی از جنگ، شورش و بلوا تحت پوشش نمی‌باشد.',
          normalizedDescriptionFa: 'استثنای خسارات ناشی از ناآرامی‌های مدنی و عملیات جنگی',
          sourceDocumentReference: 'آیین‌نامه شماره ۲۱ شورای عالی بیمه'
        }
      ],
      eligibilityRules: [
        {
          ruleId: 'rule-max-age',
          criterionType: 'max_building_age_years',
          targetValue: 35,
          isMandatory: true,
          descriptionFa: 'حداکثر سن مجاز ساختمان ۳۵ سال است.',
          sourceReference: 'شرایط عمومی بیمه آتش‌سوزی'
        }
      ],
      requiredDocumentsChecklist: [
        { documentKey: 'ownership-deed', nameFa: 'سند مالکیت یا اجاره‌نامه', isMandatory: true }
      ],
      policyDurationMonths: 12,
      availabilityStatus: 'active',
      sourceReference: 'https://iraninsurance.ir/fire-policy',
      lastVerifiedTimestampIso: new Date().toISOString(),
      effectiveFromIso: new Date().toISOString()
    });

    assert.equal(product.productVersion, 1);
    assert.equal(product.coverages.length, 2);

    // 3. Increment version
    const v2 = await service.updateProductVersion('prod-fire-residential', {
      policyDurationMonths: 24
    });
    assert.equal(v2.productVersion, 2);
    assert.equal(v2.policyDurationMonths, 24);

    const history = await service.getProductHistory('prod-fire-residential');
    assert.equal(history.length, 2);
  });

  it('evaluates insured value adequacy and flags underinsurance / overinsurance', () => {
    const { service } = setup();

    // 1. Underinsurance (Declared 5B vs Replacement 10B -> 50% ratio, under 90%)
    const under = service.analyzeInsuredValueAdequacy(10_000_000_000, 5_000_000_000);
    assert.equal(under.status, 'underinsured');
    assert.equal(under.proportionalAverageRuleWarning, true);
    assert.ok(under.explanationFa.includes('کم‌بیمه‌گی'));

    // 2. Overinsurance (Declared 15B vs Replacement 10B -> 150% ratio, over 115%)
    const over = service.analyzeInsuredValueAdequacy(10_000_000_000, 15_000_000_000);
    assert.equal(over.status, 'overinsured');
    assert.equal(over.proportionalAverageRuleWarning, false);

    // 3. Adequate (Declared 10B vs Replacement 10B -> 100% ratio)
    const adequate = service.analyzeInsuredValueAdequacy(10_000_000_000, 10_000_000_000);
    assert.equal(adequate.status, 'adequately_insured');
    assert.equal(adequate.proportionalAverageRuleWarning, false);
  });

  it('calculates deductible deductions accurately across different structures', () => {
    const { service } = setup();

    // Fixed amount deductible (50M on 200M loss)
    const res1 = service.calculateDeductible(200_000_000, {
      deductibleId: 'ded-1',
      coverageCategory: 'fire_and_explosion',
      type: 'fixed_amount',
      fixedAmount: 50_000_000,
      currency: 'IRR'
    });
    assert.equal(res1.deductibleAmount, 50_000_000);
    assert.equal(res1.netPayableClaimAmount, 150_000_000);

    // Percentage of loss deductible (10% on 300M loss)
    const res2 = service.calculateDeductible(300_000_000, {
      deductibleId: 'ded-2',
      coverageCategory: 'earthquake_and_volcano',
      type: 'percentage_of_loss',
      percentageRate: 10,
      currency: 'IRR'
    });
    assert.equal(res2.deductibleAmount, 30_000_000);
    assert.equal(res2.netPayableClaimAmount, 270_000_000);

    // Bounded percentage (10% with min 40M) on 200M loss: 10% is 20M, bounded by min 40M
    const res3 = service.calculateDeductible(200_000_000, {
      deductibleId: 'ded-3',
      coverageCategory: 'flood_and_water_damage',
      type: 'percentage_with_min_max',
      percentageRate: 10,
      minAmount: 40_000_000,
      currency: 'IRR'
    });
    assert.equal(res3.deductibleAmount, 40_000_000);
    assert.equal(res3.netPayableClaimAmount, 160_000_000);
  });

  it('estimates indicative premiums deterministically with documented formula basis', async () => {
    const { service } = setup();

    await service.registerInstitution({
      institutionId: 'inst-dana',
      nameFa: 'بیمه دانا',
      category: 'property_insurer',
      jurisdiction: 'IR',
      verificationStatus: 'verified',
      lastVerifiedTimestampIso: new Date().toISOString()
    });

    await service.createProduct({
      productId: 'prod-dana-villa',
      institutionId: 'inst-dana',
      productNameFa: 'بیمه ویلا',
      category: 'residential_building',
      jurisdiction: 'IR',
      currency: 'IRR',
      eligiblePropertyCategories: ['residential_villa'],
      eligibleConstructionTypes: ['steel_frame'],
      coverages: [],
      deductibles: [],
      exclusions: [],
      eligibilityRules: [],
      requiredDocumentsChecklist: [],
      policyDurationMonths: 12,
      availabilityStatus: 'active',
      sourceReference: 'https://dana-insurance.ir',
      lastVerifiedTimestampIso: new Date().toISOString(),
      effectiveFromIso: new Date().toISOString()
    });

    const estimate = await service.calculatePremiumEstimate({
      productId: 'prod-dana-villa',
      buildingReplacementValue: 10_000_000_000, // 10B IRR
      contentsValue: 2_000_000_000, // 2B IRR
      formulaBasis: {
        baseRatePerThousandBuilding: 0.6,
        baseRatePerThousandContents: 0.8,
        earthquakeZoneFactor: 1.5, // 50% surcharge
        floodFactor: 0.1, // 10% surcharge
        constructionMultiplier: 1.0,
        applicableTaxesPercent: 9.0 // 9% VAT
      }
    });

    assert.ok(estimate.baseBuildingPremium > 0);
    assert.ok(estimate.contentsPremium > 0);
    assert.ok(estimate.earthquakeSurcharge > 0);
    assert.ok(estimate.taxesAndOfficialLevies > 0);
    assert.ok(estimate.totalIndicativeAnnualPremium > 0);
    assert.ok(estimate.disclaimerFa.includes('صرفاً برآورد اولیه'));
  });

  it('evaluates explainable eligibility criteria and identifies unmet conditions', async () => {
    const { service } = setup();

    await service.registerInstitution({
      institutionId: 'inst-alborz',
      nameFa: 'بیمه البرز',
      category: 'general_insurer',
      jurisdiction: 'IR',
      verificationStatus: 'verified',
      lastVerifiedTimestampIso: new Date().toISOString()
    });

    await service.createProduct({
      productId: 'prod-alborz-apart',
      institutionId: 'inst-alborz',
      productNameFa: 'بیمه آتش‌سوزی آپارتمان',
      category: 'residential_building',
      jurisdiction: 'IR',
      currency: 'IRR',
      eligiblePropertyCategories: ['residential_apartment'],
      eligibleConstructionTypes: ['steel_frame'],
      coverages: [],
      deductibles: [],
      exclusions: [],
      eligibilityRules: [
        {
          ruleId: 'rule-extinguisher',
          criterionType: 'requires_fire_extinguisher',
          targetValue: true,
          isMandatory: true,
          descriptionFa: 'کپسول آتش‌نشانی الزامی است',
          sourceReference: 'دستورالعمل بیمه البرز'
        }
      ],
      requiredDocumentsChecklist: [],
      policyDurationMonths: 12,
      availabilityStatus: 'active',
      sourceReference: 'https://alborz.ir',
      lastVerifiedTimestampIso: new Date().toISOString(),
      effectiveFromIso: new Date().toISOString()
    });

    // Incompatible construction (masonry vs steel_frame) and missing extinguisher
    const evalReport = await service.evaluateEligibility('prod-alborz-apart', {
      propertyCategory: 'residential_apartment',
      constructionType: 'traditional_masonry',
      declaredBuildingValue: 5_000_000_000,
      hasFireExtinguisher: false
    });

    assert.equal(evalReport.appearsEligible, false);
    assert.equal(evalReport.allMandatoryPassed, false);
    assert.ok(evalReport.unmetRules.some(r => r.criterionType === 'allowed_construction_types'));
    assert.ok(evalReport.unmetRules.some(r => r.criterionType === 'requires_fire_extinguisher'));
  });

  it('compares insurance products by coverage completeness and flags stale data', async () => {
    const { service } = setup();

    await service.registerInstitution({
      institutionId: 'inst-comp',
      nameFa: 'بیمه نوین',
      category: 'general_insurer',
      jurisdiction: 'IR',
      verificationStatus: 'verified',
      lastVerifiedTimestampIso: new Date().toISOString()
    });

    // Product 1: Fresh with 3 standard coverages
    await service.createProduct({
      productId: 'prod-fresh-comp',
      institutionId: 'inst-comp',
      productNameFa: 'طرح جامع نوین',
      category: 'residential_building',
      jurisdiction: 'IR',
      currency: 'IRR',
      eligiblePropertyCategories: ['residential_apartment'],
      eligibleConstructionTypes: ['steel_frame'],
      coverages: [
        { coverageId: 'c1', category: 'fire_and_explosion', nameFa: 'آتش‌سوزی', descriptionFa: '', isStandard: true, isAggregateLimit: false, coverageBasis: 'replacement_cost', currency: 'IRR' },
        { coverageId: 'c2', category: 'earthquake_and_volcano', nameFa: 'زلزله', descriptionFa: '', isStandard: true, isAggregateLimit: false, coverageBasis: 'replacement_cost', currency: 'IRR' },
        { coverageId: 'c3', category: 'flood_and_water_damage', nameFa: 'سیل', descriptionFa: '', isStandard: true, isAggregateLimit: false, coverageBasis: 'replacement_cost', currency: 'IRR' }
      ],
      deductibles: [],
      exclusions: [],
      eligibilityRules: [],
      requiredDocumentsChecklist: [],
      policyDurationMonths: 12,
      availabilityStatus: 'active',
      sourceReference: 'https://novin.ir/comprehensive',
      lastVerifiedTimestampIso: new Date().toISOString(),
      effectiveFromIso: new Date().toISOString()
    });

    // Product 2: Stale with 1 standard coverage (verified 200 days ago)
    const staleDateIso = new Date(Date.now() - 200 * 24 * 60 * 60 * 1000).toISOString();
    await service.createProduct({
      productId: 'prod-stale-comp',
      institutionId: 'inst-comp',
      productNameFa: 'طرح پایه قدیمی',
      category: 'residential_building',
      jurisdiction: 'IR',
      currency: 'IRR',
      eligiblePropertyCategories: ['residential_apartment'],
      eligibleConstructionTypes: ['steel_frame'],
      coverages: [
        { coverageId: 'c1', category: 'fire_and_explosion', nameFa: 'فقط حریق', descriptionFa: '', isStandard: true, isAggregateLimit: false, coverageBasis: 'replacement_cost', currency: 'IRR' }
      ],
      deductibles: [],
      exclusions: [],
      eligibilityRules: [],
      requiredDocumentsChecklist: [],
      policyDurationMonths: 12,
      availabilityStatus: 'active',
      sourceReference: 'https://novin.ir/old',
      lastVerifiedTimestampIso: staleDateIso,
      effectiveFromIso: staleDateIso
    });

    const report = await service.compareProducts({
      propertyValue: 8_000_000_000,
      propertyCategory: 'residential_apartment',
      constructionType: 'steel_frame',
      buildingAgeYears: 5,
      currency: 'IRR',
      jurisdiction: 'IR',
      rankingMethodology: 'most_comprehensive_coverage'
    });

    assert.equal(report.comparedProducts.length, 2);
    assert.equal(report.comparedProducts[0].product.productId, 'prod-fresh-comp');
    assert.equal(report.comparedProducts[0].standardCoveragesCount, 3);
    assert.equal(report.comparedProducts[0].dataFreshnessStatus, 'fresh');

    assert.equal(report.comparedProducts[1].product.productId, 'prod-stale-comp');
    assert.equal(report.comparedProducts[1].dataFreshnessStatus, 'stale');
  });

  it('manages quotation references, policy renewal tracking, and claim references', async () => {
    const { service } = setup();

    await service.registerInstitution({
      institutionId: 'inst-asia',
      nameFa: 'بیمه آسیا',
      category: 'general_insurer',
      jurisdiction: 'IR',
      verificationStatus: 'verified',
      lastVerifiedTimestampIso: new Date().toISOString()
    });

    await service.createProduct({
      productId: 'prod-asia-1',
      institutionId: 'inst-asia',
      productNameFa: 'بیمه حریق آسیا',
      category: 'residential_building',
      jurisdiction: 'IR',
      currency: 'IRR',
      eligiblePropertyCategories: ['residential_apartment'],
      eligibleConstructionTypes: ['steel_frame'],
      coverages: [],
      deductibles: [],
      exclusions: [],
      eligibilityRules: [],
      requiredDocumentsChecklist: [],
      policyDurationMonths: 12,
      availabilityStatus: 'active',
      sourceReference: 'https://asia.ir',
      lastVerifiedTimestampIso: new Date().toISOString(),
      effectiveFromIso: new Date().toISOString()
    });

    // 1. Create quote
    const quote = await service.createQuoteReference({
      productId: 'prod-asia-1',
      userId: 'user-homeowner-1',
      propertyId: 'prop-tehran-12',
      declaredBuildingValue: 6_000_000_000,
      quotedAnnualPremium: 12_000_000,
      currency: 'IRR'
    });
    assert.equal(quote.status, 'draft');

    // 2. Register policy reference
    const now = new Date();
    const endDate = new Date(now.getTime() + 15 * 24 * 60 * 60 * 1000); // Expires in 15 days
    const policy = await service.registerPolicyReference({
      userId: 'user-homeowner-1',
      propertyId: 'prop-tehran-12',
      institutionId: 'inst-asia',
      productId: 'prod-asia-1',
      externalPolicyNumber: 'POL-ASIA-882194',
      policyStartDateIso: now.toISOString(),
      policyEndDateIso: endDate.toISOString(),
      annualPremiumPaid: 12_000_000,
      currency: 'IRR'
    });
    assert.equal(policy.status, 'active_user_reported');

    // List expiring policies
    const expiringIn30Days = await service.getExpiringPolicies(
      new Date(now.getTime() + 30 * 24 * 60 * 60 * 1000).toISOString()
    );
    assert.ok(expiringIn30Days.some(p => p.policyReferenceId === policy.policyReferenceId));

    // 3. Register claim reference
    const claim = await service.registerClaimReference({
      policyReferenceId: policy.policyReferenceId,
      propertyId: 'prop-tehran-12',
      institutionId: 'inst-asia',
      userId: 'user-homeowner-1',
      incidentDateIso: now.toISOString(),
      incidentCategory: 'flood_and_water_damage',
      userDescriptionFa: 'نشت لوله آب و تخریب پارکت پذیرایی'
    });
    assert.equal(claim.status, 'incident_reported');

    // Update claim status with source provenance
    const updatedClaim = await service.updateClaimStatus(
      claim.claimReferenceId,
      'insurer_acknowledged',
      'insurer_confirmed',
      undefined
    );
    assert.equal(updatedClaim.status, 'insurer_acknowledged');
    assert.equal(updatedClaim.statusSource, 'insurer_confirmed');
  });
});
