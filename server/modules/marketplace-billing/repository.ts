/**
 * Employee 67 — Marketplace Billing Persistence Repository & Default Adapters
 * (`server/modules/marketplace-billing/repository.ts`)
 *
 * Exclusive ownership: `server/modules/marketplace-billing/`
 */

import crypto from 'node:crypto';
import { runDurableTransaction } from '../core';
import type { TransactionContextLike, TransactionRunnerAdapter } from '../core/types';
import type {
  AuthoritativeFinancialLedgerAdapter,
  BillingCurrency,
  BillingNotificationAdapter,
  BillingProductRecord,
  BrokerageAndCommissionReferenceAdapter,
  CommissionBillingReferenceRecord,
  CouponDefinitionRecord,
  CouponRedemptionRecord,
  CreditNoteRecord,
  CustomerAndOrganizationDirectoryAdapter,
  EntitlementGrantRecord,
  EntitlementPolicyRecord,
  FinancialDocumentManagementAdapter,
  LedgerPostingEntry,
  MarketplaceInvoiceRecord,
  MarketplaceSubscriptionRecord,
  PaymentHistoryEntry,
  PaymentIntentRecord,
  PaymentProviderAdapter,
  PaymentProviderConfigReference,
  PricingVersionRecord,
  ProviderWebhookPayload,
  ReconciliationBatchRecord,
  ReconciliationExceptionRecord,
  RefundRequestRecord,
  SubscriptionHistoryEntryRecord,
  UsageBillingEventRecord,
} from './types';

export interface InMemoryMarketplaceBillingBackingStore {
  docs: Map<string, Record<string, unknown>>;
}

export function createInMemoryMarketplaceBillingTxRunner(
  backingStore: InMemoryMarketplaceBillingBackingStore = { docs: new Map() },
): TransactionRunnerAdapter & { backingStore: InMemoryMarketplaceBillingBackingStore } {
  return {
    backingStore,
    async runTransaction<T>(work: (tx: TransactionContextLike) => Promise<T>): Promise<T> {
      const stagedWrites = new Map<string, Record<string, unknown> | null>();
      const tx: TransactionContextLike = {
        async get<D = Record<string, unknown>>(docPath: string): Promise<{ exists: boolean; data?: D }> {
          if (stagedWrites.has(docPath)) {
            const staged = stagedWrites.get(docPath);
            return staged ? { exists: true, data: structuredClone(staged) as D } : { exists: false };
          }
          const existing = backingStore.docs.get(docPath);
          return existing ? { exists: true, data: structuredClone(existing) as D } : { exists: false };
        },
        set<D = Record<string, unknown>>(docPath: string, data: D, options?: { merge?: boolean }): void {
          if (options?.merge) {
            const prev = stagedWrites.has(docPath)
              ? stagedWrites.get(docPath)
              : backingStore.docs.get(docPath);
            stagedWrites.set(docPath, {
              ...(prev ? structuredClone(prev) : {}),
              ...(structuredClone(data) as Record<string, unknown>),
            });
          } else {
            stagedWrites.set(docPath, structuredClone(data) as Record<string, unknown>);
          }
        },
        update(docPath: string, partial: Record<string, unknown>): void {
          const prev = stagedWrites.has(docPath)
            ? stagedWrites.get(docPath)
            : backingStore.docs.get(docPath);
          stagedWrites.set(docPath, {
            ...(prev ? structuredClone(prev) : {}),
            ...structuredClone(partial),
          });
        },
        delete(docPath: string): void {
          stagedWrites.set(docPath, null);
        },
      };

      const result = await work(tx);
      for (const [docPath, value] of stagedWrites.entries()) {
        if (value === null) {
          backingStore.docs.delete(docPath);
        } else {
          backingStore.docs.set(docPath, value);
        }
      }
      return result;
    },
  };
}

interface BoundedIndexDocument {
  ids: string[];
  updatedAtIso: string;
}

const MAX_BOUNDED_INDEX_IDS = 500;

export class MarketplaceBillingRepository {
  private readonly txRunner: TransactionRunnerAdapter;
  private cachedPublicCatalog: {
    expiresAtMs: number;
    items: Array<{ product: BillingProductRecord; activePricing: PricingVersionRecord }>;
  } | null = null;

  constructor(txRunner: TransactionRunnerAdapter) {
    this.txRunner = txRunner;
  }

  public async runInTransaction<T>(
    operationName: string,
    work: (tx: TransactionContextLike) => Promise<T>,
  ): Promise<T> {
    return runDurableTransaction(this.txRunner, { operationName }, work);
  }

  private writeDoc(tx: TransactionContextLike, docPath: string, data: unknown): void {
    tx.set(docPath, data as Record<string, unknown>);
  }

