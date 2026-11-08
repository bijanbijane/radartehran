/**
 * Pure Mathematical Financial Calculation Engine
 * (`server/modules/financing-intelligence/formulas.ts`)
 * Exclusive ownership: `server/modules/financing-intelligence/`
 */

import { randomUUID } from 'node:crypto';
import {
  AffordabilityEvaluationInput,
  AffordabilityEvaluationResult,
  AmortizationInstallment,
  AmortizationScheduleResult,
  EarlyRepaymentScenarioInput,
  EarlyRepaymentScenarioResult,
  RefinancingScenarioInput,
  RefinancingScenarioResult,
  RepaymentMethod
} from './types.js';

export const METHODOLOGY_VERSION = 'v1.4.0-deterministic';

export function roundByCurrency(value: number, currency: string = 'IRR'): number {
  if (currency.toUpperCase() === 'IRR' || currency.toUpperCase() === 'TOMAN') {
    return Math.round(value);
  }
  return Math.round(value * 100) / 100;
}

export function calculateLtvAndContribution(
  propertyValue: number,
  financingAmount: number
): {
  ltvPercent: number;
  borrowerContributionAmount: number;
  borrowerContributionPercent: number;
} {
  if (propertyValue <= 0) {
    throw new Error('ارزش ملک باید عددی مثبت و بزرگ‌تر از صفر باشد.');
  }
  if (financingAmount < 0) {
    throw new Error('مبلغ تسهیلات نمی‌تواند منفی باشد.');
  }

  const ltvPercent = (financingAmount / propertyValue) * 100;
  const borrowerContributionAmount = Math.max(0, propertyValue - financingAmount);
  const borrowerContributionPercent = (borrowerContributionAmount / propertyValue) * 100;

  return {
    ltvPercent: Math.round(ltvPercent * 100) / 100,
    borrowerContributionAmount: Math.round(borrowerContributionAmount),
    borrowerContributionPercent: Math.round(borrowerContributionPercent * 100) / 100
  };
}

