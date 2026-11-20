/** Durable telemetry journal replay worker — RT-TELEMETRY-CRITICAL-037 */
import type { TelemetryDataProcessingService } from './telemetryService';

export function runTelemetryReplayOnce(service: TelemetryDataProcessingService, maxBatch = 200): number {
  return service.replayJournalBatchToAggregator(maxBatch);
}