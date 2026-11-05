/**
 * @file src/utils/appCheck.test.ts
 * @description Unit tests for Firebase App Check initialization lifecycle & server middleware.
 * Mocks the FirebaseApp instance and verifies that the App Check SDK is initialized with the
 * correct configuration BEFORE Firestore or Storage services are utilized in the application lifecycle.
 */

import { beforeEach, describe, expect, it, vi } from 'vitest'; import type { Request, Response, NextFunction } from 'express'; import type { FirebaseApp } from 'firebase/app'; import type { AppCheck, AppCheckOptions, CustomProvider } from 'firebase/app-check';
import { initializeFirebaseAppCheck, initializeAppServicesWithAppCheck, getAppCheckLifecycleState, resetAppCheckLifecycleForTests, createRequireAppCheckTokenMiddleware, resetConsumedMiddlewareTokensForTests, } from './appCheck';
import { AUTHORITATIVE_FIREBASE_WEB_APP_ID, resetAppCheckSecurityStateForTests, } from './firebaseAppCheckSecurity901To920'; import { AUTHORITATIVE_FIREBASE_PROJECT_ID, AUTHORITATIVE_FIRESTORE_DATABASE_ID } from './serverConfigValidator'; import { formatAreaUnitLabel, formatMillionTomanAsIntlCurrency } from './areaUnit';

function createMockFirebaseApp(overrides: Partial<{ name: string; projectId: string; appId: string }> = {}): FirebaseApp { return { name: overrides.name ?? '[DEFAULT]', options: {
      projectId: overrides.projectId ?? AUTHORITATIVE_FIREBASE_PROJECT_ID, appId: overrides.appId ?? AUTHORITATIVE_FIREBASE_WEB_APP_ID, apiKey: 'mock-api-key-not-a-recaptcha-key', },
    automaticDataCollectionEnabled: false, } as unknown as FirebaseApp; }

const VALID_ENTERPRISE_SITE_KEY = '6LeEnterpriseValidSiteKey_1234567890'; const VALID_V3_SITE_KEY = '6LeRecaptchaV3ValidSiteKey_0987654321';
const VALID_MOCK_JWT = 'eyJhbGciOiJSUzI1NiIsInR5cCI6IkpXVCJ9.eyJzdWIiOiIxOjkzNTQyNzQ1MzQyMjp3ZWI6MjU4MTdkMzJkZjcxM2YyYTY4ZGVmZiJ9.signaturePart12345';