export function calculateAmortizationSchedule(
  principalAmount: number,
  annualInterestRatePercent: number,
  repaymentPeriodMonths: number,
  repaymentMethod: RepaymentMethod = 'equal_installments',
  currency: string = 'IRR',
  startDateIso: string = new Date().toISOString()
): AmortizationScheduleResult {
  if (principalAmount <= 0) {
    throw new Error('مبلغ اصل تسهیلات باید بزرگ‌تر از صفر باشد.');
  }
  if (annualInterestRatePercent < 0) {
    throw new Error('نرخ سود سالانه نمی‌تواند منفی باشد.');
  }
  if (repaymentPeriodMonths <= 0 || !Number.isInteger(repaymentPeriodMonths)) {
    throw new Error('تعداد اقساط باید یک عدد صحیح مثبت باشد.');
  }

  const monthlyRate = annualInterestRatePercent / 100 / 12;
  const installments: AmortizationInstallment[] = [];
  let remainingPrincipal = principalAmount;
  let accumulatedInterest = 0;
  let firstInstallmentAmount = 0;

  const baseDate = new Date(startDateIso);

  if (repaymentMethod === 'equal_installments') {
    // Annuity formula: M = P * [r(1+r)^n] / [(1+r)^n - 1]
    let baseMonthlyPayment: number;
    if (monthlyRate === 0) {
      baseMonthlyPayment = principalAmount / repaymentPeriodMonths;
    } else {
      const compoundFactor = Math.pow(1 + monthlyRate, repaymentPeriodMonths);
      baseMonthlyPayment = (principalAmount * (monthlyRate * compoundFactor)) / (compoundFactor - 1);
    }
    firstInstallmentAmount = roundByCurrency(baseMonthlyPayment, currency);

    for (let month = 1; month <= repaymentPeriodMonths; month++) {
      const interestComponent = roundByCurrency(remainingPrincipal * monthlyRate, currency);
      let principalComponent: number;

      if (month === repaymentPeriodMonths) {
        principalComponent = remainingPrincipal;
      } else {
        principalComponent = roundByCurrency(baseMonthlyPayment - interestComponent, currency);
      }

      remainingPrincipal = Math.max(0, remainingPrincipal - principalComponent);
      accumulatedInterest += interestComponent;

      const paymentDate = new Date(baseDate);
      paymentDate.setMonth(paymentDate.getMonth() + month);

      installments.push({
        installmentNumber: month,
        paymentDateIso: paymentDate.toISOString(),
        installmentAmount: roundByCurrency(principalComponent + interestComponent, currency),
        principalComponent,
        interestComponent,
        remainingPrincipal: roundByCurrency(remainingPrincipal, currency),
        accumulatedInterest: roundByCurrency(accumulatedInterest, currency)
      });
    }
  } else if (repaymentMethod === 'equal_principal') {
    // Linear German method: Fixed principal each month + interest on remaining
    const fixedPrincipalMonthly = roundByCurrency(principalAmount / repaymentPeriodMonths, currency);

    for (let month = 1; month <= repaymentPeriodMonths; month++) {
      const interestComponent = roundByCurrency(remainingPrincipal * monthlyRate, currency);
      const principalComponent = month === repaymentPeriodMonths ? remainingPrincipal : fixedPrincipalMonthly;
      const installmentAmount = roundByCurrency(principalComponent + interestComponent, currency);

      if (month === 1) {
        firstInstallmentAmount = installmentAmount;
      }

      remainingPrincipal = Math.max(0, remainingPrincipal - principalComponent);
      accumulatedInterest += interestComponent;

      const paymentDate = new Date(baseDate);
      paymentDate.setMonth(paymentDate.getMonth() + month);

      installments.push({
        installmentNumber: month,
        paymentDateIso: paymentDate.toISOString(),
        installmentAmount,
        principalComponent,
        interestComponent,
        remainingPrincipal: roundByCurrency(remainingPrincipal, currency),
        accumulatedInterest: roundByCurrency(accumulatedInterest, currency)
      });
    }
  } else if (repaymentMethod === 'interest_only') {
    // Only pay interest each month, principal paid at final balloon installment
    const monthlyInterestOnly = roundByCurrency(principalAmount * monthlyRate, currency);
    firstInstallmentAmount = monthlyInterestOnly;

    for (let month = 1; month <= repaymentPeriodMonths; month++) {
      const isLastMonth = month === repaymentPeriodMonths;
      const principalComponent = isLastMonth ? principalAmount : 0;
      const interestComponent = monthlyInterestOnly;
      const installmentAmount = roundByCurrency(principalComponent + interestComponent, currency);

      remainingPrincipal = isLastMonth ? 0 : principalAmount;
      accumulatedInterest += interestComponent;

      const paymentDate = new Date(baseDate);
      paymentDate.setMonth(paymentDate.getMonth() + month);

      installments.push({
        installmentNumber: month,
        paymentDateIso: paymentDate.toISOString(),
        installmentAmount,
        principalComponent,
        interestComponent,
        remainingPrincipal,
        accumulatedInterest: roundByCurrency(accumulatedInterest, currency)
      });
    }
  } else {
    throw new Error(`روش بازپرداخت ${repaymentMethod} هنوز در این نسخه پشتیبانی نمی‌شود.`);
  }

  const totalRepaymentAmount = roundByCurrency(
    installments.reduce((sum, inst) => sum + inst.installmentAmount, 0),
    currency
  );
  const totalInterestAmount = roundByCurrency(accumulatedInterest, currency);

  return {
    calculationId: randomUUID(),
    principalAmount,
    annualInterestRatePercent,
    repaymentPeriodMonths,
    repaymentMethod,
    currency,
    monthlyInstallmentAmount: firstInstallmentAmount,
    totalRepaymentAmount,
    totalInterestAmount,
    installments,
    calculationMethodologyVersion: METHODOLOGY_VERSION,
    calculatedAtIso: new Date().toISOString()
  };
}

