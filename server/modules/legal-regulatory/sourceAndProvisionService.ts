import crypto from 'node:crypto';
import { GeographyLookupAdapter } from './adapters';
import {
  executeGetProvisionVersionAsOfDate,
  executeRecordRegulatoryChange,
  executeRegisterProvisionConflict,
  RecordRegulatoryChangeInput,
  RegisterProvisionConflictInput,
} from './changeAndConflictEngine';
import { LegalRegulatoryStore } from './store';
import {
  assertIdempotencyRecordMatches,
  computeCanonicalPayloadHash,
  LegalRegulatoryTransaction,
  sanitizeForFirestore,
} from './transactionalCore';
import {
  GeographicJurisdictionScope,
  HumanVerifiedInterpretation,
  LegalRegulatoryActorContext,
  ProvisionHierarchyLevel,
  ProvisionLifecycleStatus,
  PublicRegulatoryProvisionView,
  PublicRegulatorySourceView,
  RegulatoryChangeRecord,
  RegulatoryDocumentCategory,
  RegulatoryDocumentRecord,
  RegulatoryProvisionConflictRecord,
  RegulatoryProvisionRecord,
  RegulatoryProvisionVersionSnapshot,
  RegulatorySourceCategory,
  RegulatorySourceRecord,
  RegulatoryVerificationStatus,
  SourceReliabilityTier,
} from './types';
import {
  assertAdminOrReviewerActor,
  assertNonEmptyText,
  assertValidIsoDate,
  isPrivilegedRegulatoryViewer,
  LegalRegulatoryError,
  toPublicRegulatoryProvision,
  toPublicRegulatorySource,
  validateDateWindow,
  validateJurisdictionScopeStructure,
  validateOptionalSourceUrl,
} from './validationAndAuthz';

export type { RecordRegulatoryChangeInput, RegisterProvisionConflictInput };

export interface CreateRegulatorySourceInput {
  id?: string;
  officialTitleFa: string;
  officialTitleEn?: string;
  issuingAuthority: string;
  jurisdictionScope: GeographicJurisdictionScope;
  sourceCategory: RegulatorySourceCategory;
  reliabilityTier: SourceReliabilityTier;
  verificationStatus?: RegulatoryVerificationStatus;
  officialReferenceNumber: string;
  officialGazetteNumber?: string;
  publicationDateIso: string;
  effectiveFromIso: string;
  effectiveToIso?: string | null;
  repealedAtIso?: string | null;
  verifiedOriginalSourceUrl?: string | null;
  language?: 'fa' | 'en' | 'bilingual';
  verificationMethodNote?: string;
  isSyntheticTestFixture?: boolean;
  internalReviewerNotes?: string;
  restrictedAuditMetadata?: Record<string, string>;
  idempotencyKey?: string;
}

export interface CreateRegulatoryDocumentInput {
  id?: string;
  sourceId: string;
  documentCode: string;
  titleFa: string;
  titleEn?: string;
  documentCategory: RegulatoryDocumentCategory;
  jurisdictionScope?: GeographicJurisdictionScope;
  verificationStatus?: RegulatoryVerificationStatus;
  effectiveFromIso: string;
  effectiveToIso?: string | null;
  summaryVerified?: string;
  internalReviewerNotes?: string;
  idempotencyKey?: string;
}

export interface CreateRegulatoryProvisionInput {
  id?: string;
  documentId: string;
  sourceId: string;
  parentProvisionId?: string | null;
  hierarchyLevel: ProvisionHierarchyLevel;
  provisionNumber: string;
  citationLabel: string;
  titleFa: string;
  documentCategory: RegulatoryDocumentCategory;
  jurisdictionScope?: GeographicJurisdictionScope;
  originalTextVerbatim: string;
  verifiedExcerptText?: string;
  plainLanguageSummary?: string;
  humanVerifiedInterpretation?: HumanVerifiedInterpretation;
  lifecycleStatus?: ProvisionLifecycleStatus;
  verificationStatus?: RegulatoryVerificationStatus;
  effectiveFromIso: string;
  effectiveToIso?: string | null;
  amendsProvisionId?: string | null;
  internalReviewerNotes?: string;
  restrictedAuditMetadata?: Record<string, string>;
  idempotencyKey?: string;
}

