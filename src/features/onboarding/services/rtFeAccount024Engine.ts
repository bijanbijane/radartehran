/**
 * Stage 24 Engine — RT-FE-USER-ACCOUNT-024
 * Pure TypeScript policy evaluators for Identity/Lifecycle separation, Public vs Private Profile isolation,
 * Avatar & Version Conflict checks, Verification/Trust Badge rules, Session/Recovery safety & Telemetry hygiene.
 */
import {
  RT_FE_USER_ACCOUNT_024_SPEC_ID,
  RT_FE_STAGE25_BRIDGE_SPEC_ID,
  RT_ACCOUNT_LAYERS_8,
  RT_ACCOUNT_CONCEPTS_6,
  RT_ACCOUNT_LIFECYCLE_STATUSES_10,
  RT_PROFILE_VISIBILITY_5,
  RT_VERIFICATION_STATUSES_9,
  RT_ACCOUNT_API_ENDPOINTS_29,
  RT_ACCOUNT_DELIVERABLES_40,
  accountKeys,
  type AccountStatus,
  type VerificationStatus,
} from './rtFeAccount024Specs';

export {
  RT_FE_USER_ACCOUNT_024_SPEC_ID,
  RT_FE_STAGE25_BRIDGE_SPEC_ID,
  RT_ACCOUNT_LAYERS_8,
  RT_ACCOUNT_CONCEPTS_6,
  RT_ACCOUNT_LIFECYCLE_STATUSES_10,
  RT_PROFILE_VISIBILITY_5,
  RT_VERIFICATION_STATUSES_9,
  RT_ACCOUNT_API_ENDPOINTS_29,
  RT_ACCOUNT_DELIVERABLES_40,
  accountKeys,
};

export function evaluateIdentityAndLifecyclePolicy(params: {
  exposeAuthSubjectPublicly?: boolean;
  professionGrantAutoPermission?: boolean;
  accountStatus: AccountStatus;
  mergedTargetUserId?: string;
}): {
  valid: boolean;
  canAccessRestrictedFeatures: boolean;
  isAccountDeleted: boolean;
  issues: string[];
  summaryFa: string;
} {
  const issues: string[] = [];
  if (params.exposeAuthSubjectPublicly) {
    issues.push('شناسه احراز هویت (authSubject) نباید به‌عنوان شناسه عمومی کاربر نمایش داده شود (§۲۴.۶).');
  }
  if (params.professionGrantAutoPermission) {
    issues.push('ثبت پروفایل حرفه‌ای هرگز به معنای اعطای خودکار Role یا Permission مدیریتی نیست (§۲۴.۲.۲ & §۲۴.۱۵).');
  }
  if (params.accountStatus === 'merged' && !params.mergedTargetUserId) {
    issues.push('حساب Merged باید به شناسه حساب مقصد معتبر ارجاع داشته باشد بدون حذف شناسه تاریخی (§۲۴.۷).');
  }
  const canAccessRestrictedFeatures =
    params.accountStatus === 'active';
  const isAccountDeleted = params.accountStatus === 'deleted';

  return {
    valid: issues.length === 0,
    canAccessRestrictedFeatures,
    isAccountDeleted,
    issues,
    summaryFa:
      issues[0] ??
      (params.accountStatus === 'restricted'
        ? 'وضعیت Restricted تنها محدودیت برخی قابلیت‌هاست و به معنای حذف حساب نیست (§۲۴.۷).'
        : params.accountStatus === 'suspended'
          ? 'حساب Suspended از ورود عادی به قابلیت‌های محدودشده منع می‌شود.'
          : 'هویت پایه واحد با تفکیک کامل از پروفایل، نقش و مجوز برقرار است.'),
  };
}

export function evaluateProfileSeparationAndAvatar(params: {
  publicPayloadIncludesPrivateFields?: boolean;
  clientVersion: number;
  serverVersion: number;
  avatarFormat: 'jpeg' | 'png' | 'webp' | 'svg';
  svgSanitized?: boolean;
  completionImpliesVerification?: boolean;
}): {
  saveAllowed: boolean;
  hasVersionConflict: boolean;
  avatarAccepted: boolean;
  issues: string[];
} {
  const issues: string[] = [];
  if (params.publicPayloadIncludesPrivateFields) {
    issues.push('فیلدهای Private (شماره تماس، ایمیل، مدارک) هرگز نباید از Public Profile API به کلاینت ارسال شوند (§۲۴.۱۳).');
  }
  const hasVersionConflict = params.clientVersion !== params.serverVersion;
  if (hasVersionConflict) {
    issues.push(`تعارض نسخه ویرایش پروفایل (کلاینت v${params.clientVersion} در برابر سرور v${params.serverVersion}) — جلوگیری از بازنویسی ناخواسته (§۲۴.۴۶).`);
  }
  const avatarAccepted = params.avatarFormat !== 'svg' || Boolean(params.svgSanitized);
  if (!avatarAccepted) {
    issues.push('فایل SVG کاربر بدون Sanitization کنترل‌شده و تایید Backend به‌عنوان Avatar پذیرفته نمی‌شود (§۲۴.۱۲).');
  }
  if (params.completionImpliesVerification) {
    issues.push('درصد تکمیل پروفایل هرگز معیار اعتبار یا تایید هویت/صلاحیت حرفه‌ای محسوب نمی‌شود (§۲۴.۸).');
  }
  return {
    saveAllowed: issues.length === 0,
    hasVersionConflict,
    avatarAccepted,
    issues,
  };
}

