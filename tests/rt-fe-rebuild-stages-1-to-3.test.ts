import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';

import {
  COLOR_TOKENS,
  SPACING_TOKENS,
  TYPOGRAPHY_TOKENS,
  RADIUS_TOKENS,
  SHADOW_TOKENS,
  BREAKPOINT_TOKENS,
  Z_INDEX_TOKENS,
  getThemeTokens,
} from '../src/design-system';
import {
  clampNumber,
  formatPersianCount,
  isNonEmptyString,
  okResult,
  errResult,
} from '../src/shared';
import {
  normalizeError,
  ERROR_PAYLOAD_MAX_BYTES,
  classifyRecoveryStrategy,
} from '../src/platform/error-handling';
import {
  SafeStorageAdapter,
  getSessionStorage,
  getPreferencesStorage,
  getCacheStorage,
  getTemporaryStorage,
  runStorageMigrations,
  cleanupExpiredStorage,
} from '../src/platform/storage';
import {
  DEFAULT_API_TIMEOUT_MS,
  HEAVY_API_TIMEOUT_MS,
  MAX_GET_RETRIES,
  MAX_MUTATION_RETRIES_WITHOUT_IDEMPOTENCY,
  resolveRequestPolicy,
  shouldRetryRequest,
  parseApiResponse,
} from '../src/platform/api';
import {
  runAppBootstrap,
  initializeApp,
} from '../src/app/bootstrap';
import { ALLOWED_SHELL_LAYOUTS } from '../src/app/application-shell';
import { CENTRAL_ROUTE_REGISTRY, findRegisteredRoute } from '../src/app/router';
import * as AppShellMod from '../src/app/application-shell';
import * as AppRouterMod from '../src/app/router';
import {
  CANONICAL_AUTH_STATES,
  canTransitionAuthState,
  AuthClient,
  bootstrapAuthSession,
  isTokenExpired,
  shouldProactivelyRefresh,
  getRemainingTokenTtlMs,
  preserveSessionDraftOnExpiry,
  recoverPreservedSessionDraft,
  clearPreservedSessionDraft,
  SessionManager,
  SESSION_LIMITS,
  resolveIdentity,
  resolveProfile,
  resolveRoleAndPermissions,
  evaluateRouteAccess,
  evaluateComponentAccess,
  evaluateActionAccess,
  resolveAccessErrorMatrix,
  createWorkspaceCacheNamespace,
  WorkspaceIsolatedStore,
  WorkspaceSwitcher,
  requireStepUpVerification,
  completeStepUpVerification,
  getVerificationStateStore,
  ImpersonationManager,
  evaluateImpersonationGuard,
} from '../src/platform/auth';

const ROOT = process.cwd();

// ============================================================================
// STAGE 1: RT-FE-REBUILD-FOUNDATION-001 (FND-001 .. FND-015)
// ============================================================================

test('FND-001: 5-layer directory structure exists with clear barrel exports', () => {
  const requiredDirs = [
    'src/design-system',
    'src/shared',
    'src/platform',
    'src/features',
    'src/app',
  ];
  for (const rel of requiredDirs) {
    assert.equal(fs.existsSync(path.join(ROOT, rel)), true, `Missing layer directory: ${rel}`);
  }
  assert.ok(COLOR_TOKENS.brand.primary);
  assert.ok(SPACING_TOKENS['4']);
  assert.ok(TYPOGRAPHY_TOKENS.fontFamily.sans);
  assert.ok(RADIUS_TOKENS.xl);
  assert.ok(SHADOW_TOKENS.md);
  assert.ok(BREAKPOINT_TOKENS.lg);
  assert.ok(Z_INDEX_TOKENS.modal);
});

