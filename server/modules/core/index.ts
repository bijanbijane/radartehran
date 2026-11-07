export * from './types';
export * from './authAndAuthz';
export * from './validationAndResponses';
export * from './idempotencyTransactionsAndAudit';

import type { Request, Response } from 'express';
import {
  authorizePrincipal,
  extractAuthenticatedPrincipal,
} from './authAndAuthz';
import {
  buildErrorEnvelope,
  buildSuccessEnvelope,
  CoreApiError,
  requireFiniteNumberInRange,
  requireNonEmptyString,
  requireSafeFirestoreId,
  resolveCorrelationId,
  validateObjectSchema,
  withStandardErrorBoundary,
} from './validationAndResponses';
import {
  createFirestoreIdempotencyStoreAdapter,
  createStructuredAuditEvent,
  executeIdempotentMutation,
  runDurableTransaction,
} from './idempotencyTransactionsAndAudit';
import type {
  AuditEventSink,
  DelegatedAdminStoreAdapter,
  FirebaseTokenVerifierAdapter,
  TransactionRunnerAdapter,
} from './types';

export interface ExampleModuleDependencies {
  tokenVerifier: FirebaseTokenVerifierAdapter;
  adminStore: DelegatedAdminStoreAdapter;
  txRunner: TransactionRunnerAdapter;
  auditSink: AuditEventSink;
  primaryAdminEmails?: string[];
}

export interface UpdateListingPriceInput {
  listingId: string;
  priceMillionToman: number;
  note: string;
  [key: string]: unknown;
}

/**
 * Reference API usage example demonstrating how downstream Radartehran backend modules
 * compose Employee 0 Core Infrastructure primitives without trusting client UID/role fields.
 */
export function createExampleProtectedMutationHandler(deps: ExampleModuleDependencies) {
  const idempotencyStore = createFirestoreIdempotencyStoreAdapter(deps.txRunner);

  return withStandardErrorBoundary(async (req: Request, res: Response) => {
    const correlationId = resolveCorrelationId(req);

    // 1. Extract verified Firebase principal from Authorization Bearer header
    const identity = await extractAuthenticatedPrincipal(req, deps.tokenVerifier, {
      requireVerifiedEmail: true,
    });
    if (!identity.ok || !identity.principal) {
      res
        .status(identity.status ?? 401)
        .json(
          buildErrorEnvelope(
            'UNAUTHENTICATED',
            identity.reason ?? 'Authentication failed.',
            correlationId,
          ),
        );
      return;
    }
    const principal = identity.principal;

    // 2. Validate request body & automatically reject untrusted UID/role fields
    const validation = validateObjectSchema<UpdateListingPriceInput>(req.body, {
      listingId: requireSafeFirestoreId(),
      priceMillionToman: requireFiniteNumberInRange({ min: 100, max: 5_000_000 }),
      note: requireNonEmptyString({ minLength: 3, maxLength: 280 }),
    });
    if (!validation.ok || !validation.value) {
      throw new CoreApiError(
        'VALIDATION_FAILED',
        400,
        'Request validation failed.',
        validation.issues,
      );
    }
    const input = validation.value;

    // 3. Execute idempotent & transactional mutation with server-side ownership enforcement
    const idempotencyKeyHeader = req.headers['idempotency-key'];
    const idempotencyKey =
      typeof idempotencyKeyHeader === 'string' ? idempotencyKeyHeader : '';

    const mutationResult = await executeIdempotentMutation({
      store: idempotencyStore,
      actorUid: principal.uid,
      operation: 'listing.update_price',
      idempotencyKey,
      requestPayload: input,
      mutationFn: async () => {
        const updatedRecord = await runDurableTransaction(
          deps.txRunner,
          { operationName: 'listing.update_price', maxAttempts: 3 },
          async (tx) => {
            const docPath = `listings/${input.listingId}`;
            const snap = await tx.get<{ ownerUid: string; priceMillionToman: number }>(docPath);
            if (!snap.exists || !snap.data) {
              throw new CoreApiError('NOT_FOUND', 404, 'Target listing was not found.');
            }

            const authz = await authorizePrincipal(
              principal,
              {
                minimumRole: 'verified_user',
                resourceOwnerUid: snap.data.ownerUid,
                allowAdminOverrideForOwnership: true,
              },
              deps.adminStore,
              deps.primaryAdminEmails,
            );

            if (!authz.allowed) {
              await deps.auditSink.writeAuditEvent(
                createStructuredAuditEvent({
                  principal,
                  correlationId,
                  action: 'listing.update_price',
                  targetCollection: 'listings',
                  targetResourceId: input.listingId,
                  outcome: 'DENIED',
                  reasonCode: authz.failureCode,
                }),
              );
              throw new CoreApiError(
                'FORBIDDEN',
                authz.status,
                authz.reason ?? 'Forbidden.',
              );
            }

            const updatedAtIso = new Date().toISOString();
            tx.update(docPath, {
              priceMillionToman: input.priceMillionToman,
              updatedByUid: principal.uid,
              updatedAtIso,
            });

            return {
              listingId: input.listingId,
              priceMillionToman: input.priceMillionToman,
              updatedByUid: principal.uid,
              effectiveRole: authz.effectiveRole,
              updatedAtIso,
            };
          },
        );

        await deps.auditSink.writeAuditEvent(
          createStructuredAuditEvent({
            principal,
            correlationId,
            action: 'listing.update_price',
            targetCollection: 'listings',
            targetResourceId: input.listingId,
            outcome: 'SUCCESS',
            metadata: { newPriceMillionToman: input.priceMillionToman },
          }),
        );

        return { statusCode: 200, body: updatedRecord };
      },
    });

    res
      .status(mutationResult.statusCode)
      .json(
        buildSuccessEnvelope(mutationResult.body, correlationId, {
          idempotentReplay: mutationResult.replayed,
        }),
      );
  });
}