  public invalidatePricingCatalogCache(): void {
    this.cachedPublicCatalog = null;
  }

  public getCachedPricingCatalog(nowMs = Date.now()): Array<{
    product: BillingProductRecord;
    activePricing: PricingVersionRecord;
  }> | null {
    if (this.cachedPublicCatalog && this.cachedPublicCatalog.expiresAtMs > nowMs) {
      return structuredClone(this.cachedPublicCatalog.items);
    }
    return null;
  }

  public setCachedPricingCatalog(
    items: Array<{ product: BillingProductRecord; activePricing: PricingVersionRecord }>,
    ttlMs = 60_000,
  ): void {
    this.cachedPublicCatalog = {
      expiresAtMs: Date.now() + ttlMs,
      items: structuredClone(items),
    };
  }

  private async appendBoundedIndexId(
    tx: TransactionContextLike,
    indexDocPath: string,
    id: string,
  ): Promise<void> {
    const snap = await tx.get<BoundedIndexDocument>(indexDocPath);
    const existingIds = snap.exists && Array.isArray(snap.data?.ids) ? snap.data!.ids : [];
    const deduped = [id, ...existingIds.filter((item) => item !== id)].slice(0, MAX_BOUNDED_INDEX_IDS);
    this.writeDoc(tx, indexDocPath, {
      ids: deduped,
      updatedAtIso: new Date().toISOString(),
    });
  }

  private async getIndexedRecords<T>(
    tx: TransactionContextLike,
    indexDocPath: string,
    collectionName: string,
  ): Promise<T[]> {
    const snap = await tx.get<BoundedIndexDocument>(indexDocPath);
    const ids = snap.exists && Array.isArray(snap.data?.ids) ? snap.data!.ids : [];
    const records: T[] = [];
    for (const id of ids) {
      const docSnap = await tx.get<T>(`${collectionName}/${id}`);
      if (docSnap.exists && docSnap.data) {
        records.push(docSnap.data);
      }
    }
    return records;
  }

  // ---- Billing Products & Pricing Versions ----

  public async getProductInTx(tx: TransactionContextLike, productId: string): Promise<BillingProductRecord | null> {
    const snap = await tx.get<BillingProductRecord>(`mb_products/${productId}`);
    return snap.exists && snap.data ? snap.data : null;
  }

  public async upsertProductInTx(tx: TransactionContextLike, product: BillingProductRecord): Promise<void> {
    this.writeDoc(tx, `mb_products/${product.productId}`, product);
    await this.appendBoundedIndexId(tx, 'mb_indexes/all_products', product.productId);
  }

  public async listAllProductsInTx(tx: TransactionContextLike): Promise<BillingProductRecord[]> {
    return this.getIndexedRecords<BillingProductRecord>(tx, 'mb_indexes/all_products', 'mb_products');
  }

  public async getPricingVersionInTx(
    tx: TransactionContextLike,
    pricingVersionId: string,
  ): Promise<PricingVersionRecord | null> {
    const snap = await tx.get<PricingVersionRecord>(`mb_pricing_versions/${pricingVersionId}`);
    return snap.exists && snap.data ? snap.data : null;
  }

  public async upsertPricingVersionInTx(
    tx: TransactionContextLike,
    version: PricingVersionRecord,
  ): Promise<void> {
    this.writeDoc(tx, `mb_pricing_versions/${version.pricingVersionId}`, version);
    await this.appendBoundedIndexId(
      tx,
      `mb_pricing_by_product/${version.productId}`,
      version.pricingVersionId,
    );
  }

  // ---- Entitlement Policies & Grants ----

  public async getEntitlementPolicyInTx(
    tx: TransactionContextLike,
    policyId: string,
  ): Promise<EntitlementPolicyRecord | null> {
    const snap = await tx.get<EntitlementPolicyRecord>(`mb_entitlement_policies/${policyId}`);
    return snap.exists && snap.data ? snap.data : null;
  }

  public async upsertEntitlementPolicyInTx(
    tx: TransactionContextLike,
    policy: EntitlementPolicyRecord,
  ): Promise<void> {
    this.writeDoc(tx, `mb_entitlement_policies/${policy.policyId}`, policy);
    await this.appendBoundedIndexId(tx, 'mb_indexes/all_entitlement_policies', policy.policyId);
  }

  public async getEntitlementGrantInTx(
    tx: TransactionContextLike,
    grantId: string,
  ): Promise<EntitlementGrantRecord | null> {
    const snap = await tx.get<EntitlementGrantRecord>(`mb_entitlement_grants/${grantId}`);
    return snap.exists && snap.data ? snap.data : null;
  }

