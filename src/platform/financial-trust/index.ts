/**
 * @file src/platform/financial-trust/index.ts
 * @description Stage 17 (RT-FE-REBUILD-FINANCIAL-TRUST-BOUNDARY-017) Canonical Financial Trust Boundary.
 * Enforces zero client-determined financial success, explicit 10-state authoritative machine
 * (DEMO, UNAVAILABLE, CREATED, PENDING, PROCESSING, CONFIRMED, FAILED, REFUND_PENDING, REFUNDED, UNKNOWN),
 * strict separation of Customer Payment vs Customer Refund vs Provider Settlement,
 * and bans Math.random() tracking codes or client-forged receipts.
 */

export type AuthoritativeFinancialState =
  | 'DEMO'
  | 'UNAVAILABLE'
  | 'CREATED'
  | 'PENDING'
  | 'PROCESSING'
  | 'CONFIRMED'
  | 'FAILED'
  | 'REFUND_PENDING'
  | 'REFUNDED'
  | 'UNKNOWN';

export const AUTHORITATIVE_FINANCIAL_STATES: readonly AuthoritativeFinancialState[] = [
  'DEMO',
  'UNAVAILABLE',
  'CREATED',
  'PENDING',
  'PROCESSING',
  'CONFIRMED',
  'FAILED',
  'REFUND_PENDING',
  'REFUNDED',
  'UNKNOWN',
] as const;

export const FINANCIAL_STATE_LABELS_FA: Record<AuthoritativeFinancialState, string> = {
  DEMO: 'نمایشی — بدون تراکنش واقعی',
  UNAVAILABLE: 'درگاه پرداخت در حال حاضر فعال نیست',
  CREATED: 'تراکنش ایجاد شد',
  PENDING: 'در انتظار پرداخت',
  PROCESSING: 'در حال بررسی توسط سرور',
  CONFIRMED: 'پرداخت تأیید شد',
  FAILED: 'پرداخت ناموفق',
  REFUND_PENDING: 'درخواست بازپرداخت در حال بررسی',
  REFUNDED: 'بازپرداخت انجام شد',
  UNKNOWN: 'وضعیت نامشخص — نیازمند استعلام مجدد از سرور',
};

export interface BackendPaymentProof {
  paymentId: string;
  invoiceId: string;
  amountToman: number;
  currencyUnit: 'toman';
  providerStatus: AuthoritativeFinancialState;
  verifiedByServer: boolean;
  hmacSignatureValid: boolean;
  serverTrackingCode: string | null;
  serverReceiptId: string | null;
  verifiedAtIso: string | null;
}

export interface FinancialReconciliationResult {
  allowed: boolean;
  state: AuthoritativeFinancialState;
  labelFa: string;
  receiptIssued: boolean;
  invoiceBalanceDeducted: boolean;
  reasonFa: string;
  trackingCode: string | null;
  receiptId: string | null;
}

const CLIENT_FORGED_TRACKING_PATTERN = /^(FAKE|RANDOM|CLIENT|TEST-LOCAL)/i;

/**
 * Validates whether a payment confirmation proof comes from the authoritative server
 * and resolves the canonical 10-state financial status.
 * CRITICAL INVARIANT: `UNKNOWN` (timeout, network drop, ambiguous callback) MUST NEVER
 * be coerced into `CONFIRMED` or `FAILED`.
 */
