/**
 * RT-INFRA-010 — Production media metadata hydration after container start.
 */
import {
  createDurableMediaMetadataStore,
  type MediaMetadataPersistenceStore,
} from './metadataStore';
import {
  isProductionDurableMediaMetadataRequired,
  warmMediaMetadataCacheFirstPage,
} from './durableMediaMetadataRepository';

type HydratableMediaStore = MediaMetadataPersistenceStore & {
  hydrateFromDurableAuthority?: () => Promise<void>;
};

let sharedProductionStore: HydratableMediaStore | null = null;
let hydratePromise: Promise<void> | null = null;

export function getOrCreateProductionMediaMetadataStore(): HydratableMediaStore {
  if (!sharedProductionStore) {
    sharedProductionStore = createDurableMediaMetadataStore({
      requireDurableFirestore: isProductionDurableMediaMetadataRequired(),
    }) as HydratableMediaStore;
  }
  return sharedProductionStore;
}

export async function ensureMediaMetadataDurableBootstrap(
  env: Record<string, string | undefined> = process.env,
): Promise<void> {
  if (!isProductionDurableMediaMetadataRequired(env)) return;
  if (!hydratePromise) {
    hydratePromise = (async () => {
      const store = getOrCreateProductionMediaMetadataStore();
      if (typeof store.hydrateFromDurableAuthority === 'function') {
        await store.hydrateFromDurableAuthority();
      }
    })();
  }
  await hydratePromise;
}

export async function warmMediaMetadataCacheForContainer(
  maps: Parameters<typeof warmMediaMetadataCacheFirstPage>[0],
  env: Record<string, string | undefined> = process.env,
): Promise<{ hydratedCount: number; partial: boolean }> {
  return warmMediaMetadataCacheFirstPage(maps, env);
}