/**
 * @file server/modules/professional-verification/authoritiesAndStateMachine.ts
 * @description Canonical Registry of Official Iranian Verification Authorities, Explicit Lifecycle
 * State Machine, Anti-Plausibility Guards, and Separation-of-Duties (SoD) Authorization Rules.
 */

import type {
  AuthenticatedPrincipalContext,
  IssuingAuthorityCode,
  OfficialVerificationAuthorityMetadata,
  VerificationLifecycleState,
  VerificationMethodType,
  VerificationPermission,
} from './types';

/**
 * Official Iranian professional and regulatory issuing authorities.
 *
 * CRITICAL HONESTY INVARIANT:
 * `hasAuthorizedAutomatedApi` is explicitly `false` across all entries because this repository
 * does not hold private government/union API credentials or automated inquiry webhooks.
 * All verifications must honestly record either `'manual_document_review'` or
 * `'official_authority_registry_cross_check'` performed by an authorized human reviewer.
 */
export const OFFICIAL_VERIFICATION_AUTHORITIES: Readonly<
  Record<IssuingAuthorityCode, OfficialVerificationAuthorityMetadata>
> = {
  tehran_real_estate_union: {
    authorityCode: 'tehran_real_estate_union',
    nameFa: 'اتحادیه صنف مشاوران املاک',
    nameEn: 'Real Estate Consultants Union',
    officialPortalBaseUrl: 'https://iranamlaak.ir',
    allowedHostnameSuffixes: ['iranamlaak.ir', 'asnaf.ir', 'iranianasnaf.ir'],
    hasAuthorizedAutomatedApi: false,
    verificationGuidanceFa:
      'استعلام دستی شناسه صنفی و پروانه کسب از طریق پرتال اتحادیه املاک یا سامانه ایرانیان اصناف توسط بازرس مجاز.',
  },
  iran_business_licenses_portal_mojavez: {
    authorityCode: 'iran_business_licenses_portal_mojavez',
    nameFa: 'درگاه ملی مجوزهای کشور (مجوز)',
    nameEn: 'Iran National Portal of Business Licenses (Mojavez)',
    officialPortalBaseUrl: 'https://mojavez.ir',
    allowedHostnameSuffixes: ['mojavez.ir', 'qr.mojavez.ir'],
    hasAuthorizedAutomatedApi: false,
    verificationGuidanceFa:
      'بررسی دستی شناسه یکتای مجوز (QR/کد پیگیری) در درگاه ملی مجوزهای کشور (mojavez.ir) توسط بازرس مجاز.',
  },
  construction_engineering_org_irceo: {
    authorityCode: 'construction_engineering_org_irceo',
    nameFa: 'سازمان نظام مهندسی ساختمان',
    nameEn: 'Iran Construction Engineering Organization (IRCEO)',
    officialPortalBaseUrl: 'https://irceo.ir',
    allowedHostnameSuffixes: ['irceo.ir', 'tceo.ir'],
    hasAuthorizedAutomatedApi: false,
    verificationGuidanceFa:
      'بازبینی پروانه اشتغال به کار مهندسی و تطبیق شماره عضویت با پرتال سازمان نظام مهندسی استان.',
  },
  judiciary_official_experts_center: {
    authorityCode: 'judiciary_official_experts_center',
    nameFa: 'کانون کارشناسان رسمی دادگستری / مرکز کارشناسان قوه قضاییه',
    nameEn: 'Official Judiciary Experts Center',
    officialPortalBaseUrl: 'https://karshenasan.ir',
    allowedHostnameSuffixes: ['karshenasan.ir', '23055.ir', 'adliran.ir'],
    hasAuthorizedAutomatedApi: false,
    verificationGuidanceFa:
      'بررسی دستی پروانه کارشناسی رسمی دادگستری و اعتبار تاریخ تمدید سالانه توسط بازرس مجاز.',
  },
  plan_and_budget_org_sajat: {
    authorityCode: 'plan_and_budget_org_sajat',
    nameFa: 'سازمان برنامه و بودجه کشور (سامانه ساجات)',
    nameEn: 'Plan and Budget Organization (SAJAT Contractor Grading)',
    officialPortalBaseUrl: 'https://sajat.mporg.ir',
    allowedHostnameSuffixes: ['sajat.mporg.ir', 'mporg.ir'],
    hasAuthorizedAutomatedApi: false,
    verificationGuidanceFa:
      'بررسی گواهینامه صلاحیت پیمانکاری یا مشاور در سامانه ساجات سازمان برنامه و بودجه.',
  },
  company_registration_org_ssaa: {
    authorityCode: 'company_registration_org_ssaa',
    nameFa: 'مرکز مالکیت معنوی و ثبت شرکت‌ها (سازمان ثبت اسناد و املاک)',
    nameEn: 'Registration Organization of Deeds and Properties (SSAA)',
    officialPortalBaseUrl: 'https://ilenc.ssaa.ir',
    allowedHostnameSuffixes: ['ssaa.ir', 'rrk.ir'],
    hasAuthorizedAutomatedApi: false,
    verificationGuidanceFa:
      'تطبیق شناسه ملی اشخاص حقوقی و آگهی روزنامه رسمی (rrk.ir / ilenc.ssaa.ir) توسط بازرس مجاز.',
  },
  other_regulated_authority: {
    authorityCode: 'other_regulated_authority',
    nameFa: 'سایر مراجع رسمی و صنفی ذی‌صلاح',
    nameEn: 'Other Regulated Professional Authority',
    officialPortalBaseUrl: null,
    allowedHostnameSuffixes: ['gov.ir', 'ir'],
    hasAuthorizedAutomatedApi: false,
    verificationGuidanceFa:
      'بازبینی دستی مستندات رسمی و استعلام از مرجع صادرکننده مجوز توسط بازرس احراز هویت.',
  },
};

