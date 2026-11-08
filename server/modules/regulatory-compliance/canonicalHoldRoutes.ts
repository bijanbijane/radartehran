import express, { Request, Response, Router } from 'express';
import {
  CanonicalApiErrorEnvelope,
  CanonicalApiSuccessEnvelope,
  CanonicalHoldActor,
} from './canonicalHoldModels';
import {
  buildCanonicalErrorEnvelope,
  buildCanonicalSuccessEnvelope,
} from './canonicalHoldValidationAndAuthz';
import { CanonicalHoldRepository } from './canonicalHoldRepository';
import { CanonicalLegalHoldService } from './canonicalLegalHoldService';
import { CanonicalRetentionAndDispositionService } from './canonicalRetentionAndDispositionService';

export interface SimulatedApiRequest {
  method: 'GET' | 'POST' | 'PATCH';
  path: string;
  actor: CanonicalHoldActor | null;
  headers?: Record<string, string | undefined>;
  query?: Record<string, unknown>;
  body?: Record<string, unknown>;
  evaluationNowIso?: string;
}

export interface SimulatedApiResponse<T = unknown> {
  statusCode: number;
  body: CanonicalApiSuccessEnvelope<T> | CanonicalApiErrorEnvelope;
}

export class CanonicalHoldApiController {
  public readonly holdService: CanonicalLegalHoldService;
  public readonly retentionService: CanonicalRetentionAndDispositionService;

  constructor(public readonly repo: CanonicalHoldRepository = new CanonicalHoldRepository()) {
    this.holdService = new CanonicalLegalHoldService(this.repo);
    this.retentionService = new CanonicalRetentionAndDispositionService(this.repo);
  }

