/**
 * Employee 68 — Notification, Alert Orchestration & Communication Preferences Service
 * (`server/modules/notification-orchestration/service.ts`)
 *
 * Exclusive ownership: `server/modules/notification-orchestration/`
 */

import crypto from 'node:crypto';
import {
  CoreApiError,
  createStructuredAuditEvent,
  runDurableTransaction,
  sanitizeTextInput,
  UNTRUSTED_REQUEST_IDENTITY_FIELDS,
  verifyAdminOrDelegatedPrincipal,
} from '../core';
import type {
  AuthenticatedPrincipal,
  TransactionContextLike,
  TransactionRunnerAdapter,
} from '../core/types';
import type {
  AdministrativeAnnouncementRecord,
  AuthorizedDomainNotificationEventInput,
  ChannelDeliveryAttemptRecord,
  ChannelDeliveryProviderAdapter,
  DeliveryFailureClassification,
  DeliveryFrequencyMode,
  DigestBatchRecord,
  EntityAccessAuthorizationAdapter,
  InAppReadStatus,
  NotificationOperationalAnalyticsView,
  NotificationOrchestrationDependencies,
  NotificationPriorityLevel,
  NotificationRelatedEntityRefs,
  NotificationTemplateVersionRecord,
  OrchestrationChannel,
  UnifiedNotificationCategory,
  UnifiedNotificationRecord,
  UserCommunicationPreferenceRecord,
} from './types';

export const ALL_UNIFIED_NOTIFICATION_CATEGORIES: readonly UnifiedNotificationCategory[] = [
  'PROPERTY_AND_LISTING_UPDATES',
  'SAVED_SEARCH_ALERTS',
  'PRICE_CHANGES',
  'PROPERTY_AVAILABILITY_CHANGES',
  'TRANSACTION_UPDATES',
  'RENTAL_AND_TENANCY_UPDATES',
  'BROKERAGE_AND_AGENT_UPDATES',
  'VERIFICATION_UPDATES',
  'REVIEW_AND_REPUTATION_UPDATES',
  'SUPPORT_CASE_UPDATES',
  'BILLING_AND_SUBSCRIPTION_UPDATES',
  'DOCUMENT_STATUS_UPDATES',
  'SECURITY_AND_ACCOUNT_NOTIFICATIONS',
  'ADMINISTRATIVE_ANNOUNCEMENTS',
] as const;

export const ALL_ORCHESTRATION_CHANNELS: readonly OrchestrationChannel[] = [
  'IN_APP',
  'EMAIL',
  'SMS',
  'PUSH',
] as const;

export function createInMemoryNotificationOrchestrationTxRunner(): TransactionRunnerAdapter & {
  docs: Map<string, Record<string, unknown>>;
} {
  const docs = new Map<string, Record<string, unknown>>();
  return {
    docs,
    async runTransaction<T>(work: (tx: TransactionContextLike) => Promise<T>): Promise<T> {
      const staged = new Map<string, Record<string, unknown> | null>();
      const tx: TransactionContextLike = {
        async get<D = Record<string, unknown>>(docPath: string): Promise<{ exists: boolean; data?: D }> {
          if (staged.has(docPath)) {
            const val = staged.get(docPath);
            return val ? { exists: true, data: structuredClone(val) as D } : { exists: false };
          }
          const existing = docs.get(docPath);
          return existing ? { exists: true, data: structuredClone(existing) as D } : { exists: false };
        },
        set<D = Record<string, unknown>>(docPath: string, data: D): void {
          staged.set(docPath, structuredClone(data) as Record<string, unknown>);
        },
        update(docPath: string, partial: Record<string, unknown>): void {
          const prev = staged.has(docPath) ? staged.get(docPath) : docs.get(docPath);
          staged.set(docPath, { ...(prev ? structuredClone(prev) : {}), ...structuredClone(partial) });
        },
        delete(docPath: string): void {
          staged.set(docPath, null);
        },
      };
      const out = await work(tx);
      for (const [k, v] of staged.entries()) {
        if (v === null) docs.delete(k);
        else docs.set(k, v);
      }
      return out;
    },
  };
}

export function escapeTemplateVariableValue(raw: string | number | boolean): string {
  const str = String(raw ?? '');
  return str
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;')
    .replace(/\{\{/g, '&#123;&#123;')
    .replace(/\}\}/g, '&#125;&#125;');
}

export function sanitizeInternalDeepLink(rawPath: string | null | undefined): string | null {
  if (!rawPath || typeof rawPath !== 'string') return null;
  const trimmed = rawPath.trim();
  if (!trimmed.startsWith('/') || trimmed.startsWith('//') || /javascript:|data:|vbscript:/i.test(trimmed)) {
    throw new CoreApiError('VALIDATION_FAILED', 400, 'Deep-link path must be a safe relative internal path starting with /.');
  }
  return trimmed.slice(0, 300);
}

export function createSandboxChannelDeliveryAdapter(
  channel: OrchestrationChannel,
  providerId = `sandbox_${channel.toLowerCase()}_provider`,
): ChannelDeliveryProviderAdapter & {
  setSimulatedFailure(mode: DeliveryFailureClassification): void;
} {
  let failureMode: DeliveryFailureClassification = 'NONE';
  return {
    channel,
    providerId,
    setSimulatedFailure(mode) {
      failureMode = mode;
    },
    async send(params) {
      if (failureMode !== 'NONE') {
        return {
          ok: false,
          failureClassification: failureMode,
          failureReason: `Simulated ${failureMode} on channel ${channel}`,
          latencyMs: 18,
        };
      }
      return {
        ok: true,
        providerRequestId: `preq_${channel.toLowerCase()}_${params.idempotencyKey.slice(0, 16)}`,
        latencyMs: 12,
      };
    },
  };
}

export function createDefaultEntityAccessAuthAdapter(): EntityAccessAuthorizationAdapter {
  const restrictedEntityIds = new Set<string>(['prop_restricted_secret', 'doc_restricted_secret']);
  return {
    async canRecipientAccessRelatedEntities(_recipientUid, relatedEntities) {
      for (const val of Object.values(relatedEntities)) {
        if (typeof val === 'string' && restrictedEntityIds.has(val)) {
          return {
            allowed: false,
            reason: `Recipient is not authorized to access restricted entity ${val}.`,
          };
        }
      }
      return { allowed: true };
    },
  };
}

interface BoundedIndexDoc {
  ids: string[];
  updatedAtIso: string;
}

export class NotificationOrchestrationService {
  private readonly deps: NotificationOrchestrationDependencies;
  private readonly channelAdapters: Record<OrchestrationChannel, ChannelDeliveryProviderAdapter>;
  private readonly entityAuthAdapter: EntityAccessAuthorizationAdapter;
  private readonly urgentRateCounter = new Map<string, { count: number; windowStartMs: number }>();
  private defaultsSeeded = false;

  constructor(deps: NotificationOrchestrationDependencies) {
    this.deps = deps;
    this.channelAdapters = {
      IN_APP: deps.channelAdapters?.IN_APP ?? createSandboxChannelDeliveryAdapter('IN_APP'),
      EMAIL: deps.channelAdapters?.EMAIL ?? createSandboxChannelDeliveryAdapter('EMAIL'),
      SMS: deps.channelAdapters?.SMS ?? createSandboxChannelDeliveryAdapter('SMS'),
      PUSH: deps.channelAdapters?.PUSH ?? createSandboxChannelDeliveryAdapter('PUSH'),
    };
    this.entityAuthAdapter = deps.entityAuthAdapter ?? createDefaultEntityAccessAuthAdapter();
  }

  private async runTx<T>(
    operationName: string,
    work: (tx: TransactionContextLike) => Promise<T>,
  ): Promise<T> {
    return runDurableTransaction(this.deps.txRunner, { operationName }, work);
  }

