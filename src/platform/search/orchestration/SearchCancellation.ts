/**
 * @file src/platform/search/orchestration/SearchCancellation.ts
 * @description AbortController registry and stale-response suppression for concurrent search requests.
 */

export interface ActiveSearchAbortEntry {
  requestId: string;
  sequenceNumber: number;
  cacheKey: string;
  controller: AbortController;
  startedAtMs: number;
}

export class SearchCancellationController {
  private sequenceCounter = 0;
  private latestSequenceBySlot = new Map<string, number>();
  private inFlightBySlot = new Map<string, ActiveSearchAbortEntry>();

  issueRequestToken(slotId = 'default', cacheKey = ''): ActiveSearchAbortEntry {
    const previous = this.inFlightBySlot.get(slotId);
    if (previous && previous.cacheKey !== cacheKey) {
      previous.controller.abort('SUPERSEDED_BY_NEWER_QUERY');
      this.inFlightBySlot.delete(slotId);
    }

    const sequenceNumber = ++this.sequenceCounter;
    this.latestSequenceBySlot.set(slotId, sequenceNumber);

    const entry: ActiveSearchAbortEntry = {
      requestId: `sreq-${sequenceNumber}`,
      sequenceNumber,
      cacheKey,
      controller: new AbortController(),
      startedAtMs: Date.now(),
    };

    this.inFlightBySlot.set(slotId, entry);
    return entry;
  }

  isLatestSequence(slotId: string, sequenceNumber: number): boolean {
    const latest = this.latestSequenceBySlot.get(slotId) ?? 0;
    return sequenceNumber === latest;
  }

  completeSlot(slotId: string, sequenceNumber: number): void {
    const current = this.inFlightBySlot.get(slotId);
    if (current && current.sequenceNumber === sequenceNumber) {
      this.inFlightBySlot.delete(slotId);
    }
  }

  abortAll(reason = 'WORKSPACE_OR_USER_CHANGED'): void {
    for (const entry of this.inFlightBySlot.values()) {
      entry.controller.abort(reason);
    }
    this.inFlightBySlot.clear();
  }
}
