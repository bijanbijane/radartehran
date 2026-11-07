/**
 * @file server/modules/leads/leadValidator.ts
 * @description Input validation, phone number masking, state machine transition checks,
 * and duplicate detection heuristics for Real Estate Lead Management & CRM.
 */

import type {
  InquiryIntent,
  LeadCustomerRequirements,
  LeadLifecycleState,
  LeadTransactionType,
  LeadType,
  PreferredContactMethod,
  PropertyCategory,
} from './leadTypes';

export interface ValidationIssue {
  readonly field: string;
  readonly messageFa: string;
}

export interface ValidationResult<T> {
  readonly success: boolean;
  readonly value?: T;
  readonly errors?: readonly ValidationIssue[];
}

const IRAN_MOBILE_REGEX = /^09\d{9}$/;
const GENERAL_PHONE_REGEX = /^\+?[0-9]{10,15}$/;

/**
 * Validates and normalizes Iranian phone numbers (09xxxxxxxxx or international +989xxxxxxxxx).
 */
export function validatePhoneNumber(rawPhone: string): { valid: boolean; normalized?: string } {
  if (!rawPhone || typeof rawPhone !== 'string') return { valid: false };
  let cleaned = rawPhone.replace(/[\s\-_()]/g, '');
  if (cleaned.startsWith('+98')) {
    cleaned = '0' + cleaned.slice(3);
  } else if (cleaned.startsWith('0098')) {
    cleaned = '0' + cleaned.slice(4);
  } else if (cleaned.startsWith('98')) {
    cleaned = '0' + cleaned.slice(2);
  }

  if (IRAN_MOBILE_REGEX.test(cleaned) || GENERAL_PHONE_REGEX.test(cleaned)) {
    return { valid: true, normalized: cleaned };
  }
  return { valid: false };
}

/**
 * Masks phone numbers to protect customer privacy in non-authorized or summary CRM views.
 * Example: 09123456789 -> 0912***6789
 */
export function maskPhoneNumber(phone?: string): string {
  if (!phone || phone.length < 7) return '***';
  const prefix = phone.slice(0, 4);
  const suffix = phone.slice(-4);
  return `${prefix}***${suffix}`;
}

