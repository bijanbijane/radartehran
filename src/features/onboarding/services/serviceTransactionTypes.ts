/** @file src/features/onboarding/services/serviceTransactionTypes.ts — Stage 44 (RT-UI-SERVICE-TRANSACTION-001) Domain Types & Registries */

export type FinancialConceptId =
  | 'estimate'
  | 'quotation'
  | 'agreement'
  | 'contract'
  | 'invoice'
  | 'payment'
  | 'receipt'
  | 'settlement';

export type AgreementVersionStatus = 'پیشنهاد اولیه' | 'اصلاح‌شده' | 'آماده تأیید' | 'پذیرفته‌شده' | 'منسوخ‌شده';

export type ObligationStatus = 'انجام‌نشده' | 'در حال انجام' | 'انجام‌شده' | 'نیازمند بررسی' | 'متوقف‌شده' | 'لغوشده';

export type InvoiceStatus =
  | 'پیش‌نویس'
  | 'صادرشده'
  | 'در انتظار پرداخت'
  | 'بخشی پرداخت‌شده'
  | 'پرداخت‌شده'
  | 'سررسیدگذشته'
  | 'لغوشده'
  | 'اصلاح‌شده';

export type PaymentOperationStatus =
  | 'آماده پرداخت'
  | 'در حال انتقال'
  | 'در انتظار تأیید'
  | 'وضعیت نامشخص — نیازمند استعلام مجدد از سرور'
  | 'درگاه غیرفعال'
  | 'نمایشی (بدون تراکنش واقعی)'
  | 'موفق'
  | 'ناموفق'
  | 'لغوشده'
  | 'بازگشت وجه در انتظار'
  | 'بازپرداخت‌شده'
  | 'بازپرداخت جزئی';

export type AuthoritativeFinancialStatus =
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

export type DossierExecutionMode = 'DEMO' | 'REAL';

export interface ServerPaymentVerificationProof {
  verifiedByServer: boolean;
  providerStatus: 'CONFIRMED' | 'FAILED' | 'PENDING' | 'PROCESSING' | 'UNKNOWN' | 'UNAVAILABLE';
  serverTrackingCode?: string;
  serverReceiptId?: string;
  verifiedAtIso?: string;
  hmacSignatureValid?: boolean;
}

export type OfflineTransferVerificationState =
  | 'اعلام‌شده توسط پرداخت‌کننده'
  | 'دریافت وجه تأییدشده توسط ارائه‌دهنده'
  | 'تراکنش تأییدشده توسط سامانه پرداخت'
  | 'مبلغ تسویه‌شده';

export type RefundStatus =
  | 'درخواست ثبت‌شده'
  | 'در انتظار بررسی'
  | 'تأییدشده'
  | 'ردشده'
  | 'در انتظار انتقال'
  | 'انجام‌شده'
  | 'ناموفق'
  | 'بازپرداخت جزئی';

export type CancellationScenarioKind =
  | 'cancel_request'
  | 'reject_quote'
  | 'cancel_agreement'
  | 'pause_service'
  | 'revise_agreement'
  | 'request_refund';

export type TransactionViewerRole = 'applicant' | 'provider' | 'admin' | 'unauthorized_third_party';


export interface FinancialConceptDefinition {
  id: FinancialConceptId;
  titleFa: string;
  questionAnsweredFa: string;
  boundaryRuleFa: string;
}

