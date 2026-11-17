import { BoundingBox, SpatialPointItem } from '../core/GeoTypes';
import { isPointInBoundingBox } from '../core/GeoBounds';

export class GridSpatialIndex<T = Record<string, unknown>> {
  private cellSizeDeg: number;
  private buckets = new Map<string, SpatialPointItem<T>[]>();
  private totalCount = 0;

  constructor(cellSizeDeg = 0.02) {
    this.cellSizeDeg = Math.max(0.001, cellSizeDeg);
  }

  private getCellKey(lat: number, lng: number): string {
    const r = Math.floor(lat / this.cellSizeDeg);
    const c = Math.floor(lng / this.cellSizeDeg);
    return `${r}:${c}`;
  }

  load(items: readonly SpatialPointItem<T>[]): void {
    this.buckets.clear();
    this.totalCount = 0;
    for (const item of items) {
      if (!Number.isFinite(item.lat) || !Number.isFinite(item.lng)) continue;
      const key = this.getCellKey(item.lat, item.lng);
      let bucket = this.buckets.get(key);
      if (!bucket) {
        bucket = [];
        this.buckets.set(key, bucket);
      }
      bucket.push(item);
      this.totalCount += 1;
    }
  }

  queryBounds(bounds: BoundingBox): SpatialPointItem<T>[] {
    const minR = Math.floor(bounds.south / this.cellSizeDeg);
    const maxR = Math.floor(bounds.north / this.cellSizeDeg);
    const minC = Math.floor(bounds.west / this.cellSizeDeg);
    const maxC = Math.floor(bounds.east / this.cellSizeDeg);

    const results: SpatialPointItem<T>[] = [];
    for (let r = minR; r <= maxR; r++) {
      for (let c = minC; c <= maxC; c++) {
        const bucket = this.buckets.get(`${r}:${c}`);
        if (!bucket) continue;
        for (const item of bucket) {
          if (isPointInBoundingBox({ lat: item.lat, lng: item.lng }, bounds)) {
            results.push(item);
          }
        }
      }
    }
    return results;
  }

  size(): number {
    return this.totalCount;
  }
}
