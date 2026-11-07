/**
 * @file server/modules/real-estate-professionals/professionalValidator.ts
 * @description Input validation, official registry URL security, and membership state machines.
 */

import { escapeHtmlAttr, isValidIranMobilePhone } from '../../../src/utils/security';
import type {
  AgencyMembershipState,
  OfficialVerificationLinkMetadata,
  RealEstateRole,
} from './professionalTypes';

const VALID_ROLES = new Set<RealEstateRole>([
  'broker',
  'agency_owner',
  'agency_manager',
  'branch_manager',
  'licensed_consultant',
  'agency_agent',
]);

const APPROVED_OFFICIAL_DOMAINS = new Set([
  'ssaa.ir',
  'iranianasnaf.ir',
  'katib.ir',
  'mojavez.ir',
  'asnaftehran.ir',
]);

const ALLOWED_MEMBERSHIP_TRANSITIONS: Readonly<Record<AgencyMembershipState, readonly AgencyMembershipState[]>> = {
  INVITED: ['ACTIVE', 'REJECTED'],
  APPLICATION_SUBMITTED: ['ACTIVE', 'REJECTED'],
  PENDING_APPROVAL: ['ACTIVE', 'REJECTED'],
  ACTIVE: ['SUSPENDED', 'TERMINATED'],
  SUSPENDED: ['ACTIVE', 'TERMINATED'],
  REJECTED: [],
  TERMINATED: [],
};

/**
 * Validates and sanitizes official external verification links.
 * Strictly prevents open redirect attacks and restricts to pre-approved governmental/union domains.
 */
export function validateOfficialVerificationUrl(rawUrl: string): {
  valid: boolean;
  metadata?: OfficialVerificationLinkMetadata;
  error?: string;
} {
  if (!rawUrl || typeof rawUrl !== 'string') {
    return { valid: false, error: 'URL is required' };
  }

  const trimmed = rawUrl.trim();
  if (!trimmed.startsWith('https://')) {
    return { valid: false, error: 'Only HTTPS official links are permitted' };
  }

  try {
    const parsed = new URL(trimmed);
    const hostname = parsed.hostname.toLowerCase();

    // Check if domain or parent domain is in approved list
    const isDomainApproved = Array.from(APPROVED_OFFICIAL_DOMAINS).some(
      (approved) => hostname === approved || hostname.endsWith(`.${approved}`),
    );

    if (!isDomainApproved) {
      return {
        valid: false,
        error: `DOMAIN_NOT_APPROVED: دامنه ${hostname} جزو مراجع تاییدشده نظارتی/ثبتی کشور نیست.`,
      };
    }

    const authorityName = hostname.includes('ssaa')
      ? 'سازمان ثبت اسناد و املاک کشور (سامانه ثبت من)'
      : hostname.includes('katib')
        ? 'سامانه رسمی کاتب'
        : hostname.includes('iranianasnaf') || hostname.includes('mojavez')
          ? 'درگاه ملی مجوزهای کشور (ایرانیان اصناف)'
          : 'اتحادیه مشاورین املاک';

    return {
      valid: true,
      metadata: {
        authorityName,
        verifiedDomain: hostname,
        url: parsed.toString(),
        isApproved: true,
      },
    };
  } catch {
    return { valid: false, error: 'INVALID_URL_FORMAT' };
  }
}

/**
 * Validates professional profile creation payload.
 */
export function validateProfessionalProfileInput(input: unknown): {
  valid: boolean;
  errors: string[];
  sanitized?: {
    publicDisplayName: string;
    role: RealEstateRole;
    primaryCityId: string;
    activeHoodIds: number[];
    publicBioFa: string;
    contactPhone: string;
  };
} {
  const errors: string[] = [];
  if (!input || typeof input !== 'object' || Array.isArray(input)) {
    return { valid: false, errors: ['Profile payload must be an object'] };
  }

  const p = input as Record<string, unknown>;

  const publicDisplayName = escapeHtmlAttr(String(p.publicDisplayName || '').trim().slice(0, 100));
  if (publicDisplayName.length < 3) {
    errors.push('publicDisplayName must be at least 3 characters');
  }

  const role = p.role as RealEstateRole;
  if (!VALID_ROLES.has(role)) {
    errors.push(`Invalid role: ${String(role)}`);
  }

  const primaryCityId = String(p.primaryCityId || 'tehran').trim();
  const activeHoodIds = Array.isArray(p.activeHoodIds)
    ? p.activeHoodIds.map(Number).filter((id) => Number.isSafeInteger(id) && id > 0)
    : [];

  const publicBioFa = escapeHtmlAttr(String(p.publicBioFa || '').trim().slice(0, 2000));

  const contactPhone = String(p.contactPhone || '').trim();
  if (!isValidIranMobilePhone(contactPhone)) {
    errors.push('Invalid contactPhone: must be a valid Iranian mobile phone');
  }

  if (errors.length > 0) {
    return { valid: false, errors };
  }

  return {
    valid: true,
    errors: [],
    sanitized: {
      publicDisplayName,
      role,
      primaryCityId,
      activeHoodIds,
      publicBioFa,
      contactPhone,
    },
  };
}

