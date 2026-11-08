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

  async createRegulatorySource(
    input: CreateRegulatorySourceInput,
    actor: LegalRegulatoryActorContext,
  ): Promise<RegulatorySourceRecord> {
    assertAdminOrReviewerActor(actor, ['LEGAL_REVIEWER', 'REGULATORY_ADMIN']);
    if (input.idempotencyKey) {
      const cached = await this.store.getIdempotentResult<RegulatorySourceRecord>(
        input.idempotencyKey,
        'createRegulatorySource',
        actor.actorId,
      );
      if (cached) return cached;
    }

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

    const nowIso = new Date().toISOString();
    const id = input.id?.trim() || `reg_src_${crypto.randomUUID()}`;
    if (await this.store.getSourceById(id)) {
      throw new LegalRegulatoryError('CONFLICT_OR_DUPLICATE', `Regulatory source '${id}' already exists.`, 409);
    }

    const record: RegulatorySourceRecord = {
      id,
      officialTitleFa,
      officialTitleEn: input.officialTitleEn?.trim(),
      issuingAuthority,
      jurisdictionScope: structuredClone(input.jurisdictionScope),
      sourceCategory: input.sourceCategory,
      reliabilityTier: input.reliabilityTier,
      verificationStatus,
      officialReferenceNumber,
      officialGazetteNumber: input.officialGazetteNumber?.trim(),
      publicationDateIso,
      effectiveFromIso,
      effectiveToIso: input.effectiveToIso ?? null,
      repealedAtIso: input.repealedAtIso ?? null,
      verifiedOriginalSourceUrl,
      language: input.language ?? 'fa',
      provenance: {
        recordedByActorId: actor.actorId,
        recordedAtIso: nowIso,
        verifiedByReviewerId: verificationStatus === 'VERIFIED' ? actor.actorId : undefined,
        lastVerifiedAtIso: verificationStatus === 'VERIFIED' ? nowIso : undefined,
        verificationMethodNote: input.verificationMethodNote?.trim(),
        isSyntheticTestFixture: Boolean(input.isSyntheticTestFixture),
      },
      internalReviewerNotes: input.internalReviewerNotes,
      restrictedAuditMetadata: input.restrictedAuditMetadata,
      version: 1,
      createdAtIso: nowIso,
      updatedAtIso: nowIso,
    };

    const saved = await this.store.saveSource(record, 0);
    await this.store.appendAuditRecord({
      id: `audit_${crypto.randomUUID()}`,
      action: 'CREATE_SOURCE',
      targetEntityType: 'SOURCE',
      targetEntityId: saved.id,
      actorId: actor.actorId,
      actorRole: actor.role,
      occurredAtIso: nowIso,
      summary: `Created regulatory source ${saved.id} (${saved.officialReferenceNumber}) [${saved.verificationStatus}]`,
    });
    if (input.idempotencyKey) {
      await this.store.saveIdempotentResult(input.idempotencyKey, 'createRegulatorySource', actor.actorId, saved);
    }
    return saved;
  }

  async verifyRegulatorySource(
    sourceId: string,
    verificationMethodNote: string,
    actor: LegalRegulatoryActorContext,
    expectedVersion?: number,
  ): Promise<RegulatorySourceRecord> {
    assertAdminOrReviewerActor(actor, ['LEGAL_REVIEWER', 'REGULATORY_ADMIN']);
    const existing = await this.store.getSourceById(sourceId);
    if (!existing) {
      throw new LegalRegulatoryError('NOT_FOUND', `Regulatory source '${sourceId}' not found.`, 404);
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
        verificationMethodNote: assertNonEmptyText(verificationMethodNote, 'verificationMethodNote', 1000),
      },
      version: existing.version + 1,
      updatedAtIso: nowIso,
    };
    return this.store.saveSource(updated, expectedVersion ?? existing.version);
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
    if (input.idempotencyKey) {
      const cached = await this.store.getIdempotentResult<RegulatoryDocumentRecord>(
        input.idempotencyKey,
        'createRegulatoryDocument',
        actor.actorId,
      );
      if (cached) return cached;
    }
    const source = await this.store.getSourceById(input.sourceId);
    if (!source) {
      throw new LegalRegulatoryError('NOT_FOUND', `Parent source '${input.sourceId}' not found.`, 404);
    }
    const scope = input.jurisdictionScope ?? source.jurisdictionScope;
    this.validateAndVerifyScope(scope);
    const effectiveFromIso = assertValidIsoDate(input.effectiveFromIso, 'effectiveFromIso');
    validateDateWindow(effectiveFromIso, input.effectiveToIso);

    const nowIso = new Date().toISOString();
    const record: RegulatoryDocumentRecord = {
      id: input.id?.trim() || `reg_doc_${crypto.randomUUID()}`,
      sourceId: source.id,
      documentCode: assertNonEmptyText(input.documentCode, 'documentCode', 120),
      titleFa: assertNonEmptyText(input.titleFa, 'titleFa', 500),
      titleEn: input.titleEn?.trim(),
      documentCategory: input.documentCategory,
      jurisdictionScope: structuredClone(scope),
      verificationStatus: input.verificationStatus ?? source.verificationStatus,
      effectiveFromIso,
      effectiveToIso: input.effectiveToIso ?? null,
      repealedAtIso: null,
      summaryVerified: input.summaryVerified?.trim(),
      internalReviewerNotes: input.internalReviewerNotes,
      version: 1,
      createdAtIso: nowIso,
      updatedAtIso: nowIso,
    };
    const saved = await this.store.saveDocument(record, 0);
    if (input.idempotencyKey) {
      await this.store.saveIdempotentResult(input.idempotencyKey, 'createRegulatoryDocument', actor.actorId, saved);
    }
    return saved;
  }

  async createRegulatoryProvision(
    input: CreateRegulatoryProvisionInput,
    actor: LegalRegulatoryActorContext,
  ): Promise<RegulatoryProvisionRecord> {
    assertAdminOrReviewerActor(actor, ['LEGAL_REVIEWER', 'REGULATORY_ADMIN']);
    if (input.idempotencyKey) {
      const cached = await this.store.getIdempotentResult<RegulatoryProvisionRecord>(
        input.idempotencyKey,
        'createRegulatoryProvision',
        actor.actorId,
      );
      if (cached) return cached;
    }
    const source = await this.store.getSourceById(input.sourceId);
    if (!source) throw new LegalRegulatoryError('NOT_FOUND', `Parent source '${input.sourceId}' not found.`, 404);
    const doc = await this.store.getDocumentById(input.documentId);
    if (!doc || doc.sourceId !== source.id) {
      throw new LegalRegulatoryError(
        'VALIDATION_ERROR',
        `Document '${input.documentId}' does not exist or does not belong to source '${source.id}'.`,
        400,
      );
    }
    const scope = input.jurisdictionScope ?? doc.jurisdictionScope;
    this.validateAndVerifyScope(scope);
    const effectiveFromIso = assertValidIsoDate(input.effectiveFromIso, 'effectiveFromIso');
    validateDateWindow(effectiveFromIso, input.effectiveToIso);
    const originalTextVerbatim = assertNonEmptyText(input.originalTextVerbatim, 'originalTextVerbatim', 15000);

    const nowIso = new Date().toISOString();
    const lifecycleStatus: ProvisionLifecycleStatus = input.lifecycleStatus ?? 'ACTIVE_IN_FORCE';
    const initialSnapshot: RegulatoryProvisionVersionSnapshot = {
      versionNumber: 1,
      originalTextVerbatim,
      verifiedExcerptText: input.verifiedExcerptText?.trim(),
      plainLanguageSummary: input.plainLanguageSummary?.trim(),
      humanVerifiedInterpretation: input.humanVerifiedInterpretation,
      statusAtVersion: lifecycleStatus,
      effectiveFromIso,
      effectiveToIso: input.effectiveToIso ?? null,
      repealedAtIso: null,
      recordedAtIso: nowIso,
      recordedByActorId: actor.actorId,
    };

    const provision: RegulatoryProvisionRecord = {
      id: input.id?.trim() || `reg_prov_${crypto.randomUUID()}`,
      documentId: doc.id,
      sourceId: source.id,
      parentProvisionId: input.parentProvisionId ?? null,
      hierarchyLevel: input.hierarchyLevel,
      provisionNumber: assertNonEmptyText(input.provisionNumber, 'provisionNumber', 80),
      citationLabel: assertNonEmptyText(input.citationLabel, 'citationLabel', 240),
      titleFa: assertNonEmptyText(input.titleFa, 'titleFa', 500),
      documentCategory: input.documentCategory,
      jurisdictionScope: structuredClone(scope),
      originalTextVerbatim,
      verifiedExcerptText: input.verifiedExcerptText?.trim(),
      plainLanguageSummary: input.plainLanguageSummary?.trim(),
      humanVerifiedInterpretation: input.humanVerifiedInterpretation,
      lifecycleStatus,
      verificationStatus: input.verificationStatus ?? source.verificationStatus,
      effectiveFromIso,
      effectiveToIso: input.effectiveToIso ?? null,
      repealedAtIso: null,
      supersededByProvisionId: null,
      amendsProvisionId: input.amendsProvisionId ?? null,
      versionHistory: [initialSnapshot],
      internalReviewerNotes: input.internalReviewerNotes,
      restrictedAuditMetadata: input.restrictedAuditMetadata,
      version: 1,
      createdAtIso: nowIso,
      updatedAtIso: nowIso,
    };

    const saved = await this.store.saveProvision(provision, 0);
    if (input.idempotencyKey) {
      await this.store.saveIdempotentResult(input.idempotencyKey, 'createRegulatoryProvision', actor.actorId, saved);
    }
    return saved;
  }

  recordRegulatoryChangeAndVersion(
    input: RecordRegulatoryChangeInput,
    actor: LegalRegulatoryActorContext,
  ): Promise<{ updatedProvision: RegulatoryProvisionRecord; changeRecord: RegulatoryChangeRecord }> {
    return executeRecordRegulatoryChange(this.store, input, actor);
  }

  getProvisionVersionAsOfDate(provisionId: string, asOfDateIso: string) {
    return executeGetProvisionVersionAsOfDate(this.store, provisionId, asOfDateIso);
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
