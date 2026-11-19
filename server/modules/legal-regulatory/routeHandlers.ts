import crypto from 'node:crypto';
import type { Request, Response } from 'express';
import type { ProvinceId, SupportedCityId } from '../geography/types';
import {
  assertAuthenticatedLegalActor,
  assertRegulatoryAdminMutationActor,
  resolveLegalRegulatoryActor,
  type LegalRegulatoryAuthDeps,
} from './actorResolver';
import type {
  CreateApplicabilityRuleInput,
  CreateComplianceRequirementInput,
  LegalRegulatorySearchQuery,
  RecordNonAuthoritativeAiSuggestionInput,
} from './applicabilityAndProfileService';
import type { LegalRegulatoryModuleFacade } from './index';
import type {
  CreateRegulatoryDocumentInput,
  CreateRegulatoryProvisionInput,
  CreateRegulatorySourceInput,
  RecordRegulatoryChangeInput,
  RegisterProvisionConflictInput,
} from './sourceAndProvisionService';
import { assertValidIdempotencyKey, buildIdempotencyDocumentId } from './transactionalCore';
import type {
  LegalRegulatoryActorContext,
  PropertyCategoryType,
  PropertyRegulatoryEvaluationInput,
  RegulatoryDocumentCategory,
  RegulatorySourceCategory,
  TransactionContextType,
} from './types';
import {
  assertAllowedObjectFields,
  assertSafeEntityId,
  assertSafeJsonPayload,
  assertValidIsoDate,
  isPrivilegedRegulatoryViewer,
  LegalRegulatoryError,
  redactPrivateFieldsDeep,
} from './validationAndAuthz';

export interface LegalRegulatoryRouteHandlersDeps {
  getFacade: () => LegalRegulatoryModuleFacade;
  authDeps?: LegalRegulatoryAuthDeps;
}

const ALLOWED_FIELDS: Record<string, ReadonlySet<string>> = {
  createSource: new Set([
    'id', 'officialTitleFa', 'officialTitleEn', 'issuingAuthority', 'jurisdictionScope', 'sourceCategory',
    'reliabilityTier', 'verificationStatus', 'officialReferenceNumber', 'officialGazetteNumber',
    'publicationDateIso', 'effectiveFromIso', 'effectiveToIso', 'repealedAtIso', 'verifiedOriginalSourceUrl',
    'language', 'verificationMethodNote', 'isSyntheticTestFixture', 'internalReviewerNotes',
    'restrictedAuditMetadata', 'idempotencyKey',
  ]),
  verifySource: new Set(['verificationMethodNote', 'expectedVersion', 'idempotencyKey']),
  createDocument: new Set([
    'id', 'sourceId', 'documentCode', 'titleFa', 'titleEn', 'documentCategory', 'jurisdictionScope',
    'verificationStatus', 'effectiveFromIso', 'effectiveToIso', 'summaryVerified', 'internalReviewerNotes',
    'idempotencyKey',
  ]),
  createProvision: new Set([
    'id', 'documentId', 'sourceId', 'parentProvisionId', 'hierarchyLevel', 'provisionNumber', 'citationLabel',
    'titleFa', 'documentCategory', 'jurisdictionScope', 'originalTextVerbatim', 'verifiedExcerptText',
    'plainLanguageSummary', 'humanVerifiedInterpretation', 'lifecycleStatus', 'verificationStatus',
    'effectiveFromIso', 'effectiveToIso', 'amendsProvisionId', 'internalReviewerNotes',
    'restrictedAuditMetadata', 'idempotencyKey',
  ]),
  recordChange: new Set([
    'id', 'targetProvisionId', 'changeType', 'enactingSourceId', 'enactingProvisionId',
    'newOriginalTextVerbatim', 'newVerifiedExcerptText', 'newPlainLanguageSummary', 'effectiveFromIso',
    'effectiveToIso', 'repealedAtIso', 'supersededByProvisionId', 'changeSummary',
    'expectedPreviousVersion', 'idempotencyKey',
  ]),
  registerConflict: new Set([
    'id', 'provisionIdA', 'provisionIdB', 'conflictSeverity', 'conflictDescription',
    'resolutionGuidance', 'higherAuthorityProvisionId', 'idempotencyKey',
  ]),
  createApplicabilityRule: new Set([
    'id', 'provisionId', 'sourceId', 'ruleName', 'jurisdictionScope', 'conditions',
    'restrictionOrObligationSummary', 'mandatoryClassification', 'effectiveFromIso',
    'effectiveToIso', 'verificationStatus', 'idempotencyKey',
  ]),
  createComplianceRequirement: new Set([
    'id', 'requirementCode', 'sourceId', 'provisionId', 'jurisdictionScope',
    'applicablePropertyCategories', 'applicableTransactionContexts', 'titleFa', 'requirementDescription',
    'mandatoryVersionClassification', 'conditionTriggerDescription', 'requiredEvidenceTypes',
    'verificationMethodDescription', 'responsibleAuthorityName', 'effectiveFromIso',
    'effectiveToIso', 'internalReviewerNotes', 'idempotencyKey',
  ]),
  recordAiSummary: new Set([
    'id', 'targetEntityType', 'targetEntityId', 'targetEntityVersion', 'summaryText',
    'suggestedCategoryTags', 'modelIdentifier', 'promptTemplateVersion',
    'attemptSetAuthoritative', 'attemptOverwriteOriginalText', 'idempotencyKey',
  ]),
};