  private writeDoc(tx: TransactionContextLike, docPath: string, data: unknown): void {
    tx.set(docPath, data as Record<string, unknown>);
  }

  private async appendIndex(tx: TransactionContextLike, indexPath: string, id: string): Promise<void> {
    const snap = await tx.get<BoundedIndexDoc>(indexPath);
    const ids = snap.exists && Array.isArray(snap.data?.ids) ? snap.data!.ids : [];
    const nextIds = [id, ...ids.filter((item) => item !== id)].slice(0, 500);
    this.writeDoc(tx, indexPath, { ids: nextIds, updatedAtIso: new Date().toISOString() });
  }

  private async listIndexed<T>(
    tx: TransactionContextLike,
    indexPath: string,
    collectionName: string,
  ): Promise<T[]> {
    const snap = await tx.get<BoundedIndexDoc>(indexPath);
    const ids = snap.exists && Array.isArray(snap.data?.ids) ? snap.data!.ids : [];
    const out: T[] = [];
    for (const id of ids) {
      const docSnap = await tx.get<T>(`${collectionName}/${id}`);
      if (docSnap.exists && docSnap.data) out.push(docSnap.data);
    }
    return out;
  }

  private async assertAdmin(principal: AuthenticatedPrincipal): Promise<void> {
    const decision = await verifyAdminOrDelegatedPrincipal(principal, this.deps.adminStore, {
      primaryAdminEmails: this.deps.primaryAdminEmails,
    });
    if (!decision.allowed) {
      throw new CoreApiError('FORBIDDEN', 403, 'Administrative notification permission required.');
    }
  }

  private assertOwnership(principal: AuthenticatedPrincipal, ownerUid: string): void {
    if (
      principal.role === 'primary_admin' ||
      principal.role === 'delegated_admin' ||
      principal.role === 'server_secret_admin'
    ) {
      return;
    }
    if (principal.uid !== ownerUid) {
      throw new CoreApiError('FORBIDDEN', 403, 'Access denied to another user notification resource.');
    }
  }

  private buildDefaultPreferences(uid: string, nowIso: string): UserCommunicationPreferenceRecord {
    const categoryPreferences = {} as UserCommunicationPreferenceRecord['categoryPreferences'];
    for (const cat of ALL_UNIFIED_NOTIFICATION_CATEGORIES) {
      categoryPreferences[cat] = {
        enabled: true,
        channels:
          cat === 'SECURITY_AND_ACCOUNT_NOTIFICATIONS'
            ? ['IN_APP', 'EMAIL', 'SMS', 'PUSH']
            : ['IN_APP', 'EMAIL', 'PUSH'],
        frequency: 'IMMEDIATE',
      };
    }
    return {
      uid,
      locale: 'fa',
      timeZone: 'Asia/Tehran',
      channelEnabled: {
        IN_APP: true,
        EMAIL: true,
        SMS: true,
        PUSH: true,
      },
      categoryPreferences,
      promotionalOptInGranted: true,
      promotionalConsentWithdrawnAtIso: null,
      quietHours: {
        enabled: false,
        startHourLocal: 22,
        endHourLocal: 7,
      },
      preferenceVersion: 1,
      updatedAtIso: nowIso,
    };
  }

  public async ensureDefaultTemplatesSeeded(): Promise<void> {
    if (this.defaultsSeeded) return;
    await this.runTx('no.seedDefaultTemplates', async (tx) => {
      const existing = await this.listIndexed<NotificationTemplateVersionRecord>(
        tx,
        'no_indexes/all_templates',
        'no_templates',
      );
      if (existing.length > 0) {
        this.defaultsSeeded = true;
        return;
      }

      const nowIso = new Date().toISOString();
      const seedTemplate = async (params: {
        templateId: string;
        category: UnifiedNotificationCategory;
        locale: 'fa' | 'en';
        version: number;
        subjectTemplate: string;
        summaryTemplate: string;
        bodyTemplate: string;
        requiredVariables: string[];
        allowedVariables: string[];
      }) => {
        const templateKey = `${params.templateId}__${params.locale}__v${params.version}`;
        const record: NotificationTemplateVersionRecord = {
          templateKey,
          templateId: params.templateId,
          category: params.category,
          locale: params.locale,
          version: params.version,
          subjectTemplate: params.subjectTemplate,
          summaryTemplate: params.summaryTemplate,
          bodyTemplate: params.bodyTemplate,
          requiredVariables: params.requiredVariables,
          allowedVariables: params.allowedVariables,
          publicationStatus: 'PUBLISHED',
          effectiveFromIso: '2026-01-01T00:00:00.000Z',
          effectiveToIso: null,
          fallbackLocale: 'fa',
          createdByUid: 'system_seed',
          createdAtIso: nowIso,
          updatedAtIso: nowIso,
        };
        this.writeDoc(tx, `no_templates/${templateKey}`, record);
        await this.appendIndex(tx, 'no_indexes/all_templates', templateKey);
        await this.appendIndex(tx, `no_templates_by_id/${params.templateId}`, templateKey);
      };

      await seedTemplate({
        templateId: 'tpl_saved_search_match',
        category: 'SAVED_SEARCH_ALERTS',
        locale: 'fa',
        version: 1,
        subjectTemplate: 'ملک جدید منطبق با جستجوی «{{searchTitle}}»',
        summaryTemplate: '{{matchCount}} ملک جدید در {{neighborhoodName}} یافت شد',
        bodyTemplate: 'ملک «{{propertyTitle}}» با قیمت {{priceText}} در محله {{neighborhoodName}} ثبت شد.',
        requiredVariables: ['searchTitle', 'matchCount', 'neighborhoodName', 'propertyTitle', 'priceText'],
        allowedVariables: ['searchTitle', 'matchCount', 'neighborhoodName', 'propertyTitle', 'priceText'],
      });

      await seedTemplate({
        templateId: 'tpl_price_change_alert',
        category: 'PRICE_CHANGES',
        locale: 'fa',
        version: 1,
        subjectTemplate: 'کاهش قیمت ملک ذخیره‌شده: {{propertyTitle}}',
        summaryTemplate: 'تغییر قیمت ملک در {{neighborhoodName}}',
        bodyTemplate: 'قیمت ملک «{{propertyTitle}}» از {{oldPrice}} به {{newPrice}} تغییر یافت.',
        requiredVariables: ['propertyTitle', 'neighborhoodName', 'oldPrice', 'newPrice'],
        allowedVariables: ['propertyTitle', 'neighborhoodName', 'oldPrice', 'newPrice'],
      });

      await seedTemplate({
        templateId: 'tpl_support_case_update',
        category: 'SUPPORT_CASE_UPDATES',
        locale: 'fa',
        version: 1,
        subjectTemplate: 'به‌روزرسانی پرونده پشتیبانی #{{caseId}}',
        summaryTemplate: 'وضعیت پرونده شما به {{statusLabel}} تغییر یافت',
        bodyTemplate: 'پرونده پشتیبانی «{{caseSubject}}» به وضعیت {{statusLabel}} منتقل شد.',
        requiredVariables: ['caseId', 'caseSubject', 'statusLabel'],
        allowedVariables: ['caseId', 'caseSubject', 'statusLabel'],
      });

      await seedTemplate({
        templateId: 'tpl_billing_invoice_update',
        category: 'BILLING_AND_SUBSCRIPTION_UPDATES',
        locale: 'fa',
        version: 1,
        subjectTemplate: 'وضعیت صورتحساب {{invoiceNumber}}',
        summaryTemplate: 'تایید تراکنش مالی {{invoiceNumber}}',
        bodyTemplate: 'صورتحساب شماره {{invoiceNumber}} به مبلغ {{amountText}} با وضعیت {{paymentStatus}} ثبت شد.',
        requiredVariables: ['invoiceNumber', 'amountText', 'paymentStatus'],
        allowedVariables: ['invoiceNumber', 'amountText', 'paymentStatus'],
      });

      await seedTemplate({
        templateId: 'tpl_security_critical_alert',
        category: 'SECURITY_AND_ACCOUNT_NOTIFICATIONS',
        locale: 'fa',
        version: 1,
        subjectTemplate: 'هشدار امنیتی حساب کاربری: {{securityAction}}',
        summaryTemplate: 'رویداد امنیتی مهم در حساب کاربری شما',
        bodyTemplate: 'عملیات امنیتی «{{securityAction}}» در تاریخ {{timestampText}} روی حساب شما انجام شد.',
        requiredVariables: ['securityAction', 'timestampText'],
        allowedVariables: ['securityAction', 'timestampText'],
      });

      await seedTemplate({
        templateId: 'tpl_generic_domain_event',
        category: 'PROPERTY_AND_LISTING_UPDATES',
        locale: 'fa',
        version: 1,
        subjectTemplate: '{{headline}}',
        summaryTemplate: '{{summary}}',
        bodyTemplate: '{{details}}',
        requiredVariables: ['headline', 'summary', 'details'],
        allowedVariables: ['headline', 'summary', 'details'],
      });

      this.defaultsSeeded = true;
    });
  }

