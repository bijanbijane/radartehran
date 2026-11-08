/**
 * Employee 66 — Customer Support & Case Management HTTP API Router (`/api/v1/support`)
 * (`server/modules/customer-support/routes.ts`)
 *
 * Exclusive ownership: `server/modules/customer-support/`
 */

import express from 'express';
import type { Express, Request, Response, Router } from 'express';
import {
  buildPaginatedEnvelope,
  buildSuccessEnvelope,
  CoreApiError,
  executeIdempotentMutation,
  extractAuthenticatedPrincipal,
  resolveCorrelationId,
  verifyAdminOrDelegatedPrincipal,
  withStandardErrorBoundary,
} from '../core';
import type { AuthenticatedPrincipal } from '../core/types';
import { CustomerSupportService } from './service';
import type {
  CustomerSupportModuleDependencies,
  SupportCaseCategory,
  SupportCasePriority,
  SupportCaseStatus,
} from './types';

interface RateBucket {
  count: number;
  resetAtMs: number;
}

function createWindowRateLimiter(maxPerWindow: number, windowMs = 60_000) {
  const buckets = new Map<string, RateBucket>();
  return (key: string): void => {
    const now = Date.now();
    const bucket = buckets.get(key);
    if (!bucket || bucket.resetAtMs <= now) {
      buckets.set(key, { count: 1, resetAtMs: now + windowMs });
      return;
    }
    bucket.count += 1;
    if (bucket.count > maxPerWindow) {
      throw new CoreApiError(
        'RATE_LIMITED',
        429,
        'Rate limit exceeded for customer support endpoint.',
      );
    }
  };
}

