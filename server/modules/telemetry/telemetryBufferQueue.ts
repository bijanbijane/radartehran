import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import type { TelemetryEventPayload } from './telemetryTypes';

export interface DurableBufferRecord {
  readonly recordId: string;
  readonly eventId: string;
  readonly tehranDateKey: string;
  readonly payload: TelemetryEventPayload;
  readonly createdAtMs: number;
}

export interface TelemetryBufferStats {
  readonly pendingCount: number;
  readonly bufferFileSizeBytes: number;
  readonly deduplicatedCount: number;
  readonly droppedOverflowCount: number;
  readonly currentActivePartition: string;
}

export class DurableTelemetryBufferQueue {
  private readonly bufferDir: string;
  private readonly maxInMemoryDedupeSize = 10_000;
  private readonly seenEventIds = new Set<string>();
  private readonly maxFileSizeBytes: number;
  private deduplicatedCount = 0;
  private droppedOverflowCount = 0;

  constructor(options?: { bufferDir?: string; maxFileSizeBytes?: number }) {
    this.bufferDir = options?.bufferDir || path.resolve(process.cwd(), '.telemetry-buffer');
    this.maxFileSizeBytes = options?.maxFileSizeBytes || 16 * 1024 * 1024; // 16MB per partition
    this.ensureDirectory();
    this.loadRecentEventIdsFromDisk();
  }

  private ensureDirectory(): void {
    if (!fs.existsSync(this.bufferDir)) {
      fs.mkdirSync(this.bufferDir, { recursive: true, mode: 0o700 });
    }
  }

  private getActivePartitionPath(dateKey: string): string {
    return path.join(this.bufferDir, `telemetry-journal-${dateKey}.ndjson`);
  }

  private loadRecentEventIdsFromDisk(): void {
    try {
      this.ensureDirectory();
      const files = fs.readdirSync(this.bufferDir).filter((f) => f.endsWith('.ndjson'));
      for (const file of files) {
        const filePath = path.join(this.bufferDir, file);
        const stats = fs.statSync(filePath);
        // Only inspect files modified within last 48 hours
        if (Date.now() - stats.mtimeMs < 48 * 60 * 60 * 1000) {
          const content = fs.readFileSync(filePath, 'utf-8');
          const lines = content.split('\n');
          for (const line of lines) {
            if (!line.trim()) continue;
            try {
              const parsed = JSON.parse(line) as { eventId?: string };
              if (parsed.eventId) {
                this.seenEventIds.add(parsed.eventId);
                if (this.seenEventIds.size >= this.maxInMemoryDedupeSize) break;
              }
            } catch {
              // Ignore corrupt lines during startup recovery
            }
          }
        }
      }
    } catch {
      // Defensive fallback
    }
  }

  public isDuplicate(eventId: string): boolean {
    return this.seenEventIds.has(eventId);
  }

  /**
   * Durably writes event to disk-backed write-ahead NDJSON partition.
   * Atomically confirms durable receipt.
   */
  public enqueue(event: TelemetryEventPayload): {
    accepted: boolean;
    isDuplicate: boolean;
    reason?: 'DEDUPLICATED' | 'BUFFER_OVERFLOW' | 'PERSISTENCE_FAILED';
  } {
    if (this.seenEventIds.has(event.eventId)) {
      this.deduplicatedCount += 1;
      return { accepted: false, isDuplicate: true, reason: 'DEDUPLICATED' };
    }

    this.ensureDirectory();
    const partitionPath = this.getActivePartitionPath(event.provenance.tehranDateKey);

    try {
      if (fs.existsSync(partitionPath)) {
        const stats = fs.statSync(partitionPath);
        if (stats.size >= this.maxFileSizeBytes) {
          this.droppedOverflowCount += 1;
          return { accepted: false, isDuplicate: false, reason: 'BUFFER_OVERFLOW' };
        }
      }

      const record: DurableBufferRecord = {
        recordId: `rec_${crypto.randomBytes(6).toString('hex')}`,
        eventId: event.eventId,
        tehranDateKey: event.provenance.tehranDateKey,
        payload: event,
        createdAtMs: Date.now(),
      };

      const line = JSON.stringify(record) + '\n';
      fs.appendFileSync(partitionPath, line, { mode: 0o600, flag: 'a' });

      // Track in LRU-like set
      if (this.seenEventIds.size >= this.maxInMemoryDedupeSize) {
        const oldest = this.seenEventIds.values().next().value;
        if (oldest !== undefined) this.seenEventIds.delete(oldest);
      }
      this.seenEventIds.add(event.eventId);

      return { accepted: true, isDuplicate: false };
    } catch {
      return { accepted: false, isDuplicate: false, reason: 'PERSISTENCE_FAILED' };
    }
  }

