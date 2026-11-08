import { Router, type Request, type Response } from 'express';
import {
  CoreApiError,
  buildErrorEnvelope,
  buildSuccessEnvelope,
  resolveCorrelationId,
} from '../core';
import type { DocumentManagementService } from './service';
import type {
  DocumentCategory,
  DocumentConfidentialityLevel,
  DocumentLifecycleState,
  DocumentManagementDependencies,
} from './types';

function sendSuccessResponse<T>(res: Response, correlationId: string, data: T, status = 200) {
  res.status(status).json(buildSuccessEnvelope(data, correlationId));
}

function sendErrorResponse(res: Response, correlationId: string, err: unknown) {
  if (err instanceof CoreApiError) {
    res.status(err.status).json(buildErrorEnvelope(err.code, err.message, correlationId, err.details));
    return;
  }
  res.status(500).json(
    buildErrorEnvelope(
      'INTERNAL_ERROR',
      err instanceof Error ? err.message : 'Unexpected document management error.',
      correlationId,
    ),
  );
}

export function createDocumentManagementRouter(
  service: DocumentManagementService,
  deps: DocumentManagementDependencies,
): Router {
  const router = Router();

  async function resolveActor(req: Request): Promise<{
    uid?: string;
    email?: string;
    isAdmin: boolean;
  }> {
    const authHeader = req.headers.authorization;
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      return { isAdmin: false };
    }
    const token = authHeader.slice(7).trim();
    if (!deps.tokenVerifier) {
      throw new CoreApiError('UNAUTHORIZED', 401, 'Authentication verifier is not configured.');
    }
    const verified = await deps.tokenVerifier.verifyIdToken(token);
    let isAdmin = false;
    if (verified.email && deps.primaryAdminEmails?.includes(verified.email.toLowerCase())) {
      isAdmin = true;
    } else if (deps.adminStore && (await deps.adminStore.isUserAdmin(verified.uid, verified.email))) {
      isAdmin = true;
    }
    return {
      uid: verified.uid,
      email: verified.email,
      isAdmin,
    };
  }

  async function requireAuth(req: Request) {
    const actor = await resolveActor(req);
    if (!actor.uid) {
      throw new CoreApiError('UNAUTHORIZED', 401, 'Authentication is required.');
    }
    return { uid: actor.uid, email: actor.email, isAdmin: actor.isAdmin };
  }

  async function requireAdmin(req: Request) {
    const actor = await requireAuth(req);
    if (!actor.isAdmin) {
      throw new CoreApiError('FORBIDDEN', 403, 'Administrative privilege is required.');
    }
    return actor;
  }

  // Register a new document
  router.post('/register', async (req: Request, res: Response) => {
    const correlationId = resolveCorrelationId(req);
    try {
      const actor = await requireAuth(req);
      const body = (req.body ?? {}) as Record<string, unknown>;
      const doc = await service.registerDocument({
        actorUid: actor.uid,
        isAdmin: actor.isAdmin,
        documentId: typeof body.documentId === 'string' ? body.documentId : undefined,
        category: String(body.category ?? 'PROPERTY_DOCUMENT') as DocumentCategory,
        subcategory: typeof body.subcategory === 'string' ? body.subcategory : undefined,
        documentType: String(body.documentType ?? ''),
        storageObjectKey: String(body.storageObjectKey ?? ''),
        originalFilename: String(body.originalFilename ?? ''),
        relatedEntities: (body.relatedEntities as Record<string, string>) ?? {},
        authorizedParticipantUids: Array.isArray(body.authorizedParticipantUids)
          ? body.authorizedParticipantUids.map(String)
          : [],
        requestedConfidentiality: body.requestedConfidentiality
          ? (String(body.requestedConfidentiality) as DocumentConfidentialityLevel)
          : undefined,
        expiresAtIso: typeof body.expiresAtIso === 'string' ? body.expiresAtIso : undefined,
      });
      sendSuccessResponse(res, correlationId, doc, 201);
    } catch (err) {
      sendErrorResponse(res, correlationId, err);
    }
  });

  // Upload a replacement document version
  router.post('/:documentId/versions', async (req: Request, res: Response) => {
    const correlationId = resolveCorrelationId(req);
    try {
      const actor = await requireAuth(req);
      const body = (req.body ?? {}) as Record<string, unknown>;
      const updated = await service.createDocumentVersion({
        actorUid: actor.uid,
        isAdmin: actor.isAdmin,
        documentId: String(req.params.documentId),
        storageObjectKey: String(body.storageObjectKey ?? ''),
        originalFilename: String(body.originalFilename ?? ''),
        replacementReason: String(body.replacementReason ?? ''),
      });
      sendSuccessResponse(res, correlationId, updated);
    } catch (err) {
      sendErrorResponse(res, correlationId, err);
    }
  });

  // Retrieve document metadata with strict access control
  router.get('/:documentId', async (req: Request, res: Response) => {
    const correlationId = resolveCorrelationId(req);
    try {
      const actor = await resolveActor(req);
      const doc = service.getDocumentMetadata({
        documentId: String(req.params.documentId),
        actorUid: actor.uid,
        isAdmin: actor.isAdmin,
        isPublicListingEndpoint: req.query.publicListing === 'true',
      });
      sendSuccessResponse(res, correlationId, doc);
    } catch (err) {
      sendErrorResponse(res, correlationId, err);
    }
  });

  // Generate time-bounded signed download URL
  router.post('/:documentId/download-url', async (req: Request, res: Response) => {
    const correlationId = resolveCorrelationId(req);
    try {
      const actor = await resolveActor(req);
      const body = (req.body ?? {}) as Record<string, unknown>;
      const result = await service.generateSignedDownloadUrl({
        documentId: String(req.params.documentId),
        versionNumber: body.versionNumber !== undefined ? Number(body.versionNumber) : undefined,
        actorUid: actor.uid,
        isAdmin: actor.isAdmin,
        expiresInSeconds: body.expiresInSeconds !== undefined ? Number(body.expiresInSeconds) : undefined,
      });
      sendSuccessResponse(res, correlationId, result);
    } catch (err) {
      sendErrorResponse(res, correlationId, err);
    }
  });

  // Create a controlled sharing grant
  router.post('/:documentId/shares', async (req: Request, res: Response) => {
    const correlationId = resolveCorrelationId(req);
    try {
      const actor = await requireAuth(req);
      const body = (req.body ?? {}) as Record<string, unknown>;
      const grant = service.createSharingGrant({
        actorUid: actor.uid,
        isAdmin: actor.isAdmin,
        documentId: String(req.params.documentId),
        versionNumber: body.versionNumber !== undefined ? Number(body.versionNumber) : undefined,
        recipientUid: String(body.recipientUid ?? ''),
        purpose: String(body.purpose ?? ''),
        accessScope: body.accessScope === 'VIEW_METADATA_ONLY' ? 'VIEW_METADATA_ONLY' : 'PREVIEW_AND_DOWNLOAD',
        canDownload: body.canDownload !== undefined ? Boolean(body.canDownload) : true,
        canReshare: Boolean(body.canReshare),
        expiresInHours: body.expiresInHours !== undefined ? Number(body.expiresInHours) : undefined,
      });
      sendSuccessResponse(res, correlationId, grant, 201);
    } catch (err) {
      sendErrorResponse(res, correlationId, err);
    }
  });

  // Revoke a sharing grant
  router.post('/shares/:grantId/revoke', async (req: Request, res: Response) => {
    const correlationId = resolveCorrelationId(req);
    try {
      const actor = await requireAuth(req);
      const revoked = service.revokeSharingGrant({
        actorUid: actor.uid,
        isAdmin: actor.isAdmin,
        grantId: String(req.params.grantId),
      });
      sendSuccessResponse(res, correlationId, revoked);
    } catch (err) {
      sendErrorResponse(res, correlationId, err);
    }
  });

  // Search accessible documents
  router.get('/', async (req: Request, res: Response) => {
    const correlationId = resolveCorrelationId(req);
    try {
      const actor = await resolveActor(req);
      const results = service.searchAccessibleDocuments({
        actorUid: actor.uid,
        isAdmin: actor.isAdmin,
        category: req.query.category ? (String(req.query.category) as DocumentCategory) : undefined,
        propertyId: req.query.propertyId ? String(req.query.propertyId) : undefined,
        transactionId: req.query.transactionId ? String(req.query.transactionId) : undefined,
        tenancyId: req.query.tenancyId ? String(req.query.tenancyId) : undefined,
        brokerageAgreementId: req.query.brokerageAgreementId ? String(req.query.brokerageAgreementId) : undefined,
        lifecycleState: req.query.lifecycleState
          ? (String(req.query.lifecycleState) as DocumentLifecycleState)
          : undefined,
      });
      sendSuccessResponse(res, correlationId, results);
    } catch (err) {
      sendErrorResponse(res, correlationId, err);
    }
  });

  // Admin: verify/reject a document version
  router.post('/admin/:documentId/versions/:versionNumber/verify', async (req: Request, res: Response) => {
    const correlationId = resolveCorrelationId(req);
    try {
      const admin = await requireAdmin(req);
      const body = (req.body ?? {}) as Record<string, unknown>;
      const updated = service.verifyDocumentVersion({
        reviewerUid: admin.uid,
        isAdminOrAuthorizedVerifier: true,
        documentId: String(req.params.documentId),
        versionNumber: Number(req.params.versionNumber),
        decision: (body.decision ?? 'APPROVE') as 'APPROVE' | 'REJECT' | 'REQUEST_REVISION',
        verificationScope: (body.verificationScope ?? 'MANUAL_ADMIN') as
          | 'MANUAL_ADMIN'
          | 'AUTHORIZED_PROFESSIONAL'
          | 'LEGAL_COMPLIANCE',
        reason: String(body.reason ?? ''),
      });
      sendSuccessResponse(res, correlationId, updated);
    } catch (err) {
      sendErrorResponse(res, correlationId, err);
    }
  });

  // Admin: transition document lifecycle state
  router.post('/admin/:documentId/lifecycle', async (req: Request, res: Response) => {
    const correlationId = resolveCorrelationId(req);
    try {
      const admin = await requireAdmin(req);
      const body = (req.body ?? {}) as Record<string, unknown>;
      const updated = service.transitionDocumentLifecycle({
        actorUid: admin.uid,
        isAdmin: true,
        documentId: String(req.params.documentId),
        toState: String(body.toState ?? '') as DocumentLifecycleState,
        reason: String(body.reason ?? ''),
      });
      sendSuccessResponse(res, correlationId, updated);
    } catch (err) {
      sendErrorResponse(res, correlationId, err);
    }
  });

  // Admin: place or release legal hold
  router.post('/admin/:documentId/legal-hold', async (req: Request, res: Response) => {
    const correlationId = resolveCorrelationId(req);
    try {
      const admin = await requireAdmin(req);
      const body = (req.body ?? {}) as Record<string, unknown>;
      const updated = service.placeOrReleaseLegalHold({
        actorUid: admin.uid,
        isAdmin: true,
        documentId: String(req.params.documentId),
        legalHoldActive: Boolean(body.legalHoldActive),
        reason: String(body.reason ?? ''),
      });
      sendSuccessResponse(res, correlationId, updated);
    } catch (err) {
      sendErrorResponse(res, correlationId, err);
    }
  });

  // Admin: verify document integrity against object storage
  router.post('/admin/:documentId/verify-integrity', async (req: Request, res: Response) => {
    const correlationId = resolveCorrelationId(req);
    try {
      await requireAdmin(req);
      const body = (req.body ?? {}) as Record<string, unknown>;
      const report = await service.verifyDocumentIntegrity({
        documentId: String(req.params.documentId),
        versionNumber: body.versionNumber !== undefined ? Number(body.versionNumber) : undefined,
      });
      sendSuccessResponse(res, correlationId, report);
    } catch (err) {
      sendErrorResponse(res, correlationId, err);
    }
  });

  // Admin: run retention & expiration batch job
  router.post('/admin/retention/run', async (req: Request, res: Response) => {
    const correlationId = resolveCorrelationId(req);
    try {
      const admin = await requireAdmin(req);
      const body = (req.body ?? {}) as Record<string, unknown>;
      const result = service.runRetentionAndExpirationJob({
        actorUid: admin.uid,
        idempotencyKey: String(body.idempotencyKey ?? correlationId),
      });
      sendSuccessResponse(res, correlationId, result);
    } catch (err) {
      sendErrorResponse(res, correlationId, err);
    }
  });

  return router;
}