  public async upsertEntitlementGrantInTx(
    tx: TransactionContextLike,
    grant: EntitlementGrantRecord,
  ): Promise<void> {
    this.writeDoc(tx, `mb_entitlement_grants/${grant.grantId}`, grant);
    await this.appendBoundedIndexId(tx, `mb_grants_by_owner/${grant.ownerUid}`, grant.grantId);
    if (grant.organizationId) {
      await this.appendBoundedIndexId(tx, `mb_grants_by_org/${grant.organizationId}`, grant.grantId);
    }
    await this.appendBoundedIndexId(tx, `mb_grants_by_source/${grant.sourceReferenceId}`, grant.grantId);
  }

  public async listEntitlementGrantsForSubjectInTx(
    tx: TransactionContextLike,
    ownerUid: string,
    organizationId?: string | null,
  ): Promise<EntitlementGrantRecord[]> {
    const ownerGrants = await this.getIndexedRecords<EntitlementGrantRecord>(
      tx,
      `mb_grants_by_owner/${ownerUid}`,
      'mb_entitlement_grants',
    );
    if (!organizationId) return ownerGrants;
    const orgGrants = await this.getIndexedRecords<EntitlementGrantRecord>(
      tx,
      `mb_grants_by_org/${organizationId}`,
      'mb_entitlement_grants',
    );
    const byId = new Map<string, EntitlementGrantRecord>();
    for (const g of [...ownerGrants, ...orgGrants]) {
      byId.set(g.grantId, g);
    }
    return Array.from(byId.values());
  }

  public async listEntitlementGrantsBySourceInTx(
    tx: TransactionContextLike,
    sourceReferenceId: string,
  ): Promise<EntitlementGrantRecord[]> {
    return this.getIndexedRecords<EntitlementGrantRecord>(
      tx,
      `mb_grants_by_source/${sourceReferenceId}`,
      'mb_entitlement_grants',
    );
  }

  // ---- Payment Intents & History ----

  public async getPaymentIntentInTx(
    tx: TransactionContextLike,
    paymentIntentId: string,
  ): Promise<PaymentIntentRecord | null> {
    const snap = await tx.get<PaymentIntentRecord>(`mb_payment_intents/${paymentIntentId}`);
    return snap.exists && snap.data ? snap.data : null;
  }

  public async getPaymentIntentByIdempotencyInTx(
    tx: TransactionContextLike,
    payerUid: string,
    idempotencyKey: string,
  ): Promise<PaymentIntentRecord | null> {
    const snap = await tx.get<{ paymentIntentId: string }>(
      `mb_payment_intent_idempotency/${payerUid}__${idempotencyKey}`,
    );
    if (!snap.exists || !snap.data?.paymentIntentId) return null;
    return this.getPaymentIntentInTx(tx, snap.data.paymentIntentId);
  }

  public async upsertPaymentIntentInTx(
    tx: TransactionContextLike,
    intent: PaymentIntentRecord,
  ): Promise<void> {
    this.writeDoc(tx, `mb_payment_intents/${intent.paymentIntentId}`, intent);
    this.writeDoc(tx, `mb_payment_intent_idempotency/${intent.payerUid}__${intent.idempotencyKey}`, {
      paymentIntentId: intent.paymentIntentId,
      createdAtIso: intent.createdAtIso,
    });
    await this.appendBoundedIndexId(tx, `mb_intents_by_payer/${intent.payerUid}`, intent.paymentIntentId);
    await this.appendBoundedIndexId(tx, 'mb_indexes/all_payment_intents', intent.paymentIntentId);
  }

  public async listAllPaymentIntentsInTx(tx: TransactionContextLike): Promise<PaymentIntentRecord[]> {
    return this.getIndexedRecords<PaymentIntentRecord>(
      tx,
      'mb_indexes/all_payment_intents',
      'mb_payment_intents',
    );
  }

  public async appendPaymentHistoryInTx(
    tx: TransactionContextLike,
    paymentIntentId: string,
    entry: PaymentHistoryEntry,
  ): Promise<void> {
    this.writeDoc(tx, `mb_payment_history/${entry.eventId}`, entry);
    await this.appendBoundedIndexId(
      tx,
      `mb_payment_history_by_intent/${paymentIntentId}`,
      entry.eventId,
    );
  }

  public async listPaymentHistoryInTx(
    tx: TransactionContextLike,
    paymentIntentId: string,
  ): Promise<PaymentHistoryEntry[]> {
    const items = await this.getIndexedRecords<PaymentHistoryEntry>(
      tx,
      `mb_payment_history_by_intent/${paymentIntentId}`,
      'mb_payment_history',
    );
    return items.sort((a, b) => a.timestampIso.localeCompare(b.timestampIso));
  }

  // ---- Webhook Replay Protection ----

