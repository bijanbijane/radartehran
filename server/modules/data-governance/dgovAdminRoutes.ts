/** Admin Data Governance routes — authenticated, paginated, auditable — RT-DGOV-CRITICAL-033 */
import type { Express, Request, Response } from 'express';
import { recordAbuseSignal } from '../../../src/utils/serverDeliveryAndAbuseGuard';
import { appendServerAdminAuditLog } from '../account-admin/accountAdminRepository';
import { dgovRoleCanReadResource, parsePagination, resolveDgovPrincipal } from './dgovAccessControl';
import { getServerDgovEngine } from './dgovRepository';

export function registerDgovAdminRoutes(
  app: Express,
  deps: { getIp: (req: Request) => string },
): void {
  const requireResource = async (
    req: Request,
    res: Response,
    resource: Parameters<typeof dgovRoleCanReadResource>[1],
  ) => {
    res.setHeader('Cache-Control', 'no-store');
    res.setHeader('Pragma', 'no-cache');
    const principal = await resolveDgovPrincipal(req.headers as Record<string, string | string[] | undefined>);
    if (!principal.authorized) {
      recordAbuseSignal(deps.getIp(req), 'auth_failure');
      res.status(principal.statusCode).json({ ok: false, code: 'DGOV_FORBIDDEN', errorFa: 'دسترسی به اطلاعات حاکمیت داده نیازمند احراز هویت و نقش مجاز است.' });
      return null;
    }
    if (!dgovRoleCanReadResource(principal.roles, resource)) {
      res.status(403).json({ ok: false, code: 'DGOV_ROLE_DENIED', errorFa: 'نقش شما به این منبع حاکمیت داده دسترسی ندارد.' });
      return null;
    }
    return principal;
  };

  app.get('/api/admin/data-governance/claims', async (req, res) => {
    const principal = await requireResource(req, res, 'claims');
    if (!principal) return;
    const { limit, offset } = parsePagination(req.query as Record<string, unknown>);
    const all = getServerDgovEngine().getClaims();
    const page = all.slice(offset, offset + limit);
    appendServerAdminAuditLog({
      actorRole: 'super_admin',
      actorLabelFa: principal.email || principal.uid || 'dgov',
      actionCode: 'DGOV_ADMIN_CLAIMS_LIST',
      targetType: 'market_data',
      targetId: 'claims',
      reasonFa: `offset=${offset} limit=${limit}`,
      severity: 'info',
    });
    res.status(200).json({ ok: true, total: all.length, offset, limit, claims: page });
  });

  app.get('/api/admin/data-governance/reconciliation-cases', async (req, res) => {
    const principal = await requireResource(req, res, 'reconciliation');
    if (!principal) return;
    const { limit, offset } = parsePagination(req.query as Record<string, unknown>);
    const all = getServerDgovEngine().getReconciliationCases();
    res.status(200).json({ ok: true, total: all.length, offset, limit, reconciliationCases: all.slice(offset, offset + limit) });
  });

  app.get('/api/admin/data-governance/audit-logs', async (req, res) => {
    const principal = await requireResource(req, res, 'audit_logs');
    if (!principal) return;
    const { limit, offset } = parsePagination(req.query as Record<string, unknown>);
    const all = getServerDgovEngine().getAuditLogs();
    res.status(200).json({ ok: true, total: all.length, offset, limit, auditLogs: all.slice(offset, offset + limit) });
  });

  app.get('/api/admin/data-governance/corrections', async (req, res) => {
    const principal = await requireResource(req, res, 'corrections');
    if (!principal) return;
    const { limit, offset } = parsePagination(req.query as Record<string, unknown>);
    const all = getServerDgovEngine().getCorrectionProposals();
    res.status(200).json({ ok: true, total: all.length, offset, limit, proposals: all.slice(offset, offset + limit) });
  });
}