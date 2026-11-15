/**
 * Stage 17 — Executable Forms, Persian Normalization, Money Unit, Draft & Workflow Governance Engine
 * Spec ID: RT-FE-FORM-WORKFLOW-017
 */

export * from './rtFeFormWorkflow017Specs';

export interface MoneyValue {
  amount: number;
  currency: 'IRR' | 'IRT';
}

export interface ValidationIssue {
  field?: string;
  code: string;
  messageFa: string;
  severity: 'error' | 'warning';
  source: 'client' | 'server' | 'domain';
}

export type WorkflowState =
  | 'draft'
  | 'submitted'
  | 'validating'
  | 'review'
  | 'approved'
  | 'rejected'
  | 'published'
  | 'archived';

const DIGIT_MAP: Record<string, string> = {
  '۰': '0', '۱': '1', '۲': '2', '۳': '3', '۴': '4',
  '۵': '5', '۶': '6', '۷': '7', '۸': '8', '۹': '9',
  '٠': '0', '١': '1', '٢': '2', '٣': '3', '٤': '4',
  '٥': '5', '٦': '6', '٧': '7', '٨': '8', '٩': '9',
};

/** Normalizes Persian & Arabic digits and separators while preserving the raw user string (§17.12). */
export function normalizePersianNumericInput(raw: string): {
  rawPreserved: string;
  normalizedAscii: string;
  parsedNumber: number | null;
} {
  const digitsConverted = [...raw].map((ch) => DIGIT_MAP[ch] ?? ch).join('');
  const cleaned = digitsConverted.replace(/[\s,٬،]/g, '').trim();
  if (!cleaned || !/^-?\d+(\.\d+)?$/.test(cleaned)) {
    return { rawPreserved: raw, normalizedAscii: cleaned, parsedNumber: null };
  }
  const num = Number(cleaned);
  return {
    rawPreserved: raw,
    normalizedAscii: cleaned,
    parsedNumber: Number.isSafeInteger(num) || Number.isFinite(num) ? num : null,
  };
}

/** Single-layer currency conversion preserving original value & explicit unit (§17.14). */
export function convertMoneyValue(value: MoneyValue, targetCurrency: 'IRR' | 'IRT'): MoneyValue {
  if (value.currency === targetCurrency) return { ...value };
  if (value.currency === 'IRT' && targetCurrency === 'IRR') {
    return { amount: Math.round(value.amount * 10), currency: 'IRR' };
  }
  return { amount: Math.round(value.amount / 10), currency: 'IRT' };
}

/** Validates Property + Listing forms separating blocking Error vs advisory Warning and deal-type financials (§17.11.1, §17.23, §17.24). */
export function validatePropertyAndListingForm(input: {
  areaSqm: number;
  dealType: 'sale' | 'rent';
  salePriceToman?: number;
  depositToman?: number;
  monthlyRentToman?: number;
  neighborhoodMedianPerSqmToman: number;
  autoPublishListingWithPropertyCreate?: boolean;
}): {
  canSubmit: boolean;
  issues: ValidationIssue[];
  computedPricePerSqm: number | null;
} {
  const issues: ValidationIssue[] = [];
  if (!Number.isFinite(input.areaSqm) || input.areaSqm <= 0) {
    issues.push({ field: 'areaSqm', code: 'INVALID_AREA', messageFa: 'متراژ باید بزرگ‌تر از صفر باشد (جلوگیری از تقسیم بر صفر).', severity: 'error', source: 'client' });
  }
  if (input.autoPublishListingWithPropertyCreate) {
    issues.push({ field: 'listing', code: 'ENTITY_CONFLATION', messageFa: 'ثبت ملک نباید به‌صورت خودکار آگهی را منتشر کند (§۱۷.۲۳.۲).', severity: 'error', source: 'domain' });
  }
  let computedPricePerSqm: number | null = null;
  if (input.dealType === 'sale') {
    if (!input.salePriceToman || input.salePriceToman <= 0) {
      issues.push({ field: 'salePriceToman', code: 'SALE_PRICE_REQUIRED', messageFa: 'در معامله فروش، مبلغ فروش الزامی است (ودیعه و اجاره اجباری نیستند).', severity: 'error', source: 'client' });
    } else if (input.areaSqm > 0) {
      computedPricePerSqm = Math.round(input.salePriceToman / input.areaSqm);
      if (computedPricePerSqm > input.neighborhoodMedianPerSqmToman * 2.5 || computedPricePerSqm < input.neighborhoodMedianPerSqmToman * 0.35) {
        issues.push({ field: 'salePriceToman', code: 'UNUSUAL_PRICE_BAND', messageFa: 'هشدار (Warning): قیمت هر متر با محدوده متعارف محله فاصله چشمگیر دارد؛ ادامه ممکن است.', severity: 'warning', source: 'domain' });
      }
    }
  } else {
    if ((input.depositToman ?? 0) <= 0 && (input.monthlyRentToman ?? 0) <= 0) {
      issues.push({ field: 'depositToman', code: 'RENT_TERMS_REQUIRED', messageFa: 'در معامله اجاره، حداقل مبلغ ودیعه یا اجاره ماهانه لازم است.', severity: 'error', source: 'client' });
    }
  }
  return {
    canSubmit: !issues.some((i) => i.severity === 'error'),
    issues,
    computedPricePerSqm,
  };
}