  public async hasProcessedWebhookEventInTx(
    tx: TransactionContextLike,
    providerId: string,
    webhookEventId: string,
  ): Promise<boolean> {
    const snap = await tx.get<{ processedAtIso: string }>(
      `mb_webhook_events/${providerId}__${webhookEventId}`,
    );
    return snap.exists;
  }

  public async markWebhookEventProcessedInTx(
    tx: TransactionContextLike,
    providerId: string,
    webhookEventId: string,
    paymentIntentId: string,
  ): Promise<void> {
    this.writeDoc(tx, `mb_webhook_events/${providerId}__${webhookEventId}`, {
      providerId,
      webhookEventId,
      paymentIntentId,
      processedAtIso: new Date().toISOString(),
    });
  }

  // ---- Invoices & Credit Notes ----

  public async nextInvoiceSequenceNumberInTx(tx: TransactionContextLike, prefix: 'INV' | 'CN'): Promise<string> {
    const key = `mb_sequences/${prefix}`;
    const snap = await tx.get<{ seq: number }>(key);
    const nextSeq = (snap.exists && typeof snap.data?.seq === 'number' ? snap.data.seq : 1000) + 1;
    this.writeDoc(tx, key, { seq: nextSeq });
    const ym = new Date().toISOString().slice(0, 7).replace('-', '');
    return `${prefix}-${ym}-${String(nextSeq).padStart(6, '0')}`;
  }

  public async getInvoiceInTx(
    tx: TransactionContextLike,
    invoiceId: string,
  ): Promise<MarketplaceInvoiceRecord | null> {
    const snap = await tx.get<MarketplaceInvoiceRecord>(`mb_invoices/${invoiceId}`);
    return snap.exists && snap.data ? snap.data : null;
  }

  public async upsertInvoiceInTx(
    tx: TransactionContextLike,
    invoice: MarketplaceInvoiceRecord,
  ): Promise<void> {
    this.writeDoc(tx, `mb_invoices/${invoice.invoiceId}`, invoice);
    await this.appendBoundedIndexId(tx, `mb_invoices_by_customer/${invoice.customerUid}`, invoice.invoiceId);
    if (invoice.organizationId) {
      await this.appendBoundedIndexId(tx, `mb_invoices_by_org/${invoice.organizationId}`, invoice.invoiceId);
    }
    await this.appendBoundedIndexId(tx, 'mb_indexes/all_invoices', invoice.invoiceId);
  }

  public async listCustomerInvoicesInTx(
    tx: TransactionContextLike,
    customerUid: string,
  ): Promise<MarketplaceInvoiceRecord[]> {
    return this.getIndexedRecords<MarketplaceInvoiceRecord>(
      tx,
      `mb_invoices_by_customer/${customerUid}`,
      'mb_invoices',
    );
  }

  public async upsertCreditNoteInTx(tx: TransactionContextLike, creditNote: CreditNoteRecord): Promise<void> {
    this.writeDoc(tx, `mb_credit_notes/${creditNote.creditNoteId}`, creditNote);
    await this.appendBoundedIndexId(
      tx,
      `mb_credit_notes_by_invoice/${creditNote.invoiceId}`,
      creditNote.creditNoteId,
    );
  }

  public async listCreditNotesForInvoiceInTx(
    tx: TransactionContextLike,
    invoiceId: string,
  ): Promise<CreditNoteRecord[]> {
    return this.getIndexedRecords<CreditNoteRecord>(
      tx,
      `mb_credit_notes_by_invoice/${invoiceId}`,
      'mb_credit_notes',
    );
  }

  // ---- Subscriptions & Subscription History ----

  public async getSubscriptionInTx(
    tx: TransactionContextLike,
    subscriptionId: string,
  ): Promise<MarketplaceSubscriptionRecord | null> {
    const snap = await tx.get<MarketplaceSubscriptionRecord>(`mb_subscriptions/${subscriptionId}`);
    return snap.exists && snap.data ? snap.data : null;
  }

  public async upsertSubscriptionInTx(
    tx: TransactionContextLike,
    sub: MarketplaceSubscriptionRecord,
  ): Promise<void> {
    this.writeDoc(tx, `mb_subscriptions/${sub.subscriptionId}`, sub);
    await this.appendBoundedIndexId(tx, `mb_subscriptions_by_user/${sub.subscriberUid}`, sub.subscriptionId);
    if (sub.organizationId) {
      await this.appendBoundedIndexId(tx, `mb_subscriptions_by_org/${sub.organizationId}`, sub.subscriptionId);
    }
    await this.appendBoundedIndexId(tx, 'mb_indexes/all_subscriptions', sub.subscriptionId);
  }