describe('Firebase App Check Client Initialization & Lifecycle Ordering', () => { beforeEach(() => {
    resetAppCheckLifecycleForTests();
    resetAppCheckSecurityStateForTests();
    resetConsumedMiddlewareTokensForTests();
  });

  it('initializes App Check with ReCaptchaEnterpriseProvider and isTokenAutoRefreshEnabled=true on a mocked FirebaseApp', () => {
    const mockApp = createMockFirebaseApp();
    const mockProvider = { type: 'recaptcha_enterprise', siteKey: VALID_ENTERPRISE_SITE_KEY } as unknown as CustomProvider;
    const mockAppCheckInstance = { app: mockApp } as unknown as AppCheck;

    const createEnterpriseProvider = vi.fn().mockReturnValue(mockProvider);
    const createV3Provider = vi.fn();
    const initializeAppCheck = vi.fn().mockReturnValue(mockAppCheckInstance);

    const instance = initializeFirebaseAppCheck(mockApp, {
      siteKey: VALID_ENTERPRISE_SITE_KEY,
      providerType: 'recaptcha_enterprise',
      isTokenAutoRefreshEnabled: true,
      isBrowserRuntime: true,
      sdk: { createEnterpriseProvider, createV3Provider, initializeAppCheck },
    });

    expect(instance).toBe(mockAppCheckInstance);
    expect(createEnterpriseProvider).toHaveBeenCalledTimes(1);
    expect(createEnterpriseProvider).toHaveBeenCalledWith(VALID_ENTERPRISE_SITE_KEY);
    expect(createV3Provider).not.toHaveBeenCalled();
    expect(initializeAppCheck).toHaveBeenCalledTimes(1);
    expect(initializeAppCheck).toHaveBeenCalledWith(mockApp, { provider: mockProvider, isTokenAutoRefreshEnabled: true });

    const state = getAppCheckLifecycleState();
    expect(state.appCheckInitialized).toBe(true);
    expect(state.providerType).toBe('recaptcha_enterprise');
    expect(state.siteKeyUsed).toBe(VALID_ENTERPRISE_SITE_KEY);
    expect(state.isTokenAutoRefreshEnabled).toBe(true);
    expect(state.displayAreaUnitLabel).toBe(formatAreaUnitLabel('sqm'));
    expect(state.referenceValuationIntlText).toBe(formatMillionTomanAsIntlCurrency(10000, 'IRT'));
  });

  it('supports ReCaptchaV3Provider when providerType is configured as recaptcha_v3', () => {
    const mockApp = createMockFirebaseApp({ name: 'v3-app' });
    const mockV3Provider = { type: 'recaptcha_v3', siteKey: VALID_V3_SITE_KEY } as unknown as CustomProvider;
    const mockAppCheckInstance = { app: mockApp } as unknown as AppCheck;

    const createEnterpriseProvider = vi.fn();
    const createV3Provider = vi.fn().mockReturnValue(mockV3Provider);
    const initializeAppCheck = vi.fn().mockReturnValue(mockAppCheckInstance);

    const instance = initializeFirebaseAppCheck(mockApp, {
      siteKey: VALID_V3_SITE_KEY,
      providerType: 'recaptcha_v3',
      isBrowserRuntime: true,
      sdk: {
        createEnterpriseProvider,
        createV3Provider,
        initializeAppCheck,
      },
    });

    expect(instance).toBe(mockAppCheckInstance);
    expect(createV3Provider).toHaveBeenCalledWith(VALID_V3_SITE_KEY);
    expect(createEnterpriseProvider).not.toHaveBeenCalled();
    expect(initializeAppCheck).toHaveBeenCalledWith(mockApp, {
      provider: mockV3Provider,
      isTokenAutoRefreshEnabled: true,
    });
  });

  it('enforces single-instance idempotency per FirebaseApp instance', () => {
    const mockApp = createMockFirebaseApp({ name: 'idempotent-app' });
    const mockAppCheckInstance = { app: mockApp } as unknown as AppCheck;
    const initializeAppCheck = vi.fn().mockReturnValue(mockAppCheckInstance);

    const first = initializeFirebaseAppCheck(mockApp, {
      siteKey: VALID_ENTERPRISE_SITE_KEY,
      isBrowserRuntime: true,
      sdk: {
        createEnterpriseProvider: vi.fn().mockReturnValue({} as CustomProvider),
        initializeAppCheck,
      },
    });
    const second = initializeFirebaseAppCheck(mockApp, {
      siteKey: VALID_ENTERPRISE_SITE_KEY,
      isBrowserRuntime: true,
      sdk: {
        createEnterpriseProvider: vi.fn().mockReturnValue({} as CustomProvider),
        initializeAppCheck,
      },
    });

    expect(first).toBe(second);
    expect(initializeAppCheck).toHaveBeenCalledTimes(1);
  });

  it('verifies App Check is initialized strictly BEFORE Firestore and Storage services in the application lifecycle', () => {
    const mockApp = createMockFirebaseApp({ name: 'lifecycle-order-app' });
    const executionTrace: string[] = [];

    const mockProvider = { kind: 'enterprise' } as unknown as CustomProvider;
    const mockAppCheck = { app: mockApp } as unknown as AppCheck;
    const mockFirestore = { type: 'firestore', databaseId: AUTHORITATIVE_FIRESTORE_DATABASE_ID };
    const mockStorage = { type: 'storage', bucket: 'radartehran-media' };

    const initializeAppCheck = vi.fn((app: FirebaseApp, options: AppCheckOptions) => {
      executionTrace.push(`initAppCheck:${app.name}:autoRefresh=${String(options.isTokenAutoRefreshEnabled)}`);
      return mockAppCheck;
    });

    const initFirestore = vi.fn((app: FirebaseApp, databaseId: string) => {
      expect(initializeAppCheck).toHaveBeenCalledTimes(1);
      executionTrace.push(`initFirestore:${app.name}:${databaseId}`);
      return mockFirestore;
    });

    const initStorage = vi.fn((app: FirebaseApp) => {
      expect(initializeAppCheck).toHaveBeenCalledTimes(1);
      expect(initFirestore).toHaveBeenCalledTimes(1);
      executionTrace.push(`initStorage:${app.name}`);
      return mockStorage;
    });

    const result = initializeAppServicesWithAppCheck({
      app: mockApp,
      appCheckOptions: {
        siteKey: VALID_ENTERPRISE_SITE_KEY,
        providerType: 'recaptcha_enterprise',
        isTokenAutoRefreshEnabled: true,
        isBrowserRuntime: true,
        sdk: {
          createEnterpriseProvider: () => mockProvider,
          initializeAppCheck,
        },
      },
      initFirestore,
      initStorage,
      firestoreDatabaseId: AUTHORITATIVE_FIRESTORE_DATABASE_ID,
      requireAppCheckBeforeServices: true,
    });

    expect(result.appCheck).toBe(mockAppCheck);
    expect(result.firestore).toBe(mockFirestore);
    expect(result.storage).toBe(mockStorage);
    expect(result.callOrder).toEqual(['appCheck', 'firestore', 'storage']);
    expect(executionTrace).toEqual([
      'initAppCheck:lifecycle-order-app:autoRefresh=true',
      `initFirestore:lifecycle-order-app:${AUTHORITATIVE_FIRESTORE_DATABASE_ID}`,
      'initStorage:lifecycle-order-app',
    ]);
  });

  it('blocks Firestore and Storage initialization when requireAppCheckBeforeServices=true and App Check fails to initialize', () => {
    const mockApp = createMockFirebaseApp({ name: 'guarded-app' });
    const initFirestore = vi.fn();
    const initStorage = vi.fn();

    expect(() =>
      initializeAppServicesWithAppCheck({
        app: mockApp,
        appCheckOptions: {
          siteKey: 'PLACEHOLDER_INVALID_KEY',
          isBrowserRuntime: true,
        },
        initFirestore,
        initStorage,
        requireAppCheckBeforeServices: true,
      }),
    ).toThrow(/APP_CHECK_LIFECYCLE_GUARD/);

    expect(initFirestore).not.toHaveBeenCalled();
    expect(initStorage).not.toHaveBeenCalled();
  });

  it('rejects debug tokens in production builds and ignores Firebase API keys mistaken for reCAPTCHA site keys', () => {
    const prodApp = createMockFirebaseApp({ name: 'prod-guard-app' });
    expect(() =>
      initializeFirebaseAppCheck(prodApp, {
        siteKey: VALID_ENTERPRISE_SITE_KEY,
        isProduction: true,
        debugToken: '12345678-1234-1234-1234-1234567890ab',
        isBrowserRuntime: true,
      }),
    ).toThrow(/APP_CHECK_SECURITY_VIOLATION/);

    const misconfiguredApp = createMockFirebaseApp({ name: 'misconfigured-key-app' });
    const res = initializeFirebaseAppCheck(misconfiguredApp, {
      siteKey: 'AIzaSyFakeFirebaseWebApiKey1234567890',
      isBrowserRuntime: true,
    });
    expect(res).toBeNull();
  });
});