  // ==========================================================================
  // 4. NOTIFICATION PREFERENCES & CONSENT MANAGEMENT
  // ==========================================================================

  public async getUserPreferences(
    principal: AuthenticatedPrincipal,
    targetUid = principal.uid,
  ): Promise<UserCommunicationPreferenceRecord> {
    this.assertOwnership(principal, targetUid);
    const nowIso = new Date().toISOString();
    return this.runTx('no.getUserPreferences', async (tx) => {
      const snap = await tx.get<UserCommunicationPreferenceRecord>(`no_preferences/${targetUid}`);
      if (snap.exists && snap.data) return snap.data;
      const defaults = this.buildDefaultPreferences(targetUid, nowIso);
      this.writeDoc(tx, `no_preferences/${targetUid}`, defaults);
      return defaults;
    });
  }

  public async updateUserPreferences(
    principal: AuthenticatedPrincipal,
    rawInput: unknown,
  ): Promise<UserCommunicationPreferenceRecord> {
    if (!rawInput || typeof rawInput !== 'object' || Array.isArray(rawInput)) {
      throw new CoreApiError('VALIDATION_FAILED', 400, 'Preferences update must be an object.');
    }
    const obj = rawInput as Record<string, unknown>;
    for (const k of Object.keys(obj)) {
      if (UNTRUSTED_REQUEST_IDENTITY_FIELDS.has(k)) {
        throw new CoreApiError('VALIDATION_FAILED', 400, `Untrusted field rejected: ${k}`);
      }
    }

    const nowIso = new Date().toISOString();
    return this.runTx('no.updateUserPreferences', async (tx) => {
      const snap = await tx.get<UserCommunicationPreferenceRecord>(`no_preferences/${principal.uid}`);
      const current = snap.exists && snap.data
        ? snap.data
        : this.buildDefaultPreferences(principal.uid, nowIso);

      if (obj.locale === 'fa' || obj.locale === 'en') {
        current.locale = obj.locale;
      }
      if (typeof obj.timeZone === 'string' && sanitizeTextInput(obj.timeZone)) {
        current.timeZone = sanitizeTextInput(obj.timeZone).slice(0, 64);
      }
      if (obj.channelEnabled && typeof obj.channelEnabled === 'object') {
        const chObj = obj.channelEnabled as Record<string, unknown>;
        for (const ch of ALL_ORCHESTRATION_CHANNELS) {
          if (typeof chObj[ch] === 'boolean') {
            current.channelEnabled[ch] = chObj[ch] as boolean;
          }
        }
      }
      if (obj.categoryPreferences && typeof obj.categoryPreferences === 'object') {
        const catObj = obj.categoryPreferences as Record<string, unknown>;
        for (const cat of ALL_UNIFIED_NOTIFICATION_CATEGORIES) {
          if (catObj[cat] && typeof catObj[cat] === 'object') {
            const patch = catObj[cat] as Record<string, unknown>;
            // Security-critical category cannot be completely disabled by ordinary preference updates
            if (cat === 'SECURITY_AND_ACCOUNT_NOTIFICATIONS' && patch.enabled === false) {
              throw new CoreApiError(
                'VALIDATION_FAILED',
                400,
                'SECURITY_AND_ACCOUNT_NOTIFICATIONS cannot be disabled.',
              );
            }
            if (typeof patch.enabled === 'boolean') {
              current.categoryPreferences[cat].enabled = patch.enabled;
            }
            if (Array.isArray(patch.channels)) {
              const validChannels = (patch.channels as OrchestrationChannel[]).filter((c) =>
                ALL_ORCHESTRATION_CHANNELS.includes(c),
              );
              if (validChannels.length > 0) {
                current.categoryPreferences[cat].channels = validChannels;
              }
            }
            if (
              patch.frequency === 'IMMEDIATE' ||
              patch.frequency === 'DAILY_DIGEST' ||
              patch.frequency === 'WEEKLY_DIGEST'
            ) {
              current.categoryPreferences[cat].frequency = patch.frequency;
            }
          }
        }
      }
      if (typeof obj.promotionalOptInGranted === 'boolean') {
        current.promotionalOptInGranted = obj.promotionalOptInGranted;
        current.promotionalConsentWithdrawnAtIso = obj.promotionalOptInGranted ? null : nowIso;
      }
      if (obj.quietHours && typeof obj.quietHours === 'object') {
        const qh = obj.quietHours as Record<string, unknown>;
        if (typeof qh.enabled === 'boolean') current.quietHours.enabled = qh.enabled;
        if (typeof qh.startHourLocal === 'number' && qh.startHourLocal >= 0 && qh.startHourLocal <= 23) {
          current.quietHours.startHourLocal = Math.trunc(qh.startHourLocal);
        }
        if (typeof qh.endHourLocal === 'number' && qh.endHourLocal >= 0 && qh.endHourLocal <= 23) {
          current.quietHours.endHourLocal = Math.trunc(qh.endHourLocal);
        }
      }

      current.preferenceVersion += 1;
      current.updatedAtIso = nowIso;
      this.writeDoc(tx, `no_preferences/${principal.uid}`, current);
      return current;
    });
  }

  // ==========================================================================
  // 6. VERSIONED TEMPLATES & RENDERING
  // ==========================================================================