  public async listUserSubscriptionsInTx(
    tx: TransactionContextLike,
    subscriberUid: string,
  ): Promise<MarketplaceSubscriptionRecord[]> {
    return this.getIndexedRecords<MarketplaceSubscriptionRecord>(
      tx,
      `mb_subscriptions_by_user/${subscriberUid}`,
      'mb_subscriptions',
    );
  }

  public async listAllSubscriptionsInTx(
    tx: TransactionContextLike,
  ): Promise<MarketplaceSubscriptionRecord[]> {
    return this.getIndexedRecords<MarketplaceSubscriptionRecord>(
      tx,
      'mb_indexes/all_subscriptions',
      'mb_subscriptions',
    );
  }

  public async appendSubscriptionHistoryInTx(
    tx: TransactionContextLike,
    entry: SubscriptionHistoryEntryRecord,
  ): Promise<void> {
    this.writeDoc(tx, `mb_subscription_history/${entry.historyId}`, entry);
    await this.appendBoundedIndexId(
      tx,
      `mb_subscription_history_by_sub/${entry.subscriptionId}`,
      entry.historyId,
    );
  }

  public async listSubscriptionHistoryInTx(
    tx: TransactionContextLike,
    subscriptionId: string,
  ): Promise<SubscriptionHistoryEntryRecord[]> {
    const entries = await this.getIndexedRecords<SubscriptionHistoryEntryRecord>(
      tx,
      `mb_subscription_history_by_sub/${subscriptionId}`,
      'mb_subscription_history',
    );
    return entries.sort((a, b) => a.timestampIso.localeCompare(b.timestampIso));
  }

  // ---- Coupons & Redemptions ----

  public async getCouponByCodeInTx(
    tx: TransactionContextLike,
    code: string,
  ): Promise<CouponDefinitionRecord | null> {
    const normalized = code.trim().toUpperCase();
    const snap = await tx.get<CouponDefinitionRecord>(`mb_coupons/${normalized}`);
    return snap.exists && snap.data ? snap.data : null;
  }

  public async upsertCouponInTx(tx: TransactionContextLike, coupon: CouponDefinitionRecord): Promise<void> {
    this.writeDoc(tx, `mb_coupons/${coupon.code}`, coupon);
    await this.appendBoundedIndexId(tx, 'mb_indexes/all_coupons', coupon.code);
  }

  public async recordCouponRedemptionInTx(
    tx: TransactionContextLike,
    redemption: CouponRedemptionRecord,
  ): Promise<void> {
    this.writeDoc(tx, `mb_coupon_redemptions/${redemption.redemptionId}`, redemption);
    await this.appendBoundedIndexId(
      tx,
      `mb_coupon_redemptions_by_user/${redemption.couponCode}__${redemption.userUid}`,
      redemption.redemptionId,
    );
  }

  public async listUserCouponRedemptionsInTx(
    tx: TransactionContextLike,
    couponCode: string,
    userUid: string,
  ): Promise<CouponRedemptionRecord[]> {
    return this.getIndexedRecords<CouponRedemptionRecord>(
      tx,
      `mb_coupon_redemptions_by_user/${couponCode.toUpperCase()}__${userUid}`,
      'mb_coupon_redemptions',
    );
  }

  // ---- Refunds ----

  public async getRefundInTx(
    tx: TransactionContextLike,
    refundId: string,
  ): Promise<RefundRequestRecord | null> {
    const snap = await tx.get<RefundRequestRecord>(`mb_refunds/${refundId}`);
    return snap.exists && snap.data ? snap.data : null;
  }

  public async getRefundByIdempotencyInTx(
    tx: TransactionContextLike,
    requesterUid: string,
    idempotencyKey: string,
  ): Promise<RefundRequestRecord | null> {
    const snap = await tx.get<{ refundId: string }>(
      `mb_refund_idempotency/${requesterUid}__${idempotencyKey}`,
    );
    if (!snap.exists || !snap.data?.refundId) return null;
    return this.getRefundInTx(tx, snap.data.refundId);
  }

  public async upsertRefundInTx(tx: TransactionContextLike, refund: RefundRequestRecord): Promise<void> {
    this.writeDoc(tx, `mb_refunds/${refund.refundId}`, refund);
    this.writeDoc(tx, `mb_refund_idempotency/${refund.requesterUid}__${refund.idempotencyKey}`, {
      refundId: refund.refundId,
      createdAtIso: refund.createdAtIso,
    });
    await this.appendBoundedIndexId(tx, `mb_refunds_by_intent/${refund.paymentIntentId}`, refund.refundId);
    await this.appendBoundedIndexId(tx, 'mb_indexes/all_refunds', refund.refundId);
  }

