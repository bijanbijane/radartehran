/**
 * @file server/modules/brokerage/routes.ts
 * @description Module-Local Route Handlers and Dispatchers for Brokerage & Agency Operations.
 * Note: These handlers are self-contained and NOT registered globally in server.ts.
 * The integration lead can mount them using createBrokerageRouter(facade).
 */

import express, { type Request, type Response, type Router } from 'express';
import { type AuthenticatedPrincipal, CoreApiError } from '../core';
import type { BrokerageFacade } from './facade';
import { createBrokerageService } from './service';
import type { BrokerageDependencies } from './types';
import { BrokerageValidationError } from './validation';

async function authenticateBrokerageRequest(
  req: Request,
  deps: BrokerageDependencies
): Promise<AuthenticatedPrincipal> {
  const authHeader = String(req.headers.authorization || '').trim();
  const token = authHeader.startsWith('Bearer ') ? authHeader.slice(7).trim() : '';
  if (!token || !deps.tokenVerifier) {
    throw new CoreApiError('UNAUTHENTICATED', 401, 'Valid Bearer token is required.');
  }
  const decoded = await deps.tokenVerifier.verifyIdToken(token);
  const email = (decoded.email || '').toLowerCase();
  const isPlatformAdmin = Boolean(
    deps.primaryAdminEmails?.some((e) => e.toLowerCase() === email)
  );
  return {
    uid: decoded.uid,
    email: decoded.email || null,
    emailVerified: Boolean(decoded.email_verified),
    role: isPlatformAdmin ? 'primary_admin' : 'verified_user',
    authMode: 'firebase_id_token',
    claims: {},
  };
}

function createBrokerageExpressRouter(deps: BrokerageDependencies): Router {
  const router = express.Router();
  const service = createBrokerageService(deps);

  router.get(
    '/organizations/:brokerageId/agents/:agentUid/performance',
    async (req: Request, res: Response) => {
      try {
        const principal = await authenticateBrokerageRequest(req, deps);
        const metrics = await service.getAgentPerformance(
          principal,
          String(req.params.brokerageId || ''),
          String(req.params.agentUid || '')
        );
        res.status(200).json({ status: 'ok', data: metrics });
      } catch (err: any) {
        const code = err instanceof CoreApiError ? err.status : 500;
        res.status(code).json({
          status: 'error',
          code: err?.code || 'INTERNAL_ERROR',
          message: err?.message || 'Unexpected error',
        });
      }
    }
  );

  router.get(
    '/organizations/:brokerageId/reports/operational',
    async (req: Request, res: Response) => {
      try {
        const principal = await authenticateBrokerageRequest(req, deps);
        const report = await service.getBrokerageOperationalReport(
          principal,
          String(req.params.brokerageId || '')
        );
        res.status(200).json({ status: 'ok', data: report });
      } catch (err: any) {
        const code = err instanceof CoreApiError ? err.status : 500;
        res.status(code).json({
          status: 'error',
          code: err?.code || 'INTERNAL_ERROR',
          message: err?.message || 'Unexpected error',
        });
      }
    }
  );

  return router;
}

