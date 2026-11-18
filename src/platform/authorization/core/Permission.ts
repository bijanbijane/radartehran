/**
 * @file src/platform/authorization/core/Permission.ts
 * @description Canonical Permission contract & validation (resource:action:scope) for Stage 25 (RT-FE-USER-ACCESS-CONTROL-025).
 */

export type PermissionResourceGroup =
  | 'property'
  | 'listing'
  | 'neighborhood'
  | 'market'
  | 'valuation'
  | 'service'
  | 'provider'
  | 'community'
  | 'moderation'
  | 'user'
  | 'workspace'
  | 'admin';

export type PermissionAction =
  | 'read'
  | 'create'
  | 'update'
  | 'delete'
  | 'publish'
  | 'archive'
  | 'verify'
  | 'approve'
  | 'reject'
  | 'assign'
  | 'export'
  | 'manage'
  | 'impersonate';

export type PermissionScope =
  | 'own'
  | 'assigned'
  | 'workspace'
  | 'agency'
  | 'provider'
  | 'city'
  | 'global';

export type CanonicalPermissionCode = `${PermissionResourceGroup}:${PermissionAction}:${PermissionScope}`;

export interface PermissionDefinition {
  code: CanonicalPermissionCode;
  resource: PermissionResourceGroup;
  action: PermissionAction;
  scope: PermissionScope;
  titleFa: string;
  descriptionFa: string;
  sensitive: boolean;
  requiresStepUp?: boolean;
  requiresConfirmation?: boolean;
}

const VALID_RESOURCES = new Set<PermissionResourceGroup>([
  'property', 'listing', 'neighborhood', 'market', 'valuation', 'service',
  'provider', 'community', 'moderation', 'user', 'workspace', 'admin',
]);

const VALID_ACTIONS = new Set<PermissionAction>([
  'read', 'create', 'update', 'delete', 'publish', 'archive', 'verify',
  'approve', 'reject', 'assign', 'export', 'manage', 'impersonate',
]);

const VALID_SCOPES = new Set<PermissionScope>([
  'own', 'assigned', 'workspace', 'agency', 'provider', 'city', 'global',
]);

export function parsePermissionCode(raw: string): {
  valid: boolean;
  resource?: PermissionResourceGroup;
  action?: PermissionAction;
  scope?: PermissionScope;
  code?: CanonicalPermissionCode;
} {
  if (typeof raw !== 'string') return { valid: false };
  const parts = raw.trim().split(':');
  if (parts.length !== 3) return { valid: false };
  const [res, act, scp] = parts as [PermissionResourceGroup, PermissionAction, PermissionScope];
  if (!VALID_RESOURCES.has(res) || !VALID_ACTIONS.has(act) || !VALID_SCOPES.has(scp)) {
    return { valid: false };
  }
  return {
    valid: true,
    resource: res,
    action: act,
    scope: scp,
    code: `${res}:${act}:${scp}`,
  };
}

export function isValidPermissionFormat(raw: string): raw is CanonicalPermissionCode {
  return parsePermissionCode(raw).valid;
}