  public async listRefundsByPaymentIntentInTx(
    tx: TransactionContextLike,
    paymentIntentId: string,
  ): Promise<RefundRequestRecord[]> {
    return this.getIndexedRecords<RefundRequestRecord>(
      tx,
      `mb_refunds_by_intent/${paymentIntentId}`,
      'mb_refunds',
    );
  }

  // ---- Usage Billing Events ----

  public async getUsageEventByIdempotencyInTx(
    tx: TransactionContextLike,
    ownerUid: string,
    idempotencyKey: string,
  ): Promise<UsageBillingEventRecord | null> {
    const snap = await tx.get<{ usageEventId: string }>(
      `mb_usage_idempotency/${ownerUid}__${idempotencyKey}`,
    );
    if (!snap.exists || !snap.data?.usageEventId) return null;
    const evtSnap = await tx.get<UsageBillingEventRecord>(`mb_usage_events/${snap.data.usageEventId}`);
    return evtSnap.exists && evtSnap.data ? evtSnap.data : null;
  }

  public async getUsageEventInTx(
    tx: TransactionContextLike,
    usageEventId: string,
  ): Promise<UsageBillingEventRecord | null> {
    const snap = await tx.get<UsageBillingEventRecord>(`mb_usage_events/${usageEventId}`);
    return snap.exists && snap.data ? snap.data : null;
  }

  public async upsertUsageEventInTx(
    tx: TransactionContextLike,
    event: UsageBillingEventRecord,
  ): Promise<void> {
    this.writeDoc(tx, `mb_usage_events/${event.usageEventId}`, event);
    this.writeDoc(tx, `mb_usage_idempotency/${event.ownerUid}__${event.idempotencyKey}`, {
      usageEventId: event.usageEventId,
      recordedAtIso: event.recordedAtIso,
    });
    await this.appendBoundedIndexId(
      tx,
      `mb_usage_by_owner_period/${event.ownerUid}__${event.billingPeriodKey}`,
      event.usageEventId,
    );
  }

  public async listUsageEventsByOwnerPeriodInTx(
    tx: TransactionContextLike,
    ownerUid: string,
    billingPeriodKey: string,
  ): Promise<UsageBillingEventRecord[]> {
    return this.getIndexedRecords<UsageBillingEventRecord>(
      tx,
      `mb_usage_by_owner_period/${ownerUid}__${billingPeriodKey}`,
      'mb_usage_events',
    );
  }

  // ---- Commission References ----

  public async upsertCommissionBillingReferenceInTx(
    tx: TransactionContextLike,
    ref: CommissionBillingReferenceRecord,
  ): Promise<void> {
    this.writeDoc(tx, `mb_commission_references/${ref.referenceId}`, ref);
    await this.appendBoundedIndexId(tx, 'mb_indexes/all_commission_refs', ref.referenceId);
  }

  // ---- Reconciliation Batches & Exceptions ----

  public async upsertReconciliationBatchInTx(
    tx: TransactionContextLike,
    batch: ReconciliationBatchRecord,
  ): Promise<void> {
    this.writeDoc(tx, `mb_reconciliation_batches/${batch.batchId}`, batch);
    await this.appendBoundedIndexId(tx, 'mb_indexes/all_reconciliation_batches', batch.batchId);
  }

  public async getReconciliationBatchInTx(
    tx: TransactionContextLike,
    batchId: string,
  ): Promise<ReconciliationBatchRecord | null> {
    const snap = await tx.get<ReconciliationBatchRecord>(`mb_reconciliation_batches/${batchId}`);
    return snap.exists && snap.data ? snap.data : null;
  }

  public async upsertReconciliationExceptionInTx(
    tx: TransactionContextLike,
    exc: ReconciliationExceptionRecord,
  ): Promise<void> {
    this.writeDoc(tx, `mb_reconciliation_exceptions/${exc.exceptionId}`, exc);
    await this.appendBoundedIndexId(
      tx,
      `mb_reconciliation_exceptions_by_batch/${exc.batchId}`,
      exc.exceptionId,
    );
  }

  public async getReconciliationExceptionInTx(
    tx: TransactionContextLike,
    exceptionId: string,
  ): Promise<ReconciliationExceptionRecord | null> {
    const snap = await tx.get<ReconciliationExceptionRecord>(`mb_reconciliation_exceptions/${exceptionId}`);
    return snap.exists && snap.data ? snap.data : null;
  }

  public async listReconciliationExceptionsByBatchInTx(
    tx: TransactionContextLike,
    batchId: string,
  ): Promise<ReconciliationExceptionRecord[]> {
    return this.getIndexedRecords<ReconciliationExceptionRecord>(
      tx,
      `mb_reconciliation_exceptions_by_batch/${batchId}`,
      'mb_reconciliation_exceptions',
    );
  }

