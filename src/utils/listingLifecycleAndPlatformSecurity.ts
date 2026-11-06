import { formatAreaUnitLabel, formatMillionTomanAsIntlCurrency, getStoredAreaUnit, getStoredIntlCurrency, type AreaUnit, type IntlCurrencyCode } from './areaUnit';
export type ListingLifecycleState = | 'draft' | 'pending_review' | 'published' | 'rejected'
  | 'withdrawn' | 'sold' | 'rented' | 'expired' | 'archived'; export type ListingActorRole = 'owner' | 'admin' | 'system_scheduler'; const ALLOWED_STATE_TRANSITIONS: Readonly<Record<ListingLifecycleState, readonly ListingLifecycleState[]>> = { draft: ['pending_review', 'published', 'withdrawn', 'archived'], pending_review: ['published', 'rejected', 'withdrawn'], published: ['withdrawn', 'sold', 'rented', 'expired', 'archived'], rejected: ['draft', 'pending_review', 'withdrawn', 'archived'], withdrawn: ['draft', 'published', 'archived'], sold: ['archived'], rented: ['archived'], expired: ['published', 'withdrawn', 'archived'], archived: [], }; export function validateListingStateTransition( currentState: ListingLifecycleState, nextState: ListingLifecycleState, actorRole: ListingActorRole, dealType: 'خرید' | 'اجاره' = 'خرید', ): { allowed: boolean; reasonFa: string | null } {
  if (currentState === nextState) return { allowed: true, reasonFa: null }; const allowedNext = ALLOWED_STATE_TRANSITIONS[currentState] || []; if (!allowedNext.includes(nextState)) { return { allowed: false, reasonFa: `تغییر وضعیت مستقیم از «${currentState}» به «${nextState}» مجاز نیست.` };
  } if (nextState === 'sold' && dealType !== 'خرید') { return { allowed: false, reasonFa: 'وضعیت «فروخته‌شده» فقط برای آگهی‌های خرید مجاز است.' }; } if (nextState === 'rented' && dealType !== 'اجاره') { return { allowed: false, reasonFa: 'وضعیت «اجاره‌رفته‌» فقط برای آگهی‌های اجاره مجاز است.' }; } if (nextState === 'rejected' && actorRole !== 'admin') { return { allowed: false, reasonFa: 'رد کردن آگهی تنها توسط مدیر سیستم مجاز است.' }; }
  return { allowed: true, reasonFa: null }; } export interface ListingPriceHistoryEntry { revisionNumber: number; dealType: 'خرید' | 'اجاره'; priceMillions: number; changedAtIso: string; actorUid: string; deltaPercent: number | null; displayAreaUnitLabel?: string; priceIntlText?: string; } export function appendListingPriceHistory( existingHistory: ListingPriceHistoryEntry[],
  newPriceMillions: number, dealType: 'خرید' | 'اجاره', actorUid: string, nowIso: string = new Date().toISOString(), areaUnit: AreaUnit = getStoredAreaUnit(), intlCurrency: IntlCurrencyCode = getStoredIntlCurrency(),
): ListingPriceHistoryEntry[] { if (!Number.isFinite(newPriceMillions) || newPriceMillions <= 0) return existingHistory; const safeHistory = Array.isArray(existingHistory) ? existingHistory.slice(-199) : []; const lastEntry = safeHistory.length > 0 ? safeHistory[safeHistory.length - 1] : null; if (lastEntry && lastEntry.dealType === dealType && Math.abs(lastEntry.priceMillions - newPriceMillions) < 0.01) { return safeHistory; }
  const deltaPercent = lastEntry && lastEntry.priceMillions > 0
    ? Math.round(((newPriceMillions - lastEntry.priceMillions) / lastEntry.priceMillions) * 1000) / 10
    : null;
  const roundedMillions = Math.round(newPriceMillions * 100) / 100;
  safeHistory.push({ revisionNumber: (lastEntry?.revisionNumber ?? safeHistory.length) + 1, dealType, priceMillions: roundedMillions, changedAtIso: nowIso, actorUid: String(actorUid || 'owner'), deltaPercent, displayAreaUnitLabel: formatAreaUnitLabel(areaUnit), priceIntlText: formatMillionTomanAsIntlCurrency(roundedMillions, intlCurrency) }); return safeHistory; }