/**
 * Validates an official verification URL against the recognized authority's allowed hostnames.
 * Prevents injection of untrusted/phishing links, javascript: URIs, or invented API endpoints.
 */
export function validateOfficialAuthorityVerificationUrl(
  authorityCode: IssuingAuthorityCode,
  rawUrl: string | null | undefined
): { valid: boolean; normalizedUrl: string | null; reasonFa: string | null } {
  if (rawUrl === null || rawUrl === undefined || String(rawUrl).trim() === '') {
    return { valid: true, normalizedUrl: null, reasonFa: null };
  }

  const trimmed = String(rawUrl).trim();
  let parsed: URL;
  try {
    parsed = new URL(trimmed);
  } catch {
    return {
      valid: false,
      normalizedUrl: null,
      reasonFa: 'ساختار نشانی اینترنتی مرجع رسمی (URL) نامعتبر است.',
    };
  }

  if (parsed.protocol !== 'https:') {
    return {
      valid: false,
      normalizedUrl: null,
      reasonFa: 'پیوند مرجع رسمی استعلام باید الزاماً از پروتکل امن HTTPS استفاده کند.',
    };
  }

  const authority = OFFICIAL_VERIFICATION_AUTHORITIES[authorityCode];
  if (!authority) {
    return {
      valid: false,
      normalizedUrl: null,
      reasonFa: 'مرجع صادرکننده مجوز در فهرست مراجع رسمی شناخته نشده است.',
    };
  }

  const hostname = parsed.hostname.toLowerCase();
  const isAllowedHost = authority.allowedHostnameSuffixes.some(
    (suffix) => hostname === suffix || hostname.endsWith(`.${suffix}`)
  );

  if (!isAllowedHost) {
    return {
      valid: false,
      normalizedUrl: null,
      reasonFa: `دامنه «${hostname}» متعلق به درگاه رسمی «${authority.nameFa}» نیست.`,
    };
  }

  return {
    valid: true,
    normalizedUrl: parsed.toString(),
    reasonFa: null,
  };
}

/**
 * Explicit state transition table for `VerificationLifecycleState`.
 *
 * Notice:
 * - `unsubmitted` can ONLY transition to `pending` (never directly to `verified`).
 * - `pending` must transition to `under_review` (or `rejected`) before `verified`.
 * - `under_review` transitions to `verified` or `rejected`.
 * - `verified` can transition to `expired`, `revoked`, or `suspended`.
 * - `suspended` can transition to `verified` (reinstated after review) or `revoked` or `expired`.
 * - `rejected` and `expired` can transition to `pending` only when fresh evidence is re-submitted.
 * - `revoked` is a terminal disciplinary state for that credential submission (`[]`).
 */
export const ALLOWED_VERIFICATION_STATE_TRANSITIONS: Readonly<
  Record<VerificationLifecycleState, ReadonlyArray<VerificationLifecycleState>>
> = {
  unsubmitted: ['pending'],
  pending: ['under_review', 'rejected'],
  under_review: ['verified', 'rejected'],
  verified: ['expired', 'revoked', 'suspended'],
  rejected: ['pending'],
  expired: ['pending', 'revoked'],
  suspended: ['verified', 'revoked', 'expired'],
  revoked: [],
};

export function validateVerificationStateTransition(
  fromState: VerificationLifecycleState,
  toState: VerificationLifecycleState
): { allowed: boolean; reasonFa: string | null } {
  const allowedTargets = ALLOWED_VERIFICATION_STATE_TRANSITIONS[fromState] || [];
  if (!allowedTargets.includes(toState)) {
    return {
      allowed: false,
      reasonFa: `تغییر وضعیت مدرک از «${fromState}» به «${toState}» در چرخه احراز هویت مجاز نیست.`,
    };
  }
  return { allowed: true, reasonFa: null };
}

