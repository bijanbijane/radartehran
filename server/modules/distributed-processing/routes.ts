/**
 * @file server/modules/distributed-processing/routes.ts
 * @description Administrative APIs for Employee 75 (Phases 4 & 5):
 * - `/api/admin/jobs`, `/api/admin/jobs/:jobId`, `/api/admin/jobs/:jobId/cancel`, `/api/admin/jobs/:jobId/retry`
 * - `/api/admin/workers`, `/api/admin/outbox`, `/api/admin/outbox/:outboxId/retry`
 * - `/api/admin/workflows`, `/api/admin/workflows/:workflowId`, `/api/admin/schedules`
 */

import type { Express, Response } from 'express';
import {
  createPlatformExecutionContext,
  defaultPlatformAdminAuthVerifier,
  PlatformApplicationError,
  platformExecutionContextMiddleware,
  toCanonicalErrorResponse,
  toCanonicalSuccessResponse,
  type PlatformAdminAuthVerifier,
  type RequestWithPlatformContext,
} from '../platform-foundation';
import {
  getDefaultDistributedProcessingStore,
  type DistributedProcessingStore,
} from './jobsOutboxAndWorkersEngine';
import {
  getDefaultDurableWorkflowEngine,
  type DurableWorkflowAndSchedulerEngine,
} from './workflowsSagaAndSchedulerEngine';

const registeredProcessingApps = new WeakSet<Express>();

