import crypto from 'node:crypto';
import { LegalRegulatoryStore } from './store';
import { assertIdempotencyRecordMatches, computeCanonicalPayloadHash } from './transactionalCore';
import {
  ConflictSeverity,
  HumanVerifiedInterpretation,
  LegalRegulatoryActorContext,
  ProvisionLifecycleStatus,
  RegulatoryChangeRecord,
  RegulatoryChangeType,
  RegulatoryProvisionConflictRecord,
  RegulatoryProvisionRecord,
  RegulatoryProvisionVersionSnapshot,
} from './types';
import {
  assertAdminOrReviewerActor,
  assertNonEmptyText,
  assertValidIsoDate,
  isPrivilegedRegulatoryViewer,
  LegalRegulatoryError,
  validateDateWindow,
} from './validationAndAuthz';

export interface RecordRegulatoryChangeInput {
  targetProvisionId: string;
  changeType: RegulatoryChangeType;
  enactingSourceId: string;
  enactingProvisionId?: string;
  newOriginalTextVerbatim?: string;
  newVerifiedExcerptText?: string;
  newPlainLanguageSummary?: string;
  newHumanVerifiedInterpretation?: HumanVerifiedInterpretation;
  newLifecycleStatus?: ProvisionLifecycleStatus;
  effectiveFromIso: string;
  effectiveToIso?: string | null;
  repealedAtIso?: string | null;
  supersededByProvisionId?: string | null;
  changeSummary: string;
  expectedPreviousVersion?: number;
  idempotencyKey?: string;
}

export interface RegisterProvisionConflictInput {
  id?: string;
  provisionIdA: string;
  provisionIdB: string;
  conflictSeverity: ConflictSeverity;
  conflictDescription: string;
  resolutionGuidance?: string;
  higherAuthorityProvisionId?: string;
  idempotencyKey?: string;
}

