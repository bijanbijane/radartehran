/**
 * @file src/platform/authorization/context/ActiveWorkspaceContext.ts
 * @description Active Workspace Context state & helpers for Stage 25 authorization.
 */

import { createContext } from 'react';
import type { CanonicalBaseRole, WorkspaceStatus } from '../core/AccessContext';

export interface ActiveWorkspaceState {
  workspaceId: string | null;
  workspaceNameFa: string;
  workspaceType: 'personal' | 'agency' | 'provider' | 'analyst' | 'admin';
  workspaceStatus: WorkspaceStatus;
  activeRole: CanonicalBaseRole;
  switchWorkspace: (nextWorkspaceId: string | null, nextRole: CanonicalBaseRole) => void;
}

export const DEFAULT_ACTIVE_WORKSPACE_STATE: ActiveWorkspaceState = {
  workspaceId: null,
  workspaceNameFa: 'فضای شخصی',
  workspaceType: 'personal',
  workspaceStatus: 'ACTIVE',
  activeRole: 'guest',
  switchWorkspace: () => {},
};

export const ActiveWorkspaceReactContext = createContext<ActiveWorkspaceState>(
  DEFAULT_ACTIVE_WORKSPACE_STATE
);