export class RegulatorySourceAndProvisionService {
  constructor(
    private readonly store: LegalRegulatoryStore,
    private readonly geographyAdapter: GeographyLookupAdapter,
  ) {}

  private validateAndVerifyScope(scope: GeographicJurisdictionScope): void {
    validateJurisdictionScopeStructure(scope);
    const geoMatch = this.geographyAdapter.validateJurisdictionScope(scope);
    if (!geoMatch.valid) {
      throw new LegalRegulatoryError(
        'VALIDATION_ERROR',
        `Invalid geographic jurisdiction scope: ${geoMatch.warnings.join('; ')}`,
        400,
        { warnings: geoMatch.warnings },
      );
    }
  }

  private stageIdempotency<T>(
    tx: LegalRegulatoryTransaction,
    key: string | undefined,
    operation: string,
    actorId: string,
    requestHash: string,
    responsePayload: T,
    createdAtIso: string,
  ): void {
    if (!key) return;
    tx.putIdempotencyRecord({
      key,
      operation,
      actorId,
      requestHash,
      responsePayload,
      createdAtIso,
      schemaVersion: 1,
    });
  }

  async createRegulatorySource(
    input: CreateRegulatorySourceInput,
    actor: LegalRegulatoryActorContext,
  ): Promise<RegulatorySourceRecord> {
    assertAdminOrReviewerActor(actor, ['LEGAL_REVIEWER', 'REGULATORY_ADMIN']);
    const officialTitleFa = assertNonEmptyText(input.officialTitleFa, 'officialTitleFa', 500);
    const issuingAuthority = assertNonEmptyText(input.issuingAuthority, 'issuingAuthority', 300);
    const officialReferenceNumber = assertNonEmptyText(input.officialReferenceNumber, 'officialReferenceNumber', 200);
    const publicationDateIso = assertValidIsoDate(input.publicationDateIso, 'publicationDateIso');
    const effectiveFromIso = assertValidIsoDate(input.effectiveFromIso, 'effectiveFromIso');
    validateDateWindow(effectiveFromIso, input.effectiveToIso, input.repealedAtIso);
    const verifiedOriginalSourceUrl = validateOptionalSourceUrl(input.verifiedOriginalSourceUrl);
    this.validateAndVerifyScope(input.jurisdictionScope);

    const verificationStatus: RegulatoryVerificationStatus =
      input.verificationStatus ??
      (input.reliabilityTier === 'UNVERIFIED_EXTERNAL_REFERENCE' ? 'UNVERIFIED' : 'PENDING_VERIFICATION');

    if (verificationStatus === 'VERIFIED' && input.reliabilityTier === 'UNVERIFIED_EXTERNAL_REFERENCE') {
      throw new LegalRegulatoryError(
        'VALIDATION_ERROR',
        'A source with reliabilityTier UNVERIFIED_EXTERNAL_REFERENCE cannot be marked VERIFIED.',
        400,
      );
    }

    const requestHash = input.idempotencyKey ? computeCanonicalPayloadHash({ ...input, idempotencyKey: undefined }) : '';
    const id = input.id?.trim() || `reg_src_${crypto.randomUUID()}`;

    return this.store.runTransaction(async (tx) => {
      if (input.idempotencyKey) {
        const cached = await tx.getIdempotencyRecord<RegulatorySourceRecord>(
          input.idempotencyKey,
          'createRegulatorySource',
          actor.actorId,
        );
        if (cached) {
          return assertIdempotencyRecordMatches(cached, requestHash, 'createRegulatorySource', input.idempotencyKey);
        }
      }
      if (await tx.getSourceById(id)) {
        throw new LegalRegulatoryError('CONFLICT_OR_DUPLICATE', `Regulatory source '${id}' already exists.`, 409);
      }

      const nowIso = new Date().toISOString();
      const record: RegulatorySourceRecord = {
        id, officialTitleFa, officialTitleEn: input.officialTitleEn?.trim(), issuingAuthority,
        jurisdictionScope: structuredClone(input.jurisdictionScope), sourceCategory: input.sourceCategory,
        reliabilityTier: input.reliabilityTier, verificationStatus, officialReferenceNumber,
        officialGazetteNumber: input.officialGazetteNumber?.trim(), publicationDateIso, effectiveFromIso,
        effectiveToIso: input.effectiveToIso ?? null, repealedAtIso: input.repealedAtIso ?? null,
        verifiedOriginalSourceUrl, language: input.language ?? 'fa',
        provenance: {
          recordedByActorId: actor.actorId, recordedAtIso: nowIso,
          verifiedByReviewerId: verificationStatus === 'VERIFIED' ? actor.actorId : undefined,
          lastVerifiedAtIso: verificationStatus === 'VERIFIED' ? nowIso : undefined,
          verificationMethodNote: input.verificationMethodNote?.trim(),
          isSyntheticTestFixture: Boolean(input.isSyntheticTestFixture),
        },
        internalReviewerNotes: input.internalReviewerNotes, restrictedAuditMetadata: input.restrictedAuditMetadata,
        version: 1, createdAtIso: nowIso, updatedAtIso: nowIso,
      };
      tx.putSource(record, 0);
      tx.putAuditRecord({
        id: `audit_${crypto.randomUUID()}`, action: 'CREATE_SOURCE', targetEntityType: 'SOURCE',
        targetEntityId: record.id, actorId: actor.actorId, actorRole: actor.role, occurredAtIso: nowIso,
        summary: `Created regulatory source ${record.id} (${record.officialReferenceNumber}) [${record.verificationStatus}]`,
      });
      this.stageIdempotency(tx, input.idempotencyKey, 'createRegulatorySource', actor.actorId, requestHash, record, nowIso);
      return sanitizeForFirestore(structuredClone(record));
    });
  }

