/**
 * @file server/modules/property-due-diligence/facadeAndRoutes.ts
 * @description Unified Module Facade, Account Lifecycle Integration, and Self-Contained Route Dispatchers.
 */

import type { Request, Response } from 'express';
import { DurableDueDiligenceStore, type DueDiligenceStore, type CursorPageParams } from './store';
import { AssessmentAndChecklistService } from './assessmentAndChecklistService';
import { FindingsEvidenceAndReviewsService } from './findingsEvidenceAndReviewsService';
import { RiskRemediationAndReportingService } from './riskRemediationAndReportingService';
import {
  type PropertyRegistryReferenceAdapter,
  type MediaEvidenceReferenceAdapter,
  type GeographyAndEnvironmentalReferenceAdapter,
  type ServiceProvidersQualificationAdapter,
  type AppointmentsReferenceAdapter,
  type DueDiligenceEventSink,
  type OptionalAiReviewAssistantAdapter,
  type DueDiligenceAccountLifecycleAdapter,
  DefaultPropertyRegistryReferenceAdapter,
  DefaultMediaEvidenceReferenceAdapter,
  DefaultGeographyAndEnvironmentalReferenceAdapter,
  DefaultServiceProvidersQualificationAdapter,
  DefaultAppointmentsReferenceAdapter,
  BufferedDueDiligenceEventSink,
  UnconfiguredAiReviewAssistantAdapter,
} from './adapters';
import { DueDiligenceError, assertCanAccessAssessment } from './validationAndAuthz';

export interface PropertyDueDiligenceModuleOptions {
  store?: DueDiligenceStore;
  propertyAdapter?: PropertyRegistryReferenceAdapter;
  mediaAdapter?: MediaEvidenceReferenceAdapter;
  geoAdapter?: GeographyAndEnvironmentalReferenceAdapter;
  providerAdapter?: ServiceProvidersQualificationAdapter;
  appointmentAdapter?: AppointmentsReferenceAdapter;
  eventSink?: DueDiligenceEventSink;
  aiAssistantAdapter?: OptionalAiReviewAssistantAdapter;
}

export class PropertyDueDiligenceFacade implements DueDiligenceAccountLifecycleAdapter {
  public readonly store: DueDiligenceStore;
  public readonly eventSink: DueDiligenceEventSink;
  public readonly aiAssistantAdapter: OptionalAiReviewAssistantAdapter;
  public readonly assessmentService: AssessmentAndChecklistService;
  public readonly findingsAndReviewsService: FindingsEvidenceAndReviewsService;
  public readonly riskAndReportingService: RiskRemediationAndReportingService;

  constructor(options?: PropertyDueDiligenceModuleOptions) {
    this.store = options?.store || new DurableDueDiligenceStore();
    const propertyAdapter = options?.propertyAdapter || new DefaultPropertyRegistryReferenceAdapter();
    const mediaAdapter = options?.mediaAdapter || new DefaultMediaEvidenceReferenceAdapter();
    const geoAdapter = options?.geoAdapter || new DefaultGeographyAndEnvironmentalReferenceAdapter();
    const providerAdapter = options?.providerAdapter || new DefaultServiceProvidersQualificationAdapter();
    const appointmentAdapter = options?.appointmentAdapter || new DefaultAppointmentsReferenceAdapter();
    this.eventSink = options?.eventSink || new BufferedDueDiligenceEventSink();
    this.aiAssistantAdapter = options?.aiAssistantAdapter || new UnconfiguredAiReviewAssistantAdapter();

    this.assessmentService = new AssessmentAndChecklistService(
      this.store,
      propertyAdapter,
      providerAdapter,
      appointmentAdapter,
      this.eventSink,
    );
    this.findingsAndReviewsService = new FindingsEvidenceAndReviewsService(
      this.store,
      mediaAdapter,
      geoAdapter,
      this.eventSink,
    );
    this.riskAndReportingService = new RiskRemediationAndReportingService(
      this.store,
      this.eventSink,
    );
  }