export function registerDistributedProcessingAdminRoutes(
  app: Express,
  options: {
    processingStore?: DistributedProcessingStore;
    workflowEngine?: DurableWorkflowAndSchedulerEngine;
    authVerifier?: PlatformAdminAuthVerifier;
  } = {},
): void {
  if (registeredProcessingApps.has(app)) return;
  registeredProcessingApps.add(app);

  const procStore = options.processingStore ?? getDefaultDistributedProcessingStore();
  const wfEngine = options.workflowEngine ?? getDefaultDurableWorkflowEngine();
  const verifyAuth = options.authVerifier ?? defaultPlatformAdminAuthVerifier;

  app.use('/api/admin/jobs', platformExecutionContextMiddleware);
  app.use('/api/admin/workers', platformExecutionContextMiddleware);
  app.use('/api/admin/outbox', platformExecutionContextMiddleware);
  app.use('/api/admin/workflows', platformExecutionContextMiddleware);
  app.use('/api/admin/schedules', platformExecutionContextMiddleware);

  const guard = (
    permission: 'platform:admin:read' | 'platform:admin:write',
    operationName: string,
    fn: (req: RequestWithPlatformContext, res: Response) => Promise<void> | void,
  ) => {
    return (req: RequestWithPlatformContext, res: Response) => {
      void (async () => {
        res.setHeader('Cache-Control', 'no-store');
        const baseCtx =
          req.platformContext ??
          createPlatformExecutionContext({
            sourceModule: 'distributed-background-processing',
            operationName,
          });
        try {
          const auth = await verifyAuth(req, permission);
          if (!auth.authorized) {
            throw new PlatformApplicationError({
              code: auth.statusCode === 401 ? 'AUTHENTICATION_REQUIRED' : 'PERMISSION_DENIED',
              category: auth.statusCode === 401 ? 'AUTHENTICATION' : 'AUTHORIZATION',
              httpStatus: auth.statusCode,
              owningModule: 'distributed-background-processing',
              message: `Administrative permission '${permission}' required.`,
              correlationId: baseCtx.correlationId,
            });
          }
          await fn(req, res);
        } catch (err) {
          const mapped = toCanonicalErrorResponse(err, baseCtx);
          res.status(mapped.statusCode).json(mapped.body);
        }
      })();
    };
  };

  app.get(
    '/api/admin/jobs',
    guard('platform:admin:read', 'admin.jobs.list', (req, res) => {
      const limit = req.query.limit !== undefined ? Number(req.query.limit) : undefined;
      const cursor = typeof req.query.cursor === 'string' ? req.query.cursor : undefined;
      const status = typeof req.query.status === 'string' ? (req.query.status as any) : undefined;
      const page = procStore.listJobs({ limit, cursor, status });
      res.status(200).json(toCanonicalSuccessResponse(page.items, req.platformContext, page.nextCursor));
    }),
  );

  app.post(
    '/api/admin/jobs',
    guard('platform:admin:write', 'admin.jobs.submit', (req, res) => {
      const job = procStore.submitJob({
        ...(req.body ?? {}),
        authorizedSystemService: true,
        correlationId: req.platformContext?.correlationId ?? `corr_${Date.now()}`,
      });
      res.status(201).json(toCanonicalSuccessResponse(job, req.platformContext));
    }),
  );

  app.get(
    '/api/admin/jobs/:jobId',
    guard('platform:admin:read', 'admin.jobs.get', (req, res) => {
      const job = procStore.getJobById(req.params.jobId);
      res.status(200).json(toCanonicalSuccessResponse(job, req.platformContext));
    }),
  );

  app.post(
    '/api/admin/jobs/:jobId/cancel',
    guard('platform:admin:write', 'admin.jobs.cancel', (req, res) => {
      const cancelled = procStore.cancelJob(req.params.jobId);
      res.status(200).json(toCanonicalSuccessResponse(cancelled, req.platformContext));
    }),
  );

  app.post(
    '/api/admin/jobs/:jobId/retry',
    guard('platform:admin:write', 'admin.jobs.retry', (req, res) => {
      const retried = procStore.retryDeadLetteredJob(req.params.jobId);
      res.status(200).json(toCanonicalSuccessResponse(retried, req.platformContext));
    }),
  );

  app.get(
    '/api/admin/workers',
    guard('platform:admin:read', 'admin.workers.list', (req, res) => {
      res.status(200).json(toCanonicalSuccessResponse(procStore.listWorkers(), req.platformContext));
    }),
  );

  app.get(
    '/api/admin/outbox',
    guard('platform:admin:read', 'admin.outbox.list', (req, res) => {
      const limit = req.query.limit !== undefined ? Number(req.query.limit) : undefined;
      const cursor = typeof req.query.cursor === 'string' ? req.query.cursor : undefined;
      const page = procStore.listOutboxRecords({ limit, cursor });
      res.status(200).json(toCanonicalSuccessResponse(page.items, req.platformContext, page.nextCursor));
    }),
  );

  app.post(
    '/api/admin/outbox/:outboxId/retry',
    guard('platform:admin:write', 'admin.outbox.retry', (req, res) => {
      const updated = procStore.publishOutboxRecord(req.params.outboxId);
      res.status(200).json(toCanonicalSuccessResponse(updated, req.platformContext));
    }),
  );

  app.get(
    '/api/admin/workflows',
    guard('platform:admin:read', 'admin.workflows.list', (req, res) => {
      const limit = req.query.limit !== undefined ? Number(req.query.limit) : undefined;
      const cursor = typeof req.query.cursor === 'string' ? req.query.cursor : undefined;
      const page = wfEngine.listWorkflows({ limit, cursor });
      res.status(200).json(toCanonicalSuccessResponse(page.items, req.platformContext, page.nextCursor));
    }),
  );

  app.post(
    '/api/admin/workflows',
    guard('platform:admin:write', 'admin.workflows.start', (req, res) => {
      const started = wfEngine.startWorkflow({
        ...(req.body ?? {}),
        correlationId: req.platformContext?.correlationId ?? `corr_${Date.now()}`,
      });
      res.status(201).json(toCanonicalSuccessResponse(started, req.platformContext));
    }),
  );

  app.get(
    '/api/admin/workflows/:workflowId',
    guard('platform:admin:read', 'admin.workflows.get', (req, res) => {
      const wf = wfEngine.getWorkflowById(req.params.workflowId);
      res.status(200).json(toCanonicalSuccessResponse(wf, req.platformContext));
    }),
  );

  app.get(
    '/api/admin/schedules',
    guard('platform:admin:read', 'admin.schedules.list', (req, res) => {
      res.status(200).json(toCanonicalSuccessResponse(wfEngine.listSchedules(), req.platformContext));
    }),
  );
}
