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
  const now = new Date();
  const validityDays = params.quoteValidityDays ?? 30;
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
  const now = new Date();
  const endDate = new Date(params.policyEndDateIso);
  const thirtyDaysBeforeExpiry = new Date(endDate.getTime() - 30 * 24 * 60 * 60 * 1000);

  const isExpired = endDate.getTime() < now.getTime();

  return {
    policyReferenceId: randomUUID(),
    userId: params.userId,
    propertyId: params.propertyId,
    institutionId: params.institutionId,
    productId: params.productId,
    externalPolicyNumberProtected: params.externalPolicyNumber,
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

  return {
    claimReferenceId: randomUUID(),
    policyReferenceId: params.policyReferenceId,
    propertyId: params.propertyId,
    institutionId: params.institutionId,
    userId: params.userId,
    incidentDateIso: params.incidentDateIso,
    incidentCategory: params.incidentCategory,
    userDescriptionFa: params.userDescriptionFa,
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
  return {
    ...claim,
    status: newStatus,
    statusSource,
    settlementAmountRecorded: settlementAmount !== undefined ? settlementAmount : claim.settlementAmountRecorded,
    updatedAtIso: new Date().toISOString()
  };
}