  async retrieveAssessmentAuditHistory(
    actorUid: string,
    assessmentId: string,
    params?: CursorPageParams,
    isPlatformAdmin = false,
  ) {
    const assessment = await this.store.getAssessmentById(assessmentId);
    if (!assessment) throw new DueDiligenceError('NOT_FOUND', 'Assessment not found.', 404);
    assertCanAccessAssessment(actorUid, assessment, undefined, isPlatformAdmin);
    return this.store.listAuditHistory(assessmentId, params);
  }

  // --- Account Lifecycle Integration (Section 26) ---
  async exportUserData(userUid: string) {
    const page = await this.store.listAssessmentsByRequester(userUid, { limit: 100 });
    const submittedEvidenceRefs: unknown[] = [];
    const authoredFindings: unknown[] = [];

    for (const asmt of page.items) {
      const evList = await this.store.listEvidenceByAssessment(asmt.id);
      for (const ev of evList) {
        if (ev.submittedByUid === userUid) submittedEvidenceRefs.push(ev);
      }
      const fList = await this.store.listFindingsByAssessment(asmt.id, { limit: 100 });
      for (const f of fList.items) {
        if (f.reportingReviewerUid === userUid) authoredFindings.push(f);
      }
    }

    return {
      requestedAssessments: page.items,
      submittedEvidenceRefs,
      authoredFindings,
    };
  }

  async handleAccountDeletion(userUid: string, reason: string) {
    const page = await this.store.listAssessmentsByRequester(userUid, { limit: 100 });
    let anonymizedAssessmentsCount = 0;
    let redactedEvidenceSubmissionsCount = 0;

    for (const asmt of page.items) {
      if (asmt.status !== 'completed' && asmt.status !== 'archived') {
        asmt.status = 'cancelled';
      }
      asmt.requestingUserUid = `deleted_principal_${asmt.id}`;
      await this.store.saveAssessment(asmt);
      anonymizedAssessmentsCount += 1;

      const evList = await this.store.listEvidenceByAssessment(asmt.id);
      for (const ev of evList) {
        if (ev.submittedByUid === userUid) {
          ev.submittedByUid = `deleted_principal_${asmt.id}`;
          ev.description = `[REDACTED PURSUANT TO ACCOUNT DELETION: ${reason}]`;
          await this.store.saveEvidence(ev);
          redactedEvidenceSubmissionsCount += 1;
        }
      }
    }

    return {
      anonymizedAssessmentsCount,
      redactedEvidenceSubmissionsCount,
    };
  }
}

export function createPropertyDueDiligenceModule(
  options?: PropertyDueDiligenceModuleOptions,
): PropertyDueDiligenceFacade {
  return new PropertyDueDiligenceFacade(options);
}

/**
 * Self-contained route handlers for integration-lead mounting.
 * Never registers routes globally in server.ts.
 */
