/** @file server/modules/account-admin/accountAdminRoutes.ts — UID-Isolated Account Profiles/Sessions & Authoritative Admin RBAC/Audit/Moderation APIs */
import type { Express, Request, Response } from 'express';
import { sanitizeInput } from '../../../src/utils/security';
import { verifyAdminApiAuthorization, verifyAuthenticatedUserHeader } from '../../../src/utils/serverAdminAndTelegramSecurity';
import { recordAbuseSignal } from '../../../src/utils/serverDeliveryAndAbuseGuard';
import { serverDataCorrections, serverPublishedBargains } from '../../../src/utils/serverPublisherBargains';
import { saveDiskPersistedCache } from '../../../src/utils/serverMarketPulseEngine';
import { communityUnifiedRepository } from '../community/communityUnifiedRepository';
import { serverCommsEngine } from '../communications/commsStore';
import {
  appendServerAdminAuditLog,
  getAccountAdminState,
  recordServerSessionActivity,
  resolveAuthoritativeAdminPrincipal,
  saveAccountAdminState,
} from './accountAdminRepository';

export function registerAccountAdminRoutes(
  app: Express,
  deps: {
    getIp: (req: Request) => string;
    /** Must revoke the actual authenticated session at the identity provider. */
    revokeSession?: (uid: string, sessionId: string) => Promise<boolean>;
  },
): void {
  // === AUTHORIZED USER ACCOUNT PROFILE, PRIVACY, SESSIONS & DATA REQUESTS ===
  app.get('/api/account/profile', async (req: Request, res: Response) => {
    res.setHeader('Cache-Control', 'private, no-store');
    const auth = await verifyAuthenticatedUserHeader(req.headers as Record<string, string | string[] | undefined>);
    if (!auth.authorized || !auth.uid) { recordAbuseSignal(deps.getIp(req), 'auth_failure'); res.status(auth.statusCode).json({ status: 'error', code: auth.reason }); return; }
    const state = getAccountAdminState();
    const existing = state.profilesByUid[auth.uid] ?? {
      ownerUserId: auth.uid, displayName: auth.email?.split('@')[0] || 'کاربر رادار تهران',
      phoneMasked: 'ثبت‌نشده', preferredCityId: 'tehran', preferredPurpose: 'buy' as const,
      activeRoles: ['seeker' as const], activeWorkspaceMode: 'personal' as const,
      subscriptionTier: 'free_explorer' as const, verifiedTiers: ['verified_email'],
      version: 1, updatedAtIso: new Date().toISOString(),
    };
    state.profilesByUid[auth.uid] = existing;
    saveAccountAdminState();
    res.status(200).json({ status: 'ok', profile: existing });
  });

  app.patch('/api/account/profile', async (req: Request, res: Response) => {
    res.setHeader('Cache-Control', 'private, no-store');
    const auth = await verifyAuthenticatedUserHeader(req.headers as Record<string, string | string[] | undefined>);
    if (!auth.authorized || !auth.uid) { res.status(auth.statusCode).json({ status: 'error', code: auth.reason }); return; }
    const state = getAccountAdminState();
    const curr = state.profilesByUid[auth.uid] ?? {
      ownerUserId: auth.uid, displayName: 'کاربر رادار تهران', phoneMasked: 'ثبت‌نشده',
      preferredCityId: 'tehran', preferredPurpose: 'buy' as const, activeRoles: ['seeker' as const],
      activeWorkspaceMode: 'personal' as const, subscriptionTier: 'free_explorer' as const,
      version: 0, updatedAtIso: new Date().toISOString(),
    };
    if (typeof req.body?.expectedVersion === 'number' && req.body.expectedVersion !== curr.version) {
      res.status(409).json({ status: 'error', code: 'CONCURRENCY_CONFLICT', currentProfile: curr });
      return;
    }
    const requestedMode = req.body?.activeWorkspaceMode;
    const validWorkspaceMode =
      requestedMode === 'listings_owner' || requestedMode === 'service_provider' || requestedMode === 'personal'
        ? requestedMode
        : curr.activeWorkspaceMode;
    type RoleCap = 'seeker' | 'owner' | 'advisor' | 'provider';
    const allowedRoles = new Set<RoleCap>(['seeker', 'owner', 'advisor', 'provider']);
    const rawRoles: unknown[] = Array.isArray(req.body?.activeRoles) ? req.body.activeRoles : [];
    const sanitizedRoles: RoleCap[] = Array.from(
      new Set<RoleCap>(rawRoles.filter((r): r is RoleCap => typeof r === 'string' && allowedRoles.has(r as RoleCap))),
    ).slice(0, 4);
    const reqPurpose = req.body?.preferredPurpose;
    const next = {
      ...curr,
      displayName: sanitizeInput(String(req.body?.displayName ?? curr.displayName), 60) || curr.displayName,
      preferredCityId: typeof req.body?.preferredCityId === 'string' ? sanitizeInput(req.body.preferredCityId, 24) : curr.preferredCityId,
      preferredPurpose: reqPurpose === 'buy' || reqPurpose === 'rent' || reqPurpose === 'invest' ? reqPurpose : curr.preferredPurpose,
      activeWorkspaceMode: validWorkspaceMode,
      // Authoritative tier stays server-side; self-declared roles stay strictly descriptive
      activeRoles: sanitizedRoles.length > 0 ? sanitizedRoles : curr.activeRoles,
      version: curr.version + 1,
      updatedAtIso: new Date().toISOString(),
    };
    state.profilesByUid[auth.uid] = next;
    saveAccountAdminState();
    res.status(200).json({ status: 'ok', profile: next });
  });

  app.get('/api/account/privacy', async (req: Request, res: Response) => {
    res.setHeader('Cache-Control', 'private, no-store');
    const auth = await verifyAuthenticatedUserHeader(req.headers as Record<string, string | string[] | undefined>);
    if (!auth.authorized || !auth.uid) { res.status(auth.statusCode).json({ status: 'error', code: auth.reason }); return; }
    const state = getAccountAdminState();
    const privacy = state.privacyByUid[auth.uid] ?? {
      profileVisibility: 'masked_for_requests', sharePhoneOnlyAfterConsent: true, receiveMarketingUpdates: false,
      storeSearchHistoryLocally: true, privacySafeTelemetryEnabled: true, updatedAtIso: new Date().toISOString(),
    };
    res.status(200).json({ status: 'ok', privacy });
  });

  app.patch('/api/account/privacy', async (req: Request, res: Response) => {
    res.setHeader('Cache-Control', 'private, no-store');
    const auth = await verifyAuthenticatedUserHeader(req.headers as Record<string, string | string[] | undefined>);
    if (!auth.authorized || !auth.uid) { res.status(auth.statusCode).json({ status: 'error', code: auth.reason }); return; }
    const state = getAccountAdminState();
    const curr = state.privacyByUid[auth.uid] ?? {
      profileVisibility: 'masked_for_requests' as const, sharePhoneOnlyAfterConsent: true, receiveMarketingUpdates: false,
      storeSearchHistoryLocally: true, privacySafeTelemetryEnabled: true, updatedAtIso: new Date().toISOString(),
    };
    const body = req.body && typeof req.body === 'object' && !Array.isArray(req.body) ? (req.body as Record<string, unknown>) : {};
    const next = {
      profileVisibility:
        body.profileVisibility === 'private' || body.profileVisibility === 'masked_for_requests'
          ? body.profileVisibility
          : curr.profileVisibility,
      sharePhoneOnlyAfterConsent:
        typeof body.sharePhoneOnlyAfterConsent === 'boolean' ? body.sharePhoneOnlyAfterConsent : curr.sharePhoneOnlyAfterConsent,
      receiveMarketingUpdates:
        typeof body.receiveMarketingUpdates === 'boolean' ? body.receiveMarketingUpdates : curr.receiveMarketingUpdates,
      storeSearchHistoryLocally:
        typeof body.storeSearchHistoryLocally === 'boolean' ? body.storeSearchHistoryLocally : curr.storeSearchHistoryLocally,
      privacySafeTelemetryEnabled:
        typeof body.privacySafeTelemetryEnabled === 'boolean' ? body.privacySafeTelemetryEnabled : curr.privacySafeTelemetryEnabled,
      updatedAtIso: new Date().toISOString(),
    };
    state.privacyByUid[auth.uid] = next;
    saveAccountAdminState();
    res.status(200).json({ status: 'ok', privacy: next });
  });

  app.get('/api/account/sessions', async (req: Request, res: Response) => {
    res.setHeader('Cache-Control', 'private, no-store');
    const auth = await verifyAuthenticatedUserHeader(req.headers as Record<string, string | string[] | undefined>);
    if (!auth.authorized || !auth.uid) { res.status(auth.statusCode).json({ status: 'error', code: auth.reason }); return; }
    const sessions = recordServerSessionActivity({
      uid: auth.uid, rawAuthHeader: req.headers.authorization,
      userAgent: typeof req.headers['user-agent'] === 'string' ? req.headers['user-agent'] : 'Browser',
    });
    res.status(200).json({ status: 'ok', items: sessions });
  });

  app.post('/api/account/sessions/:id/revoke', async (req: Request, res: Response) => {
    res.setHeader('Cache-Control', 'private, no-store');
    const auth = await verifyAuthenticatedUserHeader(req.headers as Record<string, string | string[] | undefined>);
    if (!auth.authorized || !auth.uid) { res.status(auth.statusCode).json({ status: 'error', code: auth.reason }); return; }
    const state = getAccountAdminState();
    const list = state.sessionsByUid[auth.uid] || [];
    const target = list.find((s) => s.sessionId === req.params.id);
    if (!target) { res.status(404).json({ status: 'error', code: 'SESSION_NOT_FOUND' }); return; }
    if (target.isCurrent) { res.status(409).json({ status: 'error', code: 'CANNOT_REVOKE_ACTIVE_SESSION' }); return; }
    if (!deps.revokeSession) {
      res.status(503).json({ status: 'error', code: 'SESSION_REVOCATION_PROVIDER_UNAVAILABLE' });
      return;
    }
    let providerRevoked = false;
    try {
      providerRevoked = await deps.revokeSession(auth.uid, target.sessionId);
    } catch {
      providerRevoked = false;
    }
    if (!providerRevoked) {
      res.status(503).json({ status: 'error', code: 'SESSION_REVOCATION_FAILED' });
      return;
    }
    target.revokedAtIso = new Date().toISOString();
    state.sessionsByUid[auth.uid] = list.filter((s) => !s.revokedAtIso);
    saveAccountAdminState();
    res.status(200).json({ status: 'ok', items: state.sessionsByUid[auth.uid] });
  });

  app.get('/api/account/data-requests', async (req: Request, res: Response) => {
    res.setHeader('Cache-Control', 'private, no-store');
    const auth = await verifyAuthenticatedUserHeader(req.headers as Record<string, string | string[] | undefined>);
    if (!auth.authorized || !auth.uid) { res.status(auth.statusCode).json({ status: 'error', code: auth.reason }); return; }
    res.status(200).json({ status: 'ok', items: getAccountAdminState().dataRequestsByUid[auth.uid] || [] });
  });

  // === AUTHORITATIVE ADMIN RBAC, AUDIT, QUEUES, MODERATION & SENSITIVE OPS ===
  app.get('/api/admin/me', async (req: Request, res: Response) => {
    res.setHeader('Cache-Control', 'private, no-store');
    const auth = await verifyAdminApiAuthorization(
    req.headers as Record<string, string | string[] | undefined>,
    process.env,
    { requirePrimaryBootstrapAdmin: true, disallowStaticToken: true },
  );
    if (!auth.authorized) {
      recordAbuseSignal(deps.getIp(req), 'auth_failure');
      res.status(auth.statusCode).json({ authorized: false, code: auth.reason, messageFa: 'احراز هویت مدیر سیستم برقرار نیست.' });
      return;
    }
    const principal = resolveAuthoritativeAdminPrincipal({
      uid: auth.uid, email: auth.email, authReason: auth.reason, authTimeSeconds: auth.authTimeSeconds,
    });
    res.status(200).json({
      authorized: true, uid: auth.uid, email: auth.email, ...principal,
    });
  });

  app.get('/api/admin/audit-logs', async (req: Request, res: Response) => {
    res.setHeader('Cache-Control', 'private, no-store');
    const auth = await verifyAdminApiAuthorization(req.headers as Record<string, string | string[] | undefined>);
    if (!auth.authorized) { res.status(auth.statusCode).json({ status: 'error', code: auth.reason }); return; }
    const actionFilter = typeof req.query.actionCode === 'string' ? req.query.actionCode.trim().toUpperCase() : '';
    const severityFilter = typeof req.query.severity === 'string' ? req.query.severity.trim().toLowerCase() : '';
    const limit = Math.min(100, Math.max(1, Number(req.query.limit || 40)));
    const offset = Math.max(0, Number(req.query.offset || 0));
    const filtered = getAccountAdminState().adminAuditLogs.filter(
      (a) => (!actionFilter || a.actionCode.includes(actionFilter)) && (!severityFilter || a.severity === severityFilter),
    );
    res.status(200).json({ status: 'ok', items: filtered.slice(offset, offset + limit), total: filtered.length, hasMore: offset + limit < filtered.length });
  });

  app.post('/api/admin/audit-logs', async (req: Request, res: Response) => {
    res.setHeader('Cache-Control', 'private, no-store');
    const auth = await verifyAdminApiAuthorization(req.headers as Record<string, string | string[] | undefined>);
    if (!auth.authorized) { res.status(auth.statusCode).json({ status: 'error', code: auth.reason }); return; }
    const principal = resolveAuthoritativeAdminPrincipal({ uid: auth.uid, email: auth.email, authReason: auth.reason });
    const allowedAuditTargets = new Set(['listing', 'provider', 'complaint', 'market_data', 'feature_flag', 'security_op'] as const);
    const rawTargetType = typeof req.body?.targetType === 'string' ? req.body.targetType : 'security_op';
    const targetType = allowedAuditTargets.has(rawTargetType as 'listing' | 'provider' | 'complaint' | 'market_data' | 'feature_flag' | 'security_op')
      ? (rawTargetType as 'listing' | 'provider' | 'complaint' | 'market_data' | 'feature_flag' | 'security_op')
      : 'security_op';
    const entry = appendServerAdminAuditLog({
      actorRole: principal.role,
      actorLabelFa: auth.email || principal.labelFa,
      actionCode: sanitizeInput(String(req.body?.actionCode || 'ADMIN_EVENT'), 64),
      targetType,
      targetId: sanitizeInput(String(req.body?.targetId || ''), 80),
      reasonFa: sanitizeInput(String(req.body?.reasonFa || ''), 240),
      severity: req.body?.severity === 'critical' || req.body?.severity === 'warning' ? req.body.severity : 'info',
    });
    res.status(201).json({ status: 'ok', entry });
  });

  app.get('/api/admin/queues/overview', async (req: Request, res: Response) => {
    res.setHeader('Cache-Control', 'private, no-store');
    const auth = await verifyAdminApiAuthorization(req.headers as Record<string, string | string[] | undefined>);
    if (!auth.authorized) { res.status(auth.statusCode).json({ status: 'error', code: auth.reason }); return; }
    const state = getAccountAdminState();
    const liveBargains = Array.from(serverPublishedBargains.values());
    const pendingUserListings = liveBargains.filter((b) => b.lifecycleState === 'pending_review').length;
    res.status(200).json({
      status: 'ok',
      queues: {
        pendingUserListings,
        listingReports: serverDataCorrections.filter((c) => c.status === 'pending_review').length,
        pendingProviders: await communityUnifiedRepository.countPendingCorrections().catch(() => 0),
        openComplaints: state.disputes.filter((d) => d.status === 'submitted' || d.status === 'under_review').length,
        pendingSponsorRequests: 0,
        liveBargainsCount: liveBargains.filter((b) => b.lifecycleState === 'published').length,
        pendingCommsDlq: serverCommsEngine.deadLetters.filter((d) => !d.replayed).length,
      },
    });
  });

  app.get('/api/admin/listings/moderation', async (req: Request, res: Response) => {
    res.setHeader('Cache-Control', 'private, no-store');
    const auth = await verifyAdminApiAuthorization(req.headers as Record<string, string | string[] | undefined>);
    if (!auth.authorized) { res.status(auth.statusCode).json({ status: 'error', code: auth.reason }); return; }
    res.status(200).json({
      status: 'ok',
      items: Array.from(serverPublishedBargains.values()).slice(0, 100),
      moderationStates: Object.values(getAccountAdminState().listingModerations),
    });
  });

  app.patch('/api/admin/listings/moderation', async (req: Request, res: Response) => {
    res.setHeader('Cache-Control', 'private, no-store');
    const auth = await verifyAdminApiAuthorization(req.headers as Record<string, string | string[] | undefined>);
    if (!auth.authorized) { res.status(auth.statusCode).json({ status: 'error', code: auth.reason }); return; }
    const listingId = sanitizeInput(String(req.body?.listingId || ''), 80);
    const nextStatus = sanitizeInput(String(req.body?.nextStatus || ''), 24);
    const reasonFa = sanitizeInput(String(req.body?.reasonFa || ''), 240);
    if (!listingId || !['published', 'suspended', 'rejected'].includes(nextStatus) || reasonFa.trim().length < 6) {
      res.status(400).json({ status: 'error', code: 'INVALID_MODERATION_PAYLOAD', messageFa: 'شناسه، وضعیت معتبر و دلیل حداقل ۶ کاراکتر الزامی است.' });
      return;
    }
    const existing = serverPublishedBargains.get(listingId);
    if (existing) {
      existing.lifecycleState = nextStatus === 'suspended' ? 'withdrawn' : (nextStatus as 'published' | 'rejected');
      existing.updatedAtIso = new Date().toISOString();
      saveDiskPersistedCache();
    }
    const state = getAccountAdminState();
    state.listingModerations[listingId] = {
      listingId, status: nextStatus as 'published' | 'suspended' | 'rejected',
      moderatorNoteFa: reasonFa, moderatedBy: auth.email || auth.uid || 'admin', updatedAtIso: new Date().toISOString(),
    };
    saveAccountAdminState();
    appendServerAdminAuditLog({
      actorRole: 'content_moderator', actorLabelFa: auth.email || 'ناظر آگهی',
      actionCode: `LISTING_MOD_${nextStatus.toUpperCase()}`, targetType: 'listing', targetId: listingId, reasonFa,
      severity: nextStatus === 'published' ? 'info' : 'warning',
    });
    res.status(200).json({ status: 'ok', moderation: state.listingModerations[listingId] });
  });

  app.post('/api/admin/sensitive-ops/execute', async (req: Request, res: Response) => {
    res.setHeader('Cache-Control', 'private, no-store');
    const auth = await verifyAdminApiAuthorization(req.headers as Record<string, string | string[] | undefined>, process.env, { disallowStaticToken: true });
    if (!auth.authorized) { res.status(auth.statusCode).json({ status: 'error', code: auth.reason }); return; }
    const principal = resolveAuthoritativeAdminPrincipal({ uid: auth.uid, email: auth.email, authReason: auth.reason });
    if (!principal.permissions.includes('admin:run_dangerous_ops')) {
      res.status(403).json({ status: 'error', code: 'FORBIDDEN_ROLE', messageFa: 'اجرای عملیات حساس فقط برای نقش Super Admin مجاز است.' });
      return;
    }
    const opId = sanitizeInput(String(req.body?.opId || ''), 64);
    const reasonFa = sanitizeInput(String(req.body?.reasonFa || ''), 240);
    const idempotencyKey = sanitizeInput(String(req.body?.idempotencyKey || ''), 80);
    const dryRun = Boolean(req.body?.dryRun);
    const pendingResolvedCount = serverDataCorrections.filter((c) => c.status !== 'pending_review').length;

    if (dryRun) {
      res.status(200).json({
        status: 'ok', dryRun: true, opId, estimatedAffectedCount: pendingResolvedCount,
        previewSummaryFa: opId === 'purge_resolved_reports' ? `${pendingResolvedCount} گزارش بررسی‌شده در صف بایگانی قرار دارند.` : 'اجرای عملیات سروری آماده است.',
      });
      return;
    }
    if (!idempotencyKey || reasonFa.trim().length < 8 || req.body?.typedConfirm !== 'CONFIRM') {
      res.status(400).json({ status: 'error', code: 'CONFIRMATION_OR_REASON_INVALID', messageFa: 'دلیل مستند (حداقل ۸ کاراکتر)، کلید یکتا و عبارت CONFIRM الزامی است.' });
      return;
    }
    const state = getAccountAdminState();
    if (state.sensitiveOpExecutions[idempotencyKey]) {
      res.status(200).json({ status: 'ok', deduplicated: true, execution: state.sensitiveOpExecutions[idempotencyKey] });
      return;
    }
    let affectedCount = 0;
    if (opId === 'purge_resolved_reports') {
      for (let i = serverDataCorrections.length - 1; i >= 0; i--) {
        if (serverDataCorrections[i].status !== 'pending_review') { serverDataCorrections.splice(i, 1); affectedCount += 1; }
      }
      saveDiskPersistedCache();
    }
    const execRec = {
      idempotencyKey, opId, actorEmail: auth.email || 'admin', status: 'SUCCEEDED' as const,
      affectedCount, summaryFa: `اجرای عملیات ${opId} روی ${affectedCount} رکورد تکمیل شد.`, executedAtIso: new Date().toISOString(),
    };
    state.sensitiveOpExecutions[idempotencyKey] = execRec;
    saveAccountAdminState();
    appendServerAdminAuditLog({
      actorRole: principal.role, actorLabelFa: auth.email || principal.labelFa,
      actionCode: `SENSITIVE_OP_${opId.toUpperCase()}`, targetType: 'security_op', targetId: opId, reasonFa, severity: 'critical',
    });
    res.status(200).json({ status: 'ok', execution: execRec });
  });
}