export async function executeRecordRegulatoryChange(
  store: LegalRegulatoryStore,
  input: RecordRegulatoryChangeInput,
  actor: LegalRegulatoryActorContext,
): Promise<{ updatedProvision: RegulatoryProvisionRecord; changeRecord: RegulatoryChangeRecord }> {
  assertAdminOrReviewerActor(actor, ['LEGAL_REVIEWER', 'REGULATORY_ADMIN']);
  const effectiveFromIso = assertValidIsoDate(input.effectiveFromIso, 'effectiveFromIso');
  validateDateWindow(effectiveFromIso, input.effectiveToIso, input.repealedAtIso);
  const changeSummary = assertNonEmptyText(input.changeSummary, 'changeSummary', 2000);
  const requestHash = input.idempotencyKey ? computeCanonicalPayloadHash({ ...input, idempotencyKey: undefined }) : '';

  return store.runTransaction(async (tx) => {
    if (input.idempotencyKey) {
      const cached = await tx.getIdempotencyRecord<{
        updatedProvision: RegulatoryProvisionRecord;
        changeRecord: RegulatoryChangeRecord;
      }>(input.idempotencyKey, 'recordRegulatoryChangeAndVersion', actor.actorId);
      if (cached) {
        return assertIdempotencyRecordMatches(
          cached,
          requestHash,
          'recordRegulatoryChangeAndVersion',
          input.idempotencyKey,
        );
      }
    }

    const target = await tx.getProvisionById(input.targetProvisionId);
    if (!target) {
      throw new LegalRegulatoryError('NOT_FOUND', `Target provision '${input.targetProvisionId}' not found.`, 404);
    }
    const enactingSource = await tx.getSourceById(input.enactingSourceId);
    if (!enactingSource) {
      throw new LegalRegulatoryError('NOT_FOUND', `Enacting source '${input.enactingSourceId}' not found.`, 404);
    }

    if (input.expectedPreviousVersion !== undefined && target.version !== input.expectedPreviousVersion) {
      throw new LegalRegulatoryError(
        'CONCURRENT_MODIFICATION_CONFLICT',
        `Concurrent modification conflict on RegulatoryProvision '${target.id}': expected version ${input.expectedPreviousVersion}, found ${target.version}.`,
        409,
        {
          id: target.id,
          expectedPreviousVersion: input.expectedPreviousVersion,
          actualVersion: target.version,
        },
      );
    }

    const nowIso = new Date().toISOString();
    const nextVersion = target.version + 1;
    const changeId = `reg_chg_${crypto.randomUUID()}`;

    let nextStatus: ProvisionLifecycleStatus = input.newLifecycleStatus ?? target.lifecycleStatus;
    let nextRepealedAt = input.repealedAtIso !== undefined ? input.repealedAtIso : target.repealedAtIso;
    let nextEffectiveTo = input.effectiveToIso !== undefined ? input.effectiveToIso : target.effectiveToIso;
    if (input.changeType === 'REPEAL') {
      nextStatus = 'REPEALED';
      nextRepealedAt = input.repealedAtIso ?? effectiveFromIso;
      nextEffectiveTo = nextEffectiveTo ?? nextRepealedAt;
    } else if (input.changeType === 'SUPERSESSION_REPLACEMENT') {
      nextStatus = 'SUPERSEDED';
      nextEffectiveTo = input.effectiveToIso ?? effectiveFromIso;
    } else if (input.changeType === 'AMENDMENT' && !input.newLifecycleStatus) {
      nextStatus = 'ACTIVE_IN_FORCE';
    } else if (input.changeType === 'TEMPORARY_PROVISION') {
      nextStatus = 'TEMPORARY_IN_FORCE';
    }

    const updatedHistory = target.versionHistory.map((snap, idx) =>
      idx === target.versionHistory.length - 1 && !snap.effectiveToIso
        ? { ...snap, effectiveToIso: effectiveFromIso }
        : snap,
    );

    const newOriginalText = input.newOriginalTextVerbatim?.trim() || target.originalTextVerbatim;
    const newSnapshot: RegulatoryProvisionVersionSnapshot = {
      versionNumber: nextVersion,
      originalTextVerbatim: newOriginalText,
      verifiedExcerptText: input.newVerifiedExcerptText ?? target.verifiedExcerptText,
      plainLanguageSummary: input.newPlainLanguageSummary ?? target.plainLanguageSummary,
      humanVerifiedInterpretation: input.newHumanVerifiedInterpretation ?? target.humanVerifiedInterpretation,
      statusAtVersion: nextStatus,
      effectiveFromIso,
      effectiveToIso: nextEffectiveTo ?? null,
      repealedAtIso: nextRepealedAt ?? null,
      changeRecordId: changeId,
      recordedAtIso: nowIso,
      recordedByActorId: actor.actorId,
    };

    const updatedProvision: RegulatoryProvisionRecord = {
      ...target,
      originalTextVerbatim: newOriginalText,
      verifiedExcerptText: newSnapshot.verifiedExcerptText,
      plainLanguageSummary: newSnapshot.plainLanguageSummary,
      humanVerifiedInterpretation: newSnapshot.humanVerifiedInterpretation,
      lifecycleStatus: nextStatus,
      effectiveFromIso,
      effectiveToIso: nextEffectiveTo ?? null,
      repealedAtIso: nextRepealedAt ?? null,
      supersededByProvisionId: input.supersededByProvisionId ?? target.supersededByProvisionId ?? null,
      versionHistory: [...updatedHistory, newSnapshot],
      version: nextVersion,
      updatedAtIso: nowIso,
    };

    const changeRecord: RegulatoryChangeRecord = {
      id: changeId,
      changeType: input.changeType,
      targetProvisionId: target.id,
      enactingSourceId: enactingSource.id,
      enactingProvisionId: input.enactingProvisionId,
      previousProvisionVersion: target.version,
      newProvisionVersion: nextVersion,
      effectiveFromIso,
      effectiveToIso: nextEffectiveTo ?? null,
      changeSummary,
      recordedByActorId: actor.actorId,
      recordedAtIso: nowIso,
    };

    const result = {
      updatedProvision: structuredClone(updatedProvision),
      changeRecord: structuredClone(changeRecord),
    };

    tx.putProvision(updatedProvision, input.expectedPreviousVersion ?? target.version);
    tx.putChangeRecord(changeRecord);
    tx.putAuditRecord({
      id: `audit_${crypto.randomUUID()}`,
      action: 'RECORD_REGULATORY_CHANGE',
      targetEntityType: 'CHANGE',
      targetEntityId: changeRecord.id,
      actorId: actor.actorId,
      actorRole: actor.role,
      occurredAtIso: nowIso,
      summary: `Recorded ${changeRecord.changeType} on provision ${target.id} (v${target.version} -> v${nextVersion})`,
    });
    if (input.idempotencyKey) {
      tx.putIdempotencyRecord({
        key: input.idempotencyKey,
        operation: 'recordRegulatoryChangeAndVersion',
        actorId: actor.actorId,
        requestHash,
        responsePayload: result,
        createdAtIso: nowIso,
        schemaVersion: 1,
      });
    }
    return result;
  });
}

