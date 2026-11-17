import { MapLayerType } from '../core/GeoTypes';

export interface LayerOwnershipRule {
  layerType: MapLayerType;
  zIndexOrder: number;
  clearOnFilterChange: boolean;
  clearOnViewportPan: boolean;
}

export const LAYER_OWNERSHIP_RULES: Record<MapLayerType, LayerOwnershipRule> = {
  Tile: { layerType: 'Tile', zIndexOrder: 100, clearOnFilterChange: false, clearOnViewportPan: false },
  Boundary: { layerType: 'Boundary', zIndexOrder: 200, clearOnFilterChange: false, clearOnViewportPan: false },
  Neighborhood: { layerType: 'Neighborhood', zIndexOrder: 300, clearOnFilterChange: false, clearOnViewportPan: false },
  Heatmap: { layerType: 'Heatmap', zIndexOrder: 400, clearOnFilterChange: true, clearOnViewportPan: false },
  Route: { layerType: 'Route', zIndexOrder: 500, clearOnFilterChange: false, clearOnViewportPan: false },
  Landmark: { layerType: 'Landmark', zIndexOrder: 600, clearOnFilterChange: false, clearOnViewportPan: false },
  Marker: { layerType: 'Marker', zIndexOrder: 700, clearOnFilterChange: true, clearOnViewportPan: true },
  GoldPin: { layerType: 'GoldPin', zIndexOrder: 800, clearOnFilterChange: true, clearOnViewportPan: false },
  Drawing: { layerType: 'Drawing', zIndexOrder: 900, clearOnFilterChange: false, clearOnViewportPan: false },
};

export interface RegisteredLayerHandle {
  layerType: MapLayerType;
  visible: boolean;
  itemCount: number;
  revision: number;
  clear: () => void;
}

export class LayerRegistry {
  private layers = new Map<MapLayerType, RegisteredLayerHandle>();

  registerLayer(layerType: MapLayerType, clearFn?: () => void): RegisteredLayerHandle {
    const existing = this.layers.get(layerType);
    if (existing) {
      existing.clear();
    }
    const handle: RegisteredLayerHandle = {
      layerType,
      visible: true,
      itemCount: 0,
      revision: (existing?.revision ?? 0) + 1,
      clear: () => {
        handle.itemCount = 0;
        clearFn?.();
      },
    };
    this.layers.set(layerType, handle);
    return handle;
  }

  updateLayerItems(layerType: MapLayerType, count: number): RegisteredLayerHandle {
    let handle = this.layers.get(layerType);
    if (!handle) {
      handle = this.registerLayer(layerType);
    }
    handle.itemCount = Math.max(0, count);
    handle.revision += 1;
    return handle;
  }

  setLayerVisibility(layerType: MapLayerType, visible: boolean): void {
    const handle = this.layers.get(layerType);
    if (handle) {
      handle.visible = visible;
      handle.revision += 1;
    }
  }

  clearLayer(layerType: MapLayerType): void {
    const handle = this.layers.get(layerType);
    if (handle) {
      handle.clear();
      handle.revision += 1;
    }
  }

  getLayer(layerType: MapLayerType): RegisteredLayerHandle | undefined {
    return this.layers.get(layerType);
  }

  getAllLayers(): RegisteredLayerHandle[] {
    return Array.from(this.layers.values()).sort(
      (a, b) => LAYER_OWNERSHIP_RULES[a.layerType].zIndexOrder - LAYER_OWNERSHIP_RULES[b.layerType].zIndexOrder
    );
  }

  clearAll(): void {
    for (const handle of this.layers.values()) {
      handle.clear();
    }
    this.layers.clear();
  }
}