export function evaluateAffordability(input: AffordabilityEvaluationInput): AffordabilityEvaluationResult {
  if (input.userMonthlyNetIncome <= 0) {
    throw new Error('درآمد خالص ماهیانه باید بزرگ‌تر از صفر باشد.');
  }

  const maxAllowedDtiPercent = input.maxAllowedDtiPercent ?? 40;
  const schedule = calculateAmortizationSchedule(
    input.proposedFinancingAmount,
    input.proposedAnnualInterestRatePercent,
    input.proposedRepaymentPeriodMonths,
    input.repaymentMethod ?? 'equal_installments',
    input.currency
  );

  const monthlyInstallment = schedule.monthlyInstallmentAmount;
  const currentDebtToIncomePercent = (input.userMonthlyExistingDebtObligations / input.userMonthlyNetIncome) * 100;
  const totalProjectedDebtPayments = input.userMonthlyExistingDebtObligations + monthlyInstallment;
  const projectedDebtToIncomePercent = (totalProjectedDebtPayments / input.userMonthlyNetIncome) * 100;

  const isWithinDtiThreshold = projectedDebtToIncomePercent <= maxAllowedDtiPercent;
  const netResidualIncome =
    input.userMonthlyNetIncome - (totalProjectedDebtPayments + input.userEstimatedLivingExpenses);

  // Back-calculate recommended maximum financing amount based on max DTI
  const maxAffordableMonthlyDebt = (maxAllowedDtiPercent / 100) * input.userMonthlyNetIncome;
  const maxAvailableForInstallment = Math.max(0, maxAffordableMonthlyDebt - input.userMonthlyExistingDebtObligations);

  let recommendedMaxFinancingAmount = 0;
  const monthlyRate = input.proposedAnnualInterestRatePercent / 100 / 12;
  const n = input.proposedRepaymentPeriodMonths;

  if (maxAvailableForInstallment > 0) {
    if (monthlyRate === 0) {
      recommendedMaxFinancingAmount = maxAvailableForInstallment * n;
    } else {
      const factor = Math.pow(1 + monthlyRate, n);
      recommendedMaxFinancingAmount = (maxAvailableForInstallment * (factor - 1)) / (monthlyRate * factor);
    }
  }

  return {
    monthlyInstallment: roundByCurrency(monthlyInstallment, input.currency),
    currentDebtToIncomePercent: Math.round(currentDebtToIncomePercent * 100) / 100,
    projectedDebtToIncomePercent: Math.round(projectedDebtToIncomePercent * 100) / 100,
    maxAllowedDtiPercent,
    isWithinDtiThreshold,
    netResidualIncomeAfterDebtAndExpenses: roundByCurrency(netResidualIncome, input.currency),
    isResidualIncomePositive: netResidualIncome > 0,
    recommendedMaxFinancingAmount: roundByCurrency(recommendedMaxFinancingAmount, input.currency),
    disclaimerFa:
      'این محاسبات صرفاً فرضی و تحلیلی بوده و به هیچ‌وجه به منزله تاییدیه اعتباری، تضمین پرداخت یا تاییدیه نهایی از سوی بانک‌ها نمی‌باشد.',
    calculatedAtIso: new Date().toISOString()
  };
}