  async verifyRegulatorySource(
    sourceId: string,
    verificationMethodNote: string,
    actor: LegalRegulatoryActorContext,
    expectedVersion?: number,
    idempotencyKey?: string,
  ): Promise<RegulatorySourceRecord> {
    assertAdminOrReviewerActor(actor, ['LEGAL_REVIEWER', 'REGULATORY_ADMIN']);
    const note = assertNonEmptyText(verificationMethodNote, 'verificationMethodNote', 1000);
    const requestHash = idempotencyKey
      ? computeCanonicalPayloadHash({ sourceId, verificationMethodNote: note, expectedVersion })
      : '';
    return this.store.runTransaction(async (tx) => {
      if (idempotencyKey) {
        const cached = await tx.getIdempotencyRecord<RegulatorySourceRecord>(idempotencyKey, 'verifyRegulatorySource', actor.actorId);
        if (cached) return assertIdempotencyRecordMatches(cached, requestHash, 'verifyRegulatorySource', idempotencyKey);
      }
      const existing = await tx.getSourceById(sourceId);
      if (!existing) throw new LegalRegulatoryError('NOT_FOUND', `Regulatory source '${sourceId}' not found.`, 404);
      if (expectedVersion !== undefined && existing.version !== expectedVersion) {
        throw new LegalRegulatoryError(
          'CONCURRENT_MODIFICATION_CONFLICT',
          `Concurrent modification conflict on RegulatorySource '${sourceId}': expected version ${expectedVersion}, found ${existing.version}.`,
          409,
          { id: sourceId, expectedPreviousVersion: expectedVersion, actualVersion: existing.version },
        );
      }
      if (existing.reliabilityTier === 'UNVERIFIED_EXTERNAL_REFERENCE') {
        throw new LegalRegulatoryError(
          'INVALID_LIFECYCLE_TRANSITION',
          'Cannot mark an UNVERIFIED_EXTERNAL_REFERENCE source as VERIFIED without upgrading its official reliability tier.',
          400,
        );
      }
      const nowIso = new Date().toISOString();
      const updated: RegulatorySourceRecord = {
        ...existing,
        verificationStatus: 'VERIFIED',
        provenance: {
          ...existing.provenance,
          verifiedByReviewerId: actor.actorId,
          lastVerifiedAtIso: nowIso,
          verificationMethodNote: note,
        },
        version: existing.version + 1,
        updatedAtIso: nowIso,
      };
      tx.putSource(updated, expectedVersion ?? existing.version);
      tx.putAuditRecord({
        id: `audit_${crypto.randomUUID()}`, action: 'VERIFY_SOURCE', targetEntityType: 'SOURCE',
        targetEntityId: updated.id, actorId: actor.actorId, actorRole: actor.role, occurredAtIso: nowIso,
        summary: `Verified regulatory source ${updated.id} (v${existing.version} -> v${updated.version})`,
      });
      this.stageIdempotency(tx, idempotencyKey, 'verifyRegulatorySource', actor.actorId, requestHash, updated, nowIso);
      return sanitizeForFirestore(structuredClone(updated));
    });
  }