function setPrivateNoStoreHeaders(res: Response): void {
  res.setHeader('Cache-Control', 'private, no-store');
  res.setHeader('Pragma', 'no-cache');
  res.setHeader('X-Content-Type-Options', 'nosniff');
}

function setReadCacheHeaders(res: Response, isAuthenticated: boolean): void {
  res.setHeader('X-Content-Type-Options', 'nosniff');
  if (isAuthenticated) {
    res.setHeader('Cache-Control', 'private, no-store');
    res.setHeader('Pragma', 'no-cache');
  } else {
    res.setHeader('Cache-Control', 'public, max-age=60');
  }
}

const VALID_CLIENT_STATUSES = new Set([400, 401, 403, 404, 409, 413, 422, 429]);

/**
 * Unified Stage 30-C HTTP Error Mapping for all 14 Legal-Regulatory handlers.
 * - Never leaks Firestore internals, file paths, collection names, or stack traces.
 * - Attaches a deterministic `correlationId` to all 500 responses.
 * - Preserves distinct 409 codes (`IDEMPOTENCY_KEY_REUSED` vs `CONCURRENT_MODIFICATION_CONFLICT`).
 */
export function handleLegalRegulatoryHttpError(err: unknown, res: Response): void {
  if (res.headersSent) return;
  setPrivateNoStoreHeaders(res);
  if (err instanceof LegalRegulatoryError) {
    if (err.statusCode === 503 || err.code === 'PERSISTENCE_UNAVAILABLE') {
      res.status(503).json({ status: 'error', code: 'PERSISTENCE_UNAVAILABLE', message: 'Legal-regulatory service dependency is temporarily unavailable.' });
      return;
    }
    if (VALID_CLIENT_STATUSES.has(err.statusCode)) {
      res.status(err.statusCode).json({ status: 'error', code: err.code, message: err.message });
      return;
    }
  }
  const rawStatus = (err as { status?: number; statusCode?: number })?.status ?? (err as { statusCode?: number })?.statusCode;
  if (rawStatus === 413) {
    res.status(413).json({ status: 'error', code: 'PAYLOAD_TOO_LARGE', message: 'Request body exceeds maximum allowed size.' });
    return;
  }
  const correlationId = `lr_err_${crypto.randomUUID()}`;
  res.status(500).json({ status: 'error', code: 'INTERNAL_SERVER_ERROR', correlationId, message: 'An unexpected error occurred while processing the legal-regulatory request.' });
}

function assertObjectBody(req: Request, allowedFields?: ReadonlySet<string>, opLabel?: string): Record<string, unknown> {
  if (!req.body || typeof req.body !== 'object' || Array.isArray(req.body)) {
    throw new LegalRegulatoryError('VALIDATION_ERROR', 'Request body must be a JSON object.', 400);
  }
  const body = req.body as Record<string, unknown>;
  assertSafeJsonPayload(body);
  if (allowedFields && opLabel) {
    assertAllowedObjectFields(body, allowedFields, opLabel);
  }
  if (typeof body.internalReviewerNotes === 'string' && body.internalReviewerNotes.length > 5000) {
    throw new LegalRegulatoryError('VALIDATION_ERROR', 'Field internalReviewerNotes exceeds maximum length of 5000 characters.', 400);
  }
  if (typeof body.verificationMethodNote === 'string' && body.verificationMethodNote.length > 5000) {
    throw new LegalRegulatoryError('VALIDATION_ERROR', 'Field verificationMethodNote exceeds maximum length of 5000 characters.', 400);
  }
  return body;
}