export async function executeGetProvisionVersionAsOfDate(
  store: LegalRegulatoryStore,
  provisionId: string,
  asOfDateIso: string,
  actor?: LegalRegulatoryActorContext,
): Promise<{
  provisionId: string;
  citationLabel: string;
  asOfDateIso: string;
  isInForceAtDate: boolean;
  matchedSnapshot: RegulatoryProvisionVersionSnapshot | null;
}> {
  const asOfMs = Date.parse(assertValidIsoDate(asOfDateIso, 'asOfDateIso'));
  const provision = await store.getProvisionById(provisionId);
  if (!provision) throw new LegalRegulatoryError('NOT_FOUND', `Provision '${provisionId}' not found.`, 404);
  if (
    actor !== undefined &&
    !isPrivilegedRegulatoryViewer(actor) &&
    (provision.verificationStatus === 'UNVERIFIED' || provision.lifecycleStatus === 'DRAFT_UNVERIFIED')
  ) {
    throw new LegalRegulatoryError(
      'FORBIDDEN',
      'Unverified regulatory provisions are restricted from public access.',
      403,
    );
  }

  let matchedSnapshot: RegulatoryProvisionVersionSnapshot | null = null;
  for (const snap of provision.versionHistory) {
    if (actor !== undefined && !isPrivilegedRegulatoryViewer(actor) && snap.statusAtVersion === 'DRAFT_UNVERIFIED') {
      continue;
    }
    const fromMs = Date.parse(snap.effectiveFromIso);
    const toMs = snap.effectiveToIso ? Date.parse(snap.effectiveToIso) : Number.POSITIVE_INFINITY;
    const repealMs = snap.repealedAtIso ? Date.parse(snap.repealedAtIso) : Number.POSITIVE_INFINITY;
    if (asOfMs >= fromMs && asOfMs < toMs && asOfMs < repealMs) {
      matchedSnapshot = structuredClone(snap);
    }
  }

  const isInForceAtDate =
    matchedSnapshot !== null &&
    matchedSnapshot.statusAtVersion !== 'REPEALED' &&
    matchedSnapshot.statusAtVersion !== 'SUPERSEDED' &&
    matchedSnapshot.statusAtVersion !== 'DRAFT_UNVERIFIED';

  return {
    provisionId: provision.id,
    citationLabel: provision.citationLabel,
    asOfDateIso,
    isInForceAtDate,
    matchedSnapshot,
  };
}

export async function executeRegisterProvisionConflict(
  store: LegalRegulatoryStore,
  input: RegisterProvisionConflictInput,
  actor: LegalRegulatoryActorContext,
): Promise<RegulatoryProvisionConflictRecord> {
  assertAdminOrReviewerActor(actor, ['LEGAL_REVIEWER', 'REGULATORY_ADMIN']);
  if (input.provisionIdA === input.provisionIdB) {
    throw new LegalRegulatoryError('VALIDATION_ERROR', 'A provision cannot conflict with itself.', 400);
  }
  const conflictDescription = assertNonEmptyText(input.conflictDescription, 'conflictDescription', 2000);
  const requestHash = input.idempotencyKey ? computeCanonicalPayloadHash({ ...input, idempotencyKey: undefined }) : '';
  const id = input.id?.trim() || `reg_conf_${crypto.randomUUID()}`;

  return store.runTransaction(async (tx) => {
    if (input.idempotencyKey) {
      const cached = await tx.getIdempotencyRecord<RegulatoryProvisionConflictRecord>(
        input.idempotencyKey,
        'registerProvisionConflict',
        actor.actorId,
      );
      if (cached) {
        return assertIdempotencyRecordMatches(cached, requestHash, 'registerProvisionConflict', input.idempotencyKey);
      }
    }

    const [provA, provB, existing] = await Promise.all([
      tx.getProvisionById(input.provisionIdA),
      tx.getProvisionById(input.provisionIdB),
      tx.getConflictById(id),
    ]);
    if (!provA || !provB) {
      throw new LegalRegulatoryError('NOT_FOUND', 'Both provisionIdA and provisionIdB must exist.', 404);
    }
    if (existing) {
      throw new LegalRegulatoryError('CONFLICT_OR_DUPLICATE', `Conflict record '${id}' already exists.`, 409);
    }

    const nowIso = new Date().toISOString();
    const record: RegulatoryProvisionConflictRecord = {
      id,
      provisionIdA: provA.id,
      provisionIdB: provB.id,
      conflictSeverity: input.conflictSeverity,
      conflictDescription,
      resolutionGuidance: input.resolutionGuidance?.trim(),
      higherAuthorityProvisionId: input.higherAuthorityProvisionId,
      status: 'OPEN_UNRESOLVED',
      recordedByActorId: actor.actorId,
      recordedAtIso: nowIso,
      version: 1,
    };

    tx.putConflict(record, 0);
    tx.putAuditRecord({
      id: `audit_${crypto.randomUUID()}`,
      action: 'REGISTER_CONFLICT',
      targetEntityType: 'CONFLICT',
      targetEntityId: record.id,
      actorId: actor.actorId,
      actorRole: actor.role,
      occurredAtIso: nowIso,
      summary: `Registered regulatory conflict ${record.id} between ${provA.id} and ${provB.id}`,
    });
    if (input.idempotencyKey) {
      tx.putIdempotencyRecord({
        key: input.idempotencyKey,
        operation: 'registerProvisionConflict',
        actorId: actor.actorId,
        requestHash,
        responsePayload: record,
        createdAtIso: nowIso,
        schemaVersion: 1,
      });
    }
    return structuredClone(record);
  });
}
