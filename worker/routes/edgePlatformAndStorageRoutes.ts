/**
 * @file worker/routes/edgePlatformAndStorageRoutes.ts
 * @description Thin compatibility facade delegating storage requests to `objectStorageRoutes.ts`
 * and diagnostics to `storageAndAdminDiagnosticsRoutes.ts`. Eliminates duplicate upload handlers
 * and hardcoded staging bucket names (RT-TEAMWORK-CRITICAL-002).
 */
import type { WorkerRequestContext } from '../types';
import { handleObjectStorageRoute } from './objectStorageRoutes';
import {
  handleStorageAndAdminWorkerRoute,
  WORKER_DEPENDENCY_COMPATIBILITY_MATRIX,
} from './storageAndAdminDiagnosticsRoutes';

export { WORKER_DEPENDENCY_COMPATIBILITY_MATRIX };

export async function handleEdgePlatformAndStorageRoute(
  ctx: WorkerRequestContext,
  routeParams: Record<string, string> = {},
): Promise<Response | null> {
  if (ctx.pathname.startsWith('/api/object-storage/')) {
    return handleObjectStorageRoute(ctx, routeParams);
  }
  return handleStorageAndAdminWorkerRoute(ctx);
}