  async getRegulatorySourceForViewer(
    sourceId: string,
    actor?: LegalRegulatoryActorContext,
  ): Promise<RegulatorySourceRecord | PublicRegulatorySourceView> {
    const source = await this.store.getSourceById(sourceId);
    if (!source) {
      throw new LegalRegulatoryError('NOT_FOUND', `Regulatory source '${sourceId}' not found.`, 404);
    }
    if (!isPrivilegedRegulatoryViewer(actor) && source.verificationStatus === 'UNVERIFIED') {
      throw new LegalRegulatoryError(
        'FORBIDDEN',
        'Unverified draft regulatory sources are restricted from public access.',
        403,
      );
    }
    return toPublicRegulatorySource(source, actor);
  }

  async createRegulatoryDocument(
    input: CreateRegulatoryDocumentInput,
    actor: LegalRegulatoryActorContext,
  ): Promise<RegulatoryDocumentRecord> {
    assertAdminOrReviewerActor(actor, ['LEGAL_REVIEWER', 'REGULATORY_ADMIN']);
    const documentCode = assertNonEmptyText(input.documentCode, 'documentCode', 120);
    const titleFa = assertNonEmptyText(input.titleFa, 'titleFa', 500);
    const effectiveFromIso = assertValidIsoDate(input.effectiveFromIso, 'effectiveFromIso');
    validateDateWindow(effectiveFromIso, input.effectiveToIso);
    if (input.jurisdictionScope) this.validateAndVerifyScope(input.jurisdictionScope);

    const requestHash = input.idempotencyKey ? computeCanonicalPayloadHash({ ...input, idempotencyKey: undefined }) : '';
    const id = input.id?.trim() || `reg_doc_${crypto.randomUUID()}`;

    return this.store.runTransaction(async (tx) => {
      if (input.idempotencyKey) {
        const cached = await tx.getIdempotencyRecord<RegulatoryDocumentRecord>(
          input.idempotencyKey,
          'createRegulatoryDocument',
          actor.actorId,
        );
        if (cached) {
          return assertIdempotencyRecordMatches(cached, requestHash, 'createRegulatoryDocument', input.idempotencyKey);
        }
      }
      const source = await tx.getSourceById(input.sourceId);
      if (!source) {
        throw new LegalRegulatoryError('NOT_FOUND', `Parent source '${input.sourceId}' not found.`, 404);
      }
      if (await tx.getDocumentById(id)) {
        throw new LegalRegulatoryError('CONFLICT_OR_DUPLICATE', `Regulatory document '${id}' already exists.`, 409);
      }
      const scope = input.jurisdictionScope ?? source.jurisdictionScope;
      this.validateAndVerifyScope(scope);

      const nowIso = new Date().toISOString();
      const record: RegulatoryDocumentRecord = {
        id, sourceId: source.id, documentCode, titleFa, titleEn: input.titleEn?.trim(),
        documentCategory: input.documentCategory, jurisdictionScope: structuredClone(scope),
        verificationStatus: input.verificationStatus ?? source.verificationStatus,
        effectiveFromIso, effectiveToIso: input.effectiveToIso ?? null, repealedAtIso: null,
        summaryVerified: input.summaryVerified?.trim(), internalReviewerNotes: input.internalReviewerNotes,
        version: 1, createdAtIso: nowIso, updatedAtIso: nowIso,
      };
      tx.putDocument(record, 0);
      tx.putAuditRecord({
        id: `audit_${crypto.randomUUID()}`, action: 'CREATE_DOCUMENT', targetEntityType: 'DOCUMENT',
        targetEntityId: record.id, actorId: actor.actorId, actorRole: actor.role, occurredAtIso: nowIso,
        summary: `Created regulatory document ${record.id} (${record.documentCode}) under source ${source.id}`,
      });
      this.stageIdempotency(tx, input.idempotencyKey, 'createRegulatoryDocument', actor.actorId, requestHash, record, nowIso);
      return sanitizeForFirestore(structuredClone(record));
    });
  }