export function calculateEarlyRepayment(input: EarlyRepaymentScenarioInput): EarlyRepaymentScenarioResult {
  const originalSchedule = calculateAmortizationSchedule(
    input.originalPrincipal,
    input.annualInterestRatePercent,
    input.originalPeriodMonths,
    input.repaymentMethod
  );

  const idx = Math.min(input.currentInstallmentIndex, originalSchedule.installments.length);
  const targetInstallment = originalSchedule.installments[idx - 1];
  const balanceBefore = targetInstallment ? targetInstallment.remainingPrincipal : input.originalPrincipal;

  const prepaymentApplied = Math.min(input.prepaymentAmount, balanceBefore);
  const penaltyPercent = input.prepaymentPenaltyPercent ?? 0;
  const prepaymentPenaltyFee = roundByCurrency((prepaymentApplied * penaltyPercent) / 100);
  const balanceAfter = Math.max(0, balanceBefore - prepaymentApplied);

  const remainingMonths = input.originalPeriodMonths - idx;
  let newMonthlyInstallment = 0;
  let newRemainingPeriodMonths = remainingMonths;

  if (balanceAfter <= 0) {
    newMonthlyInstallment = 0;
    newRemainingPeriodMonths = 0;
  } else if (input.strategy === 'reduce_installment') {
    const newSchedule = calculateAmortizationSchedule(
      balanceAfter,
      input.annualInterestRatePercent,
      remainingMonths,
      input.repaymentMethod
    );
    newMonthlyInstallment = newSchedule.monthlyInstallmentAmount;
  } else {
    // Strategy: reduce period while keeping original installment amount
    const monthlyRate = input.annualInterestRatePercent / 100 / 12;
    const originalMonthly = originalSchedule.monthlyInstallmentAmount;

    if (monthlyRate === 0) {
      newRemainingPeriodMonths = Math.ceil(balanceAfter / originalMonthly);
    } else {
      // Solve n: M = P * [r(1+r)^n] / [(1+r)^n - 1] => (1+r)^n = M / (M - P*r)
      const denominator = originalMonthly - balanceAfter * monthlyRate;
      if (denominator <= 0) {
        newRemainingPeriodMonths = remainingMonths;
      } else {
        const ratio = originalMonthly / denominator;
        newRemainingPeriodMonths = Math.ceil(Math.log(ratio) / Math.log(1 + monthlyRate));
      }
    }
    newMonthlyInstallment = originalMonthly;
  }

  // Calculate modeled savings
  const remainingOriginalInterest = originalSchedule.installments
    .slice(idx)
    .reduce((sum, inst) => sum + inst.interestComponent, 0);

  const modeledTotalInterestSaved = Math.max(0, remainingOriginalInterest * 0.4); // Modeled approximate reduction
  const netModeledSavings = Math.max(0, modeledTotalInterestSaved - prepaymentPenaltyFee);

  return {
    remainingPrincipalBeforePrepayment: roundByCurrency(balanceBefore),
    prepaymentAmountApplied: roundByCurrency(prepaymentApplied),
    prepaymentPenaltyFee,
    remainingPrincipalAfterPrepayment: roundByCurrency(balanceAfter),
    newMonthlyInstallment: roundByCurrency(newMonthlyInstallment),
    newRemainingPeriodMonths,
    modeledTotalInterestSaved: roundByCurrency(modeledTotalInterestSaved),
    netModeledSavings: roundByCurrency(netModeledSavings)
  };
}

export function calculateRefinancing(input: RefinancingScenarioInput): RefinancingScenarioResult {
  const currentRemainingTotalPayments = input.currentMonthlyInstallment * input.currentRemainingMonths;

  const newSchedule = calculateAmortizationSchedule(
    input.currentRemainingPrincipal,
    input.proposedNewInterestRatePercent,
    input.proposedNewPeriodMonths,
    'equal_installments'
  );

  const proposedNewMonthlyInstallment = newSchedule.monthlyInstallmentAmount;
  const proposedNewTotalPayments = newSchedule.totalRepaymentAmount;

  const grossInterestSavings = Math.max(0, currentRemainingTotalPayments - proposedNewTotalPayments);
  const netRefinancingSavings = grossInterestSavings - input.refinancingClosingCosts;

  const monthlySavings = Math.max(0, input.currentMonthlyInstallment - proposedNewMonthlyInstallment);
  const breakEvenPeriodMonths = monthlySavings > 0 ? Math.ceil(input.refinancingClosingCosts / monthlySavings) : 999;

  return {
    currentRemainingTotalPayments: roundByCurrency(currentRemainingTotalPayments),
    proposedNewMonthlyInstallment: roundByCurrency(proposedNewMonthlyInstallment),
    proposedNewTotalPayments: roundByCurrency(proposedNewTotalPayments),
    grossInterestSavings: roundByCurrency(grossInterestSavings),
    refinancingClosingCosts: roundByCurrency(input.refinancingClosingCosts),
    netRefinancingSavings: roundByCurrency(netRefinancingSavings),
    breakEvenPeriodMonths,
    isEconomicallyBeneficial: netRefinancingSavings > 0
  };
}