/**
 * Validates agency creation payload.
 */
export function validateAgencyInput(input: unknown): {
  valid: boolean;
  errors: string[];
  sanitized?: {
    registeredLegalNameFa: string;
    publicTradingNameFa: string;
    tradeUnionLicenseNumber: string;
    cityId: string;
    centralOfficeAddressFa: string;
    publicPhone: string;
    privateContactPhone: string;
  };
} {
  const errors: string[] = [];
  if (!input || typeof input !== 'object') {
    return { valid: false, errors: ['Agency payload must be an object'] };
  }

  const a = input as Record<string, unknown>;

  const registeredLegalNameFa = escapeHtmlAttr(String(a.registeredLegalNameFa || '').trim().slice(0, 150));
  if (registeredLegalNameFa.length < 3) errors.push('registeredLegalNameFa is required');

  const publicTradingNameFa = escapeHtmlAttr(String(a.publicTradingNameFa || '').trim().slice(0, 150));
  if (publicTradingNameFa.length < 3) errors.push('publicTradingNameFa is required');

  const tradeUnionLicenseNumber = String(a.tradeUnionLicenseNumber || '').trim().slice(0, 50);
  if (tradeUnionLicenseNumber.length < 3) errors.push('tradeUnionLicenseNumber is required');

  const cityId = String(a.cityId || 'tehran').trim();
  const centralOfficeAddressFa = escapeHtmlAttr(String(a.centralOfficeAddressFa || '').trim().slice(0, 300));
  const publicPhone = String(a.publicPhone || '').trim();
  const privateContactPhone = String(a.privateContactPhone || '').trim();

  if (!isValidIranMobilePhone(privateContactPhone)) {
    errors.push('privateContactPhone must be a valid Iranian mobile phone');
  }

  if (errors.length > 0) {
    return { valid: false, errors };
  }

  return {
    valid: true,
    errors: [],
    sanitized: {
      registeredLegalNameFa,
      publicTradingNameFa,
      tradeUnionLicenseNumber,
      cityId,
      centralOfficeAddressFa,
      publicPhone,
      privateContactPhone,
    },
  };
}

/**
 * Validates membership state-machine transitions.
 */
export function validateMembershipTransition(
  currentState: AgencyMembershipState,
  targetState: AgencyMembershipState,
  actor: { isProfessional: boolean; isAgencyOwner: boolean; isAdmin: boolean },
): { allowed: boolean; reasonFa?: string } {
  const allowed = ALLOWED_MEMBERSHIP_TRANSITIONS[currentState];
  if (!allowed || !allowed.includes(targetState)) {
    return {
      allowed: false,
      reasonFa: `تغییر وضعیت عضویت از «${currentState}» به «${targetState}» مجاز نمی‌باشد.`,
    };
  }

  if (currentState === 'INVITED' && targetState === 'ACTIVE' && !actor.isProfessional && !actor.isAdmin) {
    return { allowed: false, reasonFa: 'تنها شخص مشاور مجاز به پذیرش دعوت‌نامه همکاری است.' };
  }

  if (currentState === 'APPLICATION_SUBMITTED' && targetState === 'ACTIVE' && !actor.isAgencyOwner && !actor.isAdmin) {
    return { allowed: false, reasonFa: 'تنها مدیر/صاحب پروانه دفتر املاک مجاز به تایید درخواست عضویت است.' };
  }

  return { allowed: true };
}
