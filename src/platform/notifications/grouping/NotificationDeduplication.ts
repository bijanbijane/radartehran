/**
 * @file src/platform/notifications/grouping/NotificationDeduplication.ts
 * @description Deduplicates incoming NotificationRecords by dedupeKey and id so duplicate realtime/polling packets never double-increment unread count (Stage 9).
 */

import type { NotificationRecord } from '../core/NotificationTypes';

export class NotificationDeduplicator {
  public deduplicateRecords(records: NotificationRecord[]): NotificationRecord[] {
    const byId = new Map<string, NotificationRecord>();
    const byDedupeKey = new Map<string, NotificationRecord>();

    for (const rec of records) {
      const existingById = byId.get(rec.id);
      const existingByDedupe = byDedupeKey.get(rec.dedupeKey);
      const existing = existingById || existingByDedupe;

      if (!existing) {
        byId.set(rec.id, rec);
        byDedupeKey.set(rec.dedupeKey, rec);
      } else {
        // Keep the newest or already-read state
        const existingTime = Date.parse(existing.readAt || existing.createdAt) || 0;
        const incomingTime = Date.parse(rec.readAt || rec.createdAt) || 0;
        const winner = incomingTime >= existingTime ? rec : existing;
        byId.set(winner.id, winner);
        byDedupeKey.set(winner.dedupeKey, winner);
      }
    }

    return Array.from(byDedupeKey.values());
  }

  public hasDuplicateInList(
    existingRecords: NotificationRecord[],
    incoming: NotificationRecord
  ): boolean {
    return existingRecords.some(
      (r) => r.id === incoming.id || (r.dedupeKey && r.dedupeKey === incoming.dedupeKey)
    );
  }
}