export function createPropertyDueDiligenceRouter(facade: PropertyDueDiligenceFacade) {
  const resolveActorUid = (req: Request): string => {
    const principalUid = (req as unknown as { user?: { uid?: string } }).user?.uid;
    if (principalUid) return principalUid;
    const headerUid = req.headers['x-verified-principal-uid'];
    return typeof headerUid === 'string' ? headerUid.trim() : '';
  };

  const handleRouteError = (res: Response, err: unknown) => {
    if (err instanceof DueDiligenceError) {
      res.status(err.statusCode).json({
        status: 'error',
        code: err.code,
        message: err.message,
        field: err.field,
      });
      return;
    }
    res.status(500).json({
      status: 'error',
      code: 'INTERNAL_DUE_DILIGENCE_ERROR',
      message: err instanceof Error ? err.message : 'Unexpected error in property due diligence module.',
    });
  };

  return {
    createAssessment: async (req: Request, res: Response) => {
      try {
        const actorUid = resolveActorUid(req);
        const idempotencyKey = typeof req.headers['idempotency-key'] === 'string' ? req.headers['idempotency-key'] : undefined;
        const created = await facade.assessmentService.createAssessment(actorUid, { ...req.body, idempotencyKey });
        res.status(201).json({ status: 'ok', data: created });
      } catch (err) {
        handleRouteError(res, err);
      }
    },

    getAssessment: async (req: Request, res: Response) => {
      try {
        const actorUid = resolveActorUid(req);
        const asmt = await facade.assessmentService.getAssessment(actorUid, req.params.assessmentId);
        res.status(200).json({ status: 'ok', data: asmt });
      } catch (err) {
        handleRouteError(res, err);
      }
    },

    assignReviewer: async (req: Request, res: Response) => {
      try {
        const actorUid = resolveActorUid(req);
        const { reviewerUid, role, serviceProviderRef } = req.body;
        const updated = await facade.assessmentService.assignReviewer(
          actorUid,
          req.params.assessmentId,
          reviewerUid,
          role,
          serviceProviderRef,
        );
        res.status(200).json({ status: 'ok', data: updated });
      } catch (err) {
        handleRouteError(res, err);
      }
    },

    createWorkstream: async (req: Request, res: Response) => {
      try {
        const actorUid = resolveActorUid(req);
        const ws = await facade.assessmentService.createWorkstream(actorUid, {
          ...req.body,
          assessmentId: req.params.assessmentId,
        });
        res.status(201).json({ status: 'ok', data: ws });
      } catch (err) {
        handleRouteError(res, err);
      }
    },

    recordChecklistResponse: async (req: Request, res: Response) => {
      try {
        const actorUid = resolveActorUid(req);
        const resp = await facade.assessmentService.recordChecklistResponse(actorUid, {
          ...req.body,
          assessmentId: req.params.assessmentId,
        });
        res.status(201).json({ status: 'ok', data: resp });
      } catch (err) {
        handleRouteError(res, err);
      }
    },

    createFinding: async (req: Request, res: Response) => {
      try {
        const actorUid = resolveActorUid(req);
        const finding = await facade.findingsAndReviewsService.createFinding(actorUid, {
          ...req.body,
          assessmentId: req.params.assessmentId,
        });
        res.status(201).json({ status: 'ok', data: finding });
      } catch (err) {
        handleRouteError(res, err);
      }
    },

    submitEvidence: async (req: Request, res: Response) => {
      try {
        const actorUid = resolveActorUid(req);
        const ev = await facade.findingsAndReviewsService.submitEvidence(actorUid, {
          ...req.body,
          assessmentId: req.params.assessmentId,
        });
        res.status(201).json({ status: 'ok', data: ev });
      } catch (err) {
        handleRouteError(res, err);
      }
    },

    generateDraftReport: async (req: Request, res: Response) => {
      try {
        const actorUid = resolveActorUid(req);
        const report = await facade.riskAndReportingService.generateDraftReport(actorUid, req.params.assessmentId);
        res.status(201).json({ status: 'ok', data: report });
      } catch (err) {
        handleRouteError(res, err);
      }
    },

    publishReportVersion: async (req: Request, res: Response) => {
      try {
        const actorUid = resolveActorUid(req);
        const version = Number(req.params.version);
        const published = await facade.riskAndReportingService.publishReportVersion(
          actorUid,
          req.params.assessmentId,
          version,
        );
        res.status(200).json({ status: 'ok', data: published });
      } catch (err) {
        handleRouteError(res, err);
      }
    },

    getQualityControls: async (req: Request, res: Response) => {
      try {
        const actorUid = resolveActorUid(req);
        const qc = await facade.riskAndReportingService.evaluateAssessmentQualityControls(
          actorUid,
          req.params.assessmentId,
        );
        res.status(200).json({ status: 'ok', data: qc });
      } catch (err) {
        handleRouteError(res, err);
      }
    },
  };
}