  async createRegulatoryProvision(
    input: CreateRegulatoryProvisionInput,
    actor: LegalRegulatoryActorContext,
  ): Promise<RegulatoryProvisionRecord> {
    assertAdminOrReviewerActor(actor, ['LEGAL_REVIEWER', 'REGULATORY_ADMIN']);
    const effectiveFromIso = assertValidIsoDate(input.effectiveFromIso, 'effectiveFromIso');
    validateDateWindow(effectiveFromIso, input.effectiveToIso);
    const originalTextVerbatim = assertNonEmptyText(input.originalTextVerbatim, 'originalTextVerbatim', 15000);
    const provisionNumber = assertNonEmptyText(input.provisionNumber, 'provisionNumber', 80);
    const citationLabel = assertNonEmptyText(input.citationLabel, 'citationLabel', 240);
    const titleFa = assertNonEmptyText(input.titleFa, 'titleFa', 500);
    if (input.jurisdictionScope) this.validateAndVerifyScope(input.jurisdictionScope);

    const requestHash = input.idempotencyKey ? computeCanonicalPayloadHash({ ...input, idempotencyKey: undefined }) : '';
    const id = input.id?.trim() || `reg_prov_${crypto.randomUUID()}`;

    return this.store.runTransaction(async (tx) => {
      if (input.idempotencyKey) {
        const cached = await tx.getIdempotencyRecord<RegulatoryProvisionRecord>(
          input.idempotencyKey, 'createRegulatoryProvision', actor.actorId,
        );
        if (cached) {
          return assertIdempotencyRecordMatches(cached, requestHash, 'createRegulatoryProvision', input.idempotencyKey);
        }
      }
      const [source, doc, existing] = await Promise.all([
        tx.getSourceById(input.sourceId),
        tx.getDocumentById(input.documentId),
        tx.getProvisionById(id),
      ]);
      if (!source) throw new LegalRegulatoryError('NOT_FOUND', `Parent source '${input.sourceId}' not found.`, 404);
      if (!doc || doc.sourceId !== source.id) {
        throw new LegalRegulatoryError('VALIDATION_ERROR', `Document '${input.documentId}' does not exist or does not belong to source '${source.id}'.`, 400);
      }
      if (existing) {
        throw new LegalRegulatoryError('CONFLICT_OR_DUPLICATE', `Regulatory provision '${id}' already exists.`, 409);
      }
      const scope = input.jurisdictionScope ?? doc.jurisdictionScope;
      this.validateAndVerifyScope(scope);

      const nowIso = new Date().toISOString();
      const lifecycleStatus: ProvisionLifecycleStatus = input.lifecycleStatus ?? 'ACTIVE_IN_FORCE';
      const initialSnapshot: RegulatoryProvisionVersionSnapshot = {
        versionNumber: 1, originalTextVerbatim, verifiedExcerptText: input.verifiedExcerptText?.trim(),
        plainLanguageSummary: input.plainLanguageSummary?.trim(), humanVerifiedInterpretation: input.humanVerifiedInterpretation,
        statusAtVersion: lifecycleStatus, effectiveFromIso, effectiveToIso: input.effectiveToIso ?? null,
        repealedAtIso: null, recordedAtIso: nowIso, recordedByActorId: actor.actorId,
      };
      const provision: RegulatoryProvisionRecord = {
        id, documentId: doc.id, sourceId: source.id, parentProvisionId: input.parentProvisionId ?? null,
        hierarchyLevel: input.hierarchyLevel, provisionNumber, citationLabel, titleFa,
        documentCategory: input.documentCategory, jurisdictionScope: structuredClone(scope),
        originalTextVerbatim, verifiedExcerptText: input.verifiedExcerptText?.trim(),
        plainLanguageSummary: input.plainLanguageSummary?.trim(), humanVerifiedInterpretation: input.humanVerifiedInterpretation,
        lifecycleStatus, verificationStatus: input.verificationStatus ?? source.verificationStatus,
        effectiveFromIso, effectiveToIso: input.effectiveToIso ?? null, repealedAtIso: null,
        supersededByProvisionId: null, amendsProvisionId: input.amendsProvisionId ?? null,
        versionHistory: [initialSnapshot], internalReviewerNotes: input.internalReviewerNotes,
        restrictedAuditMetadata: input.restrictedAuditMetadata, version: 1, createdAtIso: nowIso, updatedAtIso: nowIso,
      };
      tx.putProvision(provision, 0);
      tx.putAuditRecord({
        id: `audit_${crypto.randomUUID()}`, action: 'CREATE_PROVISION', targetEntityType: 'PROVISION',
        targetEntityId: provision.id, actorId: actor.actorId, actorRole: actor.role, occurredAtIso: nowIso,
        summary: `Created regulatory provision ${provision.id} (${provision.citationLabel}) v1`,
      });
      this.stageIdempotency(tx, input.idempotencyKey, 'createRegulatoryProvision', actor.actorId, requestHash, provision, nowIso);
      return sanitizeForFirestore(structuredClone(provision));
    });
  }

