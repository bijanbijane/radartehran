/**
 * Policy References, Expiry/Renewal & Claims Tracking Workflows
 * (`server/modules/property-insurance/policyAndClaimsService.ts`)
 * Exclusive ownership: `server/modules/property-insurance/`
 */

import { randomUUID } from 'node:crypto';
import {
  CoverageCategory,
  InsuranceClaimReference,
  InsurancePolicyReference,
  InsuranceQuoteReference
} from './types.js';

export function createQuoteReferenceWorkflow(params: {
  productId: string;
  productVersion: number;
  institutionId: string;
  propertyId?: string;
  userId: string;
  declaredBuildingValue: number;
  declaredContentsValue?: number;
  quotedAnnualPremium: number;
  currency: string;
  quoteValidityDays?: number;
  externalQuoteNumber?: string;
}): InsuranceQuoteReference {
  if (!Number.isFinite(params.declaredBuildingValue) || params.declaredBuildingValue <= 0 || params.declaredBuildingValue > Number.MAX_SAFE_INTEGER) {
    throw new Error('ارزش اعلامی اعیان باید عددی مثبت، معتبر و متناهی باشد.');
  }
  if (params.declaredContentsValue !== undefined && (!Number.isFinite(params.declaredContentsValue) || params.declaredContentsValue < 0 || params.declaredContentsValue > Number.MAX_SAFE_INTEGER)) {
    throw new Error('ارزش اعلامی اثاثیه باید عددی نامنفی، معتبر و متناهی باشد.');
  }
  if (!Number.isFinite(params.quotedAnnualPremium) || params.quotedAnnualPremium < 0 || params.quotedAnnualPremium > Number.MAX_SAFE_INTEGER) {
    throw new Error('حق بیمه اعلامی باید عددی نامنفی و متناهی باشد.');
  }
  const now = new Date();
  const validityDays = typeof params.quoteValidityDays === 'number' && Number.isSafeInteger(params.quoteValidityDays) && params.quoteValidityDays > 0 ? params.quoteValidityDays : 30;
  const expiryDate = new Date(now.getTime() + validityDays * 24 * 60 * 60 * 1000);

  return {
    quoteReferenceId: randomUUID(),
    productId: params.productId,
    productVersion: params.productVersion,
    institutionId: params.institutionId,
    propertyId: params.propertyId,
    userId: params.userId,
    declaredBuildingValue: params.declaredBuildingValue,
    declaredContentsValue: params.declaredContentsValue ?? 0,
    quotedAnnualPremium: params.quotedAnnualPremium,
    currency: params.currency,
    quoteEffectiveDateIso: now.toISOString(),
    quoteExpiryDateIso: expiryDate.toISOString(),
    externalQuoteNumber: params.externalQuoteNumber,
    status: 'draft',
    statusSource: 'user_declaration',
    createdAtIso: now.toISOString(),
    updatedAtIso: now.toISOString()
  };
}

export function registerPolicyReferenceWorkflow(params: {
  userId: string;
  propertyId: string;
  institutionId: string;
  productId?: string;
  externalPolicyNumber: string;
  policyStartDateIso: string;
  policyEndDateIso: string;
  annualPremiumPaid?: number;
  currency?: string;
}): InsurancePolicyReference {
  if (typeof params.externalPolicyNumber !== 'string' || params.externalPolicyNumber.trim().length === 0) {
    throw new Error('شماره بیمه‌نامه الزامی است.');
  }
  const now = new Date();
  const startDate = new Date(params.policyStartDateIso);
  const endDate = new Date(params.policyEndDateIso);

  if (Number.isNaN(startDate.getTime()) || Number.isNaN(endDate.getTime())) {
    throw new Error('تاریخ شروع یا پایان بیمه‌نامه نامعتبر است.');
  }
  if (startDate.getTime() > endDate.getTime()) {
    throw new Error('تاریخ شروع بیمه‌نامه نمی‌تواند پس از تاریخ پایان آن باشد.');
  }

  if (params.annualPremiumPaid !== undefined && (!Number.isFinite(params.annualPremiumPaid) || params.annualPremiumPaid < 0 || params.annualPremiumPaid > Number.MAX_SAFE_INTEGER)) {
    throw new Error('حق بیمه پرداخت‌شده باید عددی نامنفی، معتبر و متناهی باشد.');
  }

  const thirtyDaysBeforeExpiry = new Date(endDate.getTime() - 30 * 24 * 60 * 60 * 1000);
  const isExpired = endDate.getTime() < now.getTime();

  return {
    policyReferenceId: randomUUID(),
    userId: params.userId,
    propertyId: params.propertyId,
    institutionId: params.institutionId,
    productId: params.productId,
    externalPolicyNumberProtected: params.externalPolicyNumber.trim(),
    policyStartDateIso: params.policyStartDateIso,
    policyEndDateIso: params.policyEndDateIso,
    annualPremiumPaid: params.annualPremiumPaid,
    currency: params.currency ?? 'IRR',
    status: isExpired ? 'expired' : 'active_user_reported',
    statusSource: 'user_reported',
    renewalReminderDueIso: thirtyDaysBeforeExpiry.toISOString(),
    createdAtIso: now.toISOString(),
    updatedAtIso: now.toISOString()
  };
}

export function registerClaimReferenceWorkflow(params: {
  policyReferenceId: string;
  propertyId: string;
  institutionId: string;
  userId: string;
  incidentDateIso: string;
  incidentCategory: CoverageCategory;
  userDescriptionFa: string;
  externalClaimNumber?: string;
}): InsuranceClaimReference {
  const now = new Date();
  const incidentDate = new Date(params.incidentDateIso);
  if (Number.isNaN(incidentDate.getTime())) {
    throw new Error('تاریخ وقوع حادثه نامعتبر است.');
  }
  if (typeof params.userDescriptionFa !== 'string' || params.userDescriptionFa.trim().length === 0) {
    throw new Error('شرح حادثه الزامی است.');
  }

  return {
    claimReferenceId: randomUUID(),
    policyReferenceId: params.policyReferenceId,
    propertyId: params.propertyId,
    institutionId: params.institutionId,
    userId: params.userId,
    incidentDateIso: params.incidentDateIso,
    incidentCategory: params.incidentCategory,
    userDescriptionFa: params.userDescriptionFa.trim(),
    externalClaimNumber: params.externalClaimNumber,
    status: 'incident_reported',
    statusSource: 'user_declaration',
    createdAtIso: now.toISOString(),
    updatedAtIso: now.toISOString()
  };
}

export function updateClaimStatusWorkflow(
  claim: InsuranceClaimReference,
  newStatus: InsuranceClaimReference['status'],
  statusSource: InsuranceClaimReference['statusSource'],
  settlementAmount?: number
): InsuranceClaimReference {
  let verifiedSettlement = claim.settlementAmountRecorded;
  if (settlementAmount !== undefined) {
    if (!Number.isFinite(settlementAmount) || settlementAmount < 0 || settlementAmount > Number.MAX_SAFE_INTEGER) {
      throw new Error('مبلغ خسارت پرداختی باید عددی نامنفی، معتبر و متناهی باشد.');
    }
    if (newStatus === 'declined_confirmed' && settlementAmount > 0) {
      throw new Error('پرونده خسارت ردشده نمی‌تواند مبلغ تسویه مثبت داشته باشد.');
    }
    verifiedSettlement = settlementAmount;
  }

  return {
    ...claim,
    status: newStatus,
    statusSource,
    settlementAmountRecorded: verifiedSettlement,
    updatedAtIso: new Date().toISOString()
  };
}
