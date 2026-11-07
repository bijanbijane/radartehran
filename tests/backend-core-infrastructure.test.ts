import test from 'node:test';
import assert from 'node:assert/strict';
import type { Request, Response } from 'express';
import {
  authorizePrincipal,
  CoreApiError,
  createExampleProtectedMutationHandler,
  createFirestoreIdempotencyStoreAdapter,
  createStructuredAuditEvent,
  decodePaginationCursor,
  encodePaginationCursor,
  executeIdempotentMutation,
  extractAuthenticatedPrincipal,
  normalizeFirestoreTimestamp,
  normalizePaginationParams,
  requireEnumValue,
  requireFiniteNumberInRange,
  requireNonEmptyString,
  requireSafeFirestoreId,
  runDurableTransaction,
  stripUntrustedIdentityFields,
  validateObjectSchema,
  verifyAdminOrDelegatedPrincipal,
  type AuditEventSink,
  type DelegatedAdminStoreAdapter,
  type FirebaseTokenVerifierAdapter,
  type StructuredAuditEvent,
  type TransactionContextLike,
  type TransactionRunnerAdapter,
} from '../server/modules/core/index';

function createInMemoryFirestoreTransactionRunner(
  initialDocs: Record<string, Record<string, unknown>> = {},
): {
  runner: TransactionRunnerAdapter;
  dumpDoc: (path: string) => Record<string, unknown> | undefined;
} {
  const store = new Map<string, Record<string, unknown>>(
    Object.entries(initialDocs).map(([k, v]) => [k, structuredClone(v)]),
  );
  const runner: TransactionRunnerAdapter = {
    async runTransaction<T>(updateFn: (tx: TransactionContextLike) => Promise<T>): Promise<T> {
      const staged = new Map<string, Record<string, unknown> | null>();
      const tx: TransactionContextLike = {
        async get<D = Record<string, unknown>>(docPath: string) {
          const current = staged.has(docPath) ? staged.get(docPath) : store.get(docPath);
          return current ? { exists: true, data: structuredClone(current) as unknown as D } : { exists: false };
        },
        set(docPath: string, data: Record<string, unknown>, options?: { merge?: boolean }) {
          if (options?.merge && store.has(docPath)) {
            staged.set(docPath, { ...(store.get(docPath) ?? {}), ...structuredClone(data) });
          } else {
            staged.set(docPath, structuredClone(data));
          }
        },
        update(docPath: string, data: Record<string, unknown>) {
          const existing = staged.has(docPath) ? staged.get(docPath) : store.get(docPath);
          if (!existing) throw new Error(`Document ${docPath} does not exist`);
          staged.set(docPath, { ...existing, ...structuredClone(data) });
        },
        delete(docPath: string) {
          staged.set(docPath, null);
        },
      };
      const result = await updateFn(tx);
      for (const [docPath, val] of staged.entries()) {
        if (val === null) store.delete(docPath);
        else store.set(docPath, val);
      }
      return result;
    },
  };
  return { runner, dumpDoc: (path: string) => store.get(path) };
}

