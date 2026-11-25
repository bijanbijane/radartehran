import assert from 'node:assert/strict';
import { requireAdminPermission } from '../server/modules/platform-foundation/compatBridge';

const forgedHeaderRequest = {
  headers: {
    authorization: 'Bearer not-a-valid-admin-token',
    'x-admin-token': 'anything',
    'x-actor-id': 'victim-admin',
    'x-admin-role': 'primary_admin',
    'x-admin-role-scope': 'full',
  },
} as any;

assert.throws(
  () => requireAdminPermission(forgedHeaderRequest, 'platform.modules.read'),
  (error: any) => error?.code === 'AUTHENTICATION_REQUIRED',
  'Client-controlled headers must not establish admin identity.',
);

const delegatedRequest = {
  verifiedPlatformAdminContext: {
    actorId: 'delegated-admin-uid',
    actorRole: 'read_only_admin',
    permissions: ['platform.modules.read', 'platform.config.read', 'platform.health.read'],
  },
} as any;

assert.deepEqual(
  requireAdminPermission(delegatedRequest, 'platform.modules.read'),
  { actorId: 'delegated-admin-uid', actorRole: 'read_only_admin' },
);
assert.throws(
  () => requireAdminPermission(delegatedRequest, 'platform.modules.manage'),
  (error: any) => error?.code === 'PERMISSION_DENIED',
  'Delegated read-only administrators must not acquire write permissions.',
);

const primaryRequest = {
  verifiedPlatformAdminContext: {
    actorId: 'primary-admin-uid',
    actorRole: 'primary_admin',
    permissions: ['*'],
  },
} as any;

assert.equal(
  requireAdminPermission(primaryRequest, 'platform.modules.manage').actorId,
  'primary-admin-uid',
);

console.log('Platform admin compatibility authorization tests passed.');
