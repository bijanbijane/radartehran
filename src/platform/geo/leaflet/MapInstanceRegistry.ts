export interface RegisteredMapInstance {
  containerId: string;
  mapInstance: unknown;
  mountedAt: number;
  listenerCount: number;
}

export class MapInstanceRegistry {
  private instances = new Map<string, RegisteredMapInstance>();

  register(containerId: string, mapInstance: unknown): RegisteredMapInstance {
    if (this.instances.has(containerId)) {
      this.unregister(containerId);
    }
    const entry: RegisteredMapInstance = {
      containerId,
      mapInstance,
      mountedAt: Date.now(),
      listenerCount: 0,
    };
    this.instances.set(containerId, entry);
    return entry;
  }

  unregister(containerId: string): boolean {
    const existing = this.instances.get(containerId);
    if (!existing) return false;
    const inst = existing.mapInstance as { remove?: () => void; off?: () => void } | null;
    try {
      if (inst && typeof inst.off === 'function') inst.off();
      if (inst && typeof inst.remove === 'function') inst.remove();
    } catch {
      // Safe teardown
    }
    this.instances.delete(containerId);
    return true;
  }

  get(containerId: string): RegisteredMapInstance | undefined {
    return this.instances.get(containerId);
  }

  getActiveCount(containerId?: string): number {
    if (containerId) {
      return this.instances.has(containerId) ? 1 : 0;
    }
    return this.instances.size;
  }

  incrementListeners(containerId: string, delta = 1): number {
    const item = this.instances.get(containerId);
    if (!item) return 0;
    item.listenerCount = Math.max(0, item.listenerCount + delta);
    return item.listenerCount;
  }

  clearAll(): void {
    for (const key of Array.from(this.instances.keys())) {
      this.unregister(key);
    }
  }
}

let defaultMapRegistry: MapInstanceRegistry | null = null;

export function getMapInstanceRegistry(): MapInstanceRegistry {
  if (!defaultMapRegistry) {
    defaultMapRegistry = new MapInstanceRegistry();
  }
  return defaultMapRegistry;
}
