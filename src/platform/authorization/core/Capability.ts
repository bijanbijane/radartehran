/**
 * @file src/platform/authorization/core/Capability.ts
 * @description Canonical Capability model combining permissions, feature flags, and workspace constraints.
 */

import type { CanonicalPermissionCode } from './Permission';

export type CapabilityId =
  | 'cap:property:browse'
  | 'cap:property:manage_own'
  | 'cap:listing:create_draft'
  | 'cap:listing:publish'
  | 'cap:listing:moderate'
  | 'cap:neighborhood:inspect'
  | 'cap:neighborhood:curate'
  | 'cap:market:analytics'
  | 'cap:market:export'
  | 'cap:valuation:run'
  | 'cap:valuation:approve'
  | 'cap:service:request'
  | 'cap:provider:fulfill'
  | 'cap:community:participate'
  | 'cap:moderation:queue'
  | 'cap:user:self_manage'
  | 'cap:workspace:collaborate'
  | 'cap:workspace:manage_members'
  | 'cap:admin:governance'
  | 'cap:admin:impersonate';

export interface CapabilityDescriptor {
  id: CapabilityId;
  titleFa: string;
  requiredPermissions: CanonicalPermissionCode[];
  featureFlagKey?: string;
  requiresActiveWorkspace?: boolean;
  requiresVerification?: boolean;
}