export function computeCanonicalPropertyIdentityKey(input: { cityId: string; neighborhoodId: number; normalizedStreet: string; areaSqm: number; floorNumber?: number | null; }): string { const city = String(input.cityId || 'tehran').trim().toLowerCase();
  const hood = Math.trunc(Number(input.neighborhoodId) || 0); const street = String(input.normalizedStreet || '').trim().replace(/\s+/g, '_'); const areaBucket = Math.round(Number(input.areaSqm) || 0); const floor = input.floorNumber !== undefined && input.floorNumber !== null && Number.isFinite(input.floorNumber)
    ? `f${Math.trunc(input.floorNumber)}`
    : 'f_unknown';
  return `prop:${city}:${hood}:${street}:${areaBucket}m2:${floor}`;
}
export function validateOutboundUrlAgainstSsrf( rawUrl: string, allowedHostnames: readonly string[], ): { allowed: boolean; reason: string | null; parsedUrl: URL | null } {
  try { const parsed = new URL(rawUrl); if (parsed.protocol !== 'https:') return { allowed: false, reason: 'NON_HTTPS_SCHEME_BLOCKED', parsedUrl: null }; if (parsed.username || parsed.password) return { allowed: false, reason: 'URL_CREDENTIALS_BLOCKED', parsedUrl: null };
    const host = parsed.hostname.toLowerCase().replace(/\.$/, ''); const bareHost = host.replace(/^\[|\]$/g, ''); if (
      !host || host === 'localhost' || host === '0.0.0.0' || bareHost === '::1' || bareHost.includes(':') ||
      host.endsWith('.local') || host.endsWith('.internal') || host.endsWith('.localhost') ||
      /^127\./.test(host) || /^10\./.test(host) || /^192\.168\./.test(host) || /^0\./.test(host) ||
      /^169\.254\./.test(host) || /^172\.(1[6-9]|2\d|3[0-1])\./.test(host) || /^100\.(6[4-9]|[7-9]\d|1[01]\d|12[0-7])\./.test(host)
    ) { return { allowed: false, reason: 'PRIVATE_OR_LOOPBACK_HOST_BLOCKED', parsedUrl: null };
    }
    const normalizedAllowlist = allowedHostnames.map((h) => h.toLowerCase().replace(/\.$/, ''));
    if (normalizedAllowlist.length > 0 && !normalizedAllowlist.includes(host)) {
      return { allowed: false, reason: 'HOSTNAME_NOT_IN_ALLOWLIST', parsedUrl: null };
    }
    return { allowed: true, reason: null, parsedUrl: parsed };
  } catch {
    return { allowed: false, reason: 'MALFORMED_URL', parsedUrl: null };
  }
}
export function sanitizeUntrustedUserText(raw: string, maxLength = 2000): string {
  if (!raw) return '';
  return String(raw)
    .replace(/<script[\s\S]*?>[\s\S]*?<\/script>/gi, '')
    .replace(/<\/?[a-z][^>]*>/gi, '')
    .replace(/javascript\s*:/gi, '')
    .replace(/vbscript\s*:/gi, '')
    .replace(/data\s*:\s*text\/html/gi, '')
    .replace(/on[a-z]+\s*=/gi, '')
    .slice(0, maxLength)
    .trim();
}
export interface VersionedAiPromptDefinition {
  promptId: 'listing_copywriter' | 'contract_risk_analyzer' | 'market_grounded_pulse'; version: string; recommendedModel: string;
  maxInputChars: number; maxOutputTokens: number; temperature: number; systemInstructionFa: string; requiredOutputFields: readonly string[];
}
export const VERSIONED_AI_PROMPT_REGISTRY: Readonly<Record<VersionedAiPromptDefinition['promptId'], VersionedAiPromptDefinition>> = {
  listing_copywriter: {
    promptId: 'listing_copywriter',
    version: '2.1.0',
    recommendedModel: 'gemini-3.8-flash',
    maxInputChars: 1500,
    maxOutputTokens: 450,
    temperature: 0.2,
    systemInstructionFa:
      'شما نویسنده رسمی و مبتنی بر واقعیت آگهی ملکی هستید. صرفاً از مشخصات تأییدشده ورودی استفاده کنید و هرگز امکانات، دید، سند یا ویژگی ناموجود در ورودی را اضافه نکنید.',
    requiredOutputFields: ['headlineFa', 'bodyFa', 'usedAttributes'],
  },
  contract_risk_analyzer: {
    promptId: 'contract_risk_analyzer',
    version: '2.3.0',
    recommendedModel: 'gemini-3.8-flash',
    maxInputChars: 12000,
    maxOutputTokens: 1200,
    temperature: 0.1,
    systemInstructionFa:
      'متن قرارداد املاک را صرفاً بر اساس مواد صریح متن ورودی بررسی کنید. بین متن استخراج‌شده و تفسیر تحلیلی تفکیک قائل شوید و خروجی را جایگزین مشاوره حقوقی رسمی معرفی نکنید.',
    requiredOutputFields: ['riskLevel', 'score', 'redFlags', 'recommendations', 'summary'],
  },
  market_grounded_pulse: {
    promptId: 'market_grounded_pulse',
    version: '1.4.0',
    recommendedModel: 'gemini-3.8-flash',
    maxInputChars: 2000,
    maxOutputTokens: 600,
    temperature: 0.1,
    systemInstructionFa:
      'شاخص‌های کلان بازار را صرفاً با استناد به منابع معتبر استخراج کنید و در صورت نبود داده قطعی، وضعیت نامشخص برگردانید.',
    requiredOutputFields: ['summary', 'sources'],
  },
};
const PROMPT_INJECTION_PATTERNS: readonly RegExp[] = [
  /ignore\s+(all\s+)?(previous|prior|above|system)\s+instructions/i,
  /reveal\s+(your\s+)?(system\s+prompt|api\s+key|secret|credentials)/i,
  /disregard\s+(all\s+)?rules/i,
  /دستورات\s+(قبلی|سیستم)\s+را\s+نادیده\s+بگیر/i,
  /کلید\s+api\s+یا\s+پرامپت\s+سیستم\s+را\s+فاش\s+کن/i,
  /<\|im_start\|>|<\|endoftext\|>|\[SYSTEM_OVERRIDE\]/i,
];
export function detectPromptInjectionAttempt(untrustedInput: string): {
  isSuspicious: boolean;
  matchedRuleCount: number;
  sanitizedText: string;
} {
  const safeText = sanitizeUntrustedUserText(untrustedInput, 12000);
  let matchedRuleCount = 0;
  for (const pattern of PROMPT_INJECTION_PATTERNS) {
    if (pattern.test(untrustedInput) || pattern.test(safeText)) {
      matchedRuleCount++;
    }
  }
  return {
    isSuspicious: matchedRuleCount > 0,
    matchedRuleCount,
    sanitizedText: safeText,
  };
}
const RESTRICTED_UNVERIFIED_CLAIMS: ReadonlyArray<{
  claimKey: string;
  pattern: RegExp;
  labelFa: string;
}> = [
  { claimKey: 'metro_walking', pattern: /چند\s*قدم\s*تا\s*مترو|چسبیده\s*به\s*مترو/, labelFa: 'فاصله ادعایی تا مترو' },
  { claimKey: 'single_deed', pattern: /سند\s*تک[\s\u200C]*برگ\s*آماده/, labelFa: 'سند تک‌برگ تأییدنشده' },
  { claimKey: 'panoramic_view', pattern: /ویو\s*ابدی|دید\s*۳۶۰\s*درجه/, labelFa: 'ویو ابدی تأییدنشده' },
  { claimKey: 'luxury_pool', pattern: /استخر\s*و\s*سونا\s*فعال|روف[\s\u200C]*گاردن/, labelFa: 'مشاعات لوکس تأییدنشده' },
];
export interface AiOutputProvenanceEnvelope {
  operationId: string;
  promptId: VersionedAiPromptDefinition['promptId'];
  promptVersion: string;
  modelId: string;
  generatedAtIso: string;
  sourceFactKeys: string[];
  unverifiedClaimsDetected: string[];
  validationPassed: boolean;
}
export function validateAiCopywritingAgainstSourceFacts(
  generatedText: string,
  suppliedFacts: Record<string, string | number | boolean | null | undefined>,
  modelId = 'gemini-3.8-flash',
): AiOutputProvenanceEnvelope {
  const sourceFactKeys = Object.entries(suppliedFacts)
    .filter(([, v]) => v !== null && v !== undefined && v !== '' && v !== false)
    .map(([k]) => k);
  const unverifiedClaimsDetected: string[] = [];
  for (const rule of RESTRICTED_UNVERIFIED_CLAIMS) {
    if (rule.pattern.test(generatedText) && !sourceFactKeys.includes(rule.claimKey)) {
      unverifiedClaimsDetected.push(rule.labelFa);
    }
  }
  return {
    operationId: `ai_op_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`,
    promptId: 'listing_copywriter',
    promptVersion: VERSIONED_AI_PROMPT_REGISTRY.listing_copywriter.version,
    modelId,
    generatedAtIso: new Date().toISOString(),
    sourceFactKeys,
    unverifiedClaimsDetected,
    validationPassed: unverifiedClaimsDetected.length === 0 && generatedText.trim().length > 0,
  };
}
export interface AiTokenBudgetStatus {
  allowed: boolean;
  estimatedInputTokens: number;
  remainingDailyTokens: number;
  rejectionReasonFa: string | null;
}
export function evaluateAiTokenBudget(
  inputText: string,
  promptDef: VersionedAiPromptDefinition,
  consumedTokensToday: number,
  dailyTokenCap = 120_000,
): AiTokenBudgetStatus {
  if (inputText.length > promptDef.maxInputChars) {
    return {
      allowed: false,
      estimatedInputTokens: Math.ceil(inputText.length / 3),
      remainingDailyTokens: Math.max(0, dailyTokenCap - consumedTokensToday),
      rejectionReasonFa: `طول متن ورودی (${inputText.length} کاراکتر) بیشتر از سقف مجاز (${promptDef.maxInputChars} کاراکتر) است.`,
    };
  }
  const estimatedInputTokens = Math.max(1, Math.ceil(inputText.length / 3));
  const totalRequired = estimatedInputTokens + promptDef.maxOutputTokens;
  if (consumedTokensToday + totalRequired > dailyTokenCap) {
    return {
      allowed: false,
      estimatedInputTokens,
      remainingDailyTokens: Math.max(0, dailyTokenCap - consumedTokensToday),
      rejectionReasonFa: 'سهمیه روزانه پردازش هوشمند به پایان رسیده است؛ از موتور قواعد محلی استفاده می‌شود.',
    };
  }
  return {
    allowed: true,
    estimatedInputTokens,
    remainingDailyTokens: Math.max(0, dailyTokenCap - consumedTokensToday - totalRequired),
    rejectionReasonFa: null,
  };
}
export type DocumentValidationFailureCode =
  | 'EMPTY_FILE'
  | 'FILE_TOO_LARGE'
  | 'INVALID_FILENAME'
  | 'UNSUPPORTED_MIME_OR_MAGIC_BYTES'
  | 'ENCRYPTED_PDF_NOT_SUPPORTED'
  | 'MALICIOUS_PDF_SCRIPT_DETECTED'
  | 'PAGE_COUNT_EXCEEDED';