function requireParam(req: Request, name: string): string {
  return assertSafeEntityId(req.params?.[name], name, 128);
}

function requireIdempotencyKey(req: Request, body: Record<string, unknown>): string {
  const headerVal = req.headers['idempotency-key'];
  const fromHeader =
    typeof headerVal === 'string'
      ? headerVal.trim()
      : Array.isArray(headerVal) && typeof headerVal[0] === 'string'
        ? headerVal[0].trim()
        : '';
  const fromBody = typeof body.idempotencyKey === 'string' ? body.idempotencyKey.trim() : '';
  return assertValidIdempotencyKey(fromHeader || fromBody);
}

function readOptionalQueryString(req: Request, key: string, maxLength = 500): string | undefined {
  const raw = req.query?.[key];
  if (raw === undefined) return undefined;
  if (typeof raw !== 'string') {
    throw new LegalRegulatoryError('VALIDATION_ERROR', `Query parameter '${key}' must be a single string.`, 400);
  }
  const trimmed = raw.trim();
  if (trimmed.length === 0) return undefined;
  if (trimmed.length > maxLength) {
    throw new LegalRegulatoryError('VALIDATION_ERROR', `Query parameter '${key}' exceeds maximum length of ${maxLength} characters.`, 400);
  }
  return trimmed;
}

function readOptionalQueryBoolean(req: Request, key: string): boolean | undefined {
  const raw = readOptionalQueryString(req, key, 10);
  if (raw === undefined) return undefined;
  if (raw === 'true' || raw === '1') return true;
  if (raw === 'false' || raw === '0') return false;
  throw new LegalRegulatoryError('VALIDATION_ERROR', `Query parameter '${key}' must be a boolean.`, 400);
}

function readOptionalQueryInt(req: Request, key: string, min: number, max: number): number | undefined {
  const raw = readOptionalQueryString(req, key, 20);
  if (raw === undefined) return undefined;
  if (!/^-?\d+$/.test(raw)) {
    throw new LegalRegulatoryError('VALIDATION_ERROR', `Query parameter '${key}' must be an integer.`, 400);
  }
  const num = Number.parseInt(raw, 10);
  if (!Number.isInteger(num) || num < min || num > max) {
    throw new LegalRegulatoryError('VALIDATION_ERROR', `Query parameter '${key}' must be between ${min} and ${max}.`, 400);
  }
  return num;
}

function assertOptionalPositiveInt(raw: unknown, fieldName: string): number | undefined {
  if (raw === undefined) return undefined;
  if (typeof raw !== 'number' || !Number.isInteger(raw) || raw < 1) {
    throw new LegalRegulatoryError('VALIDATION_ERROR', `${fieldName} must be a positive integer.`, 400);
  }
  return raw;
}

function buildGeneralEvaluationInput(body: Record<string, unknown>): PropertyRegulatoryEvaluationInput {
  const evalInput: PropertyRegulatoryEvaluationInput = {
    countryCode: body.countryCode === 'IR' ? 'IR' : undefined,
    provinceId: typeof body.provinceId === 'string' ? (body.provinceId.trim() as ProvinceId) : undefined,
    cityId: typeof body.cityId === 'string' ? (body.cityId.trim() as SupportedCityId) : undefined,
    districtNumber: typeof body.districtNumber === 'number' ? body.districtNumber : undefined,
    neighborhoodId: typeof body.neighborhoodId === 'string' ? body.neighborhoodId.trim() : undefined,
    designatedZoneCode: typeof body.designatedZoneCode === 'string' ? body.designatedZoneCode.trim() : undefined,
    propertyCategory: typeof body.propertyCategory === 'string' ? (body.propertyCategory as PropertyCategoryType) : undefined,
    transactionContext: typeof body.transactionContext === 'string' ? (body.transactionContext as TransactionContextType) : undefined,
    floorsCount: typeof body.floorsCount === 'number' ? body.floorsCount : undefined,
    plotAreaSqm: typeof body.plotAreaSqm === 'number' ? body.plotAreaSqm : undefined,
    buildingAgeYears: typeof body.buildingAgeYears === 'number' ? body.buildingAgeYears : undefined,
    isWornOutTextureBaftFarsoodeh:
      typeof body.isWornOutTextureBaftFarsoodeh === 'boolean' ? body.isWornOutTextureBaftFarsoodeh : undefined,
    isNearActiveFaultLine:
      typeof body.isNearActiveFaultLine === 'boolean' ? body.isNearActiveFaultLine : undefined,
    asOfDateIso: typeof body.asOfDateIso === 'string' ? assertValidIsoDate(body.asOfDateIso, 'asOfDateIso') : undefined,
  };
  const hasAnySignal = Boolean(
    evalInput.provinceId || evalInput.cityId || evalInput.districtNumber !== undefined ||
    evalInput.neighborhoodId || evalInput.propertyCategory || evalInput.transactionContext,
  );
  if (!hasAnySignal) {
    throw new LegalRegulatoryError(
      'VALIDATION_ERROR',
      'General regulatory evaluation requires either propertyId or at least one geographic/property classification parameter.',
      400,
    );
  }
  return evalInput;
}

