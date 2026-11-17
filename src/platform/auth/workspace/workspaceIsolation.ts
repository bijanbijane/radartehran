import { createWorkspaceCacheNamespace, WorkspaceContextState } from './workspaceContext';

export class WorkspaceIsolatedStore {
  private namespaces = new Map<string, Map<string, unknown>>();
  private inFlightControllers = new Map<string, Set<AbortController>>();
  private selectionState = new Map<string, Record<string, unknown>>();

  setCacheValue(ctx: WorkspaceContextState, key: string, value: unknown): void {
    const ns = createWorkspaceCacheNamespace(ctx);
    let bucket = this.namespaces.get(ns);
    if (!bucket) {
      bucket = new Map<string, unknown>();
      this.namespaces.set(ns, bucket);
    }
    bucket.set(key, value);
  }

  getCacheValue<T>(ctx: WorkspaceContextState, key: string, fallback: T): T {
    const ns = createWorkspaceCacheNamespace(ctx);
    const bucket = this.namespaces.get(ns);
    if (!bucket || !bucket.has(key)) return fallback;
    return bucket.get(key) as T;
  }

  registerInFlightRequest(workspaceId: string, controller: AbortController): void {
    let set = this.inFlightControllers.get(workspaceId);
    if (!set) {
      set = new Set<AbortController>();
      this.inFlightControllers.set(workspaceId, set);
    }
    set.add(controller);
  }

  abortWorkspaceRequests(workspaceId: string): number {
    const set = this.inFlightControllers.get(workspaceId);
    if (!set) return 0;
    let aborted = 0;
    for (const ctrl of set) {
      if (!ctrl.signal.aborted) {
        ctrl.abort('WORKSPACE_SWITCHED');
        aborted += 1;
      }
    }
    set.clear();
    return aborted;
  }

  setSelectionState(workspaceId: string, state: Record<string, unknown>): void {
    this.selectionState.set(workspaceId, { ...state });
  }

  getSelectionState(workspaceId: string): Record<string, unknown> {
    return this.selectionState.get(workspaceId) ?? {};
  }

  purgeWorkspaceNamespace(ctx: WorkspaceContextState): void {
    const ns = createWorkspaceCacheNamespace(ctx);
    this.namespaces.delete(ns);
    this.selectionState.delete(ctx.workspaceId);
    this.abortWorkspaceRequests(ctx.workspaceId);
  }

  clearAll(): void {
    for (const [wsId] of this.inFlightControllers) {
      this.abortWorkspaceRequests(wsId);
    }
    this.namespaces.clear();
    this.selectionState.clear();
  }
}

let defaultIsolatedStore: WorkspaceIsolatedStore | null = null;

export function getWorkspaceIsolatedStore(): WorkspaceIsolatedStore {
  if (!defaultIsolatedStore) {
    defaultIsolatedStore = new WorkspaceIsolatedStore();
  }
  return defaultIsolatedStore;
}
