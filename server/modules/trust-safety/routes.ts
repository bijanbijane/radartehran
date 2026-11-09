import express, { type Request, type Response } from 'express';
import {
  authorizePrincipal,
  buildErrorEnvelope,
  buildSuccessEnvelope,
  CoreApiError,
  extractAuthenticatedPrincipal,
  resolveCorrelationId,
  withStandardErrorBoundary,
} from '../core';
import {
  validateAttachEvidenceInput,
  validateCreateEnforcementDecisionInput,
  validateCreateModerationCaseInput,
  validateSubmitAppealInput,
  validateSubmitUserReportInput,
} from './lifecycleAndValidation';
import { sanitizeEvidenceForViewer } from './riskAndEvidenceEngine';
import { TrustSafetyService } from './service';
import type { TrustSafetyModuleDependencies } from './types';

export function createTrustSafetyRouter(deps: TrustSafetyModuleDependencies): express.Router {
  const router = express.Router();
  const service = new TrustSafetyService(deps);

  // 1. POST /reports — Submit a user report
  router.post(
    '/reports',
    withStandardErrorBoundary(async (req: Request, res: Response) => {
      const correlationId = resolveCorrelationId(req);
      const identity = await extractAuthenticatedPrincipal(req, deps.tokenVerifier);
      if (!identity.ok || !identity.principal) {
        res.status(identity.status ?? 401).json(buildErrorEnvelope('UNAUTHENTICATED', identity.reason ?? 'Auth required.', correlationId));
        return;
      }

      const validation = validateSubmitUserReportInput(req.body);
      if (!validation.ok || !validation.value) {
        throw new CoreApiError('VALIDATION_FAILED', 400, 'Invalid report input.', validation.issues);
      }

      const idempotencyKey = (req.headers['idempotency-key'] as string) || `idem_${Date.now()}`;
      const report = await service.submitUserReport({
        reporterUid: identity.principal.uid,
        input: validation.value,
        idempotencyKey,
      });

      res.status(201).json(buildSuccessEnvelope(report, correlationId));
    }),
  );

  // 2. GET /reports/:id — View report details (private to reporter or privileged admin)
  router.get(
    '/reports/:id',
    withStandardErrorBoundary(async (req: Request, res: Response) => {
      const correlationId = resolveCorrelationId(req);
      const identity = await extractAuthenticatedPrincipal(req, deps.tokenVerifier);
      if (!identity.ok || !identity.principal) {
        res.status(identity.status ?? 401).json(buildErrorEnvelope('UNAUTHENTICATED', identity.reason ?? 'Auth required.', correlationId));
        return;
      }

      const authz = await authorizePrincipal(
        identity.principal,
        { minimumRole: 'verified_user' },
        deps.adminStore,
        deps.primaryAdminEmails,
      );
      const isPrivileged = authz.effectiveRole === 'primary_admin' || authz.effectiveRole === 'delegated_admin';

      const report = await service.getUserReport(req.params.id, {
        uid: identity.principal.uid,
        isPrivileged,
      });

      res.status(200).json(buildSuccessEnvelope(report, correlationId));
    }),
  );

  // 3. POST /cases — Create a moderation case (privileged)
  router.post(
    '/cases',
    withStandardErrorBoundary(async (req: Request, res: Response) => {
      const correlationId = resolveCorrelationId(req);
      const identity = await extractAuthenticatedPrincipal(req, deps.tokenVerifier);
      if (!identity.ok || !identity.principal) {
        res.status(identity.status ?? 401).json(buildErrorEnvelope('UNAUTHENTICATED', identity.reason ?? 'Auth required.', correlationId));
        return;
      }

      const authz = await authorizePrincipal(
        identity.principal,
        { minimumRole: 'delegated_admin' },
        deps.adminStore,
        deps.primaryAdminEmails,
      );
      if (!authz.allowed) {
        throw new CoreApiError('FORBIDDEN', 403, 'Admin privileges required to open moderation cases.');
      }

      const validation = validateCreateModerationCaseInput(req.body);
      if (!validation.ok || !validation.value) {
        throw new CoreApiError('VALIDATION_FAILED', 400, 'Invalid case input.', validation.issues);
      }

      const caseRecord = await service.createModerationCase({
        input: validation.value,
        creatorUid: identity.principal.uid,
      });

      res.status(201).json(buildSuccessEnvelope(caseRecord, correlationId));
    }),
  );

  // 4. GET /cases/:id — View case details (privileged)
  router.get(
    '/cases/:id',
    withStandardErrorBoundary(async (req: Request, res: Response) => {
      const correlationId = resolveCorrelationId(req);
      const identity = await extractAuthenticatedPrincipal(req, deps.tokenVerifier);
      if (!identity.ok || !identity.principal) {
        res.status(identity.status ?? 401).json(buildErrorEnvelope('UNAUTHENTICATED', identity.reason ?? 'Auth required.', correlationId));
        return;
      }

      const authz = await authorizePrincipal(
        identity.principal,
        { minimumRole: 'delegated_admin' },
        deps.adminStore,
        deps.primaryAdminEmails,
      );
      if (!authz.allowed) {
        throw new CoreApiError('FORBIDDEN', 403, 'Admin privileges required to view moderation cases.');
      }

      const caseRecord = await deps.repository.getModerationCase(req.params.id);
      if (!caseRecord) {
        throw new CoreApiError('NOT_FOUND', 404, 'Moderation case not found.');
      }

      const evidence = await deps.repository.getEvidenceRecords(caseRecord.id);
      const sanitizedEvidence = sanitizeEvidenceForViewer(evidence, {
        uid: identity.principal.uid,
        role: authz.effectiveRole,
      });

      res.status(200).json(buildSuccessEnvelope({ case: caseRecord, evidence: sanitizedEvidence }, correlationId));
    }),
  );

  // 5. POST /cases/:id/notes — Add internal investigation note
  router.post(
    '/cases/:id/notes',
    withStandardErrorBoundary(async (req: Request, res: Response) => {
      const correlationId = resolveCorrelationId(req);
      const identity = await extractAuthenticatedPrincipal(req, deps.tokenVerifier);
      if (!identity.ok || !identity.principal) {
        res.status(identity.status ?? 401).json(buildErrorEnvelope('UNAUTHENTICATED', identity.reason ?? 'Auth required.', correlationId));
        return;
      }

      const authz = await authorizePrincipal(
        identity.principal,
        { minimumRole: 'delegated_admin' },
        deps.adminStore,
        deps.primaryAdminEmails,
      );
      if (!authz.allowed) {
        throw new CoreApiError('FORBIDDEN', 403, 'Admin privileges required to add investigation notes.');
      }

      const noteText = typeof req.body?.note === 'string' ? req.body.note.trim() : '';
      if (noteText.length < 3) {
        throw new CoreApiError('VALIDATION_FAILED', 400, 'Note must be at least 3 characters.');
      }

      const updatedCase = await service.addCaseNote({
        caseId: req.params.id,
        authorUid: identity.principal.uid,
        note: noteText,
      });

      res.status(200).json(buildSuccessEnvelope(updatedCase, correlationId));
    }),
  );

  // 6. POST /cases/:id/evidence — Attach evidence to case
  router.post(
    '/cases/:id/evidence',
    withStandardErrorBoundary(async (req: Request, res: Response) => {
      const correlationId = resolveCorrelationId(req);
      const identity = await extractAuthenticatedPrincipal(req, deps.tokenVerifier);
      if (!identity.ok || !identity.principal) {
        res.status(identity.status ?? 401).json(buildErrorEnvelope('UNAUTHENTICATED', identity.reason ?? 'Auth required.', correlationId));
        return;
      }

      const authz = await authorizePrincipal(
        identity.principal,
        { minimumRole: 'delegated_admin' },
        deps.adminStore,
        deps.primaryAdminEmails,
      );
      if (!authz.allowed) {
        throw new CoreApiError('FORBIDDEN', 403, 'Admin privileges required to attach evidence.');
      }

      const validation = validateAttachEvidenceInput(req.body);
      if (!validation.ok || !validation.value) {
        throw new CoreApiError('VALIDATION_FAILED', 400, 'Invalid evidence input.', validation.issues);
      }

      const evidence = await service.attachEvidence({
        caseId: req.params.id,
        input: validation.value,
        actorUid: identity.principal.uid,
      });

      res.status(201).json(buildSuccessEnvelope(evidence, correlationId));
    }),
  );

  // 7. POST /enforcements — Issue an enforcement decision
  router.post(
    '/enforcements',
    withStandardErrorBoundary(async (req: Request, res: Response) => {
      const correlationId = resolveCorrelationId(req);
      const identity = await extractAuthenticatedPrincipal(req, deps.tokenVerifier);
      if (!identity.ok || !identity.principal) {
        res.status(identity.status ?? 401).json(buildErrorEnvelope('UNAUTHENTICATED', identity.reason ?? 'Auth required.', correlationId));
        return;
      }

      const authz = await authorizePrincipal(
        identity.principal,
        { minimumRole: 'delegated_admin' },
        deps.adminStore,
        deps.primaryAdminEmails,
      );
      if (!authz.allowed) {
        throw new CoreApiError('FORBIDDEN', 403, 'Admin privileges required to issue enforcement decisions.');
      }

      const validation = validateCreateEnforcementDecisionInput(req.body);
      if (!validation.ok || !validation.value) {
        throw new CoreApiError('VALIDATION_FAILED', 400, 'Invalid enforcement input.', validation.issues);
      }

      const decision = await service.issueEnforcementDecision({
        input: validation.value,
        actorUid: identity.principal.uid,
      });

      res.status(201).json(buildSuccessEnvelope(decision, correlationId));
    }),
  );

  // 8. POST /appeals — Submit appeal against an enforcement decision
  router.post(
    '/appeals',
    withStandardErrorBoundary(async (req: Request, res: Response) => {
      const correlationId = resolveCorrelationId(req);
      const identity = await extractAuthenticatedPrincipal(req, deps.tokenVerifier);
      if (!identity.ok || !identity.principal) {
        res.status(identity.status ?? 401).json(buildErrorEnvelope('UNAUTHENTICATED', identity.reason ?? 'Auth required.', correlationId));
        return;
      }

      const validation = validateSubmitAppealInput(req.body);
      if (!validation.ok || !validation.value) {
        throw new CoreApiError('VALIDATION_FAILED', 400, 'Invalid appeal input.', validation.issues);
      }

      const appeal = await service.submitAppeal({
        input: validation.value,
        appellantUid: identity.principal.uid,
      });

      res.status(201).json(buildSuccessEnvelope(appeal, correlationId));
    }),
  );

  // 9. POST /appeals/:id/resolve — Adjudicate an appeal (enforces separation of duties)
  router.post(
    '/appeals/:id/resolve',
    withStandardErrorBoundary(async (req: Request, res: Response) => {
      const correlationId = resolveCorrelationId(req);
      const identity = await extractAuthenticatedPrincipal(req, deps.tokenVerifier);
      if (!identity.ok || !identity.principal) {
        res.status(identity.status ?? 401).json(buildErrorEnvelope('UNAUTHENTICATED', identity.reason ?? 'Auth required.', correlationId));
        return;
      }

      const authz = await authorizePrincipal(
        identity.principal,
        { minimumRole: 'delegated_admin' },
        deps.adminStore,
        deps.primaryAdminEmails,
      );
      if (!authz.allowed) {
        throw new CoreApiError('FORBIDDEN', 403, 'Admin privileges required to adjudicate appeals.');
      }

      const decision = req.body?.decision;
      if (decision !== 'accepted' && decision !== 'rejected') {
        throw new CoreApiError('VALIDATION_FAILED', 400, 'Decision must be "accepted" or "rejected".');
      }

      const reviewNotes = typeof req.body?.reviewNotes === 'string' ? req.body.reviewNotes.trim() : '';
      if (reviewNotes.length < 5) {
        throw new CoreApiError('VALIDATION_FAILED', 400, 'Review notes must be at least 5 characters.');
      }

      const resolved = await service.resolveAppeal({
        appealId: req.params.id,
        decision,
        reviewNotes,
        reviewerUid: identity.principal.uid,
      });

      res.status(200).json(buildSuccessEnvelope(resolved, correlationId));
    }),
  );

  return router;
}