test('1. Identity verification boundaries: valid, missing, ambiguous, expired, revoked, disabled, audience-mismatched tokens', async () => {
  const verifier: FirebaseTokenVerifierAdapter = {
    expectedProjectId: 'radartehran-prod',
    async verifyIdToken(token: string) {
      if (token === 'valid_user_token_123456') {
        return { uid: 'user_tehran_01', email: 'Ali@Example.com', email_verified: true, aud: 'radartehran-prod', auth_time: 1_700_000_000 };
      }
      if (token === 'expired_token_12345678') {
        throw Object.assign(new Error('Firebase ID token has expired'), { code: 'auth/id-token-expired' });
      }
      if (token === 'revoked_token_12345678') {
        throw Object.assign(new Error('Firebase ID token has been revoked'), { code: 'auth/id-token-revoked' });
      }
      if (token === 'wrong_aud_token_123456') {
        return { uid: 'user_other_proj', email: 'user@example.com', email_verified: true, aud: 'foreign-project' };
      }
      if (token === 'unverified_email_token_1') {
        return { uid: 'user_unverified', email: 'unverified@example.com', email_verified: false, aud: 'radartehran-prod' };
      }
      if (token === 'disabled_user_token_123') {
        return { uid: 'uid_disabled_99', email: 'disabled@example.com', email_verified: true, aud: 'radartehran-prod' };
      }
      throw new Error('Invalid signature');
    },
    async isUserDisabled(uid: string) {
      return uid === 'uid_disabled_99';
    },
  };

  const okRes = await extractAuthenticatedPrincipal({ headers: { authorization: 'Bearer valid_user_token_123456' } }, verifier);
  assert.equal(okRes.ok, true);
  assert.equal(okRes.principal?.uid, 'user_tehran_01');
  assert.equal(okRes.principal?.email, 'ali@example.com');

  const missingRes = await extractAuthenticatedPrincipal({ headers: {} }, verifier);
  assert.equal(missingRes.failureCode, 'MISSING_AUTH_HEADER');

  const ambiguousRes = await extractAuthenticatedPrincipal(
    { headers: { authorization: 'Bearer tokenA_1234567890, Bearer tokenB_1234567890' } },
    verifier,
  );
  assert.equal(ambiguousRes.failureCode, 'AMBIGUOUS_AUTH_HEADER');

  const expiredRes = await extractAuthenticatedPrincipal({ headers: { authorization: 'Bearer expired_token_12345678' } }, verifier);
  assert.equal(expiredRes.failureCode, 'EXPIRED_FIREBASE_TOKEN');

  const revokedRes = await extractAuthenticatedPrincipal({ headers: { authorization: 'Bearer revoked_token_12345678' } }, verifier);
  assert.equal(revokedRes.failureCode, 'REVOKED_FIREBASE_TOKEN');

  const disabledRes = await extractAuthenticatedPrincipal({ headers: { authorization: 'Bearer disabled_user_token_123' } }, verifier);
  assert.equal(disabledRes.failureCode, 'DISABLED_USER_IDENTITY');
  assert.equal(disabledRes.status, 403);

  const audRes = await extractAuthenticatedPrincipal({ headers: { authorization: 'Bearer wrong_aud_token_123456' } }, verifier);
  assert.equal(audRes.failureCode, 'PROJECT_AUDIENCE_MISMATCH');

  const unverifiedRes = await extractAuthenticatedPrincipal({ headers: { authorization: 'Bearer unverified_email_token_1' } }, verifier);
  assert.equal(unverifiedRes.failureCode, 'EMAIL_NOT_VERIFIED');

  const stripped = stripUntrustedIdentityFields({ uid: 'spoofed_uid', role: 'primary_admin', isAdmin: true, neighborhoodId: 'punak' });
  assert.deepEqual(stripped.sanitizedPayload, { neighborhoodId: 'punak' });
  assert.deepEqual(stripped.strippedFields.sort(), ['isAdmin', 'role', 'uid']);
});

test('2. Authorization decisions: ownership, primary admin, delegated admin lifecycle, re-auth age, and fail-closed store errors', async () => {
  const adminStore: DelegatedAdminStoreAdapter = {
    async getDelegatedAdminByUid(uid: string) {
      if (uid === 'uid_delegated_active') {
        return { uid, role: 'delegated_admin', active: true, disabled: false, expiresAtIso: '2030-01-01T00:00:00.000Z' };
      }
      if (uid === 'uid_delegated_revoked') {
        return { uid, role: 'revoked', active: false };
      }
      return null;
    },
  };

  const regularPrincipal = {
    uid: 'user_regular_1',
    email: 'member@example.com',
    emailVerified: true,
    role: 'verified_user' as const,
    authMode: 'firebase_id_token' as const,
    authTimeSeconds: 1_700_000_000,
    claims: {},
  };

  const ownerOk = await authorizePrincipal(regularPrincipal, { minimumRole: 'verified_user', resourceOwnerUid: 'user_regular_1' });
  assert.equal(ownerOk.allowed, true);

  const ownerDenied = await authorizePrincipal(
    regularPrincipal,
    { minimumRole: 'verified_user', resourceOwnerUid: 'other_user_999', allowAdminOverrideForOwnership: true },
    adminStore,
    ['root@radartehran.ir'],
  );
  assert.equal(ownerDenied.allowed, false);
  assert.equal(ownerDenied.failureCode, 'RESOURCE_OWNERSHIP_MISMATCH');

  const delegatedPrincipal = { ...regularPrincipal, uid: 'uid_delegated_active' };
  const delegatedOk = await verifyAdminOrDelegatedPrincipal(delegatedPrincipal, adminStore, {
    primaryAdminEmails: ['root@radartehran.ir'],
    nowSeconds: 1_700_000_100,
  });
  assert.equal(delegatedOk.allowed, true);
  assert.equal(delegatedOk.effectiveRole, 'delegated_admin');

  const primaryOnlyDenied = await verifyAdminOrDelegatedPrincipal(delegatedPrincipal, adminStore, {
    requirePrimaryBootstrapAdmin: true,
    primaryAdminEmails: ['root@radartehran.ir'],
  });
  assert.equal(primaryOnlyDenied.allowed, false);
  assert.equal(primaryOnlyDenied.failureCode, 'INSUFFICIENT_ROLE');

  const revokedDenied = await verifyAdminOrDelegatedPrincipal(
    { ...regularPrincipal, uid: 'uid_delegated_revoked' },
    adminStore,
    { primaryAdminEmails: ['root@radartehran.ir'] },
  );
  assert.equal(revokedDenied.allowed, false);
  assert.equal(revokedDenied.failureCode, 'DELEGATED_ADMIN_REVOKED');

  const staleAuthDenied = await verifyAdminOrDelegatedPrincipal(delegatedPrincipal, adminStore, {
    maxAuthAgeSeconds: 300,
    nowSeconds: 1_700_001_000,
  });
  assert.equal(staleAuthDenied.allowed, false);
  assert.equal(staleAuthDenied.failureCode, 'RECENT_REAUTH_REQUIRED');

  const failClosedDecision = await verifyAdminOrDelegatedPrincipal(delegatedPrincipal, {
    async getDelegatedAdminByUid() {
      throw new Error('Firestore unavailable');
    },
  });
  assert.equal(failClosedDecision.allowed, false);
  assert.equal(failClosedDecision.status, 503);
  assert.equal(failClosedDecision.failureCode, 'AUTHZ_STORE_FAILURE');
});

