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
  validateCreateBuildingInput,
  validateCreatePropertyAssetInput,
  validateRegisterLandParcelInput,
  validateRegisterUnitInput,
} from './lifecycleAndValidation';
import { PropertyRegistryService } from './service';
import type { PropertyRegistryModuleDependencies } from './types';

export function createPropertyRegistryRouter(deps: PropertyRegistryModuleDependencies): express.Router {
  const router = express.Router();
  const service = new PropertyRegistryService(deps);

  // 1. POST /assets — Create property asset
  router.post(
    '/assets',
    withStandardErrorBoundary(async (req: Request, res: Response) => {
      const correlationId = resolveCorrelationId(req);
      const identity = await extractAuthenticatedPrincipal(req, deps.tokenVerifier);
      if (!identity.ok || !identity.principal) {
        res.status(identity.status ?? 401).json(buildErrorEnvelope('UNAUTHENTICATED', identity.reason ?? 'Auth required.', correlationId));
        return;
      }

      const validation = validateCreatePropertyAssetInput(req.body);
      if (!validation.ok || !validation.value) {
        throw new CoreApiError('VALIDATION_FAILED', 400, 'Invalid property asset input.', validation.issues);
      }

      const asset = await service.createAsset({
        input: validation.value,
        actorUid: identity.principal.uid,
      });

      res.status(201).json(buildSuccessEnvelope(asset, correlationId));
    }),
  );

  // 2. GET /assets/:id — Retrieve property asset (public view vs privileged)
  router.get(
    '/assets/:id',
    withStandardErrorBoundary(async (req: Request, res: Response) => {
      const correlationId = resolveCorrelationId(req);
      let isPrivileged = false;

      if (req.headers.authorization) {
        const identity = await extractAuthenticatedPrincipal(req, deps.tokenVerifier);
        if (identity.ok && identity.principal) {
          const authz = await authorizePrincipal(
            identity.principal,
            { minimumRole: 'delegated_admin' },
            deps.adminStore,
            deps.primaryAdminEmails,
          );
          isPrivileged = authz.allowed;
        }
      }

      const asset = await service.getAsset(req.params.id, { isPrivileged });
      res.status(200).json(buildSuccessEnvelope(asset, correlationId));
    }),
  );

  // 3. POST /buildings — Create building record
  router.post(
    '/buildings',
    withStandardErrorBoundary(async (req: Request, res: Response) => {
      const correlationId = resolveCorrelationId(req);
      const identity = await extractAuthenticatedPrincipal(req, deps.tokenVerifier);
      if (!identity.ok || !identity.principal) {
        res.status(identity.status ?? 401).json(buildErrorEnvelope('UNAUTHENTICATED', identity.reason ?? 'Auth required.', correlationId));
        return;
      }

      const validation = validateCreateBuildingInput(req.body);
      if (!validation.ok || !validation.value) {
        throw new CoreApiError('VALIDATION_FAILED', 400, 'Invalid building input.', validation.issues);
      }

      const building = await service.createBuilding({
        input: validation.value,
        actorUid: identity.principal.uid,
      });

      res.status(201).json(buildSuccessEnvelope(building, correlationId));
    }),
  );

  // 4. GET /buildings/:id — Retrieve building
  router.get(
    '/buildings/:id',
    withStandardErrorBoundary(async (req: Request, res: Response) => {
      const correlationId = resolveCorrelationId(req);
      const building = await deps.repository.getBuilding(req.params.id);
      if (!building) throw new CoreApiError('NOT_FOUND', 404, 'Building not found.');

      res.status(200).json(buildSuccessEnvelope(building, correlationId));
    }),
  );

  // 5. POST /units — Register a unit inside a building
  router.post(
    '/units',
    withStandardErrorBoundary(async (req: Request, res: Response) => {
      const correlationId = resolveCorrelationId(req);
      const identity = await extractAuthenticatedPrincipal(req, deps.tokenVerifier);
      if (!identity.ok || !identity.principal) {
        res.status(identity.status ?? 401).json(buildErrorEnvelope('UNAUTHENTICATED', identity.reason ?? 'Auth required.', correlationId));
        return;
      }

      const validation = validateRegisterUnitInput(req.body);
      if (!validation.ok || !validation.value) {
        throw new CoreApiError('VALIDATION_FAILED', 400, 'Invalid unit input.', validation.issues);
      }

      const unit = await service.registerUnit({
        input: validation.value,
        actorUid: identity.principal.uid,
      });

      res.status(201).json(buildSuccessEnvelope(unit, correlationId));
    }),
  );

  // 6. GET /buildings/:id/units — Get units of a building
  router.get(
    '/buildings/:id/units',
    withStandardErrorBoundary(async (req: Request, res: Response) => {
      const correlationId = resolveCorrelationId(req);
      const units = await deps.repository.getUnitsByBuilding(req.params.id);
      res.status(200).json(buildSuccessEnvelope(units, correlationId));
    }),
  );

  // 7. POST /parcels — Register land parcel
  router.post(
    '/parcels',
    withStandardErrorBoundary(async (req: Request, res: Response) => {
      const correlationId = resolveCorrelationId(req);
      const identity = await extractAuthenticatedPrincipal(req, deps.tokenVerifier);
      if (!identity.ok || !identity.principal) {
        res.status(identity.status ?? 401).json(buildErrorEnvelope('UNAUTHENTICATED', identity.reason ?? 'Auth required.', correlationId));
        return;
      }

      const validation = validateRegisterLandParcelInput(req.body);
      if (!validation.ok || !validation.value) {
        throw new CoreApiError('VALIDATION_FAILED', 400, 'Invalid land parcel input.', validation.issues);
      }

      const parcel = await service.registerLandParcel({
        input: validation.value,
        actorUid: identity.principal.uid,
      });

      res.status(201).json(buildSuccessEnvelope(parcel, correlationId));
    }),
  );

  // 8. GET /assets/:id/duplicates — Search duplicate candidates
  router.get(
    '/assets/:id/duplicates',
    withStandardErrorBoundary(async (req: Request, res: Response) => {
      const correlationId = resolveCorrelationId(req);
      const candidates = await service.searchDuplicateCandidates(req.params.id);
      res.status(200).json(buildSuccessEnvelope(candidates, correlationId));
    }),
  );

  // 9. POST /duplicates/:id/resolve — Admin approve merge or reject distinct
  router.post(
    '/duplicates/:id/resolve',
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
      if (!authz.allowed) throw new CoreApiError('FORBIDDEN', 403, 'Admin privileges required to resolve duplicates.');

      const { decision, primaryAssetId, secondaryAssetId } = req.body ?? {};
      if (decision !== 'approve_merge' && decision !== 'reject_distinct') {
        throw new CoreApiError('VALIDATION_FAILED', 400, 'decision must be "approve_merge" or "reject_distinct".');
      }

      const cand = await service.resolveDuplicateCandidate({
        candidateId: req.params.id,
        decision,
        primaryAssetId: String(primaryAssetId),
        secondaryAssetId: String(secondaryAssetId),
        actorUid: identity.principal.uid,
      });

      res.status(200).json(buildSuccessEnvelope(cand, correlationId));
    }),
  );

  // 10. POST /assets/:id/links — Link listing to asset
  router.post(
    '/assets/:id/links',
    withStandardErrorBoundary(async (req: Request, res: Response) => {
      const correlationId = resolveCorrelationId(req);
      const identity = await extractAuthenticatedPrincipal(req, deps.tokenVerifier);
      if (!identity.ok || !identity.principal) {
        res.status(identity.status ?? 401).json(buildErrorEnvelope('UNAUTHENTICATED', identity.reason ?? 'Auth required.', correlationId));
        return;
      }

      const listingId = String(req.body?.listingId ?? '').trim();
      if (!listingId) throw new CoreApiError('VALIDATION_FAILED', 400, 'listingId is required.');

      const link = await service.linkListingToAsset({
        assetId: req.params.id,
        listingId,
        actorUid: identity.principal.uid,
      });

      res.status(201).json(buildSuccessEnvelope(link, correlationId));
    }),
  );

  // 11. DELETE /assets/:id/links/:listingId — Unlink listing
  router.delete(
    '/assets/:id/links/:listingId',
    withStandardErrorBoundary(async (req: Request, res: Response) => {
      const correlationId = resolveCorrelationId(req);
      const identity = await extractAuthenticatedPrincipal(req, deps.tokenVerifier);
      if (!identity.ok || !identity.principal) {
        res.status(identity.status ?? 401).json(buildErrorEnvelope('UNAUTHENTICATED', identity.reason ?? 'Auth required.', correlationId));
        return;
      }

      await service.unlinkListingFromAsset({
        assetId: req.params.id,
        listingId: req.params.listingId,
        actorUid: identity.principal.uid,
      });

      res.status(200).json(buildSuccessEnvelope({ unlinked: true }, correlationId));
    }),
  );

  // 12. GET /assets/:id/history — View asset history
  router.get(
    '/assets/:id/history',
    withStandardErrorBoundary(async (req: Request, res: Response) => {
      const correlationId = resolveCorrelationId(req);
      const identity = await extractAuthenticatedPrincipal(req, deps.tokenVerifier);
      if (!identity.ok || !identity.principal) {
        res.status(identity.status ?? 401).json(buildErrorEnvelope('UNAUTHENTICATED', identity.reason ?? 'Auth required.', correlationId));
        return;
      }

      const history = await service.getAssetHistory(req.params.id);
      res.status(200).json(buildSuccessEnvelope(history, correlationId));
    }),
  );

  return router;
}