  public async upsertTemplateVersion(
    adminPrincipal: AuthenticatedPrincipal,
    rawInput: unknown,
  ): Promise<NotificationTemplateVersionRecord> {
    await this.assertAdmin(adminPrincipal);
    await this.ensureDefaultTemplatesSeeded();
    if (!rawInput || typeof rawInput !== 'object' || Array.isArray(rawInput)) {
      throw new CoreApiError('VALIDATION_FAILED', 400, 'Template input must be an object.');
    }
    const obj = rawInput as Record<string, unknown>;
    const templateId = sanitizeTextInput(String(obj.templateId ?? ''));
    if (!/^[a-zA-Z0-9_-]{3,64}$/.test(templateId)) {
      throw new CoreApiError('VALIDATION_FAILED', 400, 'Invalid templateId.');
    }
    const category = obj.category as UnifiedNotificationCategory;
    if (!ALL_UNIFIED_NOTIFICATION_CATEGORIES.includes(category)) {
      throw new CoreApiError('VALIDATION_FAILED', 400, 'Invalid notification category.');
    }
    const locale = obj.locale === 'en' ? 'en' : 'fa';
    const subjectTemplate = sanitizeTextInput(String(obj.subjectTemplate ?? ''));
    const summaryTemplate = sanitizeTextInput(String(obj.summaryTemplate ?? subjectTemplate));
    const bodyTemplate = sanitizeTextInput(String(obj.bodyTemplate ?? ''));
    if (!subjectTemplate || !bodyTemplate) {
      throw new CoreApiError('VALIDATION_FAILED', 400, 'subjectTemplate and bodyTemplate are required.');
    }

    const requiredVariables = Array.isArray(obj.requiredVariables)
      ? obj.requiredVariables.map((v) => sanitizeTextInput(String(v)))
      : [];
    const allowedVariables = Array.isArray(obj.allowedVariables)
      ? obj.allowedVariables.map((v) => sanitizeTextInput(String(v)))
      : requiredVariables;

    const nowIso = new Date().toISOString();
    const record = await this.runTx('no.upsertTemplateVersion', async (tx) => {
      const existingVersions = await this.listIndexed<NotificationTemplateVersionRecord>(
        tx,
        `no_templates_by_id/${templateId}`,
        'no_templates',
      );
      const sameLocaleVersions = existingVersions.filter((v) => v.locale === locale);
      const nextVersion =
        sameLocaleVersions.reduce((max, v) => Math.max(max, v.version), 0) + 1;

      const templateKey = `${templateId}__${locale}__v${nextVersion}`;
      const tpl: NotificationTemplateVersionRecord = {
        templateKey,
        templateId,
        category,
        locale,
        version: nextVersion,
        subjectTemplate,
        summaryTemplate,
        bodyTemplate,
        requiredVariables,
        allowedVariables: Array.from(new Set([...requiredVariables, ...allowedVariables])),
        publicationStatus:
          obj.publicationStatus === 'DRAFT' || obj.publicationStatus === 'ARCHIVED'
            ? obj.publicationStatus
            : 'PUBLISHED',
        effectiveFromIso:
          typeof obj.effectiveFromIso === 'string' ? obj.effectiveFromIso : nowIso,
        effectiveToIso: typeof obj.effectiveToIso === 'string' ? obj.effectiveToIso : null,
        fallbackLocale: 'fa',
        createdByUid: adminPrincipal.uid,
        createdAtIso: nowIso,
        updatedAtIso: nowIso,
      };
      this.writeDoc(tx, `no_templates/${templateKey}`, tpl);
      await this.appendIndex(tx, 'no_indexes/all_templates', templateKey);
      await this.appendIndex(tx, `no_templates_by_id/${templateId}`, templateKey);
      return tpl;
    });

    await this.deps.auditSink.writeAuditEvent(
      createStructuredAuditEvent({
        principal: adminPrincipal,
        correlationId: `corr_${crypto.randomBytes(4).toString('hex')}`,
        action: 'notification_orchestration.template.upserted',
        targetCollection: 'no_templates',
        targetResourceId: record.templateKey,
        outcome: 'SUCCESS',
        metadata: { templateId, locale, version: record.version },
      }),
    );

    return record;
  }

  private renderTemplateRecord(
    template: NotificationTemplateVersionRecord,
    variables: Record<string, string | number | boolean>,
  ): {
    title: string;
    summary: string;
    body: string;
    sanitizedVariables: Record<string, string | number | boolean>;
  } {
    for (const reqVar of template.requiredVariables) {
      if (variables[reqVar] === undefined || variables[reqVar] === null || variables[reqVar] === '') {
        throw new CoreApiError(
          'VALIDATION_FAILED',
          400,
          `Missing required template variable "${reqVar}" for template ${template.templateId}.`,
        );
      }
    }
    for (const providedKey of Object.keys(variables)) {
      if (
        template.allowedVariables.length > 0 &&
        !template.allowedVariables.includes(providedKey)
      ) {
        throw new CoreApiError(
          'VALIDATION_FAILED',
          400,
          `Unsupported template variable "${providedKey}" for template ${template.templateId}.`,
        );
      }
    }

    const sanitizedVariables: Record<string, string | number | boolean> = {};
    for (const [k, v] of Object.entries(variables)) {
      sanitizedVariables[k] = typeof v === 'string' ? escapeTemplateVariableValue(v) : v;
    }

    const interpolate = (rawTpl: string): string =>
      rawTpl.replace(/\{\{\s*([a-zA-Z0-9_]+)\s*\}\}/g, (_match, varName: string) => {
        const val = sanitizedVariables[varName];
        return val !== undefined ? String(val) : '';
      });

    return {
      title: interpolate(template.subjectTemplate),
      summary: interpolate(template.summaryTemplate),
      body: interpolate(template.bodyTemplate),
      sanitizedVariables,
    };
  }

  // ==========================================================================
  // 3, 5, 8, 9, 10, 11. EVENT-TO-NOTIFICATION ORCHESTRATION & DELIVERY
  // ==========================================================================

  private isLocalHourWithinQuietHours(
    nowIso: string,
    timeZone: string,
    quietHours: UserCommunicationPreferenceRecord['quietHours'],
  ): boolean {
    if (!quietHours.enabled) return false;
    try {
      const formatter = new Intl.DateTimeFormat('en-US', {
        timeZone,
        hour: 'numeric',
        hour12: false,
      });
      const hourStr = formatter.format(new Date(nowIso));
      const hour = Number(hourStr) % 24;
      const { startHourLocal, endHourLocal } = quietHours;
      if (startHourLocal <= endHourLocal) {
        return hour >= startHourLocal && hour < endHourLocal;
      }
      return hour >= startHourLocal || hour < endHourLocal;
    } catch {
      return false;
    }
  }

