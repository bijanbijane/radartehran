/**
 * @file src/platform/entity-engagement/monitoring/DuplicateSuppression.ts
 * @description Cooldown and Deduplication Registry preventing duplicate or noisy alerts from firing repeatedly (Stage 8).
 */

import type { EntityChangeEvent, WatchRule } from '../core/EngagementTypes';

export function buildAlertDedupeKey(rule: WatchRule, event: EntityChangeEvent): string {
  const currValStr =
    event.currentValue !== undefined && event.currentValue !== null
      ? String(event.currentValue)
      : 'none';
  return `alert-dedupe:${rule.userId}:${rule.workspaceId}:${rule.entity.entityType}:${rule.entity.id}:${rule.conditionType}:${currValStr}`;
}

export class DuplicateSuppressionEngine {
  private seenDedupeKeys = new Map<string, number>();

  public isDuplicateEvent(
    rule: WatchRule,
    event: EntityChangeEvent,
    nowMs = Date.now(),
    dedupeWindowMs = 24 * 60 * 60 * 1000
  ): { suppressed: boolean; dedupeKey: string } {
    const dedupeKey = buildAlertDedupeKey(rule, event);
    const previousTime = this.seenDedupeKeys.get(dedupeKey);
    if (previousTime !== undefined && nowMs - previousTime < dedupeWindowMs) {
      return { suppressed: true, dedupeKey };
    }
    return { suppressed: false, dedupeKey };
  }

  public isCooldownActive(rule: WatchRule, eventObservedAtIso: string): boolean {
    if (!rule.lastTriggeredAt) return false;
    const lastMs = Date.parse(rule.lastTriggeredAt);
    const eventMs = Date.parse(eventObservedAtIso);
    if (Number.isNaN(lastMs) || Number.isNaN(eventMs)) return false;
    const cooldownMs = Math.max(1, rule.cooldownMinutes) * 60 * 1000;
    return eventMs - lastMs < cooldownMs;
  }

  public recordDispatchedAlert(dedupeKey: string, dispatchedAtMs = Date.now()): void {
    this.seenDedupeKeys.set(dedupeKey, dispatchedAtMs);
  }

  public clear(): void {
    this.seenDedupeKeys.clear();
  }
}
