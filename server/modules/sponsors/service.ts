import crypto from 'crypto';
import {
  authorizePrincipal,
  CoreApiError,
  createFirestoreIdempotencyStoreAdapter,
  createStructuredAuditEvent,
  executeIdempotentMutation,
  normalizeFirestoreTimestamp,
  requireSafeFirestoreId,
  runDurableTransaction,
  verifyAdminOrDelegatedPrincipal,
  type AuthenticatedPrincipal,
  type TransactionContextLike,
} from '../core';
import {
  computeCanonicalSponsorTariff,
  computePlacementExpirationTimestamp,
  createDefaultSponsorSlotCatalogAdapter,
  isSponsorReservationExpired,
  toOwnerSponsorReservationView,
  toPublicSponsorPlacementProjection,
  validateCancelSponsorInput,
  validateModerateSponsorInput,
  validateSponsorLifecycleTransition,
  validateSubmitSponsorInput,
  validateVerifiedPaymentEventInput,
} from './lifecycleAndValidation';
import type {
  OwnerSponsorReservationView,
  PublicSponsorPlacementProjection,
  SlotAvailabilityStatus,
  SponsorAuditHistoryRecord,
  SponsorReservationStatus,
  SponsorSlotLockRecord,
  SponsorsModuleDependencies,
  SponsorSupportedCityId,
  StoredSponsorReservation,
} from './types';

function buildSlotKey(cityId: SponsorSupportedCityId, hoodId: number): string {
  return `${cityId}_hood_${hoodId}`;
}

function appendTransactionAuditRecord(
  tx: TransactionContextLike,
  params: {
    reservationId: string; slotKey: string; actorUid: string; actorRole: string; action: string;
    fromStatus: SponsorReservationStatus | 'none'; toStatus: SponsorReservationStatus;
    paymentStatus: StoredSponsorReservation['paymentStatus']; revision: number; nowIso: string; note?: string;
  },
): SponsorAuditHistoryRecord {
  const eventId = `sp_aud_${params.reservationId}_r${params.revision}`;
  const record: SponsorAuditHistoryRecord = {
    eventId, reservationId: params.reservationId, slotKey: params.slotKey, actorUid: params.actorUid,
    actorRole: params.actorRole, action: params.action, fromStatus: params.fromStatus, toStatus: params.toStatus,
    paymentStatus: params.paymentStatus, revision: params.revision, timestampIso: params.nowIso,
    ...(params.note ? { note: params.note } : {}),
  };
  tx.set(`sponsorAuditTrail/${eventId}`, record as unknown as Record<string, unknown>);
  return record;
}