  recordRegulatoryChangeAndVersion(
    input: RecordRegulatoryChangeInput,
    actor: LegalRegulatoryActorContext,
  ): Promise<{ updatedProvision: RegulatoryProvisionRecord; changeRecord: RegulatoryChangeRecord }> {
    return executeRecordRegulatoryChange(this.store, input, actor);
  }

  getProvisionVersionAsOfDate(
    provisionId: string,
    asOfDateIso: string,
    actor?: LegalRegulatoryActorContext,
  ) {
    return executeGetProvisionVersionAsOfDate(this.store, provisionId, asOfDateIso, actor);
  }

  registerProvisionConflict(
    input: RegisterProvisionConflictInput,
    actor: LegalRegulatoryActorContext,
  ): Promise<RegulatoryProvisionConflictRecord> {
    return executeRegisterProvisionConflict(this.store, input, actor);
  }

  async getProvisionForViewer(
    provisionId: string,
    actor?: LegalRegulatoryActorContext,
  ): Promise<RegulatoryProvisionRecord | PublicRegulatoryProvisionView> {
    const prov = await this.store.getProvisionById(provisionId);
    if (!prov) throw new LegalRegulatoryError('NOT_FOUND', `Provision '${provisionId}' not found.`, 404);
    if (!isPrivilegedRegulatoryViewer(actor) && prov.verificationStatus === 'UNVERIFIED') {
      throw new LegalRegulatoryError(
        'FORBIDDEN',
        'Unverified regulatory provisions are restricted from public access.',
        403,
      );
    }
    return toPublicRegulatoryProvision(prov, actor);
  }
}