  public async orchestrateDomainEvent(
    input: AuthorizedDomainNotificationEventInput,
  ): Promise<{
    notification: UnifiedNotificationRecord | null;
    suppressedReason?: string;
    deduplicatedReplay: boolean;
    deliveryAttempts: ChannelDeliveryAttemptRecord[];
  }> {
    await this.ensureDefaultTemplatesSeeded();

    if (!input.recipientUid || !ALL_UNIFIED_NOTIFICATION_CATEGORIES.includes(input.category)) {
      throw new CoreApiError('VALIDATION_FAILED', 400, 'Valid recipientUid and category are required.');
    }

    const priority: NotificationPriorityLevel = input.priority ?? 'NORMAL';
    const isPromotional = Boolean(
      input.isPromotional || input.category === 'ADMINISTRATIVE_ANNOUNCEMENTS',
    );

    // Section 11: Prevent promotional messages from using URGENT or SECURITY_CRITICAL priority
    if (isPromotional && (priority === 'URGENT' || priority === 'SECURITY_CRITICAL')) {
      throw new CoreApiError(
        'VALIDATION_FAILED',
        400,
        'Promotional or announcement messages cannot use URGENT or SECURITY_CRITICAL priority.',
      );
    }

    // Section 11: Rate limit URGENT notifications per recipient (max 5 per minute)
    if (priority === 'URGENT') {
      const nowMs = Date.now();
      const bucket = this.urgentRateCounter.get(input.recipientUid);
      if (!bucket || nowMs - bucket.windowStartMs >= 60_000) {
        this.urgentRateCounter.set(input.recipientUid, { count: 1, windowStartMs: nowMs });
      } else {
        bucket.count += 1;
        if (bucket.count > 5) {
          throw new CoreApiError(
            'RATE_LIMITED',
            429,
            'Urgent notification rate limit exceeded for recipient.',
          );
        }
      }
    }

    // Section 7 & 16: Verify recipient authorization for related entities before generating notification
    const relatedEntities: NotificationRelatedEntityRefs = input.relatedEntities ?? {};
    const entityAccess = await this.entityAuthAdapter.canRecipientAccessRelatedEntities(
      input.recipientUid,
      relatedEntities,
    );
    if (!entityAccess.allowed) {
      throw new CoreApiError(
        'FORBIDDEN',
        403,
        entityAccess.reason ?? 'Recipient is not authorized to access referenced entity.',
      );
    }

    const deepLinkPath = sanitizeInternalDeepLink(
      entityAccess.sanitizedDeepLinkPath ?? input.deepLinkPath,
    );
    const deduplicationKey =
      input.deduplicationKey ??
      `dedup_${input.sourceDomain}_${input.eventReferenceId || input.eventId}_${input.recipientUid}`;
    const nowIso = input.occurredAtIso ?? new Date().toISOString();

    const staged = await this.runTx('no.stageOrchestratedNotification', async (tx) => {
      const existingDedup = await tx.get<{ notificationId: string }>(
        `no_dedup/${deduplicationKey}`,
      );
      if (existingDedup.exists && existingDedup.data?.notificationId) {
        const existingNotif = await tx.get<UnifiedNotificationRecord>(
          `no_notifications/${existingDedup.data.notificationId}`,
        );
        if (existingNotif.exists && existingNotif.data) {
          const attempts = await this.listIndexed<ChannelDeliveryAttemptRecord>(
            tx,
            `no_attempts_by_notif/${existingNotif.data.notificationId}`,
            'no_delivery_attempts',
          );
          return {
            notification: existingNotif.data,
            deduplicatedReplay: true,
            suppressedReason: undefined as string | undefined,
            deliveryAttempts: attempts,
            shouldDispatchImmediately: false,
          };
        }
      }

      const prefSnap = await tx.get<UserCommunicationPreferenceRecord>(
        `no_preferences/${input.recipientUid}`,
      );
      const prefs = prefSnap.exists && prefSnap.data
        ? prefSnap.data
        : this.buildDefaultPreferences(input.recipientUid, nowIso);

      // Consent check: promotional communications require promotionalOptInGranted
      if (isPromotional && !prefs.promotionalOptInGranted && priority !== 'SECURITY_CRITICAL') {
        return {
          notification: null,
          deduplicatedReplay: false,
          suppressedReason: 'PROMOTIONAL_CONSENT_WITHDRAWN',
          deliveryAttempts: [] as ChannelDeliveryAttemptRecord[],
          shouldDispatchImmediately: false,
        };
      }

      const catPref = prefs.categoryPreferences[input.category];
      if (!catPref?.enabled && priority !== 'SECURITY_CRITICAL') {
        return {
          notification: null,
          deduplicatedReplay: false,
          suppressedReason: 'CATEGORY_DISABLED_BY_USER',
          deliveryAttempts: [] as ChannelDeliveryAttemptRecord[],
          shouldDispatchImmediately: false,
        };
      }

      // Resolve active versioned template with fallback to Persian ('fa')
      const requestedTemplateId = input.templateId ?? 'tpl_generic_domain_event';
      const allTplVersions = await this.listIndexed<NotificationTemplateVersionRecord>(
        tx,
        `no_templates_by_id/${requestedTemplateId}`,
        'no_templates',
      );
      const publishedVersions = allTplVersions
        .filter((t) => t.publicationStatus === 'PUBLISHED')
        .sort((a, b) => b.version - a.version);

      const selectedTemplate =
        publishedVersions.find((t) => t.locale === prefs.locale) ??
        publishedVersions.find((t) => t.locale === 'fa');

      if (!selectedTemplate) {
        throw new CoreApiError('NOT_FOUND', 404, `Published template ${requestedTemplateId} not found.`);
      }

      const rendered = this.renderTemplateRecord(selectedTemplate, input.variables);

      const requestedChannels: OrchestrationChannel[] =
        input.requestedChannels && input.requestedChannels.length > 0
          ? input.requestedChannels
          : catPref.channels;

      // Security-critical notifications always include IN_APP and EMAIL even if promotional preferences were customized
      const eligibleChannels: OrchestrationChannel[] =
        priority === 'SECURITY_CRITICAL'
          ? Array.from(new Set<OrchestrationChannel>(['IN_APP', 'EMAIL', ...requestedChannels]))
          : requestedChannels.filter(
              (ch) => prefs.channelEnabled[ch] && catPref.channels.includes(ch),
            );

      if (eligibleChannels.length === 0) {
        return {
          notification: null,
          deduplicatedReplay: false,
          suppressedReason: 'NO_ELIGIBLE_CHANNELS_ENABLED',
          deliveryAttempts: [] as ChannelDeliveryAttemptRecord[],
          shouldDispatchImmediately: false,
        };
      }

      // Check quiet-hours deferral or digest batching (except SECURITY_CRITICAL and URGENT)
      const inQuietHours =
        priority !== 'SECURITY_CRITICAL' &&
        priority !== 'URGENT' &&
        this.isLocalHourWithinQuietHours(nowIso, prefs.timeZone, prefs.quietHours);

      const useDigest =
        priority !== 'SECURITY_CRITICAL' &&
        priority !== 'URGENT' &&
        (catPref.frequency === 'DAILY_DIGEST' || catPref.frequency === 'WEEKLY_DIGEST');

      const retentionDays = input.retentionPolicyDays ?? 90;
      const expiresAtIso = new Date(Date.now() + retentionDays * 86_400_000).toISOString();
      const notificationId = `ntf_${crypto.randomBytes(6).toString('hex')}`;

      let scheduledForIso: string | null = input.scheduledForIso ?? null;
      if (!scheduledForIso && inQuietHours) {
        scheduledForIso = new Date(Date.now() + 8 * 3600_000).toISOString();
      }

      let digestBatchId: string | null = null;
      if (useDigest && (catPref.frequency === 'DAILY_DIGEST' || catPref.frequency === 'WEEKLY_DIGEST')) {
        const windowKey = nowIso.slice(0, 10);
        digestBatchId = `dgb_${input.recipientUid}_${catPref.frequency}_${windowKey}`;
        const existingBatchSnap = await tx.get<DigestBatchRecord>(`no_digest_batches/${digestBatchId}`);
        const batch: DigestBatchRecord =
          existingBatchSnap.exists && existingBatchSnap.data
            ? {
                ...existingBatchSnap.data,
                notificationIds: [...existingBatchSnap.data.notificationIds, notificationId],
                updatedAtIso: nowIso,
              }
            : {
                digestBatchId,
                recipientUid: input.recipientUid,
                frequency: catPref.frequency,
                notificationIds: [notificationId],
                channels: eligibleChannels,
                status: 'PENDING',
                scheduledWindowKey: windowKey,
                deliveredAtIso: null,
                createdAtIso: nowIso,
                updatedAtIso: nowIso,
              };
        this.writeDoc(tx, `no_digest_batches/${digestBatchId}`, batch);
        await this.appendIndex(tx, 'no_indexes/all_digest_batches', digestBatchId);
      }

      const shouldScheduleLater = Boolean(scheduledForIso || digestBatchId);

      const notification: UnifiedNotificationRecord = {
        notificationId,
        recipientUid: input.recipientUid,
        category: input.category,
        sourceDomain: input.sourceDomain,
        eventReferenceId: input.eventId,
        eventType: input.eventType,
        templateId: selectedTemplate.templateId,
        templateVersion: selectedTemplate.version,
        locale: selectedTemplate.locale,
        title: rendered.title,
        structuredContent: {
          summary: rendered.summary,
          body: rendered.body,
          variablesSnapshot: rendered.sanitizedVariables,
        },
        priority,
        isPromotional,
        requestedChannels,
        eligibleChannels,
        deliveredChannels: [],
        failedChannels: [],
        status: shouldScheduleLater ? 'SCHEDULED' : 'PENDING',
        readStatus: 'UNREAD',
        relatedEntities,
        deepLinkPath,
        deduplicationKey,
        retentionPolicyDays: retentionDays,
        scheduledForIso,
        digestBatchId,
        readAtIso: null,
        archivedAtIso: null,
        deliveredAtIso: null,
        expiresAtIso,
        createdAtIso: nowIso,
        updatedAtIso: nowIso,
      };

      this.writeDoc(tx, `no_notifications/${notificationId}`, notification);
      this.writeDoc(tx, `no_dedup/${deduplicationKey}`, {
        notificationId,
        createdAtIso: nowIso,
      });
      await this.appendIndex(tx, `no_notifs_by_user/${input.recipientUid}`, notificationId);
      await this.appendIndex(tx, 'no_indexes/all_notifications', notificationId);

      const attempts: ChannelDeliveryAttemptRecord[] = [];
      for (const ch of eligibleChannels) {
        const attemptId = `att_${notificationId}_${ch}`;
        const attempt: ChannelDeliveryAttemptRecord = {
          attemptId,
          notificationId,
          recipientUid: input.recipientUid,
          channel: ch,
          providerId: this.channelAdapters[ch].providerId,
          providerRequestId: null,
          idempotencyKey: `dlv_${notificationId}_${ch}`,
          status: shouldScheduleLater ? 'SCHEDULED' : 'PENDING',
          attemptCount: 0,
          maxAttempts: 3,
          failureClassification: 'NONE',
          failureReason: null,
          nextRetryAtIso: null,
          latencyMs: 0,
          lastAttemptAtIso: null,
          deliveredAtIso: null,
          createdAtIso: nowIso,
          updatedAtIso: nowIso,
        };
        this.writeDoc(tx, `no_delivery_attempts/${attemptId}`, attempt);
        await this.appendIndex(tx, `no_attempts_by_notif/${notificationId}`, attemptId);
        await this.appendIndex(tx, 'no_indexes/all_delivery_attempts', attemptId);
        attempts.push(attempt);
      }

      return {
        notification,
        deduplicatedReplay: false,
        suppressedReason: undefined as string | undefined,
        deliveryAttempts: attempts,
        shouldDispatchImmediately: !shouldScheduleLater,
      };
    });

    if (staged.deduplicatedReplay || !staged.notification || !staged.shouldDispatchImmediately) {
      return {
        notification: staged.notification,
        suppressedReason: staged.suppressedReason,
        deduplicatedReplay: staged.deduplicatedReplay,
        deliveryAttempts: staged.deliveryAttempts,
      };
    }

    const dispatched = await this.dispatchNotificationChannels(staged.notification.notificationId);
    return {
      notification: dispatched.notification,
      deduplicatedReplay: false,
      deliveryAttempts: dispatched.attempts,
    };
  }

