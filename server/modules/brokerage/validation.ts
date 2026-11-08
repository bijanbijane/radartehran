/**
 * @file server/modules/brokerage/validation.ts
 * @description Input Validation and Invariant Guards for the Brokerage Module.
 */

import type {
  AgencyOrganizationType,
  AgencyOperatingStatus,
  InternalAgencyRole,
  RepresentationType,
  CommissionType,
  CommissionCalculationBasis,
  CommissionPayer,
  CredentialType,
  ScopeOfAuthority,
  CommissionAllocationRules,
} from './types';

export class BrokerageValidationError extends Error {
  constructor(
    public readonly code: string,
    message: string,
    public readonly field?: string,
  ) {
    super(message);
    this.name = 'BrokerageValidationError';
  }
}

export function sanitizeText(val: unknown, maxLen = 250): string {
  if (typeof val !== 'string') return '';
  return val.trim().slice(0, maxLen);
}

export function validateSafeId(id: unknown, fieldName = 'id'): string {
  if (typeof id !== 'string' || !/^[a-zA-Z0-9_-]{2,64}$/.test(id.trim())) {
    throw new BrokerageValidationError('INVALID_ID', `Invalid identifier for ${fieldName}.`, fieldName);
  }
  return id.trim();
}

export function validateEmail(email: unknown, fieldName = 'email'): string {
  const sanitized = sanitizeText(email, 120);
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(sanitized)) {
    throw new BrokerageValidationError('INVALID_EMAIL', `Invalid email address format for ${fieldName}.`, fieldName);
  }
  return sanitized;
}

export function validatePhone(phone: unknown, fieldName = 'phone'): string {
  const sanitized = sanitizeText(phone, 32);
  if (!/^[+0-9\s-]{7,25}$/.test(sanitized)) {
    throw new BrokerageValidationError('INVALID_PHONE', `Invalid phone number format for ${fieldName}.`, fieldName);
  }
  return sanitized;
}

const VALID_ORG_TYPES: Set<AgencyOrganizationType> = new Set([
  'independent_brokerage',
  'real_estate_office',
  'multi_branch_agency',
  'consulting_company',
  'property_management_agency',
]);

export function validateOrgType(type: unknown): AgencyOrganizationType {
  if (typeof type !== 'string' || !VALID_ORG_TYPES.has(type as AgencyOrganizationType)) {
    throw new BrokerageValidationError('INVALID_ORG_TYPE', 'Invalid agency organization type.', 'organizationType');
  }
  return type as AgencyOrganizationType;
}

const VALID_ROLES: Set<InternalAgencyRole> = new Set([
  'agency_owner',
  'agency_director',
  'general_manager',
  'branch_manager',
  'senior_consultant',
  'real_estate_consultant',
  'listing_coordinator',
  'operations_employee',
  'administrative_employee',
]);

export function validateInternalRole(role: unknown): InternalAgencyRole {
  if (typeof role !== 'string' || !VALID_ROLES.has(role as InternalAgencyRole)) {
    throw new BrokerageValidationError('INVALID_ROLE', 'Invalid internal agency role.', 'role');
  }
  return role as InternalAgencyRole;
}

const VALID_REPRESENTATION_TYPES: Set<RepresentationType> = new Set([
  'sale_representation',
  'rental_representation',
  'commercial_representation',
  'land_representation',
  'property_management_authority',
  'exclusive_sale_representation',
  'exclusive_rental_representation',
]);

export function validateRepresentationType(type: unknown): RepresentationType {
  if (typeof type !== 'string' || !VALID_REPRESENTATION_TYPES.has(type as RepresentationType)) {
    throw new BrokerageValidationError('INVALID_REPRESENTATION_TYPE', 'Invalid representation type.', 'representationType');
  }
  return type as RepresentationType;
}

const VALID_COMMISSION_TYPES: Set<CommissionType> = new Set([
  'fixed_amount',
  'percentage_of_transaction_value',
  'agency_agent_revenue_share',
  'referral_agreement',
  'tiered_split',
]);

export function validateCommissionType(type: unknown): CommissionType {
  if (typeof type !== 'string' || !VALID_COMMISSION_TYPES.has(type as CommissionType)) {
    throw new BrokerageValidationError('INVALID_COMMISSION_TYPE', 'Invalid commission type.', 'commissionType');
  }
  return type as CommissionType;
}

const VALID_BASES: Set<CommissionCalculationBasis> = new Set([
  'confirmed_transaction_value',
  'fixed_fee',
  'first_month_rent',
  'total_lease_value',
]);

export function validateCalculationBasis(basis: unknown): CommissionCalculationBasis {
  if (typeof basis !== 'string' || !VALID_BASES.has(basis as CommissionCalculationBasis)) {
    throw new BrokerageValidationError('INVALID_CALCULATION_BASIS', 'Invalid commission calculation basis.', 'calculationBasis');
  }
  return basis as CommissionCalculationBasis;
}

export function validateCommissionAllocation(rules: CommissionAllocationRules): CommissionAllocationRules {
  if (!rules || typeof rules !== 'object') {
    throw new BrokerageValidationError('INVALID_ALLOCATION', 'Allocation rules must be provided.', 'allocationRules');
  }
  const agency = Number(rules.agencySharePercentage);
  const agent = Number(rules.agentSharePercentage);
  const referral = Number(rules.referralSharePercentage || 0);

  if (Number.isNaN(agency) || agency < 0 || agency > 100) {
    throw new BrokerageValidationError('INVALID_ALLOCATION', 'Agency share percentage must be between 0 and 100.', 'agencySharePercentage');
  }
  if (Number.isNaN(agent) || agent < 0 || agent > 100) {
    throw new BrokerageValidationError('INVALID_ALLOCATION', 'Agent share percentage must be between 0 and 100.', 'agentSharePercentage');
  }
  if (Number.isNaN(referral) || referral < 0 || referral > 100) {
    throw new BrokerageValidationError('INVALID_ALLOCATION', 'Referral share percentage must be between 0 and 100.', 'referralSharePercentage');
  }
  if (agency + agent + referral > 100.01) {
    throw new BrokerageValidationError('INVALID_ALLOCATION', 'Total allocation share cannot exceed 100%.', 'allocationRules');
  }

  return {
    agencySharePercentage: agency,
    agentSharePercentage: agent,
    referralSharePercentage: referral,
    brokerageBonusPercentage: Number(rules.brokerageBonusPercentage || 0),
  };
}

export function validateDateRange(startIso: unknown, endIso: unknown): { start: string; end: string } {
  if (typeof startIso !== 'string' || Number.isNaN(Date.parse(startIso))) {
    throw new BrokerageValidationError('INVALID_DATE', 'Invalid start date format (ISO required).', 'startDateIso');
  }
  if (typeof endIso !== 'string' || Number.isNaN(Date.parse(endIso))) {
    throw new BrokerageValidationError('INVALID_DATE', 'Invalid end/expiration date format (ISO required).', 'expirationDateIso');
  }
  if (Date.parse(endIso) <= Date.parse(startIso)) {
    throw new BrokerageValidationError('INVALID_DATE_RANGE', 'Expiration date must be strictly after start date.', 'expirationDateIso');
  }
  return { start: startIso, end: endIso };
}