describe('Server Express Middleware - requireAppCheckToken', () => {
  function createMockReqRes(headers: Record<string, string | string[] | undefined> = {}) {
    const req = {
      headers,
      query: {},
      body: {},
    } as unknown as Request;

    const statusObj = { code: 200, payload: null as unknown, headers: {} as Record<string, string> };
    const res = {
      setHeader: vi.fn((k: string, v: string) => {
        statusObj.headers[k] = v;
      }),
      status: vi.fn((code: number) => {
        statusObj.code = code;
        return res;
      }),
      json: vi.fn((body: unknown) => {
        statusObj.payload = body;
        return res;
      }),
    } as unknown as Response;

    const next = vi.fn() as unknown as NextFunction;
    return { req, res, next, statusObj };
  }

  it('extracts X-Firebase-AppCheck, verifies via Admin SDK, attaches req.appCheck claims, and calls next()', async () => {
    const futureExp = Math.floor(Date.now() / 1000) + 3600;
    const verifyTokenFn = vi.fn().mockResolvedValue({
      appId: AUTHORITATIVE_FIREBASE_WEB_APP_ID,
      alreadyConsumed: false,
      token: {
        sub: AUTHORITATIVE_FIREBASE_WEB_APP_ID,
        aud: [AUTHORITATIVE_FIREBASE_PROJECT_ID],
        exp: futureExp,
        iat: futureExp - 300,
      },
    });

    const middleware = createRequireAppCheckTokenMiddleware({ verifyTokenFn });
    const { req, res, next } = createMockReqRes({ 'x-firebase-appcheck': VALID_MOCK_JWT });

    await middleware(req, res, next);

    expect(verifyTokenFn).toHaveBeenCalledWith(VALID_MOCK_JWT, undefined);
    expect(next).toHaveBeenCalledTimes(1);
    expect(req.appCheck).toBeDefined();
    expect(req.appCheck?.verified).toBe(true);
    expect(req.appCheck?.appId).toBe(AUTHORITATIVE_FIREBASE_WEB_APP_ID);
    expect(req.appCheck?.projectId).toBe(AUTHORITATIVE_FIREBASE_PROJECT_ID);
    expect(req.appCheck?.token).toBe(VALID_MOCK_JWT);
  });

  it('fails closed (401/403) without calling next() when header is missing, malformed, replayed, or rejected by Admin SDK', async () => {
    const verifyTokenFn = vi.fn().mockRejectedValue(new Error('Invalid signature'));
    const middleware = createRequireAppCheckTokenMiddleware({ verifyTokenFn });
    // 1. Missing token
    const missing = createMockReqRes({});
    await middleware(missing.req, missing.res, missing.next);
    expect(missing.next).not.toHaveBeenCalled();
    expect(missing.statusObj.code).toBe(401);
    // 2. Malformed token
    const malformed = createMockReqRes({ 'x-firebase-appcheck': 'not-a-jwt' });
    await middleware(malformed.req, malformed.res, malformed.next);
    expect(malformed.next).not.toHaveBeenCalled();
    expect(malformed.statusObj.code).toBe(401);
    // 3. Admin SDK rejection (fails closed)
    const rejected = createMockReqRes({ 'x-firebase-appcheck': VALID_MOCK_JWT });
    await middleware(rejected.req, rejected.res, rejected.next);
    expect(rejected.next).not.toHaveBeenCalled();
    expect(rejected.statusObj.code).toBe(403);
    expect(rejected.req.appCheck).toBeUndefined();
  });
});