export function sanitizeTextFa(raw?: string, maxLength = 500): string {
  if (!raw || typeof raw !== 'string') return '';
  return raw
    .replace(/[<>'"&]/g, '')
    .trim()
    .slice(0, maxLength);
}

/**
 * Validates Lead Customer Requirements.
 */
export function validateCustomerRequirements(
  req: Partial<LeadCustomerRequirements>,
): ValidationResult<LeadCustomerRequirements> {
  const issues: ValidationIssue[] = [];

  if (!req.cityId || typeof req.cityId !== 'string' || req.cityId.trim().length === 0) {
    issues.push({ field: 'cityId', messageFa: 'شناسه شهر الزامی است.' });
  }

  const validCategories: PropertyCategory[] = [
    'RESIDENTIAL_APARTMENT',
    'RESIDENTIAL_VILLA',
    'RESIDENTIAL_LAND',
    'OFFICE_SPACE',
    'RETAIL_SHOP',
    'COMMERCIAL_BUILDING',
    'WAREHOUSE_INDUSTRIAL',
    'BUSINESS_PREMISES',
    'INVESTMENT_PROPERTY',
  ];
  if (!req.propertyCategory || !validCategories.includes(req.propertyCategory)) {
    issues.push({ field: 'propertyCategory', messageFa: 'دسته‌بندی ملک نامعتبر است.' });
  }

  const validTxTypes: LeadTransactionType[] = ['BUY', 'RENT', 'MORTGAGE', 'PRE_SALE'];
  if (!req.transactionType || !validTxTypes.includes(req.transactionType)) {
    issues.push({ field: 'transactionType', messageFa: 'نوع معامله نامعتبر است.' });
  }

  if (req.budgetMinMillion !== undefined && req.budgetMaxMillion !== undefined) {
    if (req.budgetMinMillion < 0 || req.budgetMaxMillion < req.budgetMinMillion) {
      issues.push({ field: 'budgetRange', messageFa: 'بازه بودجه نامعتبر است.' });
    }
  }

  if (req.rentMinMillion !== undefined && req.rentMaxMillion !== undefined) {
    if (req.rentMinMillion < 0 || req.rentMaxMillion < req.rentMinMillion) {
      issues.push({ field: 'rentRange', messageFa: 'بازه اجاره نامعتبر است.' });
    }
  }

  if (req.sqmMin !== undefined && req.sqmMax !== undefined) {
    if (req.sqmMin < 10 || req.sqmMax < req.sqmMin) {
      issues.push({ field: 'sqmRange', messageFa: 'بازه متراژ نامعتبر است.' });
    }
  }

  if (issues.length > 0) {
    return { success: false, errors: issues };
  }

  const validated: LeadCustomerRequirements = {
    cityId: req.cityId!.trim().toLowerCase(),
    hoodId: typeof req.hoodId === 'number' && req.hoodId > 0 ? req.hoodId : undefined,
    propertyCategory: req.propertyCategory!,
    transactionType: req.transactionType!,
    budgetMinMillion: req.budgetMinMillion,
    budgetMaxMillion: req.budgetMaxMillion,
    rentMinMillion: req.rentMinMillion,
    rentMaxMillion: req.rentMaxMillion,
    sqmMin: req.sqmMin,
    sqmMax: req.sqmMax,
    roomsMin: req.roomsMin,
    roomsMax: req.roomsMax,
    requiredFeatures: Array.isArray(req.requiredFeatures)
      ? req.requiredFeatures.map((f) => sanitizeTextFa(String(f), 50)).filter(Boolean)
      : undefined,
    commercialAttributes: req.commercialAttributes,
    preferredVisitTime: req.preferredVisitTime ? sanitizeTextFa(req.preferredVisitTime, 100) : undefined,
    customerNoteFa: req.customerNoteFa ? sanitizeTextFa(req.customerNoteFa, 1000) : undefined,
  };

  return { success: true, value: validated };
}

/**
 * Validates Lead Creation Input.
 */
export function validateLeadCreationInput(input: {
  leadType: LeadType;
  intent: InquiryIntent;
  targetListingId?: string;
  targetAgencyId?: string;
  targetBranchId?: string;
  targetProfessionalId?: string;
  customerDisplayName: string;
  customerPhone: string;
  customerEmail?: string;
  preferredContactMethod: PreferredContactMethod;
  requirements: Partial<LeadCustomerRequirements>;
  consentPurpose: string;
  consentTextVersion: string;
  marketingOptIn?: boolean;
  agencySharingConsent?: boolean;
  idempotencyKey?: string;
}): ValidationResult<{
  leadType: LeadType;
  intent: InquiryIntent;
  targetListingId?: string;
  targetAgencyId?: string;
  targetBranchId?: string;
  targetProfessionalId?: string;
  customerDisplayName: string;
  customerPhone: string;
  customerEmail?: string;
  preferredContactMethod: PreferredContactMethod;
  requirements: LeadCustomerRequirements;
  consentPurpose: string;
  consentTextVersion: string;
  marketingOptIn: boolean;
  agencySharingConsent: boolean;
  idempotencyKey: string;
}> {
  const issues: ValidationIssue[] = [];

  const validLeadTypes: LeadType[] = [
    'PROPERTY_INQUIRY',
    'GENERAL_PROPERTY_REQUIREMENT',
    'COMMERCIAL_OFFICE_INQUIRY',
    'AGENCY_PROFESSIONAL_INQUIRY',
  ];
  if (!validLeadTypes.includes(input.leadType)) {
    issues.push({ field: 'leadType', messageFa: 'نوع سرنخ نامعتبر است.' });
  }

  if (input.leadType === 'PROPERTY_INQUIRY' && (!input.targetListingId || input.targetListingId.trim().length === 0)) {
    issues.push({ field: 'targetListingId', messageFa: 'برای استعلام ملک، شناسه فایل الزامی است.' });
  }

  if (
    input.leadType === 'AGENCY_PROFESSIONAL_INQUIRY' &&
    !input.targetAgencyId &&
    !input.targetProfessionalId
  ) {
    issues.push({ field: 'targetAssignee', messageFa: 'شناسه دفتر املاک یا مشاور الزامی است.' });
  }

  const phoneCheck = validatePhoneNumber(input.customerPhone);
  if (!phoneCheck.valid || !phoneCheck.normalized) {
    issues.push({ field: 'customerPhone', messageFa: 'شماره تماس وارد شده معتبر نیست.' });
  }

  const displayName = sanitizeTextFa(input.customerDisplayName, 80);
  if (displayName.length < 2) {
    issues.push({ field: 'customerDisplayName', messageFa: 'نام متقاضی باید حداقل ۲ کاراکتر باشد.' });
  }

  const validContactMethods: PreferredContactMethod[] = [
    'PHONE',
    'SMS',
    'WHATSAPP',
    'TELEGRAM',
    'IN_APP_MESSAGE',
    'EMAIL',
  ];
  if (!validContactMethods.includes(input.preferredContactMethod)) {
    issues.push({ field: 'preferredContactMethod', messageFa: 'روش ترجیحی تماس نامعتبر است.' });
  }

  if (!input.consentPurpose || input.consentPurpose.trim().length === 0) {
    issues.push({ field: 'consentPurpose', messageFa: 'هدف رضایت‌نامه باید صراحتاً ثبت شود.' });
  }

  if (!input.consentTextVersion || input.consentTextVersion.trim().length === 0) {
    issues.push({ field: 'consentTextVersion', messageFa: 'نسخه متن رضایت‌نامه الزامی است.' });
  }

  const reqCheck = validateCustomerRequirements(input.requirements);
  if (!reqCheck.success || !reqCheck.value) {
    issues.push(...(reqCheck.errors ?? []));
  }

  if (issues.length > 0) {
    return { success: false, errors: issues };
  }

  return {
    success: true,
    value: {
      leadType: input.leadType,
      intent: input.intent,
      targetListingId: input.targetListingId?.trim(),
      targetAgencyId: input.targetAgencyId?.trim(),
      targetBranchId: input.targetBranchId?.trim(),
      targetProfessionalId: input.targetProfessionalId?.trim(),
      customerDisplayName: displayName,
      customerPhone: phoneCheck.normalized!,
      customerEmail: input.customerEmail ? sanitizeTextFa(input.customerEmail, 120) : undefined,
      preferredContactMethod: input.preferredContactMethod,
      requirements: reqCheck.value!,
      consentPurpose: sanitizeTextFa(input.consentPurpose, 150),
      consentTextVersion: sanitizeTextFa(input.consentTextVersion, 40),
      marketingOptIn: Boolean(input.marketingOptIn),
      agencySharingConsent: Boolean(input.agencySharingConsent),
      idempotencyKey: input.idempotencyKey ? sanitizeTextFa(input.idempotencyKey, 120) : `lead_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`,
    },
  };
}

/**
 * Strict CRM Lifecycle State Machine Matrix.
 */
const ALLOWED_LIFECYCLE_TRANSITIONS: Record<LeadLifecycleState, readonly LeadLifecycleState[]> = {
  NEW: ['AWAITING_ASSIGNMENT', 'ASSIGNED', 'CANCELLED', 'REJECTED', 'EXPIRED'],
  AWAITING_ASSIGNMENT: ['ASSIGNED', 'CANCELLED', 'EXPIRED', 'REJECTED'],
  ASSIGNED: ['ACCEPTED', 'AWAITING_ASSIGNMENT', 'CONTACT_ATTEMPTED', 'CANCELLED', 'REJECTED', 'EXPIRED'],
  ACCEPTED: [
    'CONTACT_ATTEMPTED',
    'CONTACTED',
    'FOLLOW_UP_REQUIRED',
    'VISIT_SCHEDULED',
    'NEGOTIATION',
    'AWAITING_ASSIGNMENT',
    'CANCELLED',
    'REJECTED',
  ],
  CONTACT_ATTEMPTED: [
    'CONTACTED',
    'FOLLOW_UP_REQUIRED',
    'UNSUCCESSFUL',
    'CANCELLED',
    'EXPIRED',
  ],
  CONTACTED: [
    'FOLLOW_UP_REQUIRED',
    'VISIT_SCHEDULED',
    'NEGOTIATION',
    'SUCCESSFUL',
    'UNSUCCESSFUL',
    'CANCELLED',
  ],
  FOLLOW_UP_REQUIRED: [
    'CONTACT_ATTEMPTED',
    'CONTACTED',
    'VISIT_SCHEDULED',
    'NEGOTIATION',
    'SUCCESSFUL',
    'UNSUCCESSFUL',
    'CANCELLED',
  ],
  VISIT_SCHEDULED: [
    'VISIT_SCHEDULED',
    'NEGOTIATION',
    'FOLLOW_UP_REQUIRED',
    'SUCCESSFUL',
    'UNSUCCESSFUL',
    'CANCELLED',
  ],
  NEGOTIATION: [
    'SUCCESSFUL',
    'UNSUCCESSFUL',
    'FOLLOW_UP_REQUIRED',
    'CANCELLED',
  ],
  SUCCESSFUL: ['FOLLOW_UP_REQUIRED', 'NEGOTIATION'], // Reopening permitted only by manager/admin
  UNSUCCESSFUL: ['NEW', 'AWAITING_ASSIGNMENT', 'FOLLOW_UP_REQUIRED'],
  CANCELLED: ['NEW', 'AWAITING_ASSIGNMENT'],
  EXPIRED: ['NEW', 'AWAITING_ASSIGNMENT'],
  REJECTED: ['AWAITING_ASSIGNMENT'],
};

/**
 * Validates whether a state transition is legal according to the CRM state machine.
 */
export function validateStateTransition(
  currentState: LeadLifecycleState,
  targetState: LeadLifecycleState,
  actorRole: 'CUSTOMER' | 'PROFESSIONAL' | 'AGENCY_MANAGER' | 'ADMIN' | 'SYSTEM',
): { allowed: boolean; reasonFa?: string } {
  if (currentState === targetState) {
    if (currentState === 'VISIT_SCHEDULED') {
      return { allowed: true }; // Rescheduling visit
    }
    return { allowed: false, reasonFa: 'وضعیت هدف با وضعیت فعلی یکسان است.' };
  }

  // Customer can only cancel their own open inquiry
  if (actorRole === 'CUSTOMER') {
    if (targetState === 'CANCELLED') {
      const cancellable: LeadLifecycleState[] = [
        'NEW',
        'AWAITING_ASSIGNMENT',
        'ASSIGNED',
        'ACCEPTED',
        'CONTACT_ATTEMPTED',
        'CONTACTED',
        'FOLLOW_UP_REQUIRED',
        'VISIT_SCHEDULED',
        'NEGOTIATION',
      ];
      if (cancellable.includes(currentState)) {
        return { allowed: true };
      }
      return { allowed: false, reasonFa: 'سرنخ‌های بسته شده یا ناموفق توسط متقاضی قابل انصراف نیستند.' };
    }
    return { allowed: false, reasonFa: 'متقاضی فقط مجاز به انصراف از استعلام است.' };
  }

  // Admin or Agency Manager can reopen closed leads
  if (currentState === 'SUCCESSFUL' && actorRole !== 'ADMIN' && actorRole !== 'AGENCY_MANAGER') {
    return { allowed: false, reasonFa: 'فقط مدیر دفتر یا مدیر سامانه مجاز به بازگشایی سرنخ موفق هستند.' };
  }

  const allowedTargets = ALLOWED_LIFECYCLE_TRANSITIONS[currentState] ?? [];
  if (!allowedTargets.includes(targetState)) {
    return {
      allowed: false,
      reasonFa: `انتقال وضعیت از ${currentState} به ${targetState} غیرمجاز است.`,
    };
  }

  return { allowed: true };
}
