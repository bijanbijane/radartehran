/**
 * @file src/platform/authorization/context/PermissionVersionContext.ts
 * @description Tracks active permissionVersion and invalidation timestamp for reactive UI guards.
 */

import { createContext } from 'react';

export interface PermissionVersionState {
  permissionVersion: number;
  lastInvalidatedAtMs: number;
  bumpPermissionVersion: (reason?: string) => number;
}

export const DEFAULT_PERMISSION_VERSION_STATE: PermissionVersionState = {
  permissionVersion: 1,
  lastInvalidatedAtMs: 0,
  bumpPermissionVersion: () => 1,
};

export const PermissionVersionReactContext = createContext<PermissionVersionState>(
  DEFAULT_PERMISSION_VERSION_STATE
);