  private async dispatchNotificationChannels(
    notificationId: string,
  ): Promise<{ notification: UnifiedNotificationRecord; attempts: ChannelDeliveryAttemptRecord[] }> {
    const loaded = await this.runTx('no.loadNotifForDispatch', async (tx) => {
      const nSnap = await tx.get<UnifiedNotificationRecord>(`no_notifications/${notificationId}`);
      if (!nSnap.exists || !nSnap.data) {
        throw new CoreApiError('NOT_FOUND', 404, `Notification ${notificationId} not found.`);
      }
      const attempts = await this.listIndexed<ChannelDeliveryAttemptRecord>(
        tx,
        `no_attempts_by_notif/${notificationId}`,
        'no_delivery_attempts',
      );
      return { notification: nSnap.data, attempts };
    });

    const providerResults = new Map<
      string,
      Awaited<ReturnType<ChannelDeliveryProviderAdapter['send']>>
    >();

    // Execute channel providers independently so a failure on one channel never blocks another channel
    for (const attempt of loaded.attempts) {
      if (attempt.status === 'DELIVERED' || attempt.status === 'FAILED_PERMANENT' || attempt.status === 'DEAD_LETTER') {
        continue;
      }
      const adapter = this.channelAdapters[attempt.channel];
      const res = await adapter.send({
        notificationId: loaded.notification.notificationId,
        recipientUid: loaded.notification.recipientUid,
        title: loaded.notification.title,
        body: loaded.notification.structuredContent.body,
        idempotencyKey: `${attempt.idempotencyKey}_try${attempt.attemptCount + 1}`,
        timeoutMs: 5000,
      });
      providerResults.set(attempt.attemptId, res);
    }

    const nowIso = new Date().toISOString();
    return this.runTx('no.recordChannelDispatchOutcomes', async (tx) => {
      const notif = (await tx.get<UnifiedNotificationRecord>(`no_notifications/${notificationId}`)).data!;
      const attempts = await this.listIndexed<ChannelDeliveryAttemptRecord>(
        tx,
        `no_attempts_by_notif/${notificationId}`,
        'no_delivery_attempts',
      );

      const deliveredChannels = new Set<OrchestrationChannel>(notif.deliveredChannels);
      const failedChannels = new Set<OrchestrationChannel>();

      for (const att of attempts) {
        const res = providerResults.get(att.attemptId);
        if (!res) continue;

        att.attemptCount += 1;
        att.lastAttemptAtIso = nowIso;
        att.latencyMs = res.latencyMs;
        att.updatedAtIso = nowIso;

        if (res.ok && res.providerRequestId) {
          att.status = 'DELIVERED';
          att.providerRequestId = res.providerRequestId;
          att.failureClassification = 'NONE';
          att.failureReason = null;
          att.nextRetryAtIso = null;
          att.deliveredAtIso = nowIso;
          deliveredChannels.add(att.channel);
        } else {
          const classification = res.failureClassification ?? 'TRANSIENT_PROVIDER_OUTAGE';
          att.failureClassification = classification;
          att.failureReason = res.failureReason ?? 'Provider delivery failed';
          const isPermanent = classification.startsWith('PERMANENT_');

          if (isPermanent) {
            att.status = 'FAILED_PERMANENT';
            att.nextRetryAtIso = null;
            failedChannels.add(att.channel);
          } else if (att.attemptCount >= att.maxAttempts) {
            att.status = 'DEAD_LETTER';
            att.nextRetryAtIso = null;
            failedChannels.add(att.channel);
          } else {
            att.status = 'RETRY_SCHEDULED';
            // Exponential backoff: 2^attemptCount * 30 seconds
            const backoffMs = Math.pow(2, att.attemptCount) * 30_000;
            att.nextRetryAtIso = new Date(Date.now() + backoffMs).toISOString();
            failedChannels.add(att.channel);
          }
        }
        this.writeDoc(tx, `no_delivery_attempts/${att.attemptId}`, att);
      }

      notif.deliveredChannels = Array.from(deliveredChannels);
      notif.failedChannels = Array.from(failedChannels).filter((c) => !deliveredChannels.has(c));

      if (notif.deliveredChannels.length > 0) {
        notif.status = 'DELIVERED';
        notif.deliveredAtIso = notif.deliveredAtIso ?? nowIso;
      } else if (attempts.some((a) => a.status === 'RETRY_SCHEDULED')) {
        notif.status = 'RETRY_SCHEDULED';
      } else {
        notif.status = 'FAILED';
      }
      notif.updatedAtIso = nowIso;
      this.writeDoc(tx, `no_notifications/${notificationId}`, notif);

      return { notification: notif, attempts };
    });
  }

  // ==========================================================================
  // 7. IN-APP NOTIFICATION CENTER
  // ==========================================================================