  // ---- Provider Config References ----

  public async getProviderConfigInTx(
    tx: TransactionContextLike,
    providerId: string,
  ): Promise<PaymentProviderConfigReference | null> {
    const snap = await tx.get<PaymentProviderConfigReference>(`mb_provider_configs/${providerId}`);
    return snap.exists && snap.data ? snap.data : null;
  }

  public async upsertProviderConfigInTx(
    tx: TransactionContextLike,
    config: PaymentProviderConfigReference,
  ): Promise<void> {
    this.writeDoc(tx, `mb_provider_configs/${config.providerId}`, config);
    await this.appendBoundedIndexId(tx, 'mb_indexes/all_provider_configs', config.providerId);
  }

  public async listProviderConfigsInTx(
    tx: TransactionContextLike,
  ): Promise<PaymentProviderConfigReference[]> {
    return this.getIndexedRecords<PaymentProviderConfigReference>(
      tx,
      'mb_indexes/all_provider_configs',
      'mb_provider_configs',
    );
  }
}

// ============================================================================
// DEFAULT ADAPTER IMPLEMENTATIONS (Employee 54, 63, 64, Provider & Notifications)
// ============================================================================

export function createDefaultFinancialLedgerAdapter(): AuthoritativeFinancialLedgerAdapter {
  const byId = new Map<string, LedgerPostingEntry>();
  const byIdempotencyKey = new Map<string, LedgerPostingEntry>();

  return {
    async postLedgerEntry(request) {
      const existing = byIdempotencyKey.get(request.idempotencyKey);
      if (existing) {
        return structuredClone(existing);
      }
      const entry: LedgerPostingEntry = {
        ...structuredClone(request),
        ledgerPostingId: `led_${crypto.randomBytes(6).toString('hex')}`,
        postedAtIso: new Date().toISOString(),
      };
      byId.set(entry.ledgerPostingId, entry);
      byIdempotencyKey.set(entry.idempotencyKey, entry);
      return structuredClone(entry);
    },
    async getLedgerEntryById(ledgerPostingId) {
      const found = byId.get(ledgerPostingId);
      return found ? structuredClone(found) : null;
    },
    async listLedgerEntriesBySource(sourceRecordId) {
      return Array.from(byId.values())
        .filter((e) => e.sourceRecordId === sourceRecordId || e.paymentIntentId === sourceRecordId || e.invoiceId === sourceRecordId)
        .map((e) => structuredClone(e));
    },
    async listAllBillingLedgerEntries() {
      return Array.from(byId.values()).map((e) => structuredClone(e));
    },
  };
}

export function createDefaultFinancialDocumentAdapter(): FinancialDocumentManagementAdapter {
  const docs = new Map<
    string,
    {
      documentId: string;
      ownerUid: string;
      organizationId: string | null;
      documentType: string;
      referenceNumber: string;
      downloadPath: string;
      payload: Record<string, unknown>;
    }
  >();

  return {
    async generateAndStoreFinancialDocument(params) {
      const documentId = `fdoc_${params.referenceNumber.replace(/[^A-Za-z0-9]/g, '_')}`;
      const downloadPath = `/api/v1/billing/documents/${documentId}/download`;
      docs.set(documentId, {
        documentId,
        ownerUid: params.ownerUid,
        organizationId: params.organizationId,
        documentType: params.documentType,
        referenceNumber: params.referenceNumber,
        downloadPath,
        payload: structuredClone(params.payload),
      });
      return { documentId, downloadPath };
    },
    async getFinancialDocumentMetadata(documentId, requesterUid, isAdmin) {
      const doc = docs.get(documentId);
      if (!doc) {
        return { exists: false, accessible: false, documentId };
      }
      const accessible = isAdmin || doc.ownerUid === requesterUid;
      return {
        exists: true,
        accessible,
        documentId,
        referenceNumber: accessible ? doc.referenceNumber : undefined,
        documentType: accessible ? doc.documentType : undefined,
        downloadPath: accessible ? doc.downloadPath : undefined,
      };
    },
  };
}

export function createDefaultCustomerDirectoryAdapter(): CustomerAndOrganizationDirectoryAdapter {
  return {
    async getCustomerBillingEligibility(uid, organizationId) {
      return {
        exists: true,
        accountActive: true,
        accountType: organizationId ? 'BROKERAGE_ORGANIZATION' : 'PROFESSIONAL_AGENT',
        identityVerified: true,
        brokerageLicenseVerified: true,
        memberOfOrganization: true,
        primaryCityId: 'tehran',
      };
    },
  };
}