/** Evaluates Draft / Autosave transitions with Version Conflict & sensitive LocalStorage prohibition (§17.19.3 & §17.20). */
export function evaluateDraftAndAutosaveTransition(input: {
  isSensitiveForm: boolean;
  storageTarget: 'server_draft_api' | 'local_storage_only';
  expectedVersion: number;
  serverVersion: number;
  isOffline: boolean;
  serverConfirmedSave: boolean;
}): {
  status: 'Saved' | 'Conflict' | 'Offline' | 'Saving' | 'BlockedStorage';
  preservesLocalChanges: boolean;
  reasonFa: string;
} {
  if (input.isSensitiveForm && input.storageTarget === 'local_storage_only') {
    return { status: 'BlockedStorage', preservesLocalChanges: true, reasonFa: 'ذخیره داده حساس صرفاً در Local Storage ممنوع است (§۱۷.۱۹.۳).' };
  }
  if (input.isOffline) {
    return { status: 'Offline', preservesLocalChanges: true, reasonFa: 'ارتباط قطع است؛ تغییرات محلی حفظ شده و موفقیت ذخیره اعلام نمی‌شود.' };
  }
  if (input.expectedVersion !== input.serverVersion) {
    return { status: 'Conflict', preservesLocalChanges: true, reasonFa: `تعارض نسخه (v${input.expectedVersion} در برابر v${input.serverVersion}): بازنویسی خاموش ممنوع است؛ مقایسه و تصمیم کاربر لازم است.` };
  }
  if (!input.serverConfirmedSave) {
    return { status: 'Saving', preservesLocalChanges: true, reasonFa: 'در حال ارسال با Idempotency Key؛ برچسب ذخیره شد پیش از تأیید سرور نمایش داده نمی‌شود.' };
  }
  return { status: 'Saved', preservesLocalChanges: true, reasonFa: `پیش‌نویس نسخه v${input.serverVersion} با تأیید Backend ذخیره شد.` };
}

/** Enforces backend-verified Workflow transitions & neighborhood indicator methodology requirements (§17.25 & §17.28). */
export function evaluateWorkflowTransition(input: {
  from: WorkflowState;
  to: WorkflowState;
  hasReviewerPermission: boolean;
  hasUnitPeriodAndSource: boolean;
}): { allowed: boolean; reasonFa: string } {
  if (!input.hasUnitPeriodAndSource && (input.to === 'approved' || input.to === 'published')) {
    return { allowed: false, reasonFa: 'داده یا شاخص بدون واحد، دوره زمانی و منبع معتبر نباید وارد چرخه انتشار شود (§۱۷.۲۵).' };
  }
  if ((input.to === 'approved' || input.to === 'published' || input.to === 'rejected') && !input.hasReviewerPermission) {
    return { allowed: false, reasonFa: 'گذار به Approved/Published نیازمند مجوز معتبر و تأیید سمت Backend است (§۱۷.۲۸.۱).' };
  }
  if (input.from === 'draft' && input.to === 'published') {
    return { allowed: false, reasonFa: 'پرش مستقیم از Draft به Published بدون گذر از مسیر بررسی مجاز نیست.' };
  }
  return { allowed: true, reasonFa: `گذار رسمی از ${input.from} به ${input.to} ثبت و قابل حسابرسی است.` };
}

/** Processes CSV/XLSX bulk import rows supporting Partial Success & per-row error reporting (§17.22.2). */
export function evaluateBulkImportBatch(rows: readonly { rowNumber: number; valid: boolean; errorFa?: string }[]): {
  total: number;
  accepted: number;
  rejected: number;
  status: 'completed' | 'partial' | 'failed';
  failedRows: { rowNumber: number; errorFa: string }[];
} {
  const failedRows = rows.filter((r) => !r.valid).map((r) => ({ rowNumber: r.rowNumber, errorFa: r.errorFa ?? 'خطای اعتبارسنجی ردیف' }));
  const accepted = rows.length - failedRows.length;
  const status = failedRows.length === 0 ? 'completed' : accepted > 0 ? 'partial' : 'failed';
  return { total: rows.length, accepted, rejected: failedRows.length, status, failedRows };
}

/** Strips raw field values, free text, PII & file contents from Form Telemetry (§17.40). */
export function sanitizeFormTelemetryEvent(raw: {
  event: 'form_started' | 'form_completed' | 'form_abandoned' | 'validation_failed';
  formId: string;
  durationMs?: number;
  extra?: Record<string, unknown>;
}): { safeEvent: Record<string, unknown>; strippedSensitiveFields: string[] } {
  const forbidden = ['fieldValues', 'freeText', 'phoneNumber', 'exactAddress', 'fileContent', 'priceAmount'];
  const strippedSensitiveFields = Object.keys(raw.extra ?? {}).filter((k) => forbidden.includes(k));
  return {
    safeEvent: {
      event: raw.event,
      formId: raw.formId,
      durationMs: raw.durationMs,
      timestamp: new Date().toISOString(),
    },
    strippedSensitiveFields,
  };
}