  /**
   * Reads a bounded batch from active partitions for processing.
   */
  public readBatch(maxBatchSize = 100): DurableBufferRecord[] {
    const results: DurableBufferRecord[] = [];
    try {
      this.ensureDirectory();
      const files = fs.readdirSync(this.bufferDir).filter((f) => f.endsWith('.ndjson')).sort();
      for (const file of files) {
        if (results.length >= maxBatchSize) break;
        const filePath = path.join(this.bufferDir, file);
        const content = fs.readFileSync(filePath, 'utf-8');
        const lines = content.split('\n');
        for (const line of lines) {
          if (!line.trim()) continue;
          try {
            const parsed = JSON.parse(line) as DurableBufferRecord;
            if (parsed && parsed.payload && parsed.eventId) {
              results.push(parsed);
              if (results.length >= maxBatchSize) break;
            }
          } catch {
            // Skip damaged lines
          }
        }
      }
    } catch {
      // Defensive
    }
    return results;
  }

  /**
   * Prunes older journal files past retention period.
   */
  public purgeExpiredPartitions(retentionDays = 30, nowMs = Date.now()): number {
    let deletedCount = 0;
    try {
      this.ensureDirectory();
      const maxAgeMs = retentionDays * 24 * 60 * 60 * 1000;
      const files = fs.readdirSync(this.bufferDir).filter((f) => f.endsWith('.ndjson'));
      for (const file of files) {
        const filePath = path.join(this.bufferDir, file);
        const stats = fs.statSync(filePath);
        if (nowMs - stats.mtimeMs > maxAgeMs) {
          fs.unlinkSync(filePath);
          deletedCount += 1;
        }
      }
    } catch {
      // Ignore cleanup error
    }
    return deletedCount;
  }

  public getStats(currentDateKey = toTehranDateKey(Date.now())): TelemetryBufferStats {
    let totalBytes = 0;
    let pendingCount = 0;
    try {
      this.ensureDirectory();
      const files = fs.readdirSync(this.bufferDir).filter((f) => f.endsWith('.ndjson'));
      for (const f of files) {
        const p = path.join(this.bufferDir, f);
        const st = fs.statSync(p);
        totalBytes += st.size;
      }
    } catch {
      // Defensive
    }

    return {
      pendingCount: this.seenEventIds.size,
      bufferFileSizeBytes: totalBytes,
      deduplicatedCount: this.deduplicatedCount,
      droppedOverflowCount: this.droppedOverflowCount,
      currentActivePartition: `telemetry-journal-${currentDateKey}.ndjson`,
    };
  }

  public clearForTests(): void {
    this.seenEventIds.clear();
    this.deduplicatedCount = 0;
    this.droppedOverflowCount = 0;
    try {
      if (fs.existsSync(this.bufferDir)) {
        const files = fs.readdirSync(this.bufferDir);
        for (const file of files) {
          fs.unlinkSync(path.join(this.bufferDir, file));
        }
        fs.rmdirSync(this.bufferDir);
      }
    } catch {
      // Ignore test cleanup
    }
  }
}

function toTehranDateKey(timestampMs: number): string {
  const safeMs = Number.isFinite(timestampMs) && timestampMs > 0 ? timestampMs : Date.now();
  return new Date(safeMs + (3 * 60 + 30) * 60_000).toISOString().slice(0, 10);
}