export function createLegalRegulatoryRouteHandlers(deps: LegalRegulatoryRouteHandlersDeps) {
  // Per-instance in-flight serialization queue keyed by SHA-256([operation, actorId, key])
  // prevents duplicate concurrent execution within the same Node process before Firestore commits.
  const inFlightIdempotency = new Map<string, Promise<unknown>>();

  const runAdminMutation = async (
    req: Request,
    res: Response,
    operation: string,
    allowedFields: ReadonlySet<string>,
    statusCode: 200 | 201,
    executor: (ctx: {
      actor: LegalRegulatoryActorContext;
      body: Record<string, unknown>;
      idempotencyKey: string;
      facade: LegalRegulatoryModuleFacade;
    }) => Promise<unknown>,
  ): Promise<void> => {
    try {
      setPrivateNoStoreHeaders(res);
      const actor = await resolveLegalRegulatoryActor(req, deps.authDeps);
      assertRegulatoryAdminMutationActor(actor);
      const body = assertObjectBody(req, allowedFields, operation);
      const idempotencyKey = requireIdempotencyKey(req, body);
      const lockId = buildIdempotencyDocumentId(operation, actor.actorId, idempotencyKey);

      const prior = inFlightIdempotency.get(lockId);
      const runWork = async (): Promise<unknown> => {
        if (prior) {
          await prior.catch(() => undefined);
        }
        return executor({ actor, body, idempotencyKey, facade: deps.getFacade() });
      };

      const currentPromise = runWork();
      inFlightIdempotency.set(lockId, currentPromise);
      try {
        const data = await currentPromise;
        res.status(statusCode).json({ status: 'ok', data });
      } finally {
        if (inFlightIdempotency.get(lockId) === currentPromise) {
          inFlightIdempotency.delete(lockId);
        }
      }
    } catch (err) {
      handleLegalRegulatoryHttpError(err, res);
    }
  };

  const sanitizeForViewer = <T>(payload: T, actor: LegalRegulatoryActorContext): T =>
    isPrivilegedRegulatoryViewer(actor) ? payload : redactPrivateFieldsDeep(payload);

  return {
    // 01. GET /provisions/search
    async handleSearchProvisions(req: Request, res: Response): Promise<void> {
      try {
        const actor = await resolveLegalRegulatoryActor(req, deps.authDeps);
        const query: LegalRegulatorySearchQuery = {
          keyword: readOptionalQueryString(req, 'keyword', 500),
          issuingAuthority: readOptionalQueryString(req, 'issuingAuthority', 300),
          countryCode: readOptionalQueryString(req, 'countryCode', 8) === 'IR' ? 'IR' : undefined,
          provinceId: readOptionalQueryString(req, 'provinceId', 64) as ProvinceId | undefined,
          cityId: readOptionalQueryString(req, 'cityId', 64) as SupportedCityId | undefined,
          districtNumber: readOptionalQueryInt(req, 'districtNumber', 1, 50),
          neighborhoodId: readOptionalQueryString(req, 'neighborhoodId', 128),
          sourceCategory: readOptionalQueryString(req, 'sourceCategory', 64) as RegulatorySourceCategory | undefined,
          documentCategory: readOptionalQueryString(req, 'documentCategory', 64) as RegulatoryDocumentCategory | undefined,
          propertyCategory: readOptionalQueryString(req, 'propertyCategory', 64) as PropertyCategoryType | undefined,
          publishedFromIso: readOptionalQueryString(req, 'publishedFromIso', 64),
          publishedToIso: readOptionalQueryString(req, 'publishedToIso', 64),
          effectiveAsOfDateIso: readOptionalQueryString(req, 'effectiveAsOfDateIso', 64),
          includeHistoricalOrRepealed: readOptionalQueryBoolean(req, 'includeHistoricalOrRepealed'),
          includeUnverifiedDrafts: readOptionalQueryBoolean(req, 'includeUnverifiedDrafts'),
          limit: readOptionalQueryInt(req, 'limit', 1, 100),
          cursor: readOptionalQueryString(req, 'cursor', 64) ?? null,
        };
        const raw = await deps.getFacade().applicabilityAndProfileService.searchProvisions(query, actor);
        const data = sanitizeForViewer(raw, actor);
        setReadCacheHeaders(res, actor.isAuthenticated);
        res.status(200).json({ status: 'ok', data });
      } catch (err) {
        handleLegalRegulatoryHttpError(err, res);
      }
    },

    // 02. GET /sources/:sourceId
    async handleGetRegulatorySource(req: Request, res: Response): Promise<void> {
      try {
        const actor = await resolveLegalRegulatoryActor(req, deps.authDeps);
        const sourceId = requireParam(req, 'sourceId');
        const raw = await deps.getFacade().sourceAndProvisionService.getRegulatorySourceForViewer(sourceId, actor);
        const data = sanitizeForViewer(raw, actor);
        setReadCacheHeaders(res, actor.isAuthenticated);
        res.status(200).json({ status: 'ok', data });
      } catch (err) {
        handleLegalRegulatoryHttpError(err, res);
      }
    },

    // 03. POST /sources
    handleCreateRegulatorySource: (req: Request, res: Response) =>
      runAdminMutation(req, res, 'createRegulatorySource', ALLOWED_FIELDS.createSource, 201, ({ actor, body, idempotencyKey, facade }) =>
        facade.sourceAndProvisionService.createRegulatorySource({ ...(body as unknown as CreateRegulatorySourceInput), idempotencyKey }, actor),
      ),

    // 04. POST /sources/:sourceId/verify
    handleVerifyRegulatorySource: (req: Request, res: Response) =>
      runAdminMutation(req, res, 'verifyRegulatorySource', ALLOWED_FIELDS.verifySource, 200, ({ actor, body, idempotencyKey, facade }) => {
        const sourceId = requireParam(req, 'sourceId');
        const note = typeof body.verificationMethodNote === 'string' ? body.verificationMethodNote : '';
        const expectedVersion = assertOptionalPositiveInt(body.expectedVersion, 'expectedVersion');
        return facade.sourceAndProvisionService.verifyRegulatorySource(sourceId, note, actor, expectedVersion, idempotencyKey);
      }),

    // 05. POST /documents
    handleCreateRegulatoryDocument: (req: Request, res: Response) =>
      runAdminMutation(req, res, 'createRegulatoryDocument', ALLOWED_FIELDS.createDocument, 201, ({ actor, body, idempotencyKey, facade }) =>
        facade.sourceAndProvisionService.createRegulatoryDocument({ ...(body as unknown as CreateRegulatoryDocumentInput), idempotencyKey }, actor),
      ),

    // 06. GET /provisions/:provisionId
    async handleGetProvision(req: Request, res: Response): Promise<void> {
      try {
        const actor = await resolveLegalRegulatoryActor(req, deps.authDeps);
        const provisionId = requireParam(req, 'provisionId');
        const raw = await deps.getFacade().sourceAndProvisionService.getProvisionForViewer(provisionId, actor);
        const data = sanitizeForViewer(raw, actor);
        setReadCacheHeaders(res, actor.isAuthenticated);
        res.status(200).json({ status: 'ok', data });
      } catch (err) {
        handleLegalRegulatoryHttpError(err, res);
      }
    },

    // 07. GET /provisions/:provisionId/as-of
    async handleGetProvisionAsOf(req: Request, res: Response): Promise<void> {
      try {
        const actor = await resolveLegalRegulatoryActor(req, deps.authDeps);
        const provisionId = requireParam(req, 'provisionId');
        const rawDate = readOptionalQueryString(req, 'asOfDateIso', 64) ?? readOptionalQueryString(req, 'date', 64);
        if (!rawDate) {
          throw new LegalRegulatoryError('VALIDATION_ERROR', "Query parameter 'asOfDateIso' is required.", 400);
        }
        const asOfDateIso = assertValidIsoDate(rawDate, 'asOfDateIso');
        const raw = await deps.getFacade().sourceAndProvisionService.getProvisionVersionAsOfDate(provisionId, asOfDateIso, actor);
        const data = sanitizeForViewer(raw, actor);
        setReadCacheHeaders(res, actor.isAuthenticated);
        res.status(200).json({ status: 'ok', data });
      } catch (err) {
        handleLegalRegulatoryHttpError(err, res);
      }
    },

    // 08. POST /provisions
    handleCreateProvision: (req: Request, res: Response) =>
      runAdminMutation(req, res, 'createRegulatoryProvision', ALLOWED_FIELDS.createProvision, 201, ({ actor, body, idempotencyKey, facade }) =>
        facade.sourceAndProvisionService.createRegulatoryProvision({ ...(body as unknown as CreateRegulatoryProvisionInput), idempotencyKey }, actor),
      ),

    // 09. POST /provisions/:provisionId/changes
    handleRecordProvisionChange: (req: Request, res: Response) =>
      runAdminMutation(req, res, 'recordRegulatoryChange', ALLOWED_FIELDS.recordChange, 201, ({ actor, body, idempotencyKey, facade }) => {
        const expectedPreviousVersion = assertOptionalPositiveInt(body.expectedPreviousVersion, 'expectedPreviousVersion');
        return facade.sourceAndProvisionService.recordRegulatoryChangeAndVersion(
          {
            ...(body as unknown as RecordRegulatoryChangeInput),
            targetProvisionId: requireParam(req, 'provisionId'),
            expectedPreviousVersion,
            idempotencyKey,
          },
          actor,
        );
      }),

    // 10. POST /conflicts
    handleRegisterProvisionConflict: (req: Request, res: Response) =>
      runAdminMutation(req, res, 'registerProvisionConflict', ALLOWED_FIELDS.registerConflict, 201, ({ actor, body, idempotencyKey, facade }) =>
        facade.sourceAndProvisionService.registerProvisionConflict({ ...(body as unknown as RegisterProvisionConflictInput), idempotencyKey }, actor),
      ),

    // 11. POST /applicability-rules
    handleCreateApplicabilityRule: (req: Request, res: Response) =>
      runAdminMutation(req, res, 'createApplicabilityRule', ALLOWED_FIELDS.createApplicabilityRule, 201, ({ actor, body, idempotencyKey, facade }) =>
        facade.applicabilityAndProfileService.createApplicabilityRule({ ...(body as unknown as CreateApplicabilityRuleInput), idempotencyKey }, actor),
      ),

    // 12. POST /compliance-requirements
    handleCreateComplianceRequirement: (req: Request, res: Response) =>
      runAdminMutation(req, res, 'createComplianceRequirement', ALLOWED_FIELDS.createComplianceRequirement, 201, ({ actor, body, idempotencyKey, facade }) =>
        facade.applicabilityAndProfileService.createComplianceRequirement({ ...(body as unknown as CreateComplianceRequirementInput), idempotencyKey }, actor),
      ),

    // 13. POST /property-profile/evaluate (read-only computational evaluation — no durable state write)
    async handleEvaluatePropertyProfile(req: Request, res: Response): Promise<void> {
      try {
        setPrivateNoStoreHeaders(res);
        const actor = await resolveLegalRegulatoryActor(req, deps.authDeps);
        assertAuthenticatedLegalActor(actor);
        const body = assertObjectBody(req);
        const rawPropertyId = body.propertyId !== undefined ? assertSafeEntityId(body.propertyId, 'propertyId', 128) : undefined;
        const evalInput: PropertyRegulatoryEvaluationInput = rawPropertyId
          ? {
              propertyId: rawPropertyId,
              transactionContext: typeof body.transactionContext === 'string' ? (body.transactionContext as TransactionContextType) : undefined,
              asOfDateIso: typeof body.asOfDateIso === 'string' ? assertValidIsoDate(body.asOfDateIso, 'asOfDateIso') : undefined,
            }
          : buildGeneralEvaluationInput(body);
        const raw = await deps.getFacade().applicabilityAndProfileService.buildPropertyRegulatoryProfile(evalInput, actor);
        res.status(200).json({ status: 'ok', data: redactPrivateFieldsDeep(raw) });
      } catch (err) {
        handleLegalRegulatoryHttpError(err, res);
      }
    },

    // 14. POST /ai-summaries
    handleRecordAiSummary: (req: Request, res: Response) =>
      runAdminMutation(req, res, 'recordNonAuthoritativeAiSuggestion', ALLOWED_FIELDS.recordAiSummary, 201, ({ actor, body, idempotencyKey, facade }) =>
        facade.applicabilityAndProfileService.recordNonAuthoritativeAiSuggestion({ ...(body as unknown as RecordNonAuthoritativeAiSuggestionInput), idempotencyKey }, actor),
      ),
  };
}
