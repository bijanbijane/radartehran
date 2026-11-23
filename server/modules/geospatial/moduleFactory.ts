import { createGeospatialService, type GeospatialService } from './service';
import { createGeospatialRouter } from './routes';
import { hydrateMaps, loadGeospatialState, persistGeospatialState, snapshotFromMaps } from './geospatialRepository';
import type { GeospatialModuleDependencies } from './types';

export function createInMemoryGeospatialModuleForTests(deps?: GeospatialModuleDependencies): {
  service: GeospatialService;
  router: ReturnType<typeof createGeospatialRouter>;
} {
  const service = createGeospatialService(deps);
  return { service, router: createGeospatialRouter(service, deps) };
}

export function createProductionGeospatialModule(deps: GeospatialModuleDependencies = {}): {
  service: GeospatialService;
  router: ReturnType<typeof createGeospatialRouter>;
} {
  const base = createGeospatialService(deps);
  return { service: base, router: createGeospatialRouter(base, deps) };
}

export function createDurableGeospatialService(deps?: GeospatialModuleDependencies): GeospatialService {
  const service = createGeospatialService(deps);
  return service;
}

export function persistGeospatialMapsFromRuntime(maps: Parameters<typeof snapshotFromMaps>[0]): void {
  persistGeospatialState(snapshotFromMaps(maps));
}

export function loadGeospatialMapsIntoRuntime(maps: Parameters<typeof hydrateMaps>[1]): void {
  hydrateMaps(loadGeospatialState(), maps);
}