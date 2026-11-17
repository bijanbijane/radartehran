import { getMapInstanceRegistry, MapInstanceRegistry } from './MapInstanceRegistry';

export interface MapLifecycleHandle {
  containerId: string;
  addManagedListener: (event: string, handler: (...args: any[]) => void) => void;
  invalidateSizeSafe: () => void;
  destroy: () => void;
}

export function createManagedMapLifecycle(
  containerId: string,
  mapInstance: {
    on?: (event: string, fn: (...args: any[]) => void) => void;
    off?: (event?: string, fn?: (...args: any[]) => void) => void;
    remove?: () => void;
    invalidateSize?: () => void;
  },
  registry: MapInstanceRegistry = getMapInstanceRegistry()
): MapLifecycleHandle {
  registry.register(containerId, mapInstance);
  const listeners: Array<{ event: string; handler: (...args: any[]) => void }> = [];
  let destroyed = false;

  return {
    containerId,
    addManagedListener: (event, handler) => {
      if (destroyed) return;
      if (typeof mapInstance.on === 'function') {
        mapInstance.on(event, handler);
      }
      listeners.push({ event, handler });
      registry.incrementListeners(containerId, 1);
    },
    invalidateSizeSafe: () => {
      if (destroyed) return;
      if (typeof mapInstance.invalidateSize === 'function') {
        mapInstance.invalidateSize();
      }
    },
    destroy: () => {
      if (destroyed) return;
      destroyed = true;
      for (const l of listeners) {
        if (typeof mapInstance.off === 'function') {
          mapInstance.off(l.event, l.handler);
        }
        registry.incrementListeners(containerId, -1);
      }
      listeners.length = 0;
      registry.unregister(containerId);
    },
  };
}