export function reconcileFinancialTrustBoundary(params: {
  executionMode: 'DEMO' | 'REAL';
  gatewayAvailable: boolean;
  clientClaimedVerified?: boolean;
  clientGeneratedTrackingCode?: string;
  networkTimedOut?: boolean;
  serverProof?: Partial<BackendPaymentProof> | null;
}): FinancialReconciliationResult {
  if (params.executionMode === 'DEMO') {
    return {
      allowed: true,
      state: 'DEMO',
      labelFa: FINANCIAL_STATE_LABELS_FA.DEMO,
      receiptIssued: false,
      invoiceBalanceDeducted: false,
      reasonFa: 'این پرونده در حالت نمایشی (DEMO) قرار دارد و هیچ تراکنش بانکی یا رسید مالی واقعی صادر نمی‌شود.',
      trackingCode: null,
      receiptId: null,
    };
  }

  if (!params.gatewayAvailable) {
    return {
      allowed: false,
      state: 'UNAVAILABLE',
      labelFa: FINANCIAL_STATE_LABELS_FA.UNAVAILABLE,
      receiptIssued: false,
      invoiceBalanceDeducted: false,
      reasonFa: 'درگاه پرداخت در حال حاضر فعال نیست؛ امکان ایجاد یا تأیید تراکنش واقعی وجود ندارد.',
      trackingCode: null,
      receiptId: null,
    };
  }

  if (params.networkTimedOut) {
    return {
      allowed: false,
      state: 'UNKNOWN',
      labelFa: FINANCIAL_STATE_LABELS_FA.UNKNOWN,
      receiptIssued: false,
      invoiceBalanceDeducted: false,
      reasonFa: 'پاسخ استعلام سرور در مهلت مقرر دریافت نشد؛ وضعیت تراکنش نامشخص (UNKNOWN) است و به موفقیت یا شکست تبدیل نمی‌شود.',
      trackingCode: null,
      receiptId: null,
    };
  }

  if (!params.serverProof || params.serverProof.verifiedByServer !== true || params.serverProof.hmacSignatureValid !== true) {
    if (params.clientClaimedVerified || params.clientGeneratedTrackingCode) {
      return {
        allowed: false,
        state: 'PENDING',
        labelFa: FINANCIAL_STATE_LABELS_FA.PENDING,
        receiptIssued: false,
        invoiceBalanceDeducted: false,
        reasonFa: 'تأیید پرداخت از سمت مرورگر یا کد رهگیری محلی مسدود شد؛ تنها مدرک امضاشده سرور معتبر است.',
        trackingCode: null,
        receiptId: null,
      };
    }
    return {
      allowed: false,
      state: 'PROCESSING',
      labelFa: FINANCIAL_STATE_LABELS_FA.PROCESSING,
      receiptIssued: false,
      invoiceBalanceDeducted: false,
      reasonFa: 'بازگشت از درگاه به‌تنهایی اثبات پرداخت نیست؛ تراکنش در حال بررسی توسط سرور است.',
      trackingCode: null,
      receiptId: null,
    };
  }

  const status = params.serverProof.providerStatus ?? 'UNKNOWN';
  if (status === 'UNKNOWN') {
    return {
      allowed: false,
      state: 'UNKNOWN',
      labelFa: FINANCIAL_STATE_LABELS_FA.UNKNOWN,
      receiptIssued: false,
      invoiceBalanceDeducted: false,
      reasonFa: 'پاسخ درگاه مبهم است؛ وضعیت در حالت UNKNOWN باقی می‌ماند تا استعلام مجدد سرور انجام شود.',
      trackingCode: null,
      receiptId: null,
    };
  }

  if (status === 'FAILED') {
    return {
      allowed: true,
      state: 'FAILED',
      labelFa: FINANCIAL_STATE_LABELS_FA.FAILED,
      receiptIssued: false,
      invoiceBalanceDeducted: false,
      reasonFa: 'تراکنش طبق استعلام رسمی سرور ناموفق اعلام شد؛ هیچ مبلغی از مانده صورت‌حساب کسر نگردید.',
      trackingCode: params.serverProof.serverTrackingCode ?? null,
      receiptId: null,
    };
  }

  if (status === 'CONFIRMED') {
    const tracking = (params.serverProof.serverTrackingCode || '').trim();
    const receiptId = (params.serverProof.serverReceiptId || '').trim();
    if (!tracking || !receiptId || CLIENT_FORGED_TRACKING_PATTERN.test(tracking)) {
      return {
        allowed: false,
        state: 'UNKNOWN',
        labelFa: FINANCIAL_STATE_LABELS_FA.UNKNOWN,
        receiptIssued: false,
        invoiceBalanceDeducted: false,
        reasonFa: 'مدرک سرور فاقد شناسه رسید یا کد رهگیری معتبر سرور است؛ صدور رسید متوقف شد.',
        trackingCode: null,
        receiptId: null,
      };
    }
    return {
      allowed: true,
      state: 'CONFIRMED',
      labelFa: FINANCIAL_STATE_LABELS_FA.CONFIRMED,
      receiptIssued: true,
      invoiceBalanceDeducted: true,
      reasonFa: 'پرداخت با استعلام امضاشده سرور تأیید و رسید رسمی صادر شد.',
      trackingCode: tracking,
      receiptId,
    };
  }

  return {
    allowed: true,
    state: status,
    labelFa: FINANCIAL_STATE_LABELS_FA[status] || FINANCIAL_STATE_LABELS_FA.UNKNOWN,
    receiptIssued: false,
    invoiceBalanceDeducted: false,
    reasonFa: `وضعیت فعلی تراکنش در سرور: ${FINANCIAL_STATE_LABELS_FA[status] || status}`,
    trackingCode: params.serverProof.serverTrackingCode ?? null,
    receiptId: null,
  };
}

export interface ThreeWayFinancialSeparation {
  customerConfirmedPaidToman: number;
  customerRefundPendingToman: number;
  customerRefundedConfirmedToman: number;
  providerSettledToman: number;
  providerUnsettledBalanceToman: number;
  platformFeeToman: number;
  isSettlementDistinctFromPayment: true;
}

export function computeThreeWayFinancialSeparation(params: {
  confirmedPaymentsToman: number;
  refundPendingToman: number;
  refundConfirmedToman: number;
  platformFeeToman: number;
  providerSettledToman: number;
}): ThreeWayFinancialSeparation {
  const netCustomerCollected = Math.max(0, params.confirmedPaymentsToman - params.refundConfirmedToman);
  const netPayableToProvider = Math.max(0, netCustomerCollected - params.platformFeeToman - params.refundPendingToman);
  const providerUnsettledBalanceToman = Math.max(0, netPayableToProvider - params.providerSettledToman);
  return {
    customerConfirmedPaidToman: params.confirmedPaymentsToman,
    customerRefundPendingToman: params.refundPendingToman,
    customerRefundedConfirmedToman: params.refundConfirmedToman,
    providerSettledToman: params.providerSettledToman,
    providerUnsettledBalanceToman,
    platformFeeToman: params.platformFeeToman,
    isSettlementDistinctFromPayment: true,
  };
}