export function evaluateVerificationAndTrustBadges(params: {
  phoneVerified: boolean;
  identityVerified: boolean;
  professionalStatus: VerificationStatus;
  clientAttemptedSelfVerify?: boolean;
  deleteProfessionalProfile?: boolean;
}): {
  showIdentityBadge: boolean;
  showProfessionalBadge: boolean;
  baseAccountIntact: boolean;
  issues: string[];
} {
  const issues: string[] = [];
  if (params.clientAttemptedSelfVerify) {
    issues.push('وضعیت تایید (Verified) صرفاً در Backend قابل تغییر است نه از کلاینت (§۲۴.۱۶).');
  }
  if (params.professionalStatus === 'expired' || params.professionalStatus === 'revoked') {
    issues.push(`تایید حرفه‌ای با وضعیت ${params.professionalStatus} نباید همچنان با نشان معتبر نمایش داده شود (§۲۴.۱۹ & §۲۴.۲۰).`);
  }
  const showIdentityBadge = params.identityVerified;
  const showProfessionalBadge = params.professionalStatus === 'verified' && !params.clientAttemptedSelfVerify;
  // Removing a specialized professional profile must never delete the core user account (§24.17)
  const baseAccountIntact = true;

  return {
    showIdentityBadge,
    showProfessionalBadge,
    baseAccountIntact,
    issues,
  };
}

export function evaluateSecuritySessionAndLifecycle(params: {
  activeLoginMethodsCount: number;
  requestRemoveLastLoginMethod?: boolean;
  sessionRevokedInBackend: boolean;
  reauthVerifiedForSensitiveAction: boolean;
  actionType: 'session_revoke' | 'contact_change' | 'account_deletion';
  remainingLoginMethodsValid?: boolean;
  exposeTokensOrRecoveryCodesInUi?: boolean;
}): {
  actionAllowed: boolean;
  issues: string[];
  summaryFa: string;
} {
  const issues: string[] = [];
  if (params.exposeTokensOrRecoveryCodesInUi) {
    issues.push('Access Token، Refresh Token یا Recovery Codes دائمی نباید در UI یا LocalStorage افشا شوند (§۲۴.۲۴ & §۲۴.۲۵).');
  }
  if (params.requestRemoveLastLoginMethod && params.activeLoginMethodsCount <= 1) {
    issues.push('حذف آخرین روش ورود معتبر بدون تعریف روش جایگزین مجاز نیست (§۲۴.۲۶).');
  }
  if (params.actionType === 'session_revoke' && !params.sessionRevokedInBackend) {
    issues.push('حذف آیتم نشست در UI به معنای ابطال واقعی نیست؛ ابطال باید در Backend ثبت شود (§۲۴.۲۴).');
  }
  if ((params.actionType === 'contact_change' || params.actionType === 'account_deletion') && !params.reauthVerifiedForSensitiveAction) {
    issues.push('تغییر اطلاعات تماس یا درخواست حذف حساب نیازمند احراز هویت مجدد (Re-auth) است (§۲۴.۲۱ & §۲۴.۳۲).');
  }
  return {
    actionAllowed: issues.length === 0,
    issues,
    summaryFa:
      issues[0] ??
      'کنترل‌های امنیتی نشست، احراز هویت مجدد و محافظت چرخه عمر حساب برقرار است.',
  };
}

export function sanitizeAccountTelemetry(params: {
  eventName: string;
  payload: Record<string, unknown>;
}): { sanitizedPayload: Record<string, unknown>; strippedKeys: string[] } {
  const blocked = new Set([
    'password', 'token', 'recoveryCode', 'identityDocument', 'privateBio',
    'fullPhone', 'fullEmail', 'credentialContent', 'sessionSecret',
    'exactLocation', 'mouseMovement', 'keystroke', 'psychologicalProfile',
  ]);
  const sanitizedPayload: Record<string, unknown> = {};
  const strippedKeys: string[] = [];
  for (const [k, v] of Object.entries(params.payload)) {
    if (blocked.has(k)) strippedKeys.push(k);
    else sanitizedPayload[k] = v;
  }
  return { sanitizedPayload, strippedKeys };
}
