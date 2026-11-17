import { LatLngPoint } from '../core/GeoTypes';
import { adaptPolygonToLeafletRing } from '../leaflet/LeafletAdapters';

export interface BoundaryPolygonDescriptor {
  id: string;
  nameFa: string;
  ring: LatLngPoint[];
  strokeColor: string;
  fillColor: string;
  fillOpacity: number;
  selected?: boolean;
}

export function buildBoundaryLayerDescriptors(
  items: readonly BoundaryPolygonDescriptor[],
  selectedId?: string | null
): Array<BoundaryPolygonDescriptor & { leafletRing: [number, number][] }> {
  return items
    .map((item) => {
      const isSelected = selectedId != null && item.id === selectedId;
      return {
        ...item,
        selected: isSelected,
        fillOpacity: isSelected ? Math.min(0.65, item.fillOpacity + 0.25) : item.fillOpacity,
        leafletRing: adaptPolygonToLeafletRing(item.ring),
      };
    })
    .filter((d) => d.leafletRing.length >= 3);
}
