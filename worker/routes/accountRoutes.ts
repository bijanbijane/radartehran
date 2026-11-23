/**
 * @file worker/routes/accountRoutes.ts
 * @description Worker-native authenticated Account, Profile, Privacy Consent, Sessions, Favorites,
 * Data Requests, and Account Deletion Lifecycle routes backed strictly by `USER_DB`.
 */
import {
  AccountWriteBlockedError,
  createUserDataRequestInD1,
  getUserPrivacyConsentFromD1,
  getUserProfileFromD1,
  listUserDataRequestsFromD1,
  listUserFavoritesFromD1,
  listUserSessionsFromD1,
  removeUserFavoriteInD1,
  revokeUserSessionInD1,
  updateUserPrivacyConsentInD1,
  upsertUserFavoriteInD1,
  upsertUserProfileInD1,
} from '../account/d1AccountRepository';
import {
  executeAccountDeletionLifecycle,
  processPendingResearchErasureOutbox,
} from '../account-lifecycle/workerLifecycleRuntime';
import { authenticateWorkerSession } from '../auth/sessionAuth';
import { jsonWorkerResponse, readValidatedJsonBody } from '../contextAndSecurity';
import { requireUserDb, resolveResearchDb } from '../db/bindingResolver';
import type { WorkerRequestContext } from '../types';

async function authenticateAccountCaller(ctx: WorkerRequestContext, sensitiveRoute = false) {
  return authenticateWorkerSession(ctx, sensitiveRoute);
}

function isHandledAccountWorkerRoute(method: string, pathname: string): boolean {
  if (pathname === '/api/account/profile' && (method === 'GET' || method === 'PATCH')) return true;
  if (pathname === '/api/account/privacy' && (method === 'GET' || method === 'PATCH')) return true;
  if (pathname === '/api/account/sessions' && method === 'GET') return true;
  if (method === 'POST' && pathname.startsWith('/api/account/sessions/') && pathname.endsWith('/revoke')) return true;
  if (pathname === '/api/account/favorites' && (method === 'GET' || method === 'PUT' || method === 'POST' || method === 'DELETE')) {
    return true;
  }
  if (pathname === '/api/account/export-data' && method === 'GET') return true;
  if (pathname === '/api/account/data-requests' && (method === 'GET' || method === 'POST')) return true;
  if (pathname === '/api/account/deletion-requests' && method === 'POST') return true;
  if (pathname === '/api/account/deletion-requests/reconcile' && method === 'POST') return true;
  return false;
}