/**
 * Enforces Separation of Duties (SoD) and explicit role/permission checks:
 * - Only authenticated principals may submit or view their own records.
 * - Only principals with `professional_verification:review_credentials` (or admin/reviewer/compliance_officer)
 *   may transition credentials into `under_review`, `verified`, or `rejected`.
 * - A reviewer MUST NEVER review, verify, or reinstate their own credential (`actor.uid !== ownerUid`).
 */
export function authorizePrincipalForVerificationAction(params: {
  principal: AuthenticatedPrincipalContext | null | undefined;
  action:
    | 'submit_own_credential'
    | 'read_private_evidence'
    | 'review_credential'
    | 'revoke_or_suspend_credential';
  resourceOwnerUid: string;
}): { authorized: boolean; statusCode: 200 | 401 | 403; reasonFa: string | null } {
  const { principal, action, resourceOwnerUid } = params;

  if (!principal || !principal.isAuthenticated || !principal.uid) {
    return {
      authorized: false,
      statusCode: 401,
      reasonFa: 'برای انجام عملیات احراز هویت حرفه‌ای، ورود به حساب کاربری معتبر الزامی است.',
    };
  }

  const hasPermission = (perm: VerificationPermission): boolean =>
    principal.isAdmin || principal.permissions.includes(perm);

  const isReviewerOrAdmin =
    principal.isAdmin ||
    principal.roles.includes('reviewer') ||
    principal.roles.includes('compliance_officer') ||
    hasPermission('professional_verification:review_credentials');

  if (action === 'submit_own_credential') {
    if (principal.uid !== resourceOwnerUid) {
      return {
        authorized: false,
        statusCode: 403,
        reasonFa: 'کاربر تنها مجاز به ثبت یا ارسال مدارک حرفه‌ای متعلق به حساب کاربری خود است.',
      };
    }
    return { authorized: true, statusCode: 200, reasonFa: null };
  }

  if (action === 'read_private_evidence') {
    const canAudit =
      isReviewerOrAdmin || hasPermission('professional_verification:audit_read');
    if (principal.uid === resourceOwnerUid || canAudit) {
      return { authorized: true, statusCode: 200, reasonFa: null };
    }
    return {
      authorized: false,
      statusCode: 403,
      reasonFa: 'اسناد هویتی و مدارک صنفی خصوصی بوده و برای سایر کاربران قابل مشاهده نیست.',
    };
  }

  if (action === 'review_credential') {
    if (!isReviewerOrAdmin) {
      return {
        authorized: false,
        statusCode: 403,
        reasonFa: 'تغییر وضعیت بررسی و تایید مدارک صرفاً برای بازرسان مجاز احراز هویت امکان‌پذیر است.',
      };
    }
    if (principal.uid === resourceOwnerUid) {
      return {
        authorized: false,
        statusCode: 403,
        reasonFa: 'تضاد منافع (Separation of Duties): بازرس مجاز به تایید یا بررسی مدرک متعلق به حساب شخصی خود نیست.',
      };
    }
    return { authorized: true, statusCode: 200, reasonFa: null };
  }

  if (action === 'revoke_or_suspend_credential') {
    const canRevoke =
      principal.isAdmin ||
      principal.roles.includes('compliance_officer') ||
      principal.roles.includes('reviewer') ||
      hasPermission('professional_verification:revoke_or_suspend');
    if (!canRevoke) {
      return {
        authorized: false,
        statusCode: 403,
        reasonFa: 'تعلیق یا ابطال گواهی تاییدشده صرفاً در صلاحیت بازرس ارشد یا مدیر انطباق است.',
      };
    }
    if (principal.uid === resourceOwnerUid && !principal.isAdmin) {
      return {
        authorized: false,
        statusCode: 403,
        reasonFa: 'بازرس مجاز به تغییر وضعیت انضباطی پرونده شخصی خود نیست.',
      };
    }
    return { authorized: true, statusCode: 200, reasonFa: null };
  }

  return {
    authorized: false,
    statusCode: 403,
    reasonFa: 'عملیات درخواستی مجاز نیست.',
  };
}

/**
 * Masks a credential identifier for safe public display (e.g., `1402-987654` -> `1402-***654`).
 */
export function maskCredentialIdentifierForPublic(rawIdentifier: string): string {
  const clean = String(rawIdentifier || '').trim();
  if (clean.length <= 4) {
    return '****';
  }
  const prefix = clean.slice(0, 2);
  const suffix = clean.slice(-2);
  return `${prefix}***${suffix}`;
}

/**
 * Returns the explicit Persian label for a verification method, preventing misleading claims.
 */
export function getVerificationMethodLabelFa(method: VerificationMethodType): string {
  switch (method) {
    case 'official_authority_registry_cross_check':
      return 'تطبیق دستی بازرس با درگاه رسمی مرجع صادرکننده';
    case 'manual_document_review':
      return 'بازبینی دستی اسناد و مدارک بارگذاری‌شده توسط بازرس';
    case 'unverified_submission':
    default:
      return 'ادعای ثبت‌شده توسط کاربر (تاییدنشده)';
  }
}