  private parseIfMatchHeader(headers?: Record<string, string | undefined>): number | undefined {
    const raw = headers?.['if-match'] ?? headers?.['If-Match'];
    if (!raw) return undefined;
    const cleaned = raw.replace(/"/g, '').trim();
    const num = Number(cleaned);
    return Number.isInteger(num) ? num : undefined;
  }

  public async dispatch(req: SimulatedApiRequest): Promise<SimulatedApiResponse> {
    const corr = req.headers?.['x-correlation-id'] || req.actor?.correlationId || this.repo.createId('corr');
    const reqId = req.headers?.['x-request-id'] || this.repo.createId('req');
    const actor = req.actor ? { ...req.actor, correlationId: corr } : null;
    const body = req.body ?? {};
    const query = req.query ?? {};

    try {
      const cleanPath = req.path.split('?')[0].replace(/\/+$/, '');

      // ======================================================================
      // SECTION 4: /api/admin/compliance/legal-holds
      // ======================================================================
      if (req.method === 'POST' && cleanPath === '/api/admin/compliance/legal-holds') {
        const res = this.holdService.createLegalHold(actor!, body);
        return { statusCode: 201, body: buildCanonicalSuccessEnvelope(res, corr, reqId) };
      }

      if (req.method === 'GET' && cleanPath === '/api/admin/compliance/legal-holds') {
        const res = this.holdService.listLegalHolds(actor!, query);
        return { statusCode: 200, body: buildCanonicalSuccessEnvelope(res, corr, reqId) };
      }

      const holdMatch = cleanPath.match(/^\/api\/admin\/compliance\/legal-holds\/([^/]+)$/);
      if (holdMatch) {
        const holdId = holdMatch[1];
        if (req.method === 'GET') {
          const res = this.holdService.getLegalHold(actor!, holdId);
          return { statusCode: 200, body: buildCanonicalSuccessEnvelope(res, corr, reqId) };
        }
        if (req.method === 'PATCH') {
          const ifMatch = this.parseIfMatchHeader(req.headers);
          const res = this.holdService.updateDraftHold(actor!, holdId, ifMatch, body);
          return { statusCode: 200, body: buildCanonicalSuccessEnvelope(res, corr, reqId) };
        }
      }

      const approveMatch = cleanPath.match(/^\/api\/admin\/compliance\/legal-holds\/([^/]+)\/approve$/);
      if (req.method === 'POST' && approveMatch) {
        const res = this.holdService.approveLegalHold(actor!, approveMatch[1], body);
        return { statusCode: 200, body: buildCanonicalSuccessEnvelope(res, corr, reqId) };
      }

      const activateMatch = cleanPath.match(/^\/api\/admin\/compliance\/legal-holds\/([^/]+)\/activate$/);
      if (req.method === 'POST' && activateMatch) {
        const res = this.holdService.activateLegalHold(actor!, activateMatch[1], body, {
          evaluationNowIso: req.evaluationNowIso,
          idempotencyKey: req.headers?.['idempotency-key'],
        });
        return { statusCode: 200, body: buildCanonicalSuccessEnvelope(res, corr, reqId) };
      }

      const targetsMatch = cleanPath.match(/^\/api\/admin\/compliance\/legal-holds\/([^/]+)\/targets$/);
      if (req.method === 'GET' && targetsMatch) {
        const res = this.holdService.listHoldTargets(actor!, targetsMatch[1], query);
        return { statusCode: 200, body: buildCanonicalSuccessEnvelope(res, corr, reqId) };
      }

      const scopesMatch = cleanPath.match(/^\/api\/admin\/compliance\/legal-holds\/([^/]+)\/scopes$/);
      if (req.method === 'POST' && scopesMatch) {
        const res = this.holdService.modifyHoldScope(actor!, scopesMatch[1], body);
        return { statusCode: 200, body: buildCanonicalSuccessEnvelope(res, corr, reqId) };
      }

      const reviewsMatch = cleanPath.match(/^\/api\/admin\/compliance\/legal-holds\/([^/]+)\/reviews$/);
      if (req.method === 'POST' && reviewsMatch) {
        const res = this.holdService.reviewLegalHold(actor!, reviewsMatch[1], body);
        return { statusCode: 200, body: buildCanonicalSuccessEnvelope(res, corr, reqId) };
      }

      const relReqMatch = cleanPath.match(/^\/api\/admin\/compliance\/legal-holds\/([^/]+)\/release-requests$/);
      if (req.method === 'POST' && relReqMatch) {
        const res = this.holdService.requestHoldRelease(actor!, relReqMatch[1], body);
        return { statusCode: 201, body: buildCanonicalSuccessEnvelope(res, corr, reqId) };
      }

      const relApproveMatch = cleanPath.match(
        /^\/api\/admin\/compliance\/legal-holds\/([^/]+)\/release-requests\/([^/]+)\/approve$/,
      );
      if (req.method === 'POST' && relApproveMatch) {
        const res = this.holdService.approveHoldRelease(actor!, relApproveMatch[1], relApproveMatch[2], body);
        return { statusCode: 200, body: buildCanonicalSuccessEnvelope(res, corr, reqId) };
      }

      const historyMatch = cleanPath.match(/^\/api\/admin\/compliance\/legal-holds\/([^/]+)\/history$/);
      if (req.method === 'GET' && historyMatch) {
        const res = this.holdService.getHoldHistory(actor!, historyMatch[1]);
        return { statusCode: 200, body: buildCanonicalSuccessEnvelope(res, corr, reqId) };
      }

      // ======================================================================
      // SECTION 5: /api/admin/compliance/retention-policies
      // ======================================================================
      if (req.method === 'POST' && cleanPath === '/api/admin/compliance/retention-policies') {
        const res = this.retentionService.createRetentionPolicy(actor!, body);
        return { statusCode: 201, body: buildCanonicalSuccessEnvelope(res, corr, reqId) };
      }

      if (req.method === 'GET' && cleanPath === '/api/admin/compliance/retention-policies') {
        const res = this.retentionService.listRetentionPolicies(actor!, query);
        return { statusCode: 200, body: buildCanonicalSuccessEnvelope(res, corr, reqId) };
      }

      const policyMatch = cleanPath.match(/^\/api\/admin\/compliance\/retention-policies\/([^/]+)$/);
      if (policyMatch) {
        if (req.method === 'GET') {
          const res = this.retentionService.getRetentionPolicy(actor!, policyMatch[1]);
          return { statusCode: 200, body: buildCanonicalSuccessEnvelope(res, corr, reqId) };
        }
        if (req.method === 'PATCH') {
          const ifMatch = this.parseIfMatchHeader(req.headers);
          const res = this.retentionService.updateRetentionPolicy(actor!, policyMatch[1], ifMatch, body);
          return { statusCode: 200, body: buildCanonicalSuccessEnvelope(res, corr, reqId) };
        }
      }

      const policyActionMatch = cleanPath.match(
        /^\/api\/admin\/compliance\/retention-policies\/([^/]+)\/(submit|approve|activate|versions|supersede|retire)$/,
      );
      if (policyActionMatch) {
        const [, policyId, action] = policyActionMatch;
        if (req.method === 'GET' && action === 'versions') {
          const res = this.retentionService.listRetentionPolicyVersions(actor!, policyId);
          return { statusCode: 200, body: buildCanonicalSuccessEnvelope(res, corr, reqId) };
        }
        if (req.method === 'POST') {
          const reason = typeof body.reason === 'string' ? body.reason : 'Policy transition';
          const res =
            action === 'submit'
              ? this.retentionService.submitRetentionPolicy(actor!, policyId)
              : action === 'approve'
                ? this.retentionService.approveRetentionPolicy(actor!, policyId, reason)
                : action === 'activate'
                  ? this.retentionService.activateRetentionPolicy(actor!, policyId)
                  : action === 'supersede'
                    ? this.retentionService.supersedeRetentionPolicy(actor!, policyId, reason)
                    : this.retentionService.retireRetentionPolicy(actor!, policyId, reason);
          return { statusCode: 200, body: buildCanonicalSuccessEnvelope(res, corr, reqId) };
        }
      }

      // ======================================================================
      // SECTION 6: /api/admin/compliance/retention
      // ======================================================================
      if (req.method === 'POST' && cleanPath === '/api/admin/compliance/retention/evaluate') {
        const res = this.retentionService.evaluateRecord(actor!, body, {
          evaluationNowIso: req.evaluationNowIso,
        });
        return { statusCode: 200, body: buildCanonicalSuccessEnvelope(res, corr, reqId) };
      }

      const evalMatch = cleanPath.match(/^\/api\/admin\/compliance\/retention\/evaluations\/([^/]+)$/);
      if (req.method === 'GET' && evalMatch) {
        const res = this.retentionService.getEvaluation(actor!, evalMatch[1]);
        return { statusCode: 200, body: buildCanonicalSuccessEnvelope(res, corr, reqId) };
      }

      const recStateMatch = cleanPath.match(
        /^\/api\/admin\/compliance\/retention\/records\/([^/]+)\/([^/]+)\/([^/]+)$/,
      );
      if (req.method === 'GET' && recStateMatch) {
        const res = this.retentionService.getRecordRetentionState(
          actor!,
          recStateMatch[1],
          recStateMatch[2],
          recStateMatch[3],
        );
        return { statusCode: 200, body: buildCanonicalSuccessEnvelope(res, corr, reqId) };
      }

      if (req.method === 'GET' && cleanPath === '/api/admin/compliance/retention/conflicts') {
        const res = this.retentionService.listConflicts(actor!, query);
        return { statusCode: 200, body: buildCanonicalSuccessEnvelope(res, corr, reqId) };
      }

      // ======================================================================
      // SECTION 7: /api/admin/compliance/dispositions
      // ======================================================================
      if (req.method === 'POST' && cleanPath === '/api/admin/compliance/dispositions') {
        const res = this.retentionService.createDispositionRequest(actor!, body, {
          evaluationNowIso: req.evaluationNowIso,
        });
        return { statusCode: 201, body: buildCanonicalSuccessEnvelope(res, corr, reqId) };
      }

      if (req.method === 'GET' && cleanPath === '/api/admin/compliance/dispositions') {
        const res = this.retentionService.listDispositionRequests(actor!, query);
        return { statusCode: 200, body: buildCanonicalSuccessEnvelope(res, corr, reqId) };
      }

      const dispMatch = cleanPath.match(/^\/api\/admin\/compliance\/dispositions\/([^/]+)$/);
      if (req.method === 'GET' && dispMatch) {
        const res = this.retentionService.getDispositionRequest(actor!, dispMatch[1]);
        return { statusCode: 200, body: buildCanonicalSuccessEnvelope(res, corr, reqId) };
      }

      const dispApproveMatch = cleanPath.match(/^\/api\/admin\/compliance\/dispositions\/([^/]+)\/approve$/);
      if (req.method === 'POST' && dispApproveMatch) {
        const res = this.retentionService.approveDispositionRequest(actor!, dispApproveMatch[1], body, {
          evaluationNowIso: req.evaluationNowIso,
        });
        return { statusCode: 200, body: buildCanonicalSuccessEnvelope(res, corr, reqId) };
      }

      const dispExecMatch = cleanPath.match(/^\/api\/admin\/compliance\/dispositions\/([^/]+)\/execute$/);
      if (req.method === 'POST' && dispExecMatch) {
        const res = await this.retentionService.executeDispositionRequest(actor!, dispExecMatch[1], body, {
          evaluationNowIso: req.evaluationNowIso,
        });
        return { statusCode: 200, body: buildCanonicalSuccessEnvelope(res, corr, reqId) };
      }

      const dispCancelMatch = cleanPath.match(/^\/api\/admin\/compliance\/dispositions\/([^/]+)\/cancel$/);
      if (req.method === 'POST' && dispCancelMatch) {
        const reason = typeof body.reason === 'string' ? body.reason : '';
        const res = this.retentionService.cancelDispositionRequest(actor!, dispCancelMatch[1], reason);
        return { statusCode: 200, body: buildCanonicalSuccessEnvelope(res, corr, reqId) };
      }

      return buildCanonicalErrorEnvelope(
        new Error(`Route not found: ${req.method} ${cleanPath}`),
        corr,
        reqId,
      );
    } catch (err) {
      return buildCanonicalErrorEnvelope(err, corr, reqId);
    }
  }
}

export function createCanonicalLegalHoldExpressRouter(
  controller = new CanonicalHoldApiController(),
  resolveServerActor?: (req: Request) => CanonicalHoldActor | null,
): Router {
  const router = express.Router();
  router.use(async (req: Request, res: Response) => {
    const actor = resolveServerActor ? resolveServerActor(req) : null;
    const result = await controller.dispatch({
      method: req.method.toUpperCase() as 'GET' | 'POST' | 'PATCH',
      path: req.originalUrl || req.path,
      actor,
      headers: req.headers as Record<string, string | undefined>,
      query: req.query as Record<string, unknown>,
      body: (req.body as Record<string, unknown>) ?? {},
    });
    res.status(result.statusCode).json(result.body);
  });
  return router;
}
