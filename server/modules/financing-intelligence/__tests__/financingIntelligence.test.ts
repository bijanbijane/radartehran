/**
 * Comprehensive Automated Tests for Mortgage & Financing Intelligence Module
 * (`server/modules/financing-intelligence/__tests__/financingIntelligence.test.ts`)
 * Exclusive ownership: `server/modules/financing-intelligence/`
 */

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
  createFinancingIntelligenceService,
  InMemoryFinancingRepository,
  FinancingDomainEvent,
  FinancingEventOutboxPublisher
} from '../index.js';

describe('Financing Intelligence Module - Comprehensive Test Suite', () => {
  const publishedEvents: FinancingDomainEvent[] = [];
  const testPublisher: FinancingEventOutboxPublisher = {
    publish: async (event) => {
      publishedEvents.push(event);
    }
  };

  function setup() {
    publishedEvents.length = 0;
    const repo = new InMemoryFinancingRepository();
    const service = createFinancingIntelligenceService({
      repository: repo,
      outboxPublisher: testPublisher
    });
    return { repo, service };
  }

  it('manages institutions, products, and version increments with CAS checks', async () => {
    const { service } = setup();

    // 1. Register institution
    const inst = await service.registerInstitution({
      institutionId: 'bank-maskan',
      nameFa: 'بانک مسکن ایران',
      nameEn: 'Bank Maskan',
      institutionType: 'specialized_housing_bank',
      jurisdiction: 'IR',
      regulatoryCode: 'BM-IR-001',
      verificationStatus: 'verified',
      lastVerifiedTimestampIso: new Date().toISOString()
    });

    assert.equal(inst.institutionId, 'bank-maskan');
    assert.equal(publishedEvents.length, 1);
    assert.equal(publishedEvents[0].eventType, 'financing.institution.created');

    // 2. Create product
    const product = await service.createProduct({
      productId: 'prod-maskan-young',
      institutionId: 'bank-maskan',
      productNameFa: 'تسهیلات جوانان مسکن',
      category: 'first_time_homebuyer',
      jurisdiction: 'IR',
      currency: 'IRR',
      minFinancingAmount: 2_000_000_000,
      maxFinancingAmount: 12_000_000_000,
      minRepaymentPeriodMonths: 60,
      maxRepaymentPeriodMonths: 240,
      allowedRepaymentMethods: ['equal_installments', 'equal_principal'],
      rateStructure: {
        rateModelId: 'rate-young-fixed',
        rateType: 'fixed',
        nominalAnnualRatePercent: 9.0,
        effectiveDateIso: new Date().toISOString()
      },
      fees: [
        { feeId: 'fee-eval', feeNameFa: 'کارمزد ارزیابی ملک', isMandatory: true, feeCategory: 'valuation', fixedAmount: 50_000_000, currency: 'IRR' }
      ],
      eligibilityRules: [
        { ruleId: 'rule-first-time', criterionType: 'first_time_buyer_only', targetValue: true, isMandatory: true, descriptionFa: 'متقاضی باید خانه‌اولی باشد.', sourceReference: 'دستورالعمل بانک مسکن' }
      ],
      requiredDocumentsChecklist: [
        { documentKey: 'id-card', nameFa: 'کارت ملی و شناسنامه', isMandatory: true },
        { documentKey: 'income-cert', nameFa: 'گواهی کسر از حقوق', isMandatory: true }
      ],
      requiredBorrowerContributionPercent: 20,
      maxLtvPercent: 80,
      availabilityStatus: 'active',
      sourceReference: 'https://bank-maskan.ir/young-account',
      lastVerifiedTimestampIso: new Date().toISOString(),
      effectiveFromIso: new Date().toISOString()
    });

    assert.equal(product.productVersion, 1);
    assert.equal(product.productId, 'prod-maskan-young');

    // 3. Update version
    const v2 = await service.updateProductVersion('prod-maskan-young', {
      maxFinancingAmount: 15_000_000_000
    });
    assert.equal(v2.productVersion, 2);
    assert.equal(v2.maxFinancingAmount, 15_000_000_000);

    // 4. Verify history preservation
    const history = await service.getProductHistory('prod-maskan-young');
    assert.equal(history.length, 2);
    assert.equal(history[0].maxFinancingAmount, 12_000_000_000);
    assert.equal(history[1].maxFinancingAmount, 15_000_000_000);
  });

  it('calculates Loan-To-Value (LTV) and borrower contribution accurately', () => {
    const { service } = setup();

    const result = service.calculateLtv(20_000_000_000, 14_000_000_000);
    assert.equal(result.ltvPercent, 70);
    assert.equal(result.borrowerContributionAmount, 6_000_000_000);
    assert.equal(result.borrowerContributionPercent, 30);

    // Invalid zero or negative property value
    assert.throws(() => {
      service.calculateLtv(0, 5_000_000);
    }, /ارزش ملک باید عددی مثبت و بزرگ‌تر از صفر باشد/);
  });

  it('calculates equal installment (Annuity) amortization schedule correctly', async () => {
    const { service } = setup();

    // 120,000,000 IRR, 12% annual rate, 12 months
    const schedule = await service.calculateAmortization(
      120_000_000,
      12.0,
      12,
      'equal_installments',
      'IRR'
    );

    assert.equal(schedule.installments.length, 12);
    // At 12% annual (1% monthly) on 120,000,000 for 12 months:
    // monthly installment is approx 10,661,855 IRR
    assert.ok(schedule.monthlyInstallmentAmount > 10_000_000 && schedule.monthlyInstallmentAmount < 11_000_000);
    assert.equal(schedule.installments[11].remainingPrincipal, 0);
    assert.ok(schedule.totalInterestAmount > 0);
    assert.equal(schedule.totalRepaymentAmount, 120_000_000 + schedule.totalInterestAmount);
  });

  it('calculates equal principal (German) and interest-only amortization schedules', async () => {
    const { service } = setup();

    // Equal principal: principal is strictly 10,000,000 each month
    const germanSchedule = await service.calculateAmortization(
      120_000_000,
      12.0,
      12,
      'equal_principal',
      'IRR'
    );
    assert.equal(germanSchedule.installments.length, 12);
    assert.equal(germanSchedule.installments[0].principalComponent, 10_000_000);
    assert.equal(germanSchedule.installments[5].principalComponent, 10_000_000);
    assert.ok(germanSchedule.installments[0].installmentAmount > germanSchedule.installments[11].installmentAmount);

    // Interest-only: principal is 0 for first 11 months, full principal at month 12
    const ioSchedule = await service.calculateAmortization(
      120_000_000,
      12.0,
      12,
      'interest_only',
      'IRR'
    );
    assert.equal(ioSchedule.installments[0].principalComponent, 0);
    assert.equal(ioSchedule.installments[0].interestComponent, 1_200_000); // 120M * 1%
    assert.equal(ioSchedule.installments[11].principalComponent, 120_000_000);
    assert.equal(ioSchedule.installments[11].remainingPrincipal, 0);
  });

  it('evaluates explainable product eligibility criteria and identifies unmet rules', async () => {
    const { service } = setup();

    await service.registerInstitution({
      institutionId: 'bank-test',
      nameFa: 'بانک آزمایشی',
      institutionType: 'commercial_bank',
      jurisdiction: 'IR',
      verificationStatus: 'verified',
      lastVerifiedTimestampIso: new Date().toISOString()
    });

    await service.createProduct({
      productId: 'prod-test-criteria',
      institutionId: 'bank-test',
      productNameFa: 'وام مسکن ویژه',
      category: 'residential_purchase',
      jurisdiction: 'IR',
      currency: 'IRR',
      minFinancingAmount: 1_000_000_000,
      maxFinancingAmount: 5_000_000_000,
      minRepaymentPeriodMonths: 12,
      maxRepaymentPeriodMonths: 120,
      allowedRepaymentMethods: ['equal_installments'],
      rateStructure: {
        rateModelId: 'rate-1',
        rateType: 'fixed',
        nominalAnnualRatePercent: 18.0,
        effectiveDateIso: new Date().toISOString()
      },
      fees: [],
      eligibilityRules: [
        { ruleId: 'rule-first-buyer', criterionType: 'first_time_buyer_only', targetValue: true, isMandatory: true, descriptionFa: 'فقط خانه‌اولی', sourceReference: 'قوانین بانک' }
      ],
      requiredDocumentsChecklist: [{ documentKey: 'doc1', nameFa: 'سند ملک', isMandatory: true }],
      requiredBorrowerContributionPercent: 20,
      maxLtvPercent: 80,
      availabilityStatus: 'active',
      sourceReference: 'https://bank-test.ir',
      lastVerifiedTimestampIso: new Date().toISOString(),
      effectiveFromIso: new Date().toISOString()
    });

    // 1. Query with amount exceeding max limit and not a first-time buyer
    const eval1 = await service.evaluateEligibility('prod-test-criteria', {
      requestedAmount: 8_000_000_000, // Exceeds 5B
      propertyValue: 10_000_000_000,
      isFirstTimeBuyer: false // Fails rule
    });

    assert.equal(eval1.appearsEligible, false);
    assert.equal(eval1.allMandatoryPassed, false);
    assert.ok(eval1.unmetRules.length >= 2);
    assert.ok(eval1.unmetRules.some(r => r.criterionType === 'max_financing_amount'));
    assert.ok(eval1.unmetRules.some(r => r.criterionType === 'first_time_buyer_only'));

    // 2. Query meeting all conditions
    const eval2 = await service.evaluateEligibility('prod-test-criteria', {
      requestedAmount: 4_000_000_000,
      propertyValue: 10_000_000_000, // LTV 40% < 80%
      requestedRepaymentPeriodMonths: 60,
      isFirstTimeBuyer: true
    });

    assert.equal(eval2.appearsEligible, true);
    assert.equal(eval2.allMandatoryPassed, true);
    assert.equal(eval2.unmetRules.length, 0);
  });

  it('models affordability scenario with DTI thresholds and residual income', async () => {
    const { service } = setup();

    const scenario = await service.evaluateAffordabilityScenario({
      userMonthlyNetIncome: 500_000_000, // 500M IRR
      userMonthlyExistingDebtObligations: 50_000_000, // 50M IRR (10% current DTI)
      userEstimatedLivingExpenses: 150_000_000, // 150M IRR
      proposedFinancingAmount: 4_000_000_000, // 4B IRR
      proposedRepaymentPeriodMonths: 60,
      proposedAnnualInterestRatePercent: 18.0,
      currency: 'IRR',
      maxAllowedDtiPercent: 40
    });

    assert.equal(scenario.currentDebtToIncomePercent, 10);
    assert.ok(scenario.monthlyInstallment > 0);
    assert.ok(scenario.projectedDebtToIncomePercent > 10);
    assert.ok(scenario.recommendedMaxFinancingAmount > 0);
    assert.ok(scenario.disclaimerFa.includes('صرفاً فرضی و تحلیلی'));
  });

  it('calculates early repayment and refinancing scenarios with fee accounting', async () => {
    const { service } = setup();

    // Early repayment
    const earlyRepay = await service.calculateEarlyRepaymentScenario({
      originalPrincipal: 1_000_000_000,
      annualInterestRatePercent: 18.0,
      originalPeriodMonths: 60,
      repaymentMethod: 'equal_installments',
      currentInstallmentIndex: 12,
      prepaymentAmount: 200_000_000,
      strategy: 'reduce_installment',
      prepaymentPenaltyPercent: 1.0 // 1% penalty = 2,000,000
    });

    assert.equal(earlyRepay.prepaymentPenaltyFee, 2_000_000);
    assert.ok(earlyRepay.remainingPrincipalAfterPrepayment < earlyRepay.remainingPrincipalBeforePrepayment);
    assert.ok(earlyRepay.newMonthlyInstallment > 0);

    // Refinancing
    const refi = await service.calculateRefinancingScenario({
      currentRemainingPrincipal: 800_000_000,
      currentMonthlyInstallment: 25_000_000,
      currentRemainingMonths: 48,
      currentInterestRatePercent: 23.0,
      proposedNewInterestRatePercent: 18.0,
      proposedNewPeriodMonths: 48,
      refinancingClosingCosts: 30_000_000
    });

    assert.ok(refi.grossInterestSavings > 0);
    assert.equal(refi.netRefinancingSavings, refi.grossInterestSavings - 30_000_000);
    assert.ok(refi.breakEvenPeriodMonths > 0 && refi.breakEvenPeriodMonths < 48);
  });

  it('compares financing products with like-for-like criteria and flags stale records', async () => {
    const { service } = setup();

    await service.registerInstitution({
      institutionId: 'bank-a',
      nameFa: 'بانک الف',
      institutionType: 'commercial_bank',
      jurisdiction: 'IR',
      verificationStatus: 'verified',
      lastVerifiedTimestampIso: new Date().toISOString()
    });

    // Product 1: Fresh active product
    await service.createProduct({
      productId: 'prod-fresh',
      institutionId: 'bank-a',
      productNameFa: 'وام الف',
      category: 'residential_purchase',
      jurisdiction: 'IR',
      currency: 'IRR',
      minFinancingAmount: 1_000_000_000,
      maxFinancingAmount: 10_000_000_000,
      minRepaymentPeriodMonths: 12,
      maxRepaymentPeriodMonths: 120,
      allowedRepaymentMethods: ['equal_installments'],
      rateStructure: {
        rateModelId: 'r-1',
        rateType: 'fixed',
        nominalAnnualRatePercent: 18.0,
        effectiveDateIso: new Date().toISOString()
      },
      fees: [
        { feeId: 'f1', feeNameFa: 'کارمزد تشکیل پرونده', isMandatory: true, feeCategory: 'administrative', fixedAmount: 20_000_000, currency: 'IRR' }
      ],
      eligibilityRules: [],
      requiredDocumentsChecklist: [],
      requiredBorrowerContributionPercent: 20,
      maxLtvPercent: 80,
      availabilityStatus: 'active',
      sourceReference: 'https://bank-a.ir',
      lastVerifiedTimestampIso: new Date().toISOString(), // fresh today
      effectiveFromIso: new Date().toISOString()
    });

    // Product 2: Stale product verified 300 days ago
    const staleDateIso = new Date(Date.now() - 300 * 24 * 60 * 60 * 1000).toISOString();
    await service.createProduct({
      productId: 'prod-stale',
      institutionId: 'bank-a',
      productNameFa: 'وام قدیمی',
      category: 'residential_purchase',
      jurisdiction: 'IR',
      currency: 'IRR',
      minFinancingAmount: 1_000_000_000,
      maxFinancingAmount: 10_000_000_000,
      minRepaymentPeriodMonths: 12,
      maxRepaymentPeriodMonths: 120,
      allowedRepaymentMethods: ['equal_installments'],
      rateStructure: {
        rateModelId: 'r-2',
        rateType: 'fixed',
        nominalAnnualRatePercent: 21.0,
        effectiveDateIso: staleDateIso
      },
      fees: [],
      eligibilityRules: [],
      requiredDocumentsChecklist: [],
      requiredBorrowerContributionPercent: 20,
      maxLtvPercent: 80,
      availabilityStatus: 'active',
      sourceReference: 'https://bank-a.ir/old',
      lastVerifiedTimestampIso: staleDateIso, // > 180 days ago
      effectiveFromIso: staleDateIso
    });

    const report = await service.compareProducts({
      requestedAmount: 5_000_000_000,
      propertyValue: 10_000_000_000,
      repaymentPeriodMonths: 60,
      currency: 'IRR',
      jurisdiction: 'IR',
      rankingMethodology: 'lowest_modeled_installment'
    });

    assert.equal(report.comparedProducts.length, 2);

    const freshItem = report.comparedProducts.find(p => p.product.productId === 'prod-fresh');
    const staleItem = report.comparedProducts.find(p => p.product.productId === 'prod-stale');

    assert.equal(freshItem?.dataFreshnessStatus, 'fresh');
    assert.equal(freshItem?.totalKnownMandatoryFees, 20_000_000);

    assert.equal(staleItem?.dataFreshnessStatus, 'stale');
    assert.equal(staleItem?.hasMissingFeeInformation, true);

    // Product with 18% rate ranked above 21% rate
    assert.equal(report.comparedProducts[0].product.productId, 'prod-fresh');
  });
});
