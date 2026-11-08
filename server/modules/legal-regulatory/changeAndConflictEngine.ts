import crypto from 'node:crypto';
import { LegalRegulatoryStore } from './store';
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
  if (input.idempotencyKey) {
    const cached = await store.getIdempotentResult<{
      updatedProvision: RegulatoryProvisionRecord;
      changeRecord: RegulatoryChangeRecord;
    }>(input.idempotencyKey, 'recordRegulatoryChangeAndVersion', actor.actorId);
    if (cached) return cached;
  }

  const target = await store.getProvisionById(input.targetProvisionId);
  if (!target) {
    throw new LegalRegulatoryError('NOT_FOUND', `Target provision '${input.targetProvisionId}' not found.`, 404);
  }
  const enactingSource = await store.getSourceById(input.enactingSourceId);
  if (!enactingSource) {
    throw new LegalRegulatoryError('NOT_FOUND', `Enacting source '${input.enactingSourceId}' not found.`, 404);
  }

  const effectiveFromIso = assertValidIsoDate(input.effectiveFromIso, 'effectiveFromIso');
  validateDateWindow(effectiveFromIso, input.effectiveToIso, input.repealedAtIso);
  const changeSummary = assertNonEmptyText(input.changeSummary, 'changeSummary', 2000);
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

  const savedProvision = await store.saveProvision(
    updatedProvision,
    input.expectedPreviousVersion ?? target.version,
  );
  const savedChange = await store.saveChangeRecord(changeRecord);
  const result = { updatedProvision: savedProvision, changeRecord: savedChange };
  if (input.idempotencyKey) {
    await store.saveIdempotentResult(
      input.idempotencyKey,
      'recordRegulatoryChangeAndVersion',
      actor.actorId,
      result,
    );
  }
  return result;
}

export async function executeGetProvisionVersionAsOfDate(
  store: LegalRegulatoryStore,
  provisionId: string,
  asOfDateIso: string,
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

  let matchedSnapshot: RegulatoryProvisionVersionSnapshot | null = null;
  for (const snap of provision.versionHistory) {
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
  const [provA, provB] = await Promise.all([
    store.getProvisionById(input.provisionIdA),
    store.getProvisionById(input.provisionIdB),
  ]);
  if (!provA || !provB) {
    throw new LegalRegulatoryError('NOT_FOUND', 'Both provisionIdA and provisionIdB must exist.', 404);
  }
  const record: RegulatoryProvisionConflictRecord = {
    id: input.id?.trim() || `reg_conf_${crypto.randomUUID()}`,
    provisionIdA: provA.id,
    provisionIdB: provB.id,
    conflictSeverity: input.conflictSeverity,
    conflictDescription: assertNonEmptyText(input.conflictDescription, 'conflictDescription', 2000),
    resolutionGuidance: input.resolutionGuidance?.trim(),
    higherAuthorityProvisionId: input.higherAuthorityProvisionId,
    status: 'OPEN_UNRESOLVED',
    recordedByActorId: actor.actorId,
    recordedAtIso: new Date().toISOString(),
    version: 1,
  };
  return store.saveConflictRecord(record, 0);
}