  public async listUserNotifications(
    principal: AuthenticatedPrincipal,
    options?: {
      category?: UnifiedNotificationCategory;
      readStatus?: InAppReadStatus;
      limit?: number;
      offset?: number;
    },
  ): Promise<{
    items: UnifiedNotificationRecord[];
    totalCount: number;
    unreadCount: number;
  }> {
    const nowIso = new Date().toISOString();
    return this.runTx('no.listUserNotifications', async (tx) => {
      const all = await this.listIndexed<UnifiedNotificationRecord>(
        tx,
        `no_notifs_by_user/${principal.uid}`,
        'no_notifications',
      );
      const active = all.filter((n) => n.expiresAtIso > nowIso && n.status !== 'CANCELED');
      const unreadCount = active.filter((n) => n.readStatus === 'UNREAD').length;

      let filtered = active;
      if (options?.category) {
        filtered = filtered.filter((n) => n.category === options.category);
      }
      if (options?.readStatus) {
        filtered = filtered.filter((n) => n.readStatus === options.readStatus);
      }

      const limit = Math.min(100, Math.max(1, options?.limit ?? 25));
      const offset = Math.max(0, options?.offset ?? 0);
      return {
        items: filtered.slice(offset, offset + limit),
        totalCount: filtered.length,
        unreadCount,
      };
    });
  }

  public async markNotificationReadStatus(
    principal: AuthenticatedPrincipal,
    notificationId: string,
    readStatus: 'READ' | 'UNREAD' | 'ARCHIVED',
  ): Promise<UnifiedNotificationRecord> {
    const nowIso = new Date().toISOString();
    return this.runTx('no.markNotificationReadStatus', async (tx) => {
      const snap = await tx.get<UnifiedNotificationRecord>(`no_notifications/${notificationId}`);
      if (!snap.exists || !snap.data) {
        throw new CoreApiError('NOT_FOUND', 404, `Notification ${notificationId} not found.`);
      }
      const notif = snap.data;
      this.assertOwnership(principal, notif.recipientUid);
      notif.readStatus = readStatus;
      if (readStatus === 'READ') notif.readAtIso = nowIso;
      if (readStatus === 'UNREAD') notif.readAtIso = null;
      if (readStatus === 'ARCHIVED') notif.archivedAtIso = nowIso;
      notif.updatedAtIso = nowIso;
      this.writeDoc(tx, `no_notifications/${notificationId}`, notif);
      return notif;
    });
  }

  public async markAllNotificationsAsRead(
    principal: AuthenticatedPrincipal,
  ): Promise<{ updatedCount: number }> {
    const nowIso = new Date().toISOString();
    return this.runTx('no.markAllAsRead', async (tx) => {
      const all = await this.listIndexed<UnifiedNotificationRecord>(
        tx,
        `no_notifs_by_user/${principal.uid}`,
        'no_notifications',
      );
      let updatedCount = 0;
      for (const notif of all) {
        if (notif.readStatus === 'UNREAD') {
          notif.readStatus = 'READ';
          notif.readAtIso = nowIso;
          notif.updatedAtIso = nowIso;
          this.writeDoc(tx, `no_notifications/${notif.notificationId}`, notif);
          updatedCount += 1;
        }
      }
      return { updatedCount };
    });
  }

  public async deleteNotification(
    principal: AuthenticatedPrincipal,
    notificationId: string,
  ): Promise<{ deleted: boolean }> {
    return this.runTx('no.deleteNotification', async (tx) => {
      const snap = await tx.get<UnifiedNotificationRecord>(`no_notifications/${notificationId}`);
      if (!snap.exists || !snap.data) {
        throw new CoreApiError('NOT_FOUND', 404, `Notification ${notificationId} not found.`);
      }
      this.assertOwnership(principal, snap.data.recipientUid);
      tx.delete(`no_notifications/${notificationId}`);
      return { deleted: true };
    });
  }

  // ==========================================================================
  // 8, 9, 10. SAVED SEARCH ALERTS, DIGEST SCHEDULING & RETRY JOBS
  // ==========================================================================

  public async dispatchSavedSearchPropertyAlert(params: {
    recipientUid: string;
    savedSearchId: string;
    searchTitle: string;
    neighborhoodName: string;
    matchedProperties: Array<{
      propertyId: string;
      title: string;
      priceText: string;
      isAvailableAndPublished: boolean;
    }>;
    executionWindowKey: string;
  }): Promise<{
    dispatched: boolean;
    notification: UnifiedNotificationRecord | null;
    filteredValidCount: number;
  }> {
    const validProperties = params.matchedProperties.filter((p) => p.isAvailableAndPublished);
    if (validProperties.length === 0) {
      return { dispatched: false, notification: null, filteredValidCount: 0 };
    }
    const top = validProperties[0];
    const result = await this.orchestrateDomainEvent({
      eventId: `ssa_${params.savedSearchId}_${params.executionWindowKey}`,
      sourceDomain: 'EMP_64_CUSTOMER_EXPERIENCE',
      eventType: 'saved_search.matches_found',
      category: 'SAVED_SEARCH_ALERTS',
      recipientUid: params.recipientUid,
      templateId: 'tpl_saved_search_match',
      priority: 'NORMAL',
      variables: {
        searchTitle: params.searchTitle,
        matchCount: validProperties.length,
        neighborhoodName: params.neighborhoodName,
        propertyTitle: top.title,
        priceText: top.priceText,
      },
      relatedEntities: {
        savedSearchId: params.savedSearchId,
        propertyId: top.propertyId,
      },
      deepLinkPath: `/search/saved/${params.savedSearchId}`,
      deduplicationKey: `ssa_dedup_${params.savedSearchId}_${params.executionWindowKey}_${top.propertyId}`,
    });

    return {
      dispatched: Boolean(result.notification),
      notification: result.notification,
      filteredValidCount: validProperties.length,
    };
  }

  public async executeScheduledAndDigestDeliveryJob(
    nowIso = new Date().toISOString(),
  ): Promise<{
    dispatchedScheduledCount: number;
    deliveredDigestBatchesCount: number;
    retriedAttemptsCount: number;
  }> {
    await this.ensureDefaultTemplatesSeeded();
    const dueIds = await this.runTx('no.findDueScheduledAndRetries', async (tx) => {
      const allNotifs = await this.listIndexed<UnifiedNotificationRecord>(
        tx,
        'no_indexes/all_notifications',
        'no_notifications',
      );
      const dueScheduledNotifIds = allNotifs
        .filter(
          (n) =>
            n.status === 'SCHEDULED' &&
            !n.digestBatchId &&
            (!n.scheduledForIso || n.scheduledForIso <= nowIso),
        )
        .map((n) => n.notificationId);

      const allBatches = await this.listIndexed<DigestBatchRecord>(
        tx,
        'no_indexes/all_digest_batches',
        'no_digest_batches',
      );
      const dueBatchIds = allBatches
        .filter((b) => b.status === 'PENDING')
        .map((b) => b.digestBatchId);

      const allAttempts = await this.listIndexed<ChannelDeliveryAttemptRecord>(
        tx,
        'no_indexes/all_delivery_attempts',
        'no_delivery_attempts',
      );
      const dueRetryNotifIds = Array.from(
        new Set(
          allAttempts
            .filter(
              (a) =>
                a.status === 'RETRY_SCHEDULED' &&
                a.nextRetryAtIso &&
                a.nextRetryAtIso <= nowIso,
            )
            .map((a) => a.notificationId),
        ),
      );

      return { dueScheduledNotifIds, dueBatchIds, dueRetryNotifIds };
    });

    let dispatchedScheduledCount = 0;
    for (const notifId of dueIds.dueScheduledNotifIds) {
      await this.dispatchNotificationChannels(notifId);
      dispatchedScheduledCount += 1;
    }

    let deliveredDigestBatchesCount = 0;
    for (const batchId of dueIds.dueBatchIds) {
      const batch = await this.runTx('no.markDigestBatchDelivered', async (tx) => {
        const bSnap = await tx.get<DigestBatchRecord>(`no_digest_batches/${batchId}`);
        if (!bSnap.exists || !bSnap.data || bSnap.data.status !== 'PENDING') return null;
        const b = bSnap.data;
        b.status = 'DELIVERED';
        b.deliveredAtIso = nowIso;
        b.updatedAtIso = nowIso;
        this.writeDoc(tx, `no_digest_batches/${batchId}`, b);
        return b;
      });
      if (batch) {
        for (const nId of batch.notificationIds) {
          await this.dispatchNotificationChannels(nId);
        }
        deliveredDigestBatchesCount += 1;
      }
    }

    let retriedAttemptsCount = 0;
    for (const notifId of dueIds.dueRetryNotifIds) {
      await this.dispatchNotificationChannels(notifId);
      retriedAttemptsCount += 1;
    }

    return {
      dispatchedScheduledCount,
      deliveredDigestBatchesCount,
      retriedAttemptsCount,
    };
  }

