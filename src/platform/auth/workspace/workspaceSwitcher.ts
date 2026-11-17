import { evaluateRouteAccess } from '../authorization/accessPolicy';
import { getAuthClient } from '../core/authClient';
import { inferWorkspaceTypeFromRole, WorkspaceContextState } from './workspaceContext';
import { getWorkspaceIsolatedStore, WorkspaceIsolatedStore } from './workspaceIsolation';

export interface WorkspaceSwitchResult {
  previousWorkspaceId: string | null;
  nextContext: WorkspaceContextState;
  abortedRequestsCount: number;
  redirectRoute: string;
}

export class WorkspaceSwitcher {
  private currentContext: WorkspaceContextState | null = null;
  private store: WorkspaceIsolatedStore;

  constructor(store = getWorkspaceIsolatedStore()) {
    this.store = store;
  }

  getCurrentContext(): WorkspaceContextState | null {
    return this.currentContext;
  }

  switchWorkspace(
    next: Omit<WorkspaceContextState, 'workspaceType' | 'switchedAt'>,
    currentRoutePath = '/'
  ): WorkspaceSwitchResult {
    const previousWorkspaceId = this.currentContext?.workspaceId ?? null;
    let abortedRequestsCount = 0;

    if (this.currentContext && this.currentContext.workspaceId !== next.workspaceId) {
      abortedRequestsCount = this.store.abortWorkspaceRequests(this.currentContext.workspaceId);
      this.store.setSelectionState(this.currentContext.workspaceId, {});
    }

    const nextContext: WorkspaceContextState = {
      ...next,
      workspaceType: inferWorkspaceTypeFromRole(next.activeRole),
      switchedAt: Date.now(),
    };

    this.currentContext = nextContext;

    const routeDecision = evaluateRouteAccess(currentRoutePath, {
      isAuthenticated: true,
      activeRole: nextContext.activeRole,
      permissions: nextContext.permissions as any[],
      workspaceId: nextContext.workspaceId,
    });

    const redirectRoute = routeDecision.allowed
      ? currentRoutePath
      : routeDecision.fallbackRoute ?? '/';

    getAuthClient().emitEvent('WORKSPACE_SWITCHED', {
      previousWorkspaceId,
      nextWorkspaceId: nextContext.workspaceId,
      activeRole: nextContext.activeRole,
      redirectRoute,
    });

    return {
      previousWorkspaceId,
      nextContext,
      abortedRequestsCount,
      redirectRoute,
    };
  }
}
