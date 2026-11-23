/**
 * Worker export + privacy handlers (D1-backed, Stage D hardening).
 */

import type { WorkerRequestContext } from '../types.ts';
import { jsonWorkerResponse } from '../contextAndSecurity.ts';
import { createD1AccountLifecycleStore } from '../../server/modules/account-lifecycle/storeFactory.ts';
import {
  AccountDataExportService,
  assertAuthorizedForTargetAccount,
} from '../../server/modules/account-lifecycle/exportService.ts';
import type { AccountLifecycleActorContext, DurableAccountExportJob } from '../../server/modules/account-lifecycle/types.ts';
import { DEFAULT_PRIVACY_POLICY_VERSION } from '../../server/modules/account-lifecycle/privacyConsentContract.ts';
import type { AccountPrivacySettingsSnapshot } from '../../server/modules/account-lifecycle/privacyConsentContract.ts';
import { createWorkerDomainAdapters } from './workerLifecycleAdapters.ts';
import type { D1DatabaseBinding } from '../db/types.ts';
import { ACCOUNT_LIFECYCLE_API_PREFIX } from '../../server/modules/account-lifecycle/officialApiContract.ts';
import { AccountLifecycleError } from '../../server/modules/account-lifecycle/types.ts';

function derivePrivacySnapshot(
  targetUid: string,
  consents: { analytics: boolean; revision: number; updatedAtIso: string },
): AccountPrivacySettingsSnapshot {
  return {
    targetUid,
    productAnalyticsOptIn: consents.analytics,
    communityProfileVisibility: 'connections',
    marketingEmailOptIn: false,
    consentPolicyVersion: DEFAULT_PRIVACY_POLICY_VERSION,
    updatedAtIso: consents.updatedAtIso,
    revision: consents.revision,
  };
}

export async function handleWorkerLifecyclePrivacy(
  ctx: WorkerRequestContext,
  actor: AccountLifecycleActorContext,
): Promise<Response> {
  const d1 = ctx.env.DB! as unknown as D1DatabaseBinding;
  const store = createD1AccountLifecycleStore(d1);
  if (ctx.method === 'GET' && ctx.pathname === `${ACCOUNT_LIFECYCLE_API_PREFIX}/privacy`) {
    assertAuthorizedForTargetAccount(actor, actor.uid, 'EXPORT');
    const latest = await store.getLatestConsent(actor.uid, 'PRODUCT_ANALYTICS_OPTIONAL');
    const snapshot = derivePrivacySnapshot(actor.uid, {
      analytics: Boolean(latest?.granted && !latest.revokedAtIso),
      revision: latest?.revision ?? 0,
      updatedAtIso: latest?.recordedAtIso ?? new Date().toISOString(),
    });
    return jsonWorkerResponse(ctx, 200, { status: 'ok', privacy: snapshot, correlationId: ctx.correlationId });
  }

  if (ctx.method === 'PATCH' && ctx.pathname === `${ACCOUNT_LIFECYCLE_API_PREFIX}/privacy`) {
    assertAuthorizedForTargetAccount(actor, actor.uid, 'EXPORT');
    const body = (await ctx.request.json().catch(() => null)) as { productAnalyticsOptIn?: boolean } | null;
    if (!body || typeof body.productAnalyticsOptIn !== 'boolean') {
      return jsonWorkerResponse(ctx, 400, {
        status: 'error',
        code: 'INVALID_PRIVACY_PAYLOAD',
        correlationId: ctx.correlationId,
      });
    }
    const nowIso = new Date().toISOString();
    const consentId = `cns_${actor.uid}_${Date.now()}`;
    const recorded = await store.recordConsent({
      consentId,
      targetUid: actor.uid,
      scope: 'PRODUCT_ANALYTICS_OPTIONAL',
      granted: body.productAnalyticsOptIn,
      policyVersion: DEFAULT_PRIVACY_POLICY_VERSION,
      recordedAtIso: nowIso,
      revokedAtIso: body.productAnalyticsOptIn ? null : nowIso,
      sourceChannel: 'api',
      revision: 1,
    });
    const snapshot = derivePrivacySnapshot(actor.uid, {
      analytics: recorded.granted,
      revision: recorded.revision,
      updatedAtIso: recorded.recordedAtIso,
    });
    return jsonWorkerResponse(ctx, 200, { status: 'ok', privacy: snapshot, correlationId: ctx.correlationId });
  }

  if (ctx.method === 'POST' && ctx.pathname === `${ACCOUNT_LIFECYCLE_API_PREFIX}/privacy/consent`) {
    const body = (await ctx.request.json().catch(() => null)) as { scope?: string; granted?: boolean } | null;
    if (!body?.scope || typeof body.granted !== 'boolean') {
      return jsonWorkerResponse(ctx, 400, { status: 'error', code: 'INVALID_CONSENT_PAYLOAD', correlationId: ctx.correlationId });
    }
    const nowIso = new Date().toISOString();
    const consent = await store.recordConsent({
      consentId: `cns_${actor.uid}_${body.scope}_${Date.now()}`,
      targetUid: actor.uid,
      scope: body.scope as 'PRODUCT_ANALYTICS_OPTIONAL',
      granted: body.granted,
      policyVersion: DEFAULT_PRIVACY_POLICY_VERSION,
      recordedAtIso: nowIso,
      revokedAtIso: body.granted ? null : nowIso,
      sourceChannel: 'api',
      revision: 1,
    });
    return jsonWorkerResponse(ctx, 200, { status: 'ok', consent, correlationId: ctx.correlationId });
  }

  if (ctx.method === 'POST' && ctx.pathname === `${ACCOUNT_LIFECYCLE_API_PREFIX}/privacy/consent/revoke`) {
    const nowIso = new Date().toISOString();
    const consent = await store.recordConsent({
      consentId: `cns_revoke_${actor.uid}_${Date.now()}`,
      targetUid: actor.uid,
      scope: 'PRODUCT_ANALYTICS_OPTIONAL',
      granted: false,
      policyVersion: DEFAULT_PRIVACY_POLICY_VERSION,
      recordedAtIso: nowIso,
      revokedAtIso: nowIso,
      sourceChannel: 'api',
      revision: 1,
    });
    return jsonWorkerResponse(ctx, 200, { status: 'ok', consent, correlationId: ctx.correlationId });
  }

  return jsonWorkerResponse(ctx, 404, { status: 'error', code: 'PRIVACY_ROUTE_NOT_FOUND', correlationId: ctx.correlationId });
}