  // ==========================================================================
  // 12 & 13. ANALYTICS & ADMINISTRATIVE ANNOUNCEMENTS
  // ==========================================================================

  public async createAdministrativeAnnouncement(
    adminPrincipal: AuthenticatedPrincipal,
    rawInput: unknown,
  ): Promise<{
    announcement: AdministrativeAnnouncementRecord;
    dispatchedCount: number;
    skippedConsentCount: number;
  }> {
    await this.assertAdmin(adminPrincipal);
    await this.ensureDefaultTemplatesSeeded();
    if (!rawInput || typeof rawInput !== 'object' || Array.isArray(rawInput)) {
      throw new CoreApiError('VALIDATION_FAILED', 400, 'Announcement payload must be an object.');
    }
    const obj = rawInput as Record<string, unknown>;
    const title = sanitizeTextInput(String(obj.title ?? '')).slice(0, 140);
    const body = sanitizeTextInput(String(obj.body ?? '')).slice(0, 1000);
    const targetRecipientUids = Array.isArray(obj.targetRecipientUids)
      ? obj.targetRecipientUids.map((u) => sanitizeTextInput(String(u))).filter(Boolean)
      : [];
    if (title.length < 3 || body.length < 5 || targetRecipientUids.length === 0) {
      throw new CoreApiError(
        'VALIDATION_FAILED',
        400,
        'title, body, and non-empty targetRecipientUids are required.',
      );
    }

    const nowIso = new Date().toISOString();
    const announcementId = `ann_${crypto.randomBytes(6).toString('hex')}`;
    let dispatchedCount = 0;
    let skippedConsentCount = 0;

    for (const uid of targetRecipientUids) {
      const res = await this.orchestrateDomainEvent({
        eventId: `${announcementId}_${uid}`,
        sourceDomain: 'ADMIN_SYSTEM',
        eventType: 'admin.announcement',
        category: 'ADMINISTRATIVE_ANNOUNCEMENTS',
        recipientUid: uid,
        templateId: 'tpl_generic_domain_event',
        priority: 'NORMAL',
        isPromotional: true,
        variables: {
          headline: title,
          summary: title,
          details: body,
        },
      });
      if (res.notification) {
        dispatchedCount += 1;
      } else {
        skippedConsentCount += 1;
      }
    }

    const announcement: AdministrativeAnnouncementRecord = {
      announcementId,
      title,
      body,
      targetAudience: 'SPECIFIC_UIDS',
      targetRecipientUids,
      requiresPromotionalConsent: true,
      priority: 'NORMAL',
      channels: ['IN_APP', 'EMAIL'],
      scheduledForIso: nowIso,
      status: 'DISPATCHED',
      dispatchedNotificationCount: dispatchedCount,
      createdByAdminUid: adminPrincipal.uid,
      canceledByAdminUid: null,
      createdAtIso: nowIso,
      updatedAtIso: nowIso,
    };

    await this.runTx('no.saveAnnouncement', async (tx) => {
      this.writeDoc(tx, `no_announcements/${announcementId}`, announcement);
      await this.appendIndex(tx, 'no_indexes/all_announcements', announcementId);
    });

    await this.deps.auditSink.writeAuditEvent(
      createStructuredAuditEvent({
        principal: adminPrincipal,
        correlationId: `corr_${crypto.randomBytes(4).toString('hex')}`,
        action: 'notification_orchestration.announcement.dispatched',
        targetCollection: 'no_announcements',
        targetResourceId: announcementId,
        outcome: 'SUCCESS',
        metadata: { dispatchedCount, skippedConsentCount },
      }),
    );

    return { announcement, dispatchedCount, skippedConsentCount };
  }

  public async getOperationalAnalytics(
    adminPrincipal: AuthenticatedPrincipal,
  ): Promise<NotificationOperationalAnalyticsView> {
    await this.assertAdmin(adminPrincipal);
    return this.runTx('no.getOperationalAnalytics', async (tx) => {
      const notifs = await this.listIndexed<UnifiedNotificationRecord>(
        tx,
        'no_indexes/all_notifications',
        'no_notifications',
      );
      const attempts = await this.listIndexed<ChannelDeliveryAttemptRecord>(
        tx,
        'no_indexes/all_delivery_attempts',
        'no_delivery_attempts',
      );
      const batches = await this.listIndexed<DigestBatchRecord>(
        tx,
        'no_indexes/all_digest_batches',
        'no_digest_batches',
      );

      const byChannel = {} as NotificationOperationalAnalyticsView['byChannel'];
      for (const ch of ALL_ORCHESTRATION_CHANNELS) {
        const chAttempts = attempts.filter((a) => a.channel === ch);
        const totalLatency = chAttempts.reduce((sum, a) => sum + a.latencyMs, 0);
        byChannel[ch] = {
          attempts: chAttempts.length,
          delivered: chAttempts.filter((a) => a.status === 'DELIVERED').length,
          failed: chAttempts.filter((a) => a.status === 'FAILED_PERMANENT').length,
          retriesScheduled: chAttempts.filter((a) => a.status === 'RETRY_SCHEDULED').length,
          deadLettered: chAttempts.filter((a) => a.status === 'DEAD_LETTER').length,
          avgLatencyMs: chAttempts.length > 0 ? Math.round(totalLatency / chAttempts.length) : 0,
        };
      }

      const byCategory = {} as Record<UnifiedNotificationCategory, number>;
      for (const cat of ALL_UNIFIED_NOTIFICATION_CATEGORIES) {
        byCategory[cat] = notifs.filter((n) => n.category === cat).length;
      }

      const byFailureClassification: Record<DeliveryFailureClassification, number> = {
        NONE: 0,
        TRANSIENT_TIMEOUT: 0,
        TRANSIENT_PROVIDER_OUTAGE: 0,
        TRANSIENT_RATE_LIMITED: 0,
        PERMANENT_INVALID_RECIPIENT: 0,
        PERMANENT_TEMPLATE_ERROR: 0,
        PERMANENT_CONSENT_REVOKED: 0,
      };
      for (const a of attempts) {
        byFailureClassification[a.failureClassification] =
          (byFailureClassification[a.failureClassification] ?? 0) + 1;
      }

      const totalGenerated = notifs.length;
      const totalDelivered = notifs.filter((n) => n.status === 'DELIVERED').length;
      const totalRead = notifs.filter((n) => n.readStatus === 'READ').length;
      const retriedCount = attempts.filter((a) => a.attemptCount > 1 || a.status === 'RETRY_SCHEDULED').length;

      return {
        generatedAtIso: new Date().toISOString(),
        totalNotificationsGenerated: totalGenerated,
        totalNotificationsDelivered: totalDelivered,
        totalDeliveryFailures: notifs.filter((n) => n.status === 'FAILED').length,
        retryRateBasisPoints:
          attempts.length > 0 ? Math.round((retriedCount * 10_000) / attempts.length) : 0,
        readRateBasisPoints:
          totalGenerated > 0 ? Math.round((totalRead * 10_000) / totalGenerated) : 0,
        digestBatchesDelivered: batches.filter((b) => b.status === 'DELIVERED').length,
        byChannel,
        byCategory,
        byFailureClassification,
      };
    });
  }
}