export async function handleAccountWorkerRoute(ctx: WorkerRequestContext): Promise<Response | null> {
  const { method, pathname, env, request } = ctx;
  if (!pathname.startsWith('/api/account/')) return null;
  if (!isHandledAccountWorkerRoute(method, pathname)) return null;

  const userDbRes = requireUserDb(env);
  if (userDbRes.ok === false) {
    return jsonWorkerResponse(ctx, userDbRes.statusCode, {
      status: 'error',
      code: userDbRes.code,
      message: userDbRes.messageFa,
    });
  }
  const userDb = userDbRes.db;

  const isSensitive = method !== 'GET' && method !== 'HEAD';
  const auth = await authenticateAccountCaller(ctx, isSensitive);
  if (!auth.authenticated || !auth.uid) {
    return jsonWorkerResponse(ctx, auth.statusCode === 200 ? 401 : auth.statusCode, {
      status: 'error',
      code: auth.reasonCode || 'UNAUTHORIZED',
    });
  }
  const uid = auth.uid;

  try {
    // 1. GET / PATCH /api/account/profile
    if (pathname === '/api/account/profile') {
      if (method === 'GET') {
        const profile = await getUserProfileFromD1(userDb, uid);
        return jsonWorkerResponse(ctx, 200, {
          status: 'ok',
          profile: profile ?? {
            uid,
            displayName: '',
            preferredCity: 'tehran',
            preferredLanguage: 'fa',
            areaUnit: 'sqm',
            intlCurrency: 'USD',
            role: auth.isAdmin ? 'ADMIN' : 'USER',
            accountStatus: 'ACTIVE',
          },
        });
      }
      if (method === 'PATCH') {
        const parsed = await readValidatedJsonBody(request, 16 * 1024);
        if (!parsed.ok) {
          return jsonWorkerResponse(ctx, parsed.status, { status: 'error', code: parsed.code, message: parsed.messageFa });
        }
        const b = parsed.body;
        const preferredCityInput =
          typeof b.preferredCity === 'string'
            ? b.preferredCity
            : typeof b.preferredCityId === 'string'
              ? b.preferredCityId
              : undefined;
        const updated = await upsertUserProfileInD1(userDb, {
          uid,
          displayName: typeof b.displayName === 'string' ? b.displayName : undefined,
          preferredCity: preferredCityInput,
          preferredLanguage: typeof b.preferredLanguage === 'string' ? b.preferredLanguage : undefined,
          areaUnit: b.areaUnit === 'sqft' ? 'sqft' : b.areaUnit === 'sqm' ? 'sqm' : undefined,
          intlCurrency: typeof b.intlCurrency === 'string' ? b.intlCurrency : undefined,
        });
        return jsonWorkerResponse(ctx, 200, { status: 'ok', profile: updated });
      }
    }

    // 2. GET / PATCH /api/account/privacy
    if (pathname === '/api/account/privacy') {
      if (method === 'GET') {
        const privacy = await getUserPrivacyConsentFromD1(userDb, uid);
        return jsonWorkerResponse(ctx, 200, { status: 'ok', privacy });
      }
      if (method === 'PATCH') {
        const parsed = await readValidatedJsonBody(request, 16 * 1024);
        if (!parsed.ok) {
          return jsonWorkerResponse(ctx, parsed.status, { status: 'error', code: parsed.code, message: parsed.messageFa });
        }
        const b = parsed.body;
        const behavioralTelemetryInput =
          typeof b.behavioralTelemetryConsent === 'boolean'
            ? b.behavioralTelemetryConsent
            : typeof b.privacySafeTelemetryEnabled === 'boolean'
              ? b.privacySafeTelemetryEnabled
              : undefined;
        const marketingInput =
          typeof b.marketingCommunicationsConsent === 'boolean'
            ? b.marketingCommunicationsConsent
            : typeof b.receiveMarketingUpdates === 'boolean'
              ? b.receiveMarketingUpdates
              : undefined;
        const privacy = await updateUserPrivacyConsentInD1(userDb, {
          uid,
          actorUid: uid,
          researchAnalyticsConsent:
            typeof b.researchAnalyticsConsent === 'boolean' ? b.researchAnalyticsConsent : undefined,
          behavioralTelemetryConsent: behavioralTelemetryInput,
          marketingCommunicationsConsent: marketingInput,
          consentVersion: typeof b.consentVersion === 'string' ? b.consentVersion : undefined,
          consentSource: 'account_privacy_api',
        });
        return jsonWorkerResponse(ctx, 200, { status: 'ok', privacy });
      }
    }

    // 3. GET /api/account/sessions & POST /api/account/sessions/:sessionId/revoke
    if (pathname === '/api/account/sessions' && method === 'GET') {
      const sessions = await listUserSessionsFromD1(userDb, uid);
      return jsonWorkerResponse(ctx, 200, { status: 'ok', sessions, items: sessions });
    }
    if (method === 'POST' && pathname.startsWith('/api/account/sessions/') && pathname.endsWith('/revoke')) {
      const sessionId = decodeURIComponent(
        pathname.slice('/api/account/sessions/'.length, -'/revoke'.length),
      ).trim();
      if (!sessionId || sessionId.length > 120) {
        return jsonWorkerResponse(ctx, 400, { status: 'error', code: 'INVALID_SESSION_ID' });
      }
      const res = await revokeUserSessionInD1(userDb, { sessionId, uid, actorUid: uid });
      if (!res.revoked) {
        return jsonWorkerResponse(ctx, 404, { status: 'error', code: 'SESSION_NOT_FOUND' });
      }
      return jsonWorkerResponse(ctx, 200, { status: 'ok', sessionId, revoked: true });
    }

    // 4. GET / PUT / DELETE /api/account/favorites
    if (pathname === '/api/account/favorites') {
      if (method === 'GET') {
        const favorites = await listUserFavoritesFromD1(userDb, uid);
        return jsonWorkerResponse(ctx, 200, { status: 'ok', favorites });
      }
      if (method === 'PUT' || method === 'POST') {
        const parsed = await readValidatedJsonBody(request, 16 * 1024);
        if (!parsed.ok) {
          return jsonWorkerResponse(ctx, parsed.status, { status: 'error', code: parsed.code, message: parsed.messageFa });
        }
        const cityId = String(parsed.body.cityId || 'tehran').trim().toLowerCase();
        const hoodId = Number(parsed.body.hoodId);
        if (!Number.isInteger(hoodId) || hoodId < 1 || hoodId > 9999) {
          return jsonWorkerResponse(ctx, 400, { status: 'error', code: 'INVALID_HOOD_ID' });
        }
        const favorite = await upsertUserFavoriteInD1(userDb, {
          uid,
          cityId,
          hoodId,
          note: typeof parsed.body.note === 'string' ? parsed.body.note : undefined,
        });
        return jsonWorkerResponse(ctx, 200, { status: 'ok', favorite });
      }
      if (method === 'DELETE') {
        const cityId = String(ctx.url.searchParams.get('cityId') || 'tehran').trim().toLowerCase();
        const hoodId = Number(ctx.url.searchParams.get('hoodId'));
        if (!Number.isInteger(hoodId) || hoodId < 1) {
          return jsonWorkerResponse(ctx, 400, { status: 'error', code: 'INVALID_HOOD_ID' });
        }
        const res = await removeUserFavoriteInD1(userDb, { uid, cityId, hoodId });
        return jsonWorkerResponse(ctx, 200, { status: 'ok', ...res });
      }
    }

    // 5. GET /api/account/export-data — D1-only, explicitly partial until all legacy domains migrate.
    if (pathname === '/api/account/export-data' && method === 'GET') {
      const [profile, privacy, favorites, dataRequests, savedSearches, notificationChannels, mediaResult, preferences] = await Promise.all([
        getUserProfileFromD1(userDb, uid),
        getUserPrivacyConsentFromD1(userDb, uid),
        listUserFavoritesFromD1(userDb, uid),
        listUserDataRequestsFromD1(userDb, uid),
        userDb.prepare(
          'SELECT search_id, label, city_id, filters_json, alert_enabled, created_at_iso, updated_at_iso FROM user_saved_searches WHERE uid = ?1 ORDER BY updated_at_iso DESC LIMIT 500',
        ).bind(uid).all<Record<string, unknown>>(),
        userDb.prepare(
          'SELECT channel_id, channel_type, destination_masked, verified, enabled, created_at_iso, updated_at_iso FROM user_notification_channels WHERE uid = ?1 ORDER BY created_at_iso DESC LIMIT 100',
        ).bind(uid).all<Record<string, unknown>>(),
        userDb.prepare(
          'SELECT object_id, media_type, mime_type, size_bytes, target_type, target_id, lifecycle_state, created_at_iso, updated_at_iso FROM media_objects WHERE owner_uid = ?1 ORDER BY created_at_iso DESC LIMIT 500',
        ).bind(uid).all<Record<string, unknown>>(),
        userDb.prepare(
          'SELECT mode, deposit, monthly_rent, buy_total_budget, target_sqm, work_hub_id, updated_at_iso FROM user_preferences WHERE uid = ?1 LIMIT 1',
        ).bind(uid).first<Record<string, unknown>>(),
      ]);

      const searches = savedSearches.results ?? [];
      const channels = notificationChannels.results ?? [];
      const media = mediaResult.results ?? [];
      const availableSources = [
        { sourceId: 'USER_PROFILE', domainSource: 'USER_PROFILE', origin: 'server', included: true, available: true, count: 1 + channels.length + dataRequests.length },
        { sourceId: 'FAVORITES_AND_WORKSPACES', domainSource: 'FAVORITES_AND_WORKSPACES', origin: 'server', included: true, available: true, count: favorites.length + searches.length + (preferences ? 1 : 0) },
        { sourceId: 'BUYER_ALERTS', domainSource: 'BUYER_ALERTS', origin: 'server', included: false, available: false, count: 0, reasonFa: 'مخزن D1 متناظر هنوز مهاجرت و فعال نشده است.' },
        { sourceId: 'BARGAIN_LISTINGS', domainSource: 'BARGAIN_LISTINGS', origin: 'server', included: false, available: false, count: 0, reasonFa: 'جدول projection فعلی مالکیت آگهی را نگهداری نمی‌کند؛ داده مالکیت از منبع قدیمی قابل انتساب امن نیست.' },
        { sourceId: 'SPONSOR_RECORDS', domainSource: 'SPONSOR_RECORDS', origin: 'server', included: false, available: false, count: 0, reasonFa: 'مخزن D1 متناظر هنوز مهاجرت و فعال نشده است.' },
        { sourceId: 'CROWD_CLAIMS', domainSource: 'CROWD_CLAIMS', origin: 'server', included: false, available: false, count: 0, reasonFa: 'مخزن D1 متناظر هنوز مهاجرت و فعال نشده است.' },
        { sourceId: 'MEDIA_METADATA', domainSource: 'MEDIA_METADATA', origin: 'server', included: true, available: true, count: media.length },
      ];
      const unavailableSources = availableSources.filter((source) => !source.available).map((source) => source.sourceId);
      const totalRecordsExported = availableSources.reduce((sum, source) => sum + source.count, 0);
      const exportData = {
        schemaVersion: '2.0.0',
        exportedAtIso: new Date().toISOString(),
        ownerUid: uid,
        exportScope: 'server_account',
        isPartialExport: unavailableSources.length > 0,
        completenessStatus: unavailableSources.length > 0 ? 'INCOMPLETE_PARTIAL' : 'COMPLETE',
        totalRecordsExported,
        omittedPagesCount: 0,
        unavailableSources,
        domainSourcesIncluded: availableSources.filter((source) => source.available).map((source) => source.domainSource),
        sources: availableSources,
        excludedSources: ['authentication_credentials', 'session_cookie_values', 'server_audit_logs'],
        profile: {
          profile,
          privacy,
          notificationChannels: channels,
          savedSearches: searches,
          preferences,
          dataRequests,
        },
        favoriteNeighborhoodKeys: favorites.map((favorite) => `${favorite.cityId}_${favorite.hoodId}`),
        savedAlerts: [],
        publishedListings: [],
        calculationSnapshots: [],
        buyerLeads: [],
        dataCorrections: [],
        sponsorRecords: [],
        crowdClaims: [],
        mediaObjects: media,
      };
      return jsonWorkerResponse(ctx, 200, { status: 'ok', exportData });
    }

    // 5. GET / POST /api/account/data-requests
    if (pathname === '/api/account/data-requests') {
      if (method === 'GET') {
        const requests = await listUserDataRequestsFromD1(userDb, uid);
        return jsonWorkerResponse(ctx, 200, { status: 'ok', requests, items: requests });
      }
      if (method === 'POST') {
        const parsed = await readValidatedJsonBody(request, 16 * 1024);
        if (!parsed.ok) {
          return jsonWorkerResponse(ctx, parsed.status, { status: 'error', code: parsed.code, message: parsed.messageFa });
        }
        const reqType = parsed.body.requestType;
        if (reqType !== 'EXPORT' && reqType !== 'ERASURE' && reqType !== 'RECTIFICATION') {
          return jsonWorkerResponse(ctx, 400, { status: 'error', code: 'INVALID_DATA_REQUEST_TYPE' });
        }
        const created = await createUserDataRequestInD1(userDb, { uid, requestType: reqType });
        return jsonWorkerResponse(ctx, 201, { status: 'ok', request: created });
      }
    }

    // 6. POST /api/account/deletion-requests & POST /api/account/deletion-requests/reconcile
    if (pathname === '/api/account/deletion-requests' && method === 'POST') {
      const parsed = await readValidatedJsonBody(request, 16 * 1024);
      if (!parsed.ok) {
        return jsonWorkerResponse(ctx, parsed.status, { status: 'error', code: parsed.code, message: parsed.messageFa });
      }
      const idempotencyKey =
        request.headers.get('idempotency-key') ||
        String(parsed.body.idempotencyKey || `del_${uid}_${Date.now()}`).trim();
      const result = await executeAccountDeletionLifecycle({
        env,
        uid,
        actorUid: uid,
        idempotencyKey,
        reason: typeof parsed.body.reason === 'string' ? parsed.body.reason.slice(0, 120) : 'USER_REQUESTED_ERASURE',
      });
      return jsonWorkerResponse(ctx, result.statusCode, {
        status: result.ok ? 'ok' : 'error',
        ...result,
      });
    }

    if (pathname === '/api/account/deletion-requests/reconcile' && method === 'POST') {
      if (!auth.isAdmin) {
        return jsonWorkerResponse(ctx, 403, { status: 'error', code: 'ADMIN_FORBIDDEN' });
      }
      const outbox = await processPendingResearchErasureOutbox({
        userDb,
        researchDb: resolveResearchDb(env),
        receiptSecret: env.INTERNAL_LIFECYCLE_RPC_SECRET || env.RESEARCH_HMAC_SECRET,
      });
      return jsonWorkerResponse(ctx, 200, { status: 'ok', outbox });
    }
  } catch (err) {
    if (err instanceof AccountWriteBlockedError) {
      return jsonWorkerResponse(ctx, 423, {
        status: 'error',
        code: 'ACCOUNT_WRITE_BLOCKED',
        message: 'حساب کاربری در حال حذف است و تغییرات جدید مسدود شده است.',
      });
    }
    throw err;
  }

  return null;
}