export function createBrokerageRouter(deps: BrokerageDependencies): Router;
export function createBrokerageRouter(facade: BrokerageFacade): Record<string, (req: Request, res: Response) => Promise<any>>;
export function createBrokerageRouter(
  facadeOrDeps: BrokerageFacade | BrokerageDependencies
): any {
  if ('txRunner' in facadeOrDeps) {
    return createBrokerageExpressRouter(facadeOrDeps);
  }
  const facade = facadeOrDeps;
  return {
    // Agency Endpoints
    createAgency: async (req: Request, res: Response) => {
      try {
        const actorUid = (req as any).user?.uid || req.headers['x-actor-uid'];
        const result = await facade.agencyService.createAgency(String(actorUid || ''), req.body);
        res.status(201).json({ status: 'ok', data: result.agency });
      } catch (err: any) {
        handleError(res, err);
      }
    },

    getAgency: async (req: Request, res: Response) => {
      try {
        const agencyId = req.params.agencyId;
        const agency = await facade.agencyService.getAgency(agencyId);
        if (!agency) return res.status(404).json({ status: 'error', code: 'NOT_FOUND', message: 'Agency not found' });
        res.status(200).json({ status: 'ok', data: agency });
      } catch (err: any) {
        handleError(res, err);
      }
    },

    updateAgency: async (req: Request, res: Response) => {
      try {
        const actorUid = (req as any).user?.uid || req.headers['x-actor-uid'];
        const agencyId = req.params.agencyId;
        const updated = await facade.agencyService.updateAgency(agencyId, String(actorUid || ''), req.body);
        res.status(200).json({ status: 'ok', data: updated });
      } catch (err: any) {
        handleError(res, err);
      }
    },

    setAgencyStatus: async (req: Request, res: Response) => {
      try {
        const actorUid = (req as any).user?.uid || req.headers['x-actor-uid'];
        const agencyId = req.params.agencyId;
        const { status, reason } = req.body;
        const updated = await facade.agencyService.setOperatingStatus(agencyId, status, String(actorUid || ''), reason);
        res.status(200).json({ status: 'ok', data: updated });
      } catch (err: any) {
        handleError(res, err);
      }
    },

    // Branch Endpoints
    createBranch: async (req: Request, res: Response) => {
      try {
        const actorUid = (req as any).user?.uid || req.headers['x-actor-uid'];
        const branch = await facade.agencyService.createBranch(String(actorUid || ''), req.body);
        res.status(201).json({ status: 'ok', data: branch });
      } catch (err: any) {
        handleError(res, err);
      }
    },

    listBranches: async (req: Request, res: Response) => {
      try {
        const agencyId = req.params.agencyId;
        const branches = await facade.agencyService.listAgencyBranches(agencyId);
        res.status(200).json({ status: 'ok', data: branches });
      } catch (err: any) {
        handleError(res, err);
      }
    },

    // Agent Profile Endpoints
    registerAgentProfile: async (req: Request, res: Response) => {
      try {
        const actorUid = (req as any).user?.uid || req.headers['x-actor-uid'];
        const profile = await facade.membershipService.registerAgentProfile(String(actorUid || ''), req.body);
        res.status(200).json({ status: 'ok', data: profile });
      } catch (err: any) {
        handleError(res, err);
      }
    },

    // Membership Endpoints
    inviteMember: async (req: Request, res: Response) => {
      try {
        const actorUid = (req as any).user?.uid || req.headers['x-actor-uid'];
        const membership = await facade.membershipService.inviteMember(String(actorUid || ''), req.body);
        res.status(201).json({ status: 'ok', data: membership });
      } catch (err: any) {
        handleError(res, err);
      }
    },

    acceptInvitation: async (req: Request, res: Response) => {
      try {
        const actorUid = (req as any).user?.uid || req.headers['x-actor-uid'];
        const { membershipId, token } = req.body;
        const accepted = await facade.membershipService.acceptInvitation(membershipId, String(actorUid || ''), token);
        res.status(200).json({ status: 'ok', data: accepted });
      } catch (err: any) {
        handleError(res, err);
      }
    },

    updateMemberRole: async (req: Request, res: Response) => {
      try {
        const actorUid = (req as any).user?.uid || req.headers['x-actor-uid'];
        const membershipId = req.params.membershipId;
        const { role } = req.body;
        const updated = await facade.membershipService.updateMembershipRole(String(actorUid || ''), membershipId, role);
        res.status(200).json({ status: 'ok', data: updated });
      } catch (err: any) {
        handleError(res, err);
      }
    },

    terminateMember: async (req: Request, res: Response) => {
      try {
        const actorUid = (req as any).user?.uid || req.headers['x-actor-uid'];
        const membershipId = req.params.membershipId;
        const { reason } = req.body;
        const terminated = await facade.membershipService.terminateMembership(String(actorUid || ''), membershipId, reason);
        res.status(200).json({ status: 'ok', data: terminated });
      } catch (err: any) {
        handleError(res, err);
      }
    },

    listMembers: async (req: Request, res: Response) => {
      try {
        const agencyId = req.params.agencyId;
        const members = await facade.membershipService.listAgencyMembers(agencyId);
        res.status(200).json({ status: 'ok', data: members });
      } catch (err: any) {
        handleError(res, err);
      }
    },

    // Mandate Endpoints
    createMandate: async (req: Request, res: Response) => {
      try {
        const actorUid = (req as any).user?.uid || req.headers['x-actor-uid'];
        const mandate = await facade.mandateService.createMandate(String(actorUid || ''), req.body);
        res.status(201).json({ status: 'ok', data: mandate });
      } catch (err: any) {
        handleError(res, err);
      }
    },

    validateAuthority: async (req: Request, res: Response) => {
      try {
        const { propertyReference, agencyId, scope, agentUid } = req.query;
        const result = await facade.mandateService.validateRepresentationAuthority(
          String(propertyReference || ''),
          String(agencyId || ''),
          (scope as any) || 'canAdvertise',
          agentUid ? String(agentUid) : undefined,
        );
        res.status(200).json({ status: 'ok', data: result });
      } catch (err: any) {
        handleError(res, err);
      }
    },

    // Listing Assignments
    assignListing: async (req: Request, res: Response) => {
      try {
        const actorUid = (req as any).user?.uid || req.headers['x-actor-uid'];
        const assignment = await facade.mandateService.assignListingToAgent(String(actorUid || ''), req.body);
        res.status(201).json({ status: 'ok', data: assignment });
      } catch (err: any) {
        handleError(res, err);
      }
    },

    // Commission Endpoints
    createCommissionAgreement: async (req: Request, res: Response) => {
      try {
        const actorUid = (req as any).user?.uid || req.headers['x-actor-uid'];
        const agreement = await facade.commissionService.createAgreement(String(actorUid || ''), req.body);
        res.status(201).json({ status: 'ok', data: agreement });
      } catch (err: any) {
        handleError(res, err);
      }
    },

    calculateCommission: async (req: Request, res: Response) => {
      try {
        const agreementId = req.params.agreementId;
        const calculation = await facade.commissionService.calculatePayableCommission(agreementId);
        res.status(200).json({ status: 'ok', data: calculation });
      } catch (err: any) {
        handleError(res, err);
      }
    },

    // Performance & Analytics
    getAgencyPerformance: async (req: Request, res: Response) => {
      try {
        const actorUid = (req as any).user?.uid || req.headers['x-actor-uid'];
        const agencyId = req.params.agencyId;
        const days = Number(req.query.days || 30);
        const summary = await facade.analyticsService.getAgencyPerformanceSummary(agencyId, String(actorUid || ''), days);
        res.status(200).json({ status: 'ok', data: summary });
      } catch (err: any) {
        handleError(res, err);
      }
    },
  };
}

function handleError(res: Response, err: any) {
  if (err instanceof BrokerageValidationError) {
    const statusMap: Record<string, number> = {
      AUTH_REQUIRED: 401,
      FORBIDDEN: 403,
      UNAUTHORIZED_ROLE_ESCALATION: 403,
      NOT_FOUND: 404,
      LISTING_NOT_FOUND: 404,
      AGENCY_SUSPENDED: 423,
      AGENCY_INACTIVE: 423,
      ALREADY_MEMBER: 409,
      ALREADY_INVITED: 409,
    };
    const statusCode = statusMap[err.code] || 400;
    return res.status(statusCode).json({
      status: 'error',
      code: err.code,
      message: err.message,
      field: err.field,
    });
  }
  return res.status(500).json({
    status: 'error',
    code: 'INTERNAL_BROKERAGE_ERROR',
    message: err?.message || 'An unexpected error occurred in brokerage module.',
  });
}