export interface DocumentIngestionAuditResult {
  accepted: boolean;
  failureCode: DocumentValidationFailureCode | null;
  messageFa: string;
  detectedFormat: 'pdf' | 'plain_text' | 'unknown';
  estimatedPageCount: number;
}
export function validateContractDocumentBuffer(
  fileBytes: Uint8Array,
  fileName: string,
  declaredMimeType: string,
  maxBytes = 5 * 1024 * 1024,
  maxPages = 40,
): DocumentIngestionAuditResult {
  if (!fileBytes || fileBytes.byteLength === 0) {
    return {
      accepted: false,
      failureCode: 'EMPTY_FILE',
      messageFa: 'فایل انتخاب‌شده خالی است.',
      detectedFormat: 'unknown',
      estimatedPageCount: 0,
    };
  }
  if (fileBytes.byteLength > maxBytes) {
    return {
      accepted: false,
      failureCode: 'FILE_TOO_LARGE',
      messageFa: 'حجم سند بیش از حد مجاز (۵ مگابایت) است.',
      detectedFormat: 'unknown',
      estimatedPageCount: 0,
    };
  }
  if (fileName.includes('..') || fileName.includes('/') || fileName.includes('\\') || fileName.includes('\0')) {
    return {
      accepted: false,
      failureCode: 'INVALID_FILENAME',
      messageFa: 'نام فایل حاوی کاراکترهای غیرمجاز است.',
      detectedFormat: 'unknown',
      estimatedPageCount: 0,
    };
  }
  const headerAscii = new TextDecoder('latin1').decode(fileBytes.slice(0, 8));
  const isPdfMagic = headerAscii.startsWith('%PDF-');
  const isPlainTextMime = declaredMimeType === 'text/plain' && fileName.toLowerCase().endsWith('.txt');
  if (!isPdfMagic && !isPlainTextMime) {
    return {
      accepted: false,
      failureCode: 'UNSUPPORTED_MIME_OR_MAGIC_BYTES',
      messageFa: 'امضای باینری فایل با استاندارد PDF یا متن ساده مطابقت ندارد.',
      detectedFormat: 'unknown',
      estimatedPageCount: 0,
    };
  }
  if (isPdfMagic) {
    const winBytes = 256 * 1024;
    const headSample = new TextDecoder('latin1').decode(fileBytes.slice(0, Math.min(fileBytes.byteLength, winBytes)));
    const tailSample = fileBytes.byteLength > winBytes ? new TextDecoder('latin1').decode(fileBytes.slice(fileBytes.byteLength - winBytes)) : '';
    const rawContentSample = `${headSample}\n${tailSample}`;
    if (/\/Encrypt\b/.test(rawContentSample)) {
      return {
        accepted: false,
        failureCode: 'ENCRYPTED_PDF_NOT_SUPPORTED',
        messageFa: 'فایل PDF رمزگذاری‌شده است؛ لطفاً نسخه بدون رمز را بارگذاری کنید.',
        detectedFormat: 'pdf',
        estimatedPageCount: 0,
      };
    }
    if (/\/(?:JavaScript|JS|Launch|EmbeddedFiles|RichMedia)\b/i.test(rawContentSample)) {
      return {
        accepted: false,
        failureCode: 'MALICIOUS_PDF_SCRIPT_DETECTED',
        messageFa: 'فایل PDF حاوی اسکریپت یا شیء اجرایی غیرمجاز است و به دلایل امنیتی مسدود شد.',
        detectedFormat: 'pdf',
        estimatedPageCount: 0,
      };
    }
    const pageMatches = rawContentSample.match(/\/Type\s*\/Page\b/g);
    const estimatedPageCount = Math.max(1, pageMatches ? pageMatches.length : 1);
    if (estimatedPageCount > maxPages) {
      return { accepted: false, failureCode: 'PAGE_COUNT_EXCEEDED',
        messageFa: `تعداد صفحات سند (${estimatedPageCount} صفحه) بیش از سقف مجاز (${maxPages} صفحه) است.`,
        detectedFormat: 'pdf', estimatedPageCount, }; } return { accepted: true, failureCode: null, messageFa: 'سند PDF با موفقیت اعتبارسنجی شد.', detectedFormat: 'pdf', estimatedPageCount, }; } return { accepted: true, failureCode: null, messageFa: 'متن قرارداد با موفقیت اعتبارسنجی شد.', detectedFormat: 'plain_text', estimatedPageCount: 1, }; }