export const EIGHT_FINANCIAL_CONCEPTS: readonly FinancialConceptDefinition[] = [
  { id: 'estimate', titleFa: '۱. برآورد اولیه', questionAnsweredFa: 'هزینه احتمالی چقدر است؟', boundaryRuleFa: 'برآورد اولیه الزاماً تعهد قطعی قیمت نیست.' },
  { id: 'quotation', titleFa: '۲. پیشنهاد قیمت', questionAnsweredFa: 'ارائه‌دهنده چه مبلغی پیشنهاد داده؟', boundaryRuleFa: 'مبلغ، دامنه، مدت اعتبار و موارد خارج از تعهد باید شفاف باشد.' },
  { id: 'agreement', titleFa: '۳. توافق نهایی', questionAnsweredFa: 'طرفین روی چه شرایطی موافق‌اند؟', boundaryRuleFa: 'تغییر مبلغ یا دامنه پس از پذیرش، نسخه جدید و تأیید مجدد می‌خواهد.' },
  { id: 'contract', titleFa: '۴. قرارداد رسمی', questionAnsweredFa: 'چه تعهداتی به شکل سند قراردادی ثبت شده‌اند؟', boundaryRuleFa: 'فشردن دکمه «موافقم» بدون الزامات حقوقی، امضای الکترونیکی معتبر محسوب نمی‌شود.' },
  { id: 'invoice', titleFa: '۵. صورت‌حساب', questionAnsweredFa: 'چه مبلغی باید پرداخت شود؟', boundaryRuleFa: 'صورت‌حساب با پیش‌فاکتور و رسید یکسان نیست و بی‌سابقه تغییر نمی‌کند.' },
  { id: 'payment', titleFa: '۶. پرداخت', questionAnsweredFa: 'چه مبلغی واقعاً پرداخت شده است؟', boundaryRuleFa: 'بازگشت از درگاه به‌تنهایی اثبات موفقیت پرداخت نیست.' },
  { id: 'receipt', titleFa: '۷. رسید پرداخت', questionAnsweredFa: 'پرداخت چگونه مستند شده است؟', boundaryRuleFa: 'رسید فقط پس از تأیید معتبر پرداخت صادر می‌شود.' },
  { id: 'settlement', titleFa: '۸. تسویه با ارائه‌دهنده', questionAnsweredFa: 'مبلغ دریافتی چه زمانی به ارائه‌دهنده منتقل شده؟', boundaryRuleFa: 'پرداخت موفق مشتری به معنی انجام تسویه با ارائه‌دهنده نیست.' },
] as const;

export const STAGE44_DESIGN_COMPONENT_IDS = [
  'TXN-01', 'TXN-02', 'TXN-03', 'TXN-04', 'TXN-05', 'TXN-06', 'TXN-07', 'TXN-08', 'TXN-09', 'TXN-10',
  'TXN-11', 'TXN-12', 'TXN-13', 'TXN-14', 'TXN-15', 'TXN-16', 'TXN-17', 'TXN-18', 'TXN-19', 'TXN-20',
  'TXN-21', 'TXN-22', 'TXN-23', 'TXN-24', 'TXN-25', 'TXN-26', 'TXN-27', 'TXN-28', 'TXN-29', 'TXN-30',
] as const;

export const STAGE44_UX_EVENTS = [
  'agreement_reviewed', 'agreement_change_requested', 'agreement_accepted', 'agreement_version_created',
  'invoice_created', 'invoice_viewed', 'payment_started', 'payment_confirmed', 'payment_failed',
  'refund_requested', 'refund_completed', 'payment_receipt_downloaded',
  'financial_dispute_submitted', 'provider_settlement_completed',
] as const;

export interface AgreementPartyInfo {
  userId: string;
  displayNameFa: string;
  roleFa: 'درخواست‌کننده' | 'ارائه‌دهنده';
  verifiedIdentityLabelFa: string;
  allowedContactFa: string;
  representativeNoteFa?: string;
}

export interface AgreementVersionRecord {
  versionId: string;
  versionNumber: number;
  versionLabel: string;
  status: AgreementVersionStatus;
  createdAtFa: string;
  createdByFa: string;
  changeSummaryFa: string;
  changesFromPreviousFa: string[];
  subjectTitleFa: string;
  scopeIncludedFa: string[];
  outOfScopeFa: string[];
  timelineFa: {
    proposedStartDateFa: string;
    estimatedDurationFa: string;
    executionStagesFa: string[];
    deliveryDeadlineFa: string;
    rescheduleConditionFa: string;
  };
  amountToman: number;
  sideCostsToman: number;
  discountToman: number;
  platformFeeToman: number;
  paymentTermsFa: string;
  supplementaryTermsFa: {
    cancellationFa: string;
    scopeChangeFa: string;
    delayFa: string;
    deliveryAndReviewFa: string;
    disputeResolutionFa: string;
  };
  applicantApproved: boolean;
  applicantApprovedAtFa?: string;
  providerApproved: boolean;
  providerApprovedAtFa?: string;
}

export interface PartyObligationItem {
  obligationId: string;
  titleFa: string;
  responsibleRole: 'applicant' | 'provider';
  responsibleLabelFa: 'درخواست‌کننده' | 'ارائه‌دهنده';
  dueConditionFa: string;
  status: ObligationStatus;
  descriptionFa: string;
  linkedStageFa: string;
}

export interface InvoiceLineItem {
  itemId: string;
  titleFa: string;
  descriptionFa: string;
  amountToman: number;
  isMandatory: boolean;
  isEstimated: boolean;
  category: 'base_service' | 'extra_service' | 'visit_fee' | 'materials' | 'transport' | 'discount' | 'verified_tax' | 'platform_fee';
}