export function createDefaultBrokerageCommissionAdapter(): BrokerageAndCommissionReferenceAdapter {
  return {
    async getAuthoritativeCommissionRecord({ transactionDealId, brokerageId }) {
      return {
        exists: true,
        calculationId: `comm_calc_${transactionDealId}`,
        transactionDealId,
        brokerageId,
        agentUid: 'agent_default',
        grossCommissionMinor: 50_000_000,
        platformServiceFeeMinor: 5_000_000,
        currency: 'IRT',
      };
    },
  };
}

export function createDefaultBillingNotificationAdapter(): BillingNotificationAdapter {
  return {
    async sendCustomerBillingNotification(params) {
      return {
        delivered: true,
        notificationId: `notif_${params.idempotencyKey.slice(0, 24)}`,
      };
    },
  };
}

export function computeWebhookHmacSignature(
  secret: string,
  payload: Omit<ProviderWebhookPayload, 'rawSignature'>,
): string {
  const canonical = `${payload.providerId}|${payload.webhookEventId}|${payload.paymentIntentId}|${payload.providerTransactionRef}|${payload.eventStatus}|${payload.paidAmountMinor}|${payload.currency}`;
  return crypto.createHmac('sha256', secret).update(canonical, 'utf8').digest('hex');
}

export function createSandboxPaymentProviderAdapter(
  providerId = 'sandbox_gateway_ir',
  webhookSecret = 'sandbox_webhook_secret_key_for_verification',
): PaymentProviderAdapter & {
  setSimulatedFailureMode(mode: 'NONE' | 'TIMEOUT' | 'UNAVAILABLE' | 'DECLINED'): void;
  getWebhookSecret(): string;
} {
  let failureMode: 'NONE' | 'TIMEOUT' | 'UNAVAILABLE' | 'DECLINED' = 'NONE';
  const txStore = new Map<
    string,
    {
      providerTransactionRef: string;
      status: 'SUCCEEDED' | 'FAILED' | 'PENDING' | 'REFUNDED';
      amountMinor: number;
      currency: BillingCurrency;
    }
  >();

  return {
    providerId,
    setSimulatedFailureMode(mode) {
      failureMode = mode;
    },
    getWebhookSecret() {
      return webhookSecret;
    },
    async initiatePayment(params) {
      if (failureMode === 'TIMEOUT') {
        return {
          ok: false,
          errorCategory: 'PROVIDER_TIMEOUT',
          errorMessage: 'Payment provider timed out while initiating payment session.',
        };
      }
      if (failureMode === 'UNAVAILABLE') {
        return {
          ok: false,
          errorCategory: 'PROVIDER_UNAVAILABLE',
          errorMessage: 'Payment provider gateway is temporarily unavailable.',
        };
      }
      if (failureMode === 'DECLINED') {
        return {
          ok: false,
          errorCategory: 'PAYMENT_DECLINED',
          errorMessage: 'Payment initiation declined by provider risk policy.',
        };
      }
      const providerTransactionRef = `ptx_${providerId}_${params.paymentIntentId}`;
      txStore.set(providerTransactionRef, {
        providerTransactionRef,
        status: 'PENDING',
        amountMinor: params.amountMinor,
        currency: params.currency,
      });
      return {
        ok: true,
        providerTransactionRef,
        checkoutUrl: `https://pay.sandbox.tehranradar.ir/checkout/${providerTransactionRef}`,
        providerFeeMinor: Math.floor(params.amountMinor / 200), // 0.5% fee
      };
    },
    verifyWebhookSignature(payload, signature) {
      const expected = computeWebhookHmacSignature(webhookSecret, payload);
      const expectedBuf = Buffer.from(expected, 'utf8');
      const actualBuf = Buffer.from(String(signature || ''), 'utf8');
      if (expectedBuf.length !== actualBuf.length) return false;
      return crypto.timingSafeEqual(expectedBuf, actualBuf);
    },
    async requestRefund(params) {
      if (failureMode === 'TIMEOUT' || failureMode === 'UNAVAILABLE') {
        return {
          ok: false,
          errorCategory: failureMode === 'TIMEOUT' ? 'PROVIDER_TIMEOUT' : 'PROVIDER_UNAVAILABLE',
          errorMessage: 'Provider unable to process refund due to gateway outage.',
        };
      }
      const rec = txStore.get(params.providerTransactionRef);
      if (rec) {
        rec.status = 'REFUNDED';
      }
      return {
        ok: true,
        providerRefundRef: `pref_${params.refundId}`,
      };
    },
    async queryTransactionStatus(providerTransactionRef) {
      const rec = txStore.get(providerTransactionRef);
      if (!rec) {
        return {
          found: false,
          providerTransactionRef,
          status: 'FAILED',
          amountMinor: 0,
          currency: 'IRT',
        };
      }
      return {
        found: true,
        ...rec,
      };
    },
  };
}
