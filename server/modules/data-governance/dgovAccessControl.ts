/** Role matrix & access helpers for Data Governance admin APIs — RT-DGOV-CRITICAL-033 */
import type { DataGovernanceRole } from '../../../src/features/data-governance/models/dataGovernance.types';
import { verifyAdminApiAuthorization, verifyAuthenticatedUserHeader } from '../../../src/utils/serverAdminAndTelegramSecurity';

export type DgovAdminResource =
  | 'claims'
  | 'reconciliation'
  | 'audit_logs'
  | 'corrections'
  | 'evidence';

const ROLE_MATRIX: Record<DgovAdminResource, readonly DataGovernanceRole[]> = {
  claims: ['DATA_GOVERNANCE_ADMIN', 'DATA_STEWARD', 'DATA_REVIEWER', 'DOMAIN_EXPERT', 'AUDIT_REVIEWER'],
  reconciliation: ['DATA_GOVERNANCE_ADMIN', 'DATA_STEWARD', 'DATA_REVIEWER', 'DOMAIN_EXPERT'],
  audit_logs: ['DATA_GOVERNANCE_ADMIN', 'AUDIT_REVIEWER'],
  corrections: ['DATA_GOVERNANCE_ADMIN', 'DATA_STEWARD', 'DATA_REVIEWER', 'RIGHTS_REVIEWER'],
  evidence: ['DATA_GOVERNANCE_ADMIN', 'SOURCE_MANAGER', 'DATA_REVIEWER', 'AUDIT_REVIEWER'],
};

export interface ResolvedDgovPrincipal {
  authorized: boolean;
  statusCode: number;
  uid?: string;
  email?: string;
  roles: DataGovernanceRole[];
  isPlatformAdmin: boolean;
}

function parseGovernanceRolesHeader(headers: Record<string, string | string[] | undefined>): DataGovernanceRole[] {
  const raw = headers['x-data-governance-roles'] ?? headers['x-dgov-roles'];
  const value = Array.isArray(raw) ? raw.join(',') : raw;
  if (!value || typeof value !== 'string') return [];
  const allowed = new Set<string>([
    'DATA_GOVERNANCE_ADMIN',
    'DATA_STEWARD',
    'SOURCE_MANAGER',
    'DATA_REVIEWER',
    'DOMAIN_EXPERT',
    'GEO_DATA_REVIEWER',
    'METHODOLOGY_REVIEWER',
    'RIGHTS_REVIEWER',
    'DATA_ENGINEER',
    'AUDIT_REVIEWER',
  ]);
  return value
    .split(',')
    .map((r) => r.trim().toUpperCase())
    .filter((r): r is DataGovernanceRole => allowed.has(r));
}

export async function resolveDgovPrincipal(
  headers: Record<string, string | string[] | undefined>,
): Promise<ResolvedDgovPrincipal> {
  // Governance roles are privileged server-side assignments. Never accept
  // x-governance-roles or any other role claim from an HTTP caller.
  const admin = await verifyAdminApiAuthorization(headers, process.env, {
    requirePrimaryBootstrapAdmin: true,
    disallowStaticToken: true,
  });
  if (admin.authorized) {
    return {
      authorized: true,
      statusCode: 200,
      uid: admin.actorUid || admin.uid,
      email: admin.email,
      roles: ['DATA_GOVERNANCE_ADMIN', 'AUDIT_REVIEWER'],
      isPlatformAdmin: true,
    };
  }

  const user = await verifyAuthenticatedUserHeader(headers);
  if (!user.authorized || !user.uid) {
    return {
      authorized: false,
      statusCode: user.statusCode ?? 401,
      roles: [],
      isPlatformAdmin: false,
    };
  }

  return {
    authorized: false,
    statusCode: 403,
    uid: user.uid,
    email: user.email,
    roles: [],
    isPlatformAdmin: false,
  };
}

export function dgovRoleCanReadResource(
  roles: readonly DataGovernanceRole[],
  resource: DgovAdminResource,
): boolean {
  const allowed = ROLE_MATRIX[resource];
  return roles.some((role) => allowed.includes(role));
}

export function parsePagination(query: Record<string, unknown>): { limit: number; offset: number } {
  const rawLimit = Number(query.limit);
  const rawOffset = Number(query.offset);
  const limit = Number.isInteger(rawLimit) && rawLimit >= 1 ? Math.min(rawLimit, 100) : 25;
  const offset = Number.isInteger(rawOffset) && rawOffset >= 0 ? rawOffset : 0;
  return { limit, offset };
}