export interface ProformaDocument {
  proformaId: string;
  issuedAtFa: string;
  validUntilFa: string;
  scopeSummaryFa: string;
  estimatedTotalToman: number;
  limitationsFa: string;
}

export interface ServiceInvoiceRecord {
  invoiceId: string;
  invoiceNumber: string;
  agreementVersionId: string;
  agreementVersionLabel: string;
  issuedAtFa: string;
  dueAtFa: string;
  currencyUnit: 'toman';
  items: InvoiceLineItem[];
  discountToman: number;
  discountAppliedToFa: string;
  verifiedTaxToman: number | null;
  taxNoteFa: string;
  platformFeeToman: number;
  totalPayableToman: number;
  paidToman: number;
  remainingToman: number;
  status: InvoiceStatus;
  supersedesInvoiceId?: string;
  revisionReasonFa?: string;
}

export interface MilestonePaymentItem {
  milestoneId: string;
  titleFa: string;
  stageOrder: number;
  amountToman: number;
  executionStatus: 'شروع‌نشده' | 'در حال اجرا' | 'انجام‌شده' | 'تأییدشده';
  paymentStatus: 'در انتظار سررسید' | 'آماده پرداخت' | 'پرداخت‌شده' | 'لغوشده';
  linkedInvoiceId?: string;
}

export interface PaymentOperationRecord {
  paymentId: string;
  invoiceId: string;
  invoiceNumber: string;
  createdAtFa: string;
  finalizedAtFa?: string;
  amountToman: number;
  currencyUnit: 'toman';
  methodId: 'shaparak_gateway' | 'bank_transfer_declared';
  methodLabelFa: string;
  status: PaymentOperationStatus;
  authoritativeStatus?: AuthoritativeFinancialStatus;
  isDemoFixture?: boolean;
  isPartialPayment: boolean;
  gatewayVerifiedSourceFa: string;
  trackingCode?: string;
  offlineVerificationState?: OfflineTransferVerificationState;
  idempotencyKey: string;
}

export interface PaymentReceiptRecord {
  receiptId: string;
  receiptType: 'payment' | 'refund';
  paymentId: string;
  invoiceId: string;
  agreementVersionLabel: string;
  issuedAtFa: string;
  payerNameFa: string;
  payeeNameFa: string;
  serviceTitleFa: string;
  amountToman: number;
  currencyUnit: 'toman';
  methodLabelFa: string;
  trackingCode: string;
  statusLabelFa: string;
  isPartial: boolean;
  isDemoFixture?: boolean;
  issuedByServer?: boolean;
}

export interface RefundRequestRecord {
  refundId: string;
  originalPaymentId: string;
  originalAmountToman: number;
  requestedAmountToman: number;
  approvedAmountToman: number;
  reasonFa: string;
  requestedAtFa: string;
  status: RefundStatus;
  authoritativeStatus?: AuthoritativeFinancialStatus;
  refundTrackingCode?: string;
  verifiedByServer?: boolean;
}

export interface SettlementRecord {
  settlementId: string;
  supportedByInfrastructure: boolean;
  statusFa: 'در انتظار زیرساخت تسویه رسمی' | 'در صف تسویه' | 'تسویه‌شده';
  settledAmountToman: number;
  noteFa: string;
}

export interface ServiceTransactionDossier {
  dossierId: string;
  executionMode?: DossierExecutionMode;
  isFixtureDemo?: boolean;
  paymentGatewayAvailable?: boolean;
  requestId: string;
  quoteId: string;
  subjectPropertyRef: string;
  locationSummaryFa: string;
  applicant: AgreementPartyInfo;
  provider: AgreementPartyInfo;
  serviceTitleFa: string;
  proforma: ProformaDocument;
  agreementVersions: AgreementVersionRecord[];
  activeVersionId: string;
  obligations: PartyObligationItem[];
  invoices: ServiceInvoiceRecord[];
  milestones: MilestonePaymentItem[];
  payments: PaymentOperationRecord[];
  receipts: PaymentReceiptRecord[];
  refunds: RefundRequestRecord[];
  settlement: SettlementRecord;
  supportedPaymentMethods: Array<{ id: 'shaparak_gateway' | 'bank_transfer_declared'; labelFa: string; supported: boolean; noteFa: string }>;
  auditHistoryFa: Array<{ id: string; timestampFa: string; actorFa: string; actionFa: string }>;
}