export function createSponsorsService(deps: SponsorsModuleDependencies) {
  const slotCatalog = deps.slotCatalog ?? createDefaultSponsorSlotCatalogAdapter();
  const idempotencyStore = deps.idempotencyStore ?? createFirestoreIdempotencyStoreAdapter(deps.txRunner);
  const nowFn = deps.nowFn ?? (() => Date.now());

  async function emitCoreAudit(params: {
    principal: AuthenticatedPrincipal | null | undefined;
    correlationId: string;
    action: string;
    reservationId: string;
    outcome: 'SUCCESS' | 'DENIED' | 'FAILURE';
    reasonCode?: string;
    metadata?: Record<string, unknown>;
  }): Promise<void> {
    if (!deps.auditSink) return;
    await deps.auditSink.writeAuditEvent(
      createStructuredAuditEvent({
        principal: params.principal,
        correlationId: params.correlationId,
        action: params.action,
        targetCollection: 'sponsorRequests',
        targetResourceId: params.reservationId,
        outcome: params.outcome,
        reasonCode: params.reasonCode,
        metadata: params.metadata,
        nowIso: new Date(nowFn()).toISOString(),
      }),
    );
  }

  function validateReservationId(rawId: unknown): string {
    const res = requireSafeFirestoreId()(rawId, 'reservationId');
    if (!res.ok || !res.value) throw new CoreApiError('VALIDATION_FAILED', 400, 'Invalid reservationId.', res.issues);
    return res.value;
  }

  return {
    async checkSlotAvailability(params: {
      cityId: SponsorSupportedCityId;
      hoodId: number;
    }): Promise<{ slotKey: string; availability: SlotAvailabilityStatus; expiresAtIso?: string }> {
      const slot = slotCatalog.resolveNeighborhoodSlot(params.cityId, params.hoodId);
      if (!slot) throw new CoreApiError('VALIDATION_FAILED', 400, 'Invalid cityId or hoodId.');
      const slotKey = buildSlotKey(params.cityId, params.hoodId);

      return runDurableTransaction(deps.txRunner, { operationName: 'sponsors.check_availability', maxAttempts: 2 }, async (tx) => {
        const lockSnap = await tx.get<SponsorSlotLockRecord>(`sponsorSlotLocks/${slotKey}`);
        if (!lockSnap.exists || !lockSnap.data || lockSnap.data.status === 'released') return { slotKey, availability: 'available' as const };
        const lock = lockSnap.data;
        if (lock.expiresAt && nowFn() >= lock.expiresAt.epochMs) return { slotKey, availability: 'available' as const };
        if (lock.status === 'active') {
          return { slotKey, availability: 'active_occupied' as const, ...(lock.expiresAt ? { expiresAtIso: lock.expiresAt.iso } : {}) };
        }
        return { slotKey, availability: 'reserved_pending' as const };
      });
    },

    async submitSponsorReservation(params: {
      principal: AuthenticatedPrincipal;
      idempotencyKey: string;
      rawBody: unknown;
      correlationId: string;
    }): Promise<{ replayed: boolean; statusCode: number; reservation: OwnerSponsorReservationView }> {
      const authz = await authorizePrincipal(params.principal, { minimumRole: 'verified_user' }, deps.adminStore, deps.primaryAdminEmails);
      if (!authz.allowed) throw new CoreApiError('FORBIDDEN', authz.status, authz.reason ?? 'Forbidden.');

      const validation = validateSubmitSponsorInput(params.rawBody);
      if (!validation.ok || !validation.value) throw new CoreApiError('VALIDATION_FAILED', 400, 'Invalid sponsor reservation input.', validation.issues);
      const input = validation.value;
      const slot = slotCatalog.resolveNeighborhoodSlot(input.cityId, input.hoodId);
      if (!slot) throw new CoreApiError('VALIDATION_FAILED', 400, `Neighborhood ${input.hoodId} is not available in city "${input.cityId}".`);

      try {
        const outcome = await executeIdempotentMutation<OwnerSponsorReservationView>({
          store: idempotencyStore,
          actorUid: params.principal.uid,
          operation: 'sponsors.submit_reservation',
          idempotencyKey: params.idempotencyKey,
          requestPayload: input,
          nowEpochMs: nowFn(),
          mutationFn: async () => {
            const nowMs = nowFn();
            const nowTs = normalizeFirestoreTimestamp(nowMs)!;
            const slotKey = buildSlotKey(input.cityId, input.hoodId);
            const reservationId = `${params.principal.uid}_${slotKey}`;
            const pricing = computeCanonicalSponsorTariff(slot.baseMonthlyTariffMillion, input.planMonths);
            const trackingCode = `SP-${input.hoodId}-${crypto.randomBytes(3).toString('hex').toUpperCase()}`;

            const createdView = await runDurableTransaction(deps.txRunner, { operationName: 'sponsors.submit_reservation', maxAttempts: 3 }, async (tx) => {
              const lockPath = `sponsorSlotLocks/${slotKey}`;
              const resPath = `sponsorRequests/${reservationId}`;
              const [lockSnap, existingResSnap] = await Promise.all([tx.get<SponsorSlotLockRecord>(lockPath), tx.get<StoredSponsorReservation>(resPath)]);

              if (lockSnap.exists && lockSnap.data && lockSnap.data.status !== 'released') {
                const lock = lockSnap.data;
                if (!(lock.expiresAt && nowMs >= lock.expiresAt.epochMs)) {
                  throw new CoreApiError('CONFLICT', 409, `Neighborhood slot "${slotKey}" is already ${lock.status === 'active' ? 'actively occupied' : 'reserved pending review'}.`);
                }
              }

              if (existingResSnap.exists && existingResSnap.data) {
                const prev = existingResSnap.data;
                if ((prev.status === 'pending_review' || prev.status === 'approved_awaiting_payment' || prev.status === 'active') && !isSponsorReservationExpired(prev, nowMs)) {
                  throw new CoreApiError('CONFLICT', 409, 'You already have an active or pending reservation for this neighborhood.');
                }
              }

              const nextRevision = existingResSnap.data ? existingResSnap.data.revision + 1 : 1;
              const doc: StoredSponsorReservation = {
                id: reservationId,
                slotKey,
                ownerUid: params.principal.uid,
                ownerEmail: params.principal.email,
                cityId: input.cityId,
                hoodId: slot.hoodId,
                hoodName: slot.hoodName,
                agencyName: input.agencyName,
                phone: input.phone,
                specialty: input.specialty,
                experienceYears: input.experienceYears,
                planMonths: pricing.planMonths,
                monthlyTariffMillion: pricing.monthlyTariffMillion,
                totalPayableMillion: pricing.totalPayableMillion,
                trackingCode,
                status: 'pending_review',
                paymentStatus: 'unpaid',
                revision: nextRevision,
                createdAt: nowTs,
                updatedAt: nowTs,
              };

              const slotLock: SponsorSlotLockRecord = {
                slotKey,
                cityId: input.cityId,
                hoodId: slot.hoodId,
                reservationId,
                ownerUid: params.principal.uid,
                status: 'held_pending',
                updatedAt: nowTs,
              };

              tx.set(resPath, doc as unknown as Record<string, unknown>);
              tx.set(lockPath, slotLock as unknown as Record<string, unknown>);
              appendTransactionAuditRecord(tx, {
                reservationId,
                slotKey,
                actorUid: params.principal.uid,
                actorRole: params.principal.role,
                action: 'sponsors.submit_reservation',
                fromStatus: existingResSnap.data?.status ?? 'none',
                toStatus: 'pending_review',
                paymentStatus: 'unpaid',
                revision: nextRevision,
                nowIso: nowTs.iso,
              });
              return toOwnerSponsorReservationView(doc);
            });

            await emitCoreAudit({
              principal: params.principal,
              correlationId: params.correlationId,
              action: 'sponsors.submit_reservation',
              reservationId: createdView.id,
              outcome: 'SUCCESS',
              metadata: { slotKey: createdView.slotKey, planMonths: createdView.planMonths, totalPayableMillion: createdView.totalPayableMillion },
            });
            return { statusCode: 201, body: createdView };
          },
        });
        return { replayed: outcome.replayed, statusCode: outcome.statusCode, reservation: outcome.body };
      } catch (err) {
        if (err instanceof CoreApiError) throw err;
        throw new CoreApiError('PERSISTENCE_FAILED', 503, err instanceof Error ? err.message : 'Sponsor reservation persistence failed.');
      }
    },

    async getOwnerReservation(params: { principal: AuthenticatedPrincipal; reservationId: string; correlationId: string }): Promise<OwnerSponsorReservationView> {
      const reservationId = validateReservationId(params.reservationId);
      return runDurableTransaction(deps.txRunner, { operationName: 'sponsors.get_owner', maxAttempts: 2 }, async (tx) => {
        const snap = await tx.get<StoredSponsorReservation>(`sponsorRequests/${reservationId}`);
        if (!snap.exists || !snap.data) throw new CoreApiError('NOT_FOUND', 404, 'Sponsor reservation not found.');
        const authz = await authorizePrincipal(
          params.principal,
          { minimumRole: 'verified_user', resourceOwnerUid: snap.data.ownerUid, allowAdminOverrideForOwnership: true },
          deps.adminStore,
          deps.primaryAdminEmails,
        );
        if (!authz.allowed) throw new CoreApiError('FORBIDDEN', authz.status, authz.reason ?? 'Forbidden.');
        return toOwnerSponsorReservationView(snap.data);
      });
    },

    async recordVerifiedPaymentEvent(params: { rawEvent: unknown; correlationId: string }): Promise<OwnerSponsorReservationView> {
      const validation = validateVerifiedPaymentEventInput(params.rawEvent);
      if (!validation.ok || !validation.value) throw new CoreApiError('VALIDATION_FAILED', 400, 'Invalid payment verification event.', validation.issues);
      const event = validation.value;

      if (!deps.paymentVerifier || typeof deps.paymentVerifier.verifyPaymentEvent !== 'function') {
        throw new CoreApiError('PERSISTENCE_FAILED', 503, 'Payment verification adapter is not configured (fail-closed).');
      }

      return runDurableTransaction(deps.txRunner, { operationName: 'sponsors.record_verified_payment', maxAttempts: 3 }, async (tx) => {
        const resPath = `sponsorRequests/${event.reservationId}`;
        const snap = await tx.get<StoredSponsorReservation>(resPath);
        if (!snap.exists || !snap.data) throw new CoreApiError('NOT_FOUND', 404, 'Sponsor reservation not found.');
        const current = snap.data;

        if (current.paymentStatus === 'paid_verified' && current.paymentReferenceId === event.externalReferenceId) {
          return toOwnerSponsorReservationView(current);
        }

        const verification = await deps.paymentVerifier!.verifyPaymentEvent(event, current.totalPayableMillion);
        if (!verification.verified) throw new CoreApiError('FORBIDDEN', 403, verification.reason ?? 'Payment event signature or amount verification failed.');

        const targetStatus: SponsorReservationStatus = current.status === 'approved_awaiting_payment' ? 'active' : current.status;
        const transition = validateSponsorLifecycleTransition(current.status, targetStatus, 'payment_verifier');
        if (!transition.allowed) throw new CoreApiError('CONFLICT', 409, transition.reason ?? 'Cannot apply payment to reservation in current status.');

        const nowMs = nowFn();
        const nowTs = normalizeFirestoreTimestamp(nowMs)!;
        const nextRevision = current.revision + 1;
        const expiresAt = targetStatus === 'active' ? computePlacementExpirationTimestamp(nowMs, current.planMonths) : current.expiresAt;

        const updatedDoc: StoredSponsorReservation = {
          ...current,
          status: targetStatus,
          paymentStatus: 'paid_verified',
          paymentReferenceId: event.externalReferenceId,
          paidAt: nowTs,
          revision: nextRevision,
          updatedAt: nowTs,
          ...(expiresAt ? { expiresAt } : {}),
        };

        tx.set(resPath, updatedDoc as unknown as Record<string, unknown>);
        if (targetStatus === 'active' && expiresAt) {
          tx.set(`sponsorSlotLocks/${current.slotKey}`, { slotKey: current.slotKey, cityId: current.cityId, hoodId: current.hoodId, reservationId: current.id, ownerUid: current.ownerUid, status: 'active', updatedAt: nowTs, expiresAt }, { merge: true });
        }

        appendTransactionAuditRecord(tx, {
          reservationId: current.id,
          slotKey: current.slotKey,
          actorUid: 'payment_verifier',
          actorRole: 'system',
          action: 'sponsors.payment_verified',
          fromStatus: current.status,
          toStatus: targetStatus,
          paymentStatus: 'paid_verified',
          revision: nextRevision,
          nowIso: nowTs.iso,
          note: `ref:${event.externalReferenceId}`,
        });
        return toOwnerSponsorReservationView(updatedDoc);
      });
    },

    async moderateSponsorReservation(params: { principal: AuthenticatedPrincipal; reservationId: string; rawBody: unknown; correlationId: string }): Promise<OwnerSponsorReservationView> {
      const reservationId = validateReservationId(params.reservationId);
      const adminDecision = await verifyAdminOrDelegatedPrincipal(params.principal, deps.adminStore, { primaryAdminEmails: deps.primaryAdminEmails, disallowStaticToken: true });
      if (!adminDecision.allowed) {
        await emitCoreAudit({ principal: params.principal, correlationId: params.correlationId, action: 'sponsors.moderate', reservationId, outcome: 'DENIED', reasonCode: adminDecision.failureCode });
        throw new CoreApiError('FORBIDDEN', adminDecision.status, adminDecision.reason ?? 'Administrator privileges required.');
      }

      const validation = validateModerateSponsorInput(params.rawBody);
      if (!validation.ok || !validation.value) throw new CoreApiError('VALIDATION_FAILED', 400, 'Invalid moderation payload.', validation.issues);
      const input = validation.value;

      const updatedView = await runDurableTransaction(deps.txRunner, { operationName: 'sponsors.moderate', maxAttempts: 3 }, async (tx) => {
        const resPath = `sponsorRequests/${reservationId}`;
        const snap = await tx.get<StoredSponsorReservation>(resPath);
        if (!snap.exists || !snap.data) throw new CoreApiError('NOT_FOUND', 404, 'Sponsor reservation not found.');
        const current = snap.data;

        if (input.expectedRevision !== undefined && current.revision !== input.expectedRevision) {
          throw new CoreApiError('CONFLICT', 409, `Stale revision: stored is ${current.revision}, expected ${input.expectedRevision}.`);
        }

        const nowMs = nowFn();
        const nowTs = normalizeFirestoreTimestamp(nowMs)!;
        const nextPaymentStatus = input.decision === 'approve' && input.waivePaymentRequirement === true && current.paymentStatus === 'unpaid' ? 'waived_by_policy' : current.paymentStatus;
        const canActivateNow = nextPaymentStatus === 'paid_verified' || nextPaymentStatus === 'waived_by_policy';
        const targetStatus: SponsorReservationStatus = input.decision === 'reject' ? 'rejected' : canActivateNow ? 'active' : 'approved_awaiting_payment';

        const transition = validateSponsorLifecycleTransition(current.status, targetStatus, 'admin');
        if (!transition.allowed) throw new CoreApiError('CONFLICT', 409, transition.reason ?? 'Invalid moderation transition.');

        const nextRevision = current.revision + 1;
        const expiresAt = targetStatus === 'active' ? computePlacementExpirationTimestamp(nowMs, current.planMonths) : current.expiresAt;

        const updatedDoc: StoredSponsorReservation = {
          ...current,
          status: targetStatus,
          paymentStatus: nextPaymentStatus,
          revision: nextRevision,
          updatedAt: nowTs,
          ...(input.decision === 'approve' ? { approvedAt: nowTs, approvedByUid: params.principal.uid } : {}),
          ...(expiresAt ? { expiresAt } : {}),
          ...(input.decision === 'reject' ? { rejectionReason: input.rejectionReason ?? 'Rejected by administrator moderation.' } : {}),
        };

        tx.set(resPath, updatedDoc as unknown as Record<string, unknown>);
        const lockPath = `sponsorSlotLocks/${current.slotKey}`;
        if (targetStatus === 'rejected') {
          tx.set(lockPath, { slotKey: current.slotKey, cityId: current.cityId, hoodId: current.hoodId, reservationId: current.id, ownerUid: current.ownerUid, status: 'released', updatedAt: nowTs }, { merge: true });
        } else if (targetStatus === 'active' && expiresAt) {
          tx.set(lockPath, { slotKey: current.slotKey, cityId: current.cityId, hoodId: current.hoodId, reservationId: current.id, ownerUid: current.ownerUid, status: 'active', updatedAt: nowTs, expiresAt }, { merge: true });
        }

        appendTransactionAuditRecord(tx, {
          reservationId: current.id,
          slotKey: current.slotKey,
          actorUid: params.principal.uid,
          actorRole: adminDecision.effectiveRole,
          action: `sponsors.moderate.${input.decision}`,
          fromStatus: current.status,
          toStatus: targetStatus,
          paymentStatus: nextPaymentStatus,
          revision: nextRevision,
          nowIso: nowTs.iso,
          note: input.rejectionReason,
        });
        return toOwnerSponsorReservationView(updatedDoc);
      });

      await emitCoreAudit({
        principal: { ...params.principal, role: adminDecision.effectiveRole },
        correlationId: params.correlationId,
        action: `sponsors.moderate.${input.decision}`,
        reservationId,
        outcome: 'SUCCESS',
        metadata: { status: updatedView.status, revision: updatedView.revision },
      });
      return updatedView;
    },

    async cancelSponsorReservation(params: { principal: AuthenticatedPrincipal; reservationId: string; rawBody: unknown; correlationId: string }): Promise<OwnerSponsorReservationView> {
      const reservationId = validateReservationId(params.reservationId);
      const validation = validateCancelSponsorInput(params.rawBody);
      if (!validation.ok || !validation.value) throw new CoreApiError('VALIDATION_FAILED', 400, 'Invalid cancellation payload.', validation.issues);
      const input = validation.value;

      return runDurableTransaction(deps.txRunner, { operationName: 'sponsors.cancel', maxAttempts: 3 }, async (tx) => {
        const resPath = `sponsorRequests/${reservationId}`;
        const snap = await tx.get<StoredSponsorReservation>(resPath);
        if (!snap.exists || !snap.data) throw new CoreApiError('NOT_FOUND', 404, 'Sponsor reservation not found.');
        const current = snap.data;

        const authz = await authorizePrincipal(params.principal, { minimumRole: 'verified_user', resourceOwnerUid: current.ownerUid, allowAdminOverrideForOwnership: false }, deps.adminStore, deps.primaryAdminEmails);
        if (!authz.allowed) throw new CoreApiError('FORBIDDEN', authz.status, authz.reason ?? 'Forbidden.');
        if (current.revision !== input.expectedRevision) throw new CoreApiError('CONFLICT', 409, `Stale revision: stored is ${current.revision}, expected ${input.expectedRevision}.`);

        const transition = validateSponsorLifecycleTransition(current.status, 'cancelled', 'owner');
        if (!transition.allowed) throw new CoreApiError('CONFLICT', 409, transition.reason ?? 'Cannot cancel reservation in current status.');

        const nowTs = normalizeFirestoreTimestamp(nowFn())!;
        const nextRevision = current.revision + 1;
        const updatedDoc: StoredSponsorReservation = { ...current, status: 'cancelled', revision: nextRevision, updatedAt: nowTs, cancelledAt: nowTs };

        tx.set(resPath, updatedDoc as unknown as Record<string, unknown>);
        tx.set(`sponsorSlotLocks/${current.slotKey}`, { slotKey: current.slotKey, cityId: current.cityId, hoodId: current.hoodId, reservationId: current.id, ownerUid: current.ownerUid, status: 'released', updatedAt: nowTs }, { merge: true });

        appendTransactionAuditRecord(tx, {
          reservationId: current.id,
          slotKey: current.slotKey,
          actorUid: params.principal.uid,
          actorRole: params.principal.role,
          action: 'sponsors.cancel',
          fromStatus: current.status,
          toStatus: 'cancelled',
          paymentStatus: current.paymentStatus,
          revision: nextRevision,
          nowIso: nowTs.iso,
          note: input.reason,
        });
        return toOwnerSponsorReservationView(updatedDoc);
      });
    },

    async expireSponsorReservationIfDue(params: { reservationId: string }): Promise<{ expired: boolean; status: SponsorReservationStatus; revision: number }> {
      const reservationId = validateReservationId(params.reservationId);
      return runDurableTransaction(deps.txRunner, { operationName: 'sponsors.expire_if_due', maxAttempts: 3 }, async (tx) => {
        const resPath = `sponsorRequests/${reservationId}`;
        const snap = await tx.get<StoredSponsorReservation>(resPath);
        if (!snap.exists || !snap.data) throw new CoreApiError('NOT_FOUND', 404, 'Sponsor reservation not found.');
        const current = snap.data;
        if (current.status === 'expired') return { expired: true, status: 'expired', revision: current.revision };
        if (!isSponsorReservationExpired(current, nowFn())) return { expired: false, status: current.status, revision: current.revision };

        const transition = validateSponsorLifecycleTransition(current.status, 'expired', 'system_expiry');
        if (!transition.allowed) return { expired: false, status: current.status, revision: current.revision };

        const nowTs = normalizeFirestoreTimestamp(nowFn())!;
        const nextRevision = current.revision + 1;
        tx.update(resPath, { status: 'expired', revision: nextRevision, updatedAt: nowTs });
        tx.set(`sponsorSlotLocks/${current.slotKey}`, { slotKey: current.slotKey, cityId: current.cityId, hoodId: current.hoodId, reservationId: current.id, ownerUid: current.ownerUid, status: 'released', updatedAt: nowTs }, { merge: true });
        appendTransactionAuditRecord(tx, {
          reservationId: current.id,
          slotKey: current.slotKey,
          actorUid: 'system_expiry',
          actorRole: 'system',
          action: 'sponsors.expire',
          fromStatus: current.status,
          toStatus: 'expired',
          paymentStatus: current.paymentStatus,
          revision: nextRevision,
          nowIso: nowTs.iso,
        });
        return { expired: true, status: 'expired', revision: nextRevision };
      });
    },

    async getPublicActivePlacement(params: { cityId: SponsorSupportedCityId; hoodId: number }): Promise<PublicSponsorPlacementProjection | null> {
      const slotKey = buildSlotKey(params.cityId, params.hoodId);
      return runDurableTransaction(deps.txRunner, { operationName: 'sponsors.get_public_placement', maxAttempts: 2 }, async (tx) => {
        const lockSnap = await tx.get<SponsorSlotLockRecord>(`sponsorSlotLocks/${slotKey}`);
        if (!lockSnap.exists || !lockSnap.data || lockSnap.data.status !== 'active') return null;
        const resSnap = await tx.get<StoredSponsorReservation>(`sponsorRequests/${lockSnap.data.reservationId}`);
        return toPublicSponsorPlacementProjection(resSnap.data, nowFn());
      });
    },
  };
}
