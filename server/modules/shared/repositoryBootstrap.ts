/**
 * RT-INFRA-008 — Production repository hydration & cold-start recovery.
 */
import { enqueueReindexJob, ensureSearchIndexRepositoryHydrated } from '../search/searchIndexRepository';
import { ensureSearchWorkspaceRepositoryHydrated } from '../search/searchWorkspaceRepository';
import { ensureGeospatialRepositoryHydrated } from '../geospatial/geospatialRepository';
import { getGeospatialPersistenceHealth, getLastGeospatialRecoveryReport } from '../geospatial/geospatialDurableRecovery';
import { getActiveIndexDocuments } from '../search/searchIndexRepository';
import { isDurableRepositoryProductionMode, isRebuildableRepository } from './repositoryPersistencePolicy';

export async function ensureDurableRepositoryBootstrap(
  env: Record<string, string | undefined> = process.env,
): Promise<void> {
  const { ensureMediaMetadataDurableBootstrap } = await import('../media/mediaBootstrap');
  await ensureMediaMetadataDurableBootstrap(env);
  if (!isDurableRepositoryProductionMode(env)) return;
  await Promise.all([
    ensureSearchIndexRepositoryHydrated(),
    ensureSearchWorkspaceRepositoryHydrated(),
    ensureGeospatialRepositoryHydrated(),
  ]);
  await recoverDerivedSearchIndexIfMissing(env);
  const geoHealth = getGeospatialPersistenceHealth();
  if (geoHealth === 'BLOCKED') {
    const report = getLastGeospatialRecoveryReport();
    console.error(
      `[GEOSPATIAL_RECOVERY] BLOCKED: ${report?.recoveryRequirement ?? 'No valid geospatial durable snapshot.'}`,
    );
    if (env.RADAR_STRICT_PERSISTENCE === '1') {
      throw new Error('GEOSPATIAL_PERSISTENCE_BLOCKED');
    }
  }
}

async function recoverDerivedSearchIndexIfMissing(
  env: Record<string, string | undefined> = process.env,
): Promise<void> {
  if (!isRebuildableRepository('search-index-state.json')) return;
  const activeDocs = getActiveIndexDocuments();
  if (activeDocs.length > 0) return;
  enqueueReindexJob({
    scope: 'ALL',
    idempotencyKey: `cold-start-${new Date().toISOString().slice(0, 10)}`,
    correlationId: 'RT-INFRA-008-COLD-START',
  });
  if (env.RADAR_STRICT_PERSISTENCE === '1') {
    console.warn('[REPOSITORY_BOOTSTRAP] Search index empty — FULL_REINDEX job enqueued (cold start).');
  }
}