export function createCustomerSupportRouter(
  deps: CustomerSupportModuleDependencies,
  existingService?: CustomerSupportService,
): { router: Router; service: CustomerSupportService } {
  const router = express.Router();
  const service = existingService ?? new CustomerSupportService(deps);
  const checkRateLimit = createWindowRateLimiter(90, 60_000);

  const requireAuth = async (req: Request): Promise<AuthenticatedPrincipal> => {
    const extraction = await extractAuthenticatedPrincipal(req, deps.tokenVerifier);
    if (!extraction.ok || !extraction.principal) {
      throw new CoreApiError(
        extraction.status === 403 ? 'FORBIDDEN' : 'UNAUTHENTICATED',
        extraction.status ?? 401,
        extraction.reason ?? 'Valid Bearer authentication token is required.',
      );
    }
    return extraction.principal;
  };

  const runMaybeIdempotent = async <T>(
    req: Request,
    principal: AuthenticatedPrincipal,
    operation: string,
    statusCode: number,
    work: () => Promise<T>,
  ): Promise<{ data: T; replayed: boolean; statusCode: number }> => {
    const rawKey = req.header('idempotency-key') || req.header('x-idempotency-key');
    if (rawKey && deps.idempotencyStore) {
      const result = await executeIdempotentMutation({
        store: deps.idempotencyStore,
        actorUid: principal.uid,
        operation: `cs:${operation}`,
        idempotencyKey: rawKey.trim(),
        requestPayload: req.body ?? {},
        mutationFn: async () => ({ statusCode, body: await work() }),
      });
      return { data: result.body, replayed: result.replayed, statusCode: result.statusCode };
    }
    return { data: await work(), replayed: false, statusCode };
  };

  // --------------------------------------------------------------------------
  // 9. Customer Portal APIs
  // --------------------------------------------------------------------------

  router.post(
    '/cases',
    withStandardErrorBoundary(async (req: Request, res: Response) => {
      const correlationId = resolveCorrelationId(req);
      const principal = await requireAuth(req);
      checkRateLimit(`create_case:${principal.uid}`);
      const { data, replayed, statusCode } = await runMaybeIdempotent(
        req,
        principal,
        'case.create',
        201,
        () => service.createSupportCase(principal, req.body, correlationId),
      );
      res.status(statusCode).json(
        buildSuccessEnvelope(data, correlationId, { idempotentReplay: replayed }),
      );
    }),
  );

  router.get(
    '/cases',
    withStandardErrorBoundary(async (req: Request, res: Response) => {
      const correlationId = resolveCorrelationId(req);
      const principal = await requireAuth(req);
      const result = await service.listCustomerCases(principal, {
        limit: req.query.limit,
        cursor: req.query.cursor,
        status: typeof req.query.status === 'string' ? (req.query.status as SupportCaseStatus) : undefined,
        category: typeof req.query.category === 'string' ? (req.query.category as SupportCaseCategory) : undefined,
      });
      res.status(200).json(
        buildPaginatedEnvelope(
          result.items,
          {
            limit: Number(req.query.limit) || 20,
            nextCursor: result.nextCursor,
            hasMore: result.hasMore,
            totalCount: result.totalCount,
          },
          correlationId,
        ),
      );
    }),
  );

  router.get(
    '/cases/:caseId',
    withStandardErrorBoundary(async (req: Request, res: Response) => {
      const correlationId = resolveCorrelationId(req);
      const principal = await requireAuth(req);
      const details = await service.getCustomerCaseDetails(
        principal,
        String(req.params.caseId || ''),
      );
      res.status(200).json(buildSuccessEnvelope(details, correlationId));
    }),
  );

  router.post(
    '/cases/:caseId/messages',
    withStandardErrorBoundary(async (req: Request, res: Response) => {
      const correlationId = resolveCorrelationId(req);
      const principal = await requireAuth(req);
      checkRateLimit(`message:${principal.uid}`);
      const { data, replayed, statusCode } = await runMaybeIdempotent(
        req,
        principal,
        `case.message.${String(req.params.caseId || '')}`,
        201,
        () =>
          service.addCustomerVisibleMessage(
            principal,
            String(req.params.caseId || ''),
            req.body,
            correlationId,
          ),
      );
      res.status(statusCode).json(
        buildSuccessEnvelope(data, correlationId, { idempotentReplay: replayed }),
      );
    }),
  );

  router.post(
    '/cases/:caseId/attachments',
    withStandardErrorBoundary(async (req: Request, res: Response) => {
      const correlationId = resolveCorrelationId(req);
      const principal = await requireAuth(req);
      checkRateLimit(`attachment:${principal.uid}`);
      const attachment = await service.attachCaseEvidence(
        principal,
        String(req.params.caseId || ''),
        req.body,
        correlationId,
      );
      res.status(201).json(buildSuccessEnvelope(attachment, correlationId));
    }),
  );

  router.get(
    '/cases/:caseId/attachments/:attachmentId/download',
    withStandardErrorBoundary(async (req: Request, res: Response) => {
      const correlationId = resolveCorrelationId(req);
      const principal = await requireAuth(req);
      const authorized = await service.authorizeAttachmentDownload(
        principal,
        String(req.params.caseId || ''),
        String(req.params.attachmentId || ''),
      );
      res.status(200).json(buildSuccessEnvelope(authorized, correlationId));
    }),
  );

  router.post(
    '/cases/:caseId/transition',
    withStandardErrorBoundary(async (req: Request, res: Response) => {
      const correlationId = resolveCorrelationId(req);
      const principal = await requireAuth(req);
      checkRateLimit(`transition:${principal.uid}`);
      const updated = await service.transitionCaseStatus(
        principal,
        String(req.params.caseId || ''),
        req.body,
        correlationId,
      );
      res.status(200).json(
        buildSuccessEnvelope(service.projectCustomerFacingCase(updated), correlationId),
      );
    }),
  );

  router.post(
    '/cases/:caseId/satisfaction',
    withStandardErrorBoundary(async (req: Request, res: Response) => {
      const correlationId = resolveCorrelationId(req);
      const principal = await requireAuth(req);
      checkRateLimit(`csat:${principal.uid}`);
      const feedback = await service.submitCaseSatisfactionFeedback(
        principal,
        String(req.params.caseId || ''),
        req.body,
        correlationId,
      );
      res.status(201).json(buildSuccessEnvelope(feedback, correlationId));
    }),
  );

  // --------------------------------------------------------------------------
  // 7. Complaint & Appeal Endpoints
  // --------------------------------------------------------------------------

  router.post(
    '/complaints',
    withStandardErrorBoundary(async (req: Request, res: Response) => {
      const correlationId = resolveCorrelationId(req);
      const principal = await requireAuth(req);
      checkRateLimit(`complaint:${principal.uid}`);
      const result = await service.submitComplaint(principal, req.body, correlationId);
      res.status(201).json(buildSuccessEnvelope(result, correlationId));
    }),
  );

  router.post(
    '/complaints/:complaintId/appeal',
    withStandardErrorBoundary(async (req: Request, res: Response) => {
      const correlationId = resolveCorrelationId(req);
      const principal = await requireAuth(req);
      checkRateLimit(`complaint:${principal.uid}`);
      const updated = await service.submitComplaintAppeal(
        principal,
        String(req.params.complaintId || ''),
        req.body,
        correlationId,
      );
      res.status(200).json(buildSuccessEnvelope(updated, correlationId));
    }),
  );

  // --------------------------------------------------------------------------
  // 11. Knowledge Base Public Endpoints
  // --------------------------------------------------------------------------

  router.get(
    '/kb/articles',
    withStandardErrorBoundary(async (req: Request, res: Response) => {
      const correlationId = resolveCorrelationId(req);
      const articles = await service.searchPublicKnowledgeArticles({
        q: typeof req.query.q === 'string' ? req.query.q : undefined,
        category: typeof req.query.category === 'string' ? (req.query.category as SupportCaseCategory) : undefined,
        limit: Number(req.query.limit) || 20,
      });
      res.status(200).json(buildSuccessEnvelope(articles, correlationId));
    }),
  );

  router.post(
    '/kb/articles/:articleId/feedback',
    withStandardErrorBoundary(async (req: Request, res: Response) => {
      const correlationId = resolveCorrelationId(req);
      const principal = await requireAuth(req);
      const feedback = await service.submitKnowledgeArticleFeedback(
        principal,
        String(req.params.articleId || ''),
        req.body,
      );
      res.status(200).json(buildSuccessEnvelope(feedback, correlationId));
    }),
  );

  // --------------------------------------------------------------------------
  // 10. Internal Support Staff APIs
  // --------------------------------------------------------------------------

  router.get(
    '/staff/cases',
    withStandardErrorBoundary(async (req: Request, res: Response) => {
      const correlationId = resolveCorrelationId(req);
      const principal = await requireAuth(req);
      const result = await service.listStaffQueueCases(principal, {
        teamId: typeof req.query.teamId === 'string' ? req.query.teamId : undefined,
        agentUid: typeof req.query.agentUid === 'string' ? req.query.agentUid : undefined,
        unassignedOnly: req.query.unassignedOnly === 'true',
        status: typeof req.query.status === 'string' ? (req.query.status as SupportCaseStatus) : undefined,
        priority: typeof req.query.priority === 'string' ? (req.query.priority as SupportCasePriority) : undefined,
        limit: req.query.limit,
        cursor: req.query.cursor,
      });
      res.status(200).json(
        buildPaginatedEnvelope(
          result.items,
          {
            limit: Number(req.query.limit) || 20,
            nextCursor: result.nextCursor,
            hasMore: result.hasMore,
            totalCount: result.totalCount,
          },
          correlationId,
        ),
      );
    }),
  );

  router.get(
    '/staff/cases/:caseId',
    withStandardErrorBoundary(async (req: Request, res: Response) => {
      const correlationId = resolveCorrelationId(req);
      const principal = await requireAuth(req);
      const details = await service.getStaffCaseDetails(
        principal,
        String(req.params.caseId || ''),
      );
      res.status(200).json(buildSuccessEnvelope(details, correlationId));
    }),
  );

  router.post(
    '/staff/cases/:caseId/assign',
    withStandardErrorBoundary(async (req: Request, res: Response) => {
      const correlationId = resolveCorrelationId(req);
      const principal = await requireAuth(req);
      const updated = await service.assignSupportCase(
        principal,
        String(req.params.caseId || ''),
        req.body,
        correlationId,
      );
      res.status(200).json(buildSuccessEnvelope(updated, correlationId));
    }),
  );

  router.post(
    '/staff/cases/:caseId/escalate',
    withStandardErrorBoundary(async (req: Request, res: Response) => {
      const correlationId = resolveCorrelationId(req);
      const principal = await requireAuth(req);
      const result = await service.escalateSupportCase(
        principal,
        String(req.params.caseId || ''),
        req.body,
        correlationId,
      );
      res.status(200).json(buildSuccessEnvelope(result, correlationId));
    }),
  );

  router.post(
    '/staff/cases/:caseId/internal-notes',
    withStandardErrorBoundary(async (req: Request, res: Response) => {
      const correlationId = resolveCorrelationId(req);
      const principal = await requireAuth(req);
      const note = await service.addInternalStaffNote(
        principal,
        String(req.params.caseId || ''),
        req.body,
        correlationId,
      );
      res.status(201).json(buildSuccessEnvelope(note, correlationId));
    }),
  );

  router.post(
    '/staff/cases/:caseId/transition',
    withStandardErrorBoundary(async (req: Request, res: Response) => {
      const correlationId = resolveCorrelationId(req);
      const principal = await requireAuth(req);
      const updated = await service.transitionCaseStatus(
        principal,
        String(req.params.caseId || ''),
        req.body,
        correlationId,
      );
      res.status(200).json(buildSuccessEnvelope(updated, correlationId));
    }),
  );

  router.post(
    '/staff/complaints/:complaintId/decision',
    withStandardErrorBoundary(async (req: Request, res: Response) => {
      const correlationId = resolveCorrelationId(req);
      const principal = await requireAuth(req);
      const updated = await service.recordComplaintDecision(
        principal,
        String(req.params.complaintId || ''),
        req.body,
        correlationId,
      );
      res.status(200).json(buildSuccessEnvelope(updated, correlationId));
    }),
  );

  router.get(
    '/staff/metrics',
    withStandardErrorBoundary(async (req: Request, res: Response) => {
      const correlationId = resolveCorrelationId(req);
      const principal = await requireAuth(req);
      const summary = await service.getOperationalMetricsSummary(principal);
      res.status(200).json(buildSuccessEnvelope(summary, correlationId));
    }),
  );

  // --------------------------------------------------------------------------
  // 14 & 16. Administrative Controls & Background SLA Job
  // --------------------------------------------------------------------------

  router.post(
    '/admin/teams',
    withStandardErrorBoundary(async (req: Request, res: Response) => {
      const correlationId = resolveCorrelationId(req);
      const principal = await requireAuth(req);
      const team = await service.adminUpsertSupportTeam(principal, req.body, correlationId);
      res.status(200).json(buildSuccessEnvelope(team, correlationId));
    }),
  );

  router.put(
    '/admin/sla-policy',
    withStandardErrorBoundary(async (req: Request, res: Response) => {
      const correlationId = resolveCorrelationId(req);
      const principal = await requireAuth(req);
      const policy = await service.adminUpdateSlaPolicy(principal, req.body, correlationId);
      res.status(200).json(buildSuccessEnvelope(policy, correlationId));
    }),
  );

  router.post(
    '/admin/templates',
    withStandardErrorBoundary(async (req: Request, res: Response) => {
      const correlationId = resolveCorrelationId(req);
      const principal = await requireAuth(req);
      const tpl = await service.adminUpsertResponseTemplate(principal, req.body, correlationId);
      res.status(200).json(buildSuccessEnvelope(tpl, correlationId));
    }),
  );

  router.post(
    '/admin/kb/articles',
    withStandardErrorBoundary(async (req: Request, res: Response) => {
      const correlationId = resolveCorrelationId(req);
      const principal = await requireAuth(req);
      const article = await service.upsertKnowledgeArticle(principal, req.body, correlationId);
      res.status(200).json(buildSuccessEnvelope(article, correlationId));
    }),
  );

  router.post(
    '/admin/jobs/sla-monitor',
    withStandardErrorBoundary(async (req: Request, res: Response) => {
      const correlationId = resolveCorrelationId(req);
      const principal = await requireAuth(req);
      const decision = await verifyAdminOrDelegatedPrincipal(principal, deps.adminStore, {
        primaryAdminEmails: deps.primaryAdminEmails,
      });
      if (!decision.allowed) {
        throw new CoreApiError('FORBIDDEN', 403, 'Scheduled SLA monitoring job requires admin privilege.');
      }
      const jobKey = String(req.body?.jobExecutionKey || req.header('idempotency-key') || '');
      const result = await service.executeSlaMonitoringJob(
        jobKey,
        typeof req.body?.nowIso === 'string' ? req.body.nowIso : undefined,
      );
      res.status(200).json(
        buildSuccessEnvelope(result, correlationId, { idempotentReplay: result.replayed }),
      );
    }),
  );

  return { router, service };
}

export function registerCustomerSupportRoutes(
  app: Express,
  deps: CustomerSupportModuleDependencies,
  basePath = '/api/v1/support',
): CustomerSupportService {
  const { router, service } = createCustomerSupportRouter(deps);
  app.use(basePath, router);
  return service;
}