export async function handleWorkerLifecycleExport(
  ctx: WorkerRequestContext,
  actor: AccountLifecycleActorContext,
): Promise<Response> {
  const d1 = ctx.env.DB! as unknown as D1DatabaseBinding;
  const store = createD1AccountLifecycleStore(d1);
  const exportService = new AccountDataExportService(createWorkerDomainAdapters(d1));

  if (ctx.method === 'POST' && ctx.pathname === `${ACCOUNT_LIFECYCLE_API_PREFIX}/export`) {
    assertAuthorizedForTargetAccount(actor, actor.uid, 'EXPORT');
    const nowIso = new Date().toISOString();
    const exportJobId = `exjob_${actor.uid}_${Date.now()}`;
    try {
      const envelope = await exportService.exportUserData(actor, actor.uid, { pageSize: 20, maxPagesPerSource: 5 });
      const artifactJson = JSON.stringify(envelope);
      const tokenBytes = crypto.getRandomValues(new Uint8Array(24));
      const token = [...tokenBytes].map((b) => b.toString(16).padStart(2, '0')).join('');
      const tokenHashBuf = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(token));
      const tokenHash = [...new Uint8Array(tokenHashBuf)].map((b) => b.toString(16).padStart(2, '0')).join('');
      const expiresAt = new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString();
      const job: DurableAccountExportJob = {
        exportJobId,
        targetUid: actor.uid,
        requestedByUid: actor.uid,
        state: envelope.completenessStatus === 'COMPLETE' ? 'READY' : 'READY',
        downloadTokenHash: tokenHash,
        downloadExpiresAtIso: expiresAt,
        artifactStorageKey: `inline:${exportJobId}`,
        completenessStatus: envelope.completenessStatus,
        revision: 1,
        createdAtIso: nowIso,
        updatedAtIso: nowIso,
        completedAtIso: nowIso,
        lastError: envelope.completenessStatus === 'COMPLETE' ? null : 'PARTIAL_DOMAIN_COVERAGE',
      };
      await store.createExportJob(job);
      return jsonWorkerResponse(ctx, 202, {
        status: 'accepted',
        exportJobId,
        downloadToken: token,
        downloadExpiresAtIso: expiresAt,
        completenessStatus: envelope.completenessStatus,
        correlationId: ctx.correlationId,
      });
    } catch (err) {
      if (err instanceof AccountLifecycleError) {
        return jsonWorkerResponse(ctx, err.httpStatus, { status: 'error', code: err.code, correlationId: ctx.correlationId });
      }
      throw err;
    }
  }

  const exportStatusMatch = ctx.pathname.match(
    new RegExp(`^${ACCOUNT_LIFECYCLE_API_PREFIX.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}/export/([^/]+)$`),
  );
  if (ctx.method === 'GET' && exportStatusMatch) {
    const exportJobId = decodeURIComponent(exportStatusMatch[1]);
    const job = await store.getExportJob(exportJobId);
    if (!job || job.targetUid !== actor.uid) {
      return jsonWorkerResponse(ctx, 404, { status: 'error', code: 'EXPORT_JOB_NOT_FOUND', correlationId: ctx.correlationId });
    }
    return jsonWorkerResponse(ctx, 200, { status: 'ok', exportJob: job, correlationId: ctx.correlationId });
  }

  const downloadMatch = ctx.pathname.match(
    new RegExp(`^${ACCOUNT_LIFECYCLE_API_PREFIX.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}/export/([^/]+)/download$`),
  );
  if (ctx.method === 'GET' && downloadMatch) {
    return jsonWorkerResponse(ctx, 501, {
      status: 'error',
      code: 'EXPORT_ARTIFACT_REQUIRES_R2_BINDING',
      message: 'Export artifact streaming requires R2 binding; metadata job is stored in D1.',
      correlationId: ctx.correlationId,
    });
  }

  return jsonWorkerResponse(ctx, 404, { status: 'error', code: 'EXPORT_ROUTE_NOT_FOUND', correlationId: ctx.correlationId });
}