test('3. Input validation, timestamp normalization, and signed cursor pagination', () => {
  const schema = {
    hoodId: requireSafeFirestoreId(),
    title: requireNonEmptyString({ minLength: 3, maxLength: 80 }),
    areaSqm: requireFiniteNumberInRange({ min: 20, max: 2000, integerOnly: true }),
    dealType: requireEnumValue(['buy', 'rent'] as const),
  };

  const badResult = validateObjectSchema(
    { hoodId: '../etc/passwd', title: 'A', areaSqm: 15, dealType: 'swap', uid: 'injected_uid', extraField: 123 },
    schema,
  );
  assert.equal(badResult.ok, false);
  const issueCodes = new Set(badResult.issues.map((i) => i.code));
  assert.equal(issueCodes.has('UNTRUSTED_IDENTITY_FIELD'), true);
  assert.equal(issueCodes.has('UNKNOWN_FIELD_REJECTED'), true);
  assert.equal(issueCodes.has('INVALID_FORMAT'), true);
  assert.equal(issueCodes.has('STRING_TOO_SHORT'), true);
  assert.equal(issueCodes.has('NUMBER_OUT_OF_RANGE'), true);
  assert.equal(issueCodes.has('INVALID_ENUM_VALUE'), true);

  const fromFirestoreLike = normalizeFirestoreTimestamp({ seconds: 1_710_000_000, nanoseconds: 500_000_000 });
  assert.equal(fromFirestoreLike?.epochMs, 1_710_000_000_500);
  assert.equal(normalizeFirestoreTimestamp(Number.NaN), null);
  assert.equal(normalizeFirestoreTimestamp('not-a-date'), null);

  const cursor = encodePaginationCursor({ sortValue: 1_710_000_000_500, docId: 'claim_tehran_01', direction: 'desc' }, 'test-secret-key');
  assert.deepEqual(decodePaginationCursor(cursor, 'test-secret-key'), {
    sortValue: 1_710_000_000_500,
    docId: 'claim_tehran_01',
    direction: 'desc',
  });
  assert.equal(decodePaginationCursor(`${cursor}tampered`, 'test-secret-key'), null);
  assert.equal(decodePaginationCursor(cursor, 'wrong-secret-key'), null);

  const pageParams = normalizePaginationParams({ limit: '9999', direction: 'asc' }, { maxLimit: 50 });
  assert.equal(pageParams.limit, 50);
  assert.equal(pageParams.direction, 'asc');
});

test('4. Idempotency behavior, transaction contention retry, and PII-safe structured audit logging', async () => {
  const { runner, dumpDoc } = createInMemoryFirestoreTransactionRunner({
    'listings/listing_vanak_1': { ownerUid: 'user_owner_1', priceMillionToman: 18500 },
  });
  const idempotencyStore = createFirestoreIdempotencyStoreAdapter(runner);

  let executionCount = 0;
  const firstCall = await executeIdempotentMutation({
    store: idempotencyStore,
    actorUid: 'user_owner_1',
    operation: 'listing.update_price',
    idempotencyKey: 'idem_key_vanak_0001',
    requestPayload: { listingId: 'listing_vanak_1', priceMillionToman: 19200 },
    mutationFn: async () => {
      executionCount += 1;
      return { statusCode: 200, body: { updatedPrice: 19200, seq: executionCount } };
    },
  });
  assert.equal(firstCall.replayed, false);
  assert.equal(firstCall.body.seq, 1);

  const secondCall = await executeIdempotentMutation({
    store: idempotencyStore,
    actorUid: 'user_owner_1',
    operation: 'listing.update_price',
    idempotencyKey: 'idem_key_vanak_0001',
    requestPayload: { priceMillionToman: 19200, listingId: 'listing_vanak_1' },
    mutationFn: async () => {
      executionCount += 1;
      return { statusCode: 200, body: { updatedPrice: 19200, seq: executionCount } };
    },
  });
  assert.equal(secondCall.replayed, true);
  assert.equal(secondCall.body.seq, 1);
  assert.equal(executionCount, 1);

  await assert.rejects(
    async () => {
      await executeIdempotentMutation({
        store: idempotencyStore,
        actorUid: 'user_owner_1',
        operation: 'listing.update_price',
        idempotencyKey: 'idem_key_vanak_0001',
        requestPayload: { listingId: 'listing_vanak_1', priceMillionToman: 25000 },
        mutationFn: async () => ({ statusCode: 200, body: {} }),
      });
    },
    (err: unknown) => err instanceof CoreApiError && err.code === 'IDEMPOTENCY_PAYLOAD_MISMATCH' && err.status === 409,
  );

  let txAttempts = 0;
  const txResult = await runDurableTransaction(
    {
      async runTransaction<T>(fn: (tx: TransactionContextLike) => Promise<T>): Promise<T> {
        txAttempts += 1;
        if (txAttempts === 1) throw Object.assign(new Error('10 ABORTED: contention'), { code: 'ABORTED' });
        return runner.runTransaction(fn);
      },
    },
    { operationName: 'test.contention_retry', maxAttempts: 3, baseBackoffMs: 5 },
    async (tx) => {
      tx.update('listings/listing_vanak_1', { priceMillionToman: 19800 });
      return { committedPrice: 19800 };
    },
  );
  assert.equal(txAttempts, 2);
  assert.equal(txResult.committedPrice, 19800);

  const auditEvents: StructuredAuditEvent[] = [];
  const auditSink: AuditEventSink = { async writeAuditEvent(e) { auditEvents.push(e); } };
  const exampleHandler = createExampleProtectedMutationHandler({
    tokenVerifier: { async verifyIdToken() { return { uid: 'user_owner_1', email: 'owner.tehran@example.com', email_verified: true }; } },
    adminStore: { async getDelegatedAdminByUid() { return null; } },
    txRunner: runner,
    auditSink,
  });

  let statusCode = 200;
  let jsonBody: Record<string, unknown> = {};
  await exampleHandler(
    {
      headers: { authorization: 'Bearer valid_owner_token_123456', 'idempotency-key': 'e2e_handler_idem_key_01' },
      body: { listingId: 'listing_vanak_1', priceMillionToman: 20500, note: 'Updated asking price' },
    } as unknown as Request,
    {
      setHeader() {},
      status(code: number) { statusCode = code; return this; },
      json(payload: Record<string, unknown>) { jsonBody = payload; return this; },
    } as unknown as Response,
  );
  assert.equal(statusCode, 200);
  assert.equal(jsonBody.ok, true);
  assert.equal(dumpDoc('listings/listing_vanak_1')?.priceMillionToman, 20500);
  assert.equal(auditEvents[0].actorEmailRedacted, 'ow***@example.com');

  const piiAudit = createStructuredAuditEvent({
    principal: { uid: 'u1', email: 'test@example.com', role: 'verified_user' },
    correlationId: 'corr_pii_01',
    action: 'user.contact',
    targetCollection: 'leads',
    targetResourceId: 'lead_1',
    outcome: 'SUCCESS',
    metadata: { secretToken: 'secret_abc', contactNote: 'Call buyer at 09123456789 with Bearer eyJhbGciOiJIUzI1NiJ9' },
  });
  assert.equal(piiAudit.metadata.secretToken, '[REDACTED]');
  assert.equal(piiAudit.metadata.contactNote, 'Call buyer at [REDACTED_IR_PHONE] with Bearer [REDACTED]');
});
