import { GEO_ENGINE_CONFIG } from '../core/GeoConfig';

export interface SpatialOperationTiming {
  operation: string;
  durationMs: number;
  exceededMainThreadBudget: boolean;
  itemCount: number;
  timestamp: number;
}

export class MapPerformanceMonitor {
  private timings: SpatialOperationTiming[] = [];
  private maxSamples = 100;

  recordOperation(operation: string, durationMs: number, itemCount = 0): SpatialOperationTiming {
    const entry: SpatialOperationTiming = {
      operation,
      durationMs,
      exceededMainThreadBudget: durationMs > GEO_ENGINE_CONFIG.workerOffloadThresholdMs,
      itemCount,
      timestamp: Date.now(),
    };
    this.timings.push(entry);
    if (this.timings.length > this.maxSamples) {
      this.timings.shift();
    }
    return entry;
  }

  shouldOffloadToWorker(estimatedDurationMs: number, itemCount: number): boolean {
    return (
      estimatedDurationMs > GEO_ENGINE_CONFIG.workerOffloadThresholdMs ||
      itemCount > 2_000
    );
  }

  getTimings(): readonly SpatialOperationTiming[] {
    return this.timings;
  }

  clear(): void {
    this.timings = [];
  }
}