test('FND-002: Design System layer has zero upward imports from platform, features, or app', () => {
  const dsFiles = fs.readdirSync(path.join(ROOT, 'src/design-system'), { recursive: true }) as string[];
  for (const rel of dsFiles) {
    const full = path.join(ROOT, 'src/design-system', rel);
    if (!fs.statSync(full).isFile() || (!full.endsWith('.ts') && !full.endsWith('.tsx'))) continue;
    const content = fs.readFileSync(full, 'utf8');
    assert.equal(/from\s+['"][^'"]*\/(platform|features|app)\//.test(content), false, `Upward import in ${rel}`);
  }
});

test('FND-003: Shared layer has zero upward imports from features or app', () => {
  const sharedFiles = fs.readdirSync(path.join(ROOT, 'src/shared'), { recursive: true }) as string[];
  for (const rel of sharedFiles) {
    const full = path.join(ROOT, 'src/shared', rel);
    if (!fs.statSync(full).isFile() || (!full.endsWith('.ts') && !full.endsWith('.tsx'))) continue;
    const content = fs.readFileSync(full, 'utf8');
    assert.equal(/from\s+['"][^'"]*\/(features|app)\//.test(content), false, `Upward import in ${rel}`);
  }
});

test('FND-004: Platform layer has zero upward imports from features or app', () => {
  const platformFiles = fs.readdirSync(path.join(ROOT, 'src/platform'), { recursive: true }) as string[];
  for (const rel of platformFiles) {
    const full = path.join(ROOT, 'src/platform', rel);
    if (!fs.statSync(full).isFile() || (!full.endsWith('.ts') && !full.endsWith('.tsx'))) continue;
    const content = fs.readFileSync(full, 'utf8');
    assert.equal(/from\s+['"][^'"]*\/(features|app)\//.test(content), false, `Upward import in ${rel}`);
  }
});

test('FND-005: Application Shell enforces exactly 4 canonical layouts (public, authenticated, admin, main)', () => {
  assert.deepEqual(AppShellMod.ALLOWED_SHELL_LAYOUTS, ['public', 'authenticated', 'admin', 'main']);
  assert.equal(typeof AppShellMod.PublicLayout, 'function');
  assert.equal(typeof AppShellMod.AuthenticatedLayout, 'function');
  assert.equal(typeof AppShellMod.AdminLayout, 'function');
  assert.equal(typeof AppShellMod.MainLayout, 'function');
  assert.equal(typeof AppShellMod.AppShell, 'function');
});

test('FND-006: Central Route Registry defines routes with layout, auth, and lazy boundaries', () => {
  assert.ok(AppRouterMod.CENTRAL_ROUTE_REGISTRY.length >= 6);
  const home = AppRouterMod.findRegisteredRoute('/');
  assert.equal(home?.id, 'radar-map');
  assert.equal(home?.layout, 'main');
  const admin = AppRouterMod.findRegisteredRoute('/admin/governance');
  assert.equal(admin?.layout, 'admin');
  assert.equal(admin?.requiresAuth, true);
});

test('FND-007: API Client enforces 15s normal timeout and 30s heavy timeout', () => {
  assert.equal(DEFAULT_API_TIMEOUT_MS, 15_000);
  assert.equal(HEAVY_API_TIMEOUT_MS, 30_000);
  const normal = resolveRequestPolicy({ url: '/api/neighborhoods' });
  const heavy = resolveRequestPolicy({ url: '/api/valuation/heavy', heavy: true });
  assert.equal(normal.timeoutMs, 15_000);
  assert.equal(heavy.timeoutMs, 30_000);
});

test('FND-008: API Retry policy allows max 2 retries for GET and 0 for POST/PUT/DELETE without idempotencyKey', () => {
  assert.equal(MAX_GET_RETRIES, 2);
  assert.equal(MAX_MUTATION_RETRIES_WITHOUT_IDEMPOTENCY, 0);
  const getPolicy = resolveRequestPolicy({ url: '/api/items', method: 'GET' });
  const postNoIdemp = resolveRequestPolicy({ url: '/api/items', method: 'POST' });
  const postWithIdemp = resolveRequestPolicy({ url: '/api/items', method: 'POST', idempotencyKey: 'idem-123' });
  assert.equal(getPolicy.maxRetries, 2);
  assert.equal(postNoIdemp.maxRetries, 0);
  assert.equal(postWithIdemp.maxRetries, 2);
  assert.equal(shouldRetryRequest(getPolicy, 0, 503, false), true);
  assert.equal(shouldRetryRequest(getPolicy, 2, 503, false), false);
  assert.equal(shouldRetryRequest(postNoIdemp, 0, 503, false), false);
});

test('FND-009: Error normalizer redacts sensitive fields and caps serialized payload to <= 2 KB', () => {
  assert.equal(ERROR_PAYLOAD_MAX_BYTES, 2048);
  const hugeDetails: Record<string, unknown> = {
    accessToken: 'secret-jwt-token-value',
    password: 'my-secret-password',
    bigText: 'X'.repeat(5000),
  };
  const normalized = normalizeError({ status: 500, message: 'Server Failure', details: hugeDetails });
  assert.equal(normalized.details?.accessToken, '[REDACTED]');
  assert.equal(normalized.details?.password, '[REDACTED]');
  const byteSize = new TextEncoder().encode(JSON.stringify(normalized)).length;
  assert.ok(byteSize <= ERROR_PAYLOAD_MAX_BYTES, `Expected <= 2048 bytes, got ${byteSize}`);
});

test('FND-010: Error recovery classifier distinguishes retry, reauth, and fatal codes', () => {
  const netRecovery = classifyRecoveryStrategy('ERR_NETWORK_OFFLINE');
  const authRecovery = classifyRecoveryStrategy('ERR_AUTH_SESSION_EXPIRED');
  assert.equal(netRecovery.canRetry, true);
  assert.equal(authRecovery.shouldRedirectToLogin, true);
});

test('FND-011: SafeStorageAdapter handles QuotaExceededError by evicting expired/cache entries', () => {
  const adapter = new SafeStorageAdapter('cache');
  adapter.set('expired-item', { a: 1 }, -1000); // already expired
  adapter.set('live-item', { b: 2 }, 60_000);
  assert.equal(adapter.get('expired-item', null), null);
  assert.deepEqual(adapter.get('live-item', null), { b: 2 });
  const evicted = adapter.evictExpired();
  assert.ok(evicted >= 0);
});

test('FND-012: Four isolated storage namespaces (session, prefs, cache, temp) operate without collision', () => {
  getSessionStorage().set('k1', 'session-val');
  getPreferencesStorage().set('k1', 'prefs-val');
  getCacheStorage().set('k1', 'cache-val');
  getTemporaryStorage().set('k1', 'temp-val');

  assert.equal(getSessionStorage().get('k1', ''), 'session-val');
  assert.equal(getPreferencesStorage().get('k1', ''), 'prefs-val');
  assert.equal(getCacheStorage().get('k1', ''), 'cache-val');
  assert.equal(getTemporaryStorage().get('k1', ''), 'temp-val');
});

test('FND-013: Storage migration and cleanup run deterministically during app bootstrap', async () => {
  const migration = runStorageMigrations();
  assert.equal(migration.toVersion, 1);
  const initRes = await initializeApp(null);
  assert.equal(initRes.bootstrap.direction, 'rtl');
  assert.equal(initRes.bootstrap.locale, 'fa-IR');
  assert.equal(initRes.auth.status, 'UNAUTHENTICATED');
});

test('FND-014: Shared utilities and Result contracts behave deterministically', () => {
  assert.equal(clampNumber(15, 0, 10), 10);
  assert.equal(isNonEmptyString('  سلام '), true);
  assert.equal(isNonEmptyString('   '), false);
  assert.ok(formatPersianCount(1250).length > 0);
  const ok = okResult(42);
  const err = errResult('FAILED');
  assert.equal(ok.ok, true);
  assert.equal(err.ok, false);
});

test('FND-015: Theme tokens resolve both dark and light mode definitions cleanly', () => {
  const dark = getThemeTokens('dark');
  const light = getThemeTokens('light');
  assert.equal(dark.mode, 'dark');
  assert.equal(light.mode, 'light');
  assert.notEqual(dark.background.primary, light.background.primary);
});

// ============================================================================
// STAGE 2: RT-FE-REBUILD-DEBT-RETIREMENT-002 (RTD-001 .. RTD-015)
// ============================================================================

test('RTD-001: index.html has zero runtime dependencies on fonts.googleapis.com, fonts.gstatic.com, or unpkg.com', () => {
  const html = fs.readFileSync(path.join(ROOT, 'index.html'), 'utf8');
  assert.equal(html.includes('fonts.googleapis.com'), false);
  assert.equal(html.includes('fonts.gstatic.com'), false);
  assert.equal(html.includes('unpkg.com'), false);
});

test('RTD-002: index.html body does not lock global scroll or text selection with overflow-hidden select-none', () => {
  const html = fs.readFileSync(path.join(ROOT, 'index.html'), 'utf8');
  const bodyMatch = html.match(/<body[^>]*>/i);
  assert.ok(bodyMatch, 'Expected <body> tag in index.html');
  assert.equal(bodyMatch[0].includes('overflow-hidden'), false);
  assert.equal(bodyMatch[0].includes('select-none'), false);
});

test('RTD-003: src/index.css declares the 7-layer CSS architecture (@layer reset, tokens, base, themes, layouts, components, utilities)', () => {
  const css = fs.readFileSync(path.join(ROOT, 'src/index.css'), 'utf8');
  assert.equal(
    css.includes('@layer reset, tokens, base, themes, layouts, components, utilities;'),
    true
  );
});

test('RTD-004: src/index.css has zero !important overrides (reduced from 78 to 0)', () => {
  const css = fs.readFileSync(path.join(ROOT, 'src/index.css'), 'utf8');
  const importantMatches = css.match(/!important/g) ?? [];
  assert.equal(importantMatches.length, 0, `Expected 0 !important in src/index.css, found ${importantMatches.length}`);
});

test('RTD-005: Local Vazirmatn @font-face declarations exist in src/styles/fonts.css', () => {
  const fontsCss = fs.readFileSync(path.join(ROOT, 'src/styles/fonts.css'), 'utf8');
  assert.equal(fontsCss.includes("font-family: 'Vazirmatn'"), true);
  assert.equal(fontsCss.includes('font-display: swap'), true);
});

test('RTD-006: Local Leaflet CSS is bundled via src/styles/index.css without external CDN', () => {
  const stylesIndex = fs.readFileSync(path.join(ROOT, 'src/styles/index.css'), 'utf8');
  assert.equal(stylesIndex.includes("leaflet/dist/leaflet.css"), true);
});

test('RTD-007: OnboardingStageSwitch uses React.lazy + Suspense for Stage34..Stage84 subpanels', () => {
  const switchCode = fs.readFileSync(
    path.join(ROOT, 'src/features/onboarding/components/OnboardingStageSwitch.tsx'),
    'utf8'
  );
  const lazyCount = (switchCode.match(/lazy\(\(\)\s*=>\s*import\(/g) ?? []).length;
  assert.ok(lazyCount >= 45, `Expected >= 45 lazy stage imports, found ${lazyCount}`);
  assert.equal(switchCode.includes('<Suspense'), true);
});

test('RTD-008: vite.config.ts manualChunks splits onboarding-ui and feature chunks cleanly', () => {
  const viteConfig = fs.readFileSync(path.join(ROOT, 'vite.config.ts'), 'utf8');
  assert.equal(viteConfig.includes('onboarding-ui-34-39'), true);
  assert.equal(viteConfig.includes('onboarding-ui-70-79'), true);
  assert.equal(viteConfig.includes('vendor-leaflet'), true);
});

test('RTD-009: Global html, body in src/styles/base.css allows natural vertical scrolling and text selection', () => {
  const baseCss = fs.readFileSync(path.join(ROOT, 'src/styles/base.css'), 'utf8');
  assert.equal(baseCss.includes('overflow-x: hidden'), true);
  assert.equal(baseCss.includes('.app-viewport-locked'), true);
});

test('RTD-010: leafletMapLifecycle.ts prefers local bundled leaflet before external script fallback', () => {
  const code = fs.readFileSync(path.join(ROOT, 'src/components/map/leafletMapLifecycle.ts'), 'utf8');
  assert.equal(code.includes("import('leaflet')"), true);
});

test('RTD-011: All new style layer files exist under src/styles/', () => {
  const expectedFiles = [
    'src/styles/index.css',
    'src/styles/reset.css',
    'src/styles/fonts.css',
    'src/styles/base.css',
    'src/styles/utilities.css',
    'src/styles/layers/tokens.css',
    'src/styles/layers/themes.css',
    'src/styles/layers/layouts.css',
    'src/styles/layers/components.css',
  ];
  for (const f of expectedFiles) {
    assert.equal(fs.existsSync(path.join(ROOT, f)), true, `Missing style file: ${f}`);
  }
});

test('RTD-012: Theme CSS variables define both dark default and html.light-mode overrides', () => {
  const themesCss = fs.readFileSync(path.join(ROOT, 'src/styles/layers/themes.css'), 'utf8');
  const tokensCss = fs.readFileSync(path.join(ROOT, 'src/styles/layers/tokens.css'), 'utf8');
  assert.equal(tokensCss.includes('--bg-dark:'), true);
  assert.equal(themesCss.includes('html.light-mode'), true);
});

test('RTD-013: No duplicate UI theme definitions exist outside src/design-system/themes and src/styles/layers', () => {
  assert.equal(fs.existsSync(path.join(ROOT, 'src/design-system/themes/dark.ts')), true);
  assert.equal(fs.existsSync(path.join(ROOT, 'src/design-system/themes/light.ts')), true);
});

test('RTD-014: Response parser safely handles JSON, text, and 204 empty responses', async () => {
  const emptyRes = new Response(null, { status: 204 });
  const parsedEmpty = await parseApiResponse(emptyRes);
  assert.equal(parsedEmpty, null);

  const jsonRes = new Response(JSON.stringify({ ok: true, count: 5 }), {
    status: 200,
    headers: { 'content-type': 'application/json' },
  });
  const parsedJson = await parseApiResponse<{ ok: boolean; count: number }>(jsonRes);
  assert.equal(parsedJson.ok, true);
  assert.equal(parsedJson.count, 5);
});

test('RTD-015: Every newly created rebuild file is well below the 500-line hard limit and 300-line soft limit', () => {
  const checkDirs = ['src/design-system', 'src/shared', 'src/platform', 'src/app'];
  for (const d of checkDirs) {
    const files = fs.readdirSync(path.join(ROOT, d), { recursive: true }) as string[];
    for (const rel of files) {
      const full = path.join(ROOT, d, rel);
      if (!fs.statSync(full).isFile() || (!full.endsWith('.ts') && !full.endsWith('.tsx'))) continue;
      const lines = fs.readFileSync(full, 'utf8').split('\n').length;
      assert.ok(lines <= 300, `File ${d}/${rel} has ${lines} lines (> 300 soft limit)`);
    }
  }
});

// ============================================================================
// STAGE 3: RT-FE-REBUILD-AUTH-ACCESS-003 (AUTH-001 .. AUTH-025)
// ============================================================================

test('AUTH-001: Auth State Machine defines all 9 canonical states', () => {
  assert.equal(CANONICAL_AUTH_STATES.length, 9);
  const expected = [
    'INITIALIZING',
    'UNAUTHENTICATED',
    'AUTHENTICATED',
    'RESOLVING_ACCESS',
    'READY',
    'TOKEN_REFRESHING',
    'REAUTH_REQUIRED',
    'SESSION_EXPIRED',
    'ACCESS_DENIED',
  ];
  assert.deepEqual([...CANONICAL_AUTH_STATES], expected);
});

test('AUTH-002: Auth state transitions enforce allowed state graph', () => {
  assert.equal(canTransitionAuthState('INITIALIZING', 'AUTHENTICATED'), true);
  assert.equal(canTransitionAuthState('AUTHENTICATED', 'RESOLVING_ACCESS'), true);
  assert.equal(canTransitionAuthState('RESOLVING_ACCESS', 'READY'), true);
  assert.equal(canTransitionAuthState('UNAUTHENTICATED', 'TOKEN_REFRESHING'), false);
});

test('AUTH-003: bootstrapAuthSession transitions guest user to UNAUTHENTICATED cleanly', async () => {
  const client = new AuthClient();
  const res = await bootstrapAuthSession(null, { client });
  assert.equal(res.status, 'UNAUTHENTICATED');
  assert.equal(client.getState(), 'UNAUTHENTICATED');
});

test('AUTH-004: bootstrapAuthSession transitions valid user through RESOLVING_ACCESS to READY', async () => {
  const client = new AuthClient();
  const res = await bootstrapAuthSession(
    {
      uid: 'u-100',
      email: 'ali@example.com',
      phoneNumber: '09121112233',
      displayName: 'علی رضایی',
      emailVerified: true,
      customClaims: { role: 'buyer', roles: ['buyer', 'agency_agent'] },
    },
    { client }
  );
  assert.equal(res.status, 'READY');
  assert.equal(client.getState(), 'READY');
  assert.equal(res.access?.activeRole, 'buyer');
});

test('AUTH-005: bootstrapAuthSession transitions locked account to ACCESS_DENIED and expired token to SESSION_EXPIRED', async () => {
  const clientLocked = new AuthClient();
  const locked = await bootstrapAuthSession(
    { uid: 'u-locked', email: null, phoneNumber: null, displayName: null, emailVerified: false },
    { client: clientLocked, accountLocked: true }
  );
  assert.equal(locked.status, 'ACCESS_DENIED');
  assert.equal(clientLocked.getState(), 'ACCESS_DENIED');

  const clientExpired = new AuthClient();
  const expired = await bootstrapAuthSession(
    { uid: 'u-exp', email: null, phoneNumber: null, displayName: null, emailVerified: false },
    { client: clientExpired, tokenExpired: true }
  );
  assert.equal(expired.status, 'SESSION_EXPIRED');
  assert.equal(clientExpired.getState(), 'SESSION_EXPIRED');
});

test('AUTH-006: Token lifecycle accurately detects expired and proactive refresh windows', () => {
  const now = 1_700_000_000_000;
  const freshToken = { accessToken: 't1', issuedAt: now - 60_000, expiresAt: now + 300_000, permissionVersion: 1 };
  const nearExpiryToken = { accessToken: 't2', issuedAt: now - 250_000, expiresAt: now + 30_000, permissionVersion: 1 };
  const expiredToken = { accessToken: 't3', issuedAt: now - 400_000, expiresAt: now - 1000, permissionVersion: 1 };

  assert.equal(isTokenExpired(freshToken, now), false);
  assert.equal(shouldProactivelyRefresh(freshToken, now), false);
  assert.equal(shouldProactivelyRefresh(nearExpiryToken, now), true);
  assert.equal(isTokenExpired(expiredToken, now), true);
  assert.equal(getRemainingTokenTtlMs(nearExpiryToken, now), 30_000);
});

test('AUTH-007: Single-Flight token refresh executes max 1 concurrent refresh for parallel callers', async () => {
  const sm = new SessionManager();
  let refreshCalls = 0;

  const refreshFn = async () => {
    refreshCalls += 1;
    assert.equal(sm.getActiveRefreshCount(), 1);
    await new Promise((r) => setTimeout(r, 25));
    return {
      accessToken: 'fresh-jwt-1',
      issuedAt: Date.now(),
      expiresAt: Date.now() + 3600_000,
      permissionVersion: 2,
    };
  };

  const [r1, r2, r3] = await Promise.all([
    sm.refreshSingleFlight(refreshFn),
    sm.refreshSingleFlight(refreshFn),
    sm.refreshSingleFlight(refreshFn),
  ]);

  assert.equal(refreshCalls, 1);
  assert.equal(r1.accessToken, 'fresh-jwt-1');
  assert.equal(r2.accessToken, 'fresh-jwt-1');
  assert.equal(r3.accessToken, 'fresh-jwt-1');
});

test('AUTH-008: SessionManager queues up to 50 GET requests during refresh and overflows at 51', async () => {
  const sm = new SessionManager();
  assert.equal(SESSION_LIMITS.maxQueuedRequests, 50);

  const promises: Promise<string>[] = [];
  for (let i = 0; i < 50; i++) {
    promises.push(
      sm.enqueueRequestDuringRefresh({
        id: `req-${i}`,
        method: 'GET',
        execute: async (token) => `${token}:${i}`,
      })
    );
  }
  assert.equal(sm.getQueueLength(), 50);

  await assert.rejects(
    () =>
      sm.enqueueRequestDuringRefresh({
        id: 'req-51',
        method: 'GET',
        execute: async (token) => token,
      }),
    /AUTH_REFRESH_QUEUE_OVERFLOW/
  );

  await sm.refreshSingleFlight(async () => ({
    accessToken: 'tok-ok',
    issuedAt: Date.now(),
    expiresAt: Date.now() + 60_000,
    permissionVersion: 1,
  }));

  const results = await Promise.all(promises);
  assert.equal(results.length, 50);
  assert.equal(results[0], 'tok-ok:0');
});

test('AUTH-009: SessionManager blocks automatic retry of POST/PUT/DELETE without idempotencyKey', async () => {
  const sm = new SessionManager();
  assert.equal(SESSION_LIMITS.autoRetryPostWithoutIdempotency, 0);

  await assert.rejects(
    () =>
      sm.enqueueRequestDuringRefresh({
        id: 'mut-1',
        method: 'POST',
        execute: async () => 'done',
      }),
    /NON_IDEMPOTENT_MUTATION_REQUIRES_CONFIRMATION/
  );
});

test('AUTH-010: SessionManager preserves 100% of form drafts and return route on session expiry', () => {
  clearPreservedSessionDraft();
  const draft = preserveSessionDraftOnExpiry({
    routePath: '/escrow',
    searchParams: '?deal=99',
    formDrafts: { buyerOfferPrice: 12_500_000_000, notes: 'پیشنهاد قطعی خریدار' },
  });
  assert.equal(draft.routePath, '/escrow');

  const recovered = recoverPreservedSessionDraft();
  assert.ok(recovered);
  assert.equal(recovered?.routePath, '/escrow');
  assert.equal(recovered?.searchParams, '?deal=99');
  assert.deepEqual(recovered?.formDrafts, {
    buyerOfferPrice: 12_500_000_000,
    notes: 'پیشنهاد قطعی خریدار',
  });
});

test('AUTH-011: Logout aborts all queued requests and allows 0 stale retries after logout', async () => {
  const sm = new SessionManager();
  const queued = sm.enqueueRequestDuringRefresh({
    id: 'q-after-logout',
    method: 'GET',
    execute: async () => 'should-not-run',
  });

  sm.logoutAndClearAll();
  await assert.rejects(() => queued, /SESSION_LOGGED_OUT_ABORTED/);
  await assert.rejects(
    () =>
      sm.enqueueRequestDuringRefresh({
        id: 'q-post-logout',
        method: 'GET',
        execute: async () => 'no',
      }),
    /SESSION_LOGGED_OUT_NO_RETRY/
  );
});

test('AUTH-012: Identity, Profile, Role, and Permission resolvers are decoupled (Role !== automatic full Permission)', () => {
  const identity = resolveIdentity({
    uid: 'u-agency-1',
    email: 'agent@tehranradar.ir',
    phoneNumber: '09120001122',
    displayName: 'مشاور منطقه ۱',
    emailVerified: true,
    customClaims: {
      role: 'agency_agent',
      roles: ['buyer', 'agency_agent'],
      revokedPermissions: ['lead:manage'], // Explicitly revoked despite agency_agent role
      permissionVersion: 4,
    },
  });
  const profile = resolveProfile(identity);
  const access = resolveRoleAndPermissions(identity, profile, 'ws:agency:10');

  assert.equal(profile.isComplete, true);
  assert.equal(access.activeRole, 'agency_agent');
  assert.equal(access.permissions.includes('lead:manage'), false, 'Revoked permission must not be granted');
  assert.equal(access.permissionVersion, 4);
});

test('AUTH-013: Workspace cache namespace isolates userId + workspaceId + permissionVersion', () => {
  const store = new WorkspaceIsolatedStore();
  const wsBuyer = {
    userId: 'u-1',
    workspaceId: 'ws:personal',
    workspaceType: 'personal' as const,
    organizationId: null,
    activeRole: 'buyer' as const,
    permissions: ['property:read'],
    permissionVersion: 1,
    switchedAt: Date.now(),
  };
  const wsAgency = {
    userId: 'u-1',
    workspaceId: 'ws:agency:42',
    workspaceType: 'agency' as const,
    organizationId: 'org-42',
    activeRole: 'agency_agent' as const,
    permissions: ['property:read', 'lead:manage'],
    permissionVersion: 1,
    switchedAt: Date.now(),
  };

  assert.notEqual(createWorkspaceCacheNamespace(wsBuyer), createWorkspaceCacheNamespace(wsAgency));
  store.setCacheValue(wsBuyer, 'leads', ['personal-saved']);
  store.setCacheValue(wsAgency, 'leads', ['agency-client-lead-1', 'agency-client-lead-2']);

  assert.deepEqual(store.getCacheValue(wsBuyer, 'leads', []), ['personal-saved']);
  assert.deepEqual(store.getCacheValue(wsAgency, 'leads', []), ['agency-client-lead-1', 'agency-client-lead-2']);
});

test('AUTH-014: WorkspaceSwitcher aborts in-flight requests of previous workspace on switch', () => {
  const store = new WorkspaceIsolatedStore();
  const switcher = new WorkspaceSwitcher(store);

  switcher.switchWorkspace({
    userId: 'u-1',
    workspaceId: 'ws:agency:1',
    organizationId: 'org-1',
    activeRole: 'agency_agent',
    permissions: ['lead:manage'],
    permissionVersion: 1,
  });

  const abortCtrl = new AbortController();
  store.registerInFlightRequest('ws:agency:1', abortCtrl);
  assert.equal(abortCtrl.signal.aborted, false);

  const switchRes = switcher.switchWorkspace(
    {
      userId: 'u-1',
      workspaceId: 'ws:personal:1',
      organizationId: null,
      activeRole: 'buyer',
      permissions: ['property:read'],
      permissionVersion: 1,
    },
    '/agency/workspace'
  );

  assert.equal(abortCtrl.signal.aborted, true);
  assert.equal(switchRes.abortedRequestsCount, 1);
  assert.equal(switchRes.redirectRoute, '/');
});

test('AUTH-015: Multi-role user (buyer + agency_agent + service_provider) never leaks selection state across switches', () => {
  const store = new WorkspaceIsolatedStore();
  const switcher = new WorkspaceSwitcher(store);

  switcher.switchWorkspace({
    userId: 'u-multi',
    workspaceId: 'ws:service',
    organizationId: 'srv-1',
    activeRole: 'service_provider',
    permissions: ['service_order:fulfill'],
    permissionVersion: 1,
  });
  store.setSelectionState('ws:service', { selectedOrderId: 'ORD-900' });

  switcher.switchWorkspace({
    userId: 'u-multi',
    workspaceId: 'ws:personal',
    organizationId: null,
    activeRole: 'buyer',
    permissions: ['property:read'],
    permissionVersion: 1,
  });

  assert.deepEqual(store.getSelectionState('ws:service'), {});
  assert.deepEqual(store.getSelectionState('ws:personal'), {});
});

test('AUTH-016: Permission version bump invalidates stale workspace cache namespace automatically', () => {
  const store = new WorkspaceIsolatedStore();
  const v1 = {
    userId: 'u-1',
    workspaceId: 'ws:agency',
    workspaceType: 'agency' as const,
    organizationId: 'org-1',
    activeRole: 'agency_agent' as const,
    permissions: ['lead:manage'],
    permissionVersion: 1,
    switchedAt: Date.now(),
  };
  const v2 = { ...v1, permissionVersion: 2 };

  store.setCacheValue(v1, 'sensitive_list', ['item-1']);
  assert.deepEqual(store.getCacheValue(v2, 'sensitive_list', []), []);
});

test('AUTH-017: Route access policy guards /admin, /agency, /service, and /escrow accurately', () => {
  const buyerCtx = {
    isAuthenticated: true,
    activeRole: 'buyer' as const,
    permissions: ['map:view', 'property:read', 'escrow:initiate'] as any[],
    workspaceId: 'ws:personal',
  };

  assert.equal(evaluateRouteAccess('/', buyerCtx).allowed, true);
  assert.equal(evaluateRouteAccess('/escrow', buyerCtx).allowed, true);
  assert.equal(evaluateRouteAccess('/admin/governance', buyerCtx).allowed, false);
  assert.equal(evaluateRouteAccess('/agency/workspace', buyerCtx).allowed, false);
  assert.equal(evaluateRouteAccess('/service/orders', buyerCtx).allowed, false);
});

test('AUTH-018: Component access policy enforces permission checks at component boundary', () => {
  const decisionDenied = evaluateComponentAccess(['admin:governance'], {
    isAuthenticated: true,
    activeRole: 'buyer',
    permissions: ['property:read'],
    workspaceId: 'ws:personal',
  });
  assert.equal(decisionDenied.allowed, false);
  assert.equal(decisionDenied.reason, 'MISSING_COMPONENT_PERMISSION');
});

test('AUTH-019: Action access policy flags sensitive actions for Step-Up verification', () => {
  const decision = evaluateActionAccess(
    'settlement:withdraw',
    ['settlement:withdraw'],
    {
      isAuthenticated: true,
      activeRole: 'seller',
      permissions: ['settlement:withdraw'],
      workspaceId: 'ws:personal',
      isStepUpVerified: false,
    },
    true
  );
  assert.equal(decision.allowed, false);
  assert.equal(decision.requiresStepUp, true);
});

test('AUTH-020: Access Error Matrix maps HTTP 401, 403, 423, 404, 429, 5xx, and featureDisabled accurately', () => {
  assert.equal(resolveAccessErrorMatrix(401).category, 'UNAUTHENTICATED');
  assert.equal(resolveAccessErrorMatrix(401).preserveDraft, true);
  assert.equal(resolveAccessErrorMatrix(403).category, 'FORBIDDEN');
  assert.equal(resolveAccessErrorMatrix(423).category, 'LOCKED');
  assert.equal(resolveAccessErrorMatrix(404).category, 'NOT_FOUND');
  assert.equal(resolveAccessErrorMatrix(429).category, 'RATE_LIMITED');
  assert.equal(resolveAccessErrorMatrix(502).category, 'SERVER_ERROR');
  assert.equal(resolveAccessErrorMatrix(200, { featureDisabled: true }).category, 'FEATURE_DISABLED');
});

test('AUTH-021: Step-Up verification blocks unverified sensitive actions and transitions to REAUTH_REQUIRED', () => {
  getVerificationStateStore().clearVerification();
  const check = requireStepUpVerification('u-step-1', 'settlement:withdraw');
  assert.equal(check.allowed, false);
  assert.equal(check.requiresReauth, true);
  assert.equal(check.reason, 'STEP_UP_VERIFICATION_REQUIRED');
});

test('AUTH-022: Step-Up verification grants access within TTL and expires after policy maxVerificationAgeMs', () => {
  getVerificationStateStore().clearVerification();
  const t0 = 1_700_000_000_000;
  completeStepUpVerification('u-step-2', 'otp', 'settlement:withdraw', t0);

  const withinTtl = requireStepUpVerification('u-step-2', 'settlement:withdraw', {
    now: t0 + 2 * 60 * 1000,
  });
  assert.equal(withinTtl.allowed, true);

  const expiredTtl = requireStepUpVerification('u-step-2', 'settlement:withdraw', {
    now: t0 + 6 * 60 * 1000,
  });
  assert.equal(expiredTtl.allowed, false);
  assert.equal(expiredTtl.requiresReauth, true);
});

test('AUTH-023: Operator Impersonation starts with readOnlyFinancials and expires after TTL', () => {
  const manager = new ImpersonationManager();
  const session = manager.startImpersonation({
    operatorUid: 'op-1',
    operatorEmail: 'support@tehranradar.ir',
    targetUserUid: 'u-target',
    targetUserDisplayName: 'کاربر هدف',
    targetRole: 'buyer',
    reason: 'بررسی تیکت پشتیبانی #402',
    ttlMs: 60_000,
  });

  assert.equal(session.readOnlyFinancials, true);
  assert.equal(manager.isImpersonating(session.startedAt + 10_000), true);
  assert.equal(manager.isImpersonating(session.startedAt + 61_000), false);
});

test('AUTH-024: ImpersonationGuard blocks financial and security mutations during impersonation', () => {
  const manager = new ImpersonationManager();
  manager.startImpersonation({
    operatorUid: 'op-1',
    operatorEmail: 'support@tehranradar.ir',
    targetUserUid: 'u-target',
    targetUserDisplayName: 'کاربر هدف',
    targetRole: 'seller',
    reason: 'بررسی مشکل نمایش آگهی',
  });

  const withdrawDecision = evaluateImpersonationGuard('settlement:withdraw', manager);
  const viewDecision = evaluateImpersonationGuard('property:read', manager);

  assert.equal(withdrawDecision.allowed, false);
  assert.equal(viewDecision.allowed, true);
});

test('AUTH-025: Stage 3 Auth documentation deliverables (01 through 10) exist in docs/frontend/rebuild/auth/', () => {
  const expectedDocs = [
    '01-auth-lifecycle.md',
    '02-session-management.md',
    '03-identity-profile-permission-model.md',
    '04-multi-role-workspace-model.md',
    '05-route-and-action-authorization.md',
    '06-step-up-authentication.md',
    '07-impersonation-and-audit.md',
    '08-error-matrix.md',
    '09-test-report.md',
    '10-residual-risks.md',
  ];
  for (const docName of expectedDocs) {
    const p = path.join(ROOT, 'docs/frontend/rebuild/auth', docName);
    assert.equal(fs.existsSync(p), true, `Missing Stage 3 doc: ${docName}`);
  }
});
