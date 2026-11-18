/**
 * @file src/platform/entity-engagement/monitoring/ChangeEventAdapter.ts
 * @description Normalizes raw entity updates into canonical EntityChangeEvent with calculated deltaPercent, deltaAbsolute, and DataConfidence (Stage 8).
 */

import { ensureValidEngagementEntityRef } from '../core/EngagementContract';
import type {
  ChangeEventConfidence,
  EngagementEntityRef,
  EntityChangeEvent,
  WatchConditionType,
} from '../core/EngagementTypes';

export interface RawEntityChangeInput {
  id?: string;
  entity: Partial<EngagementEntityRef>;
  changeType: WatchConditionType;
  previousValue?: unknown;
  currentValue?: unknown;
  confidence?: ChangeEventConfidence;
  sourceId?: string;
  observedAt?: string;
}

export function adaptEntityChangeEvent(raw: RawEntityChangeInput): EntityChangeEvent {
  const validEntity = ensureValidEngagementEntityRef(raw.entity);
  const prevNum = typeof raw.previousValue === 'number' && Number.isFinite(raw.previousValue) ? raw.previousValue : null;
  const currNum = typeof raw.currentValue === 'number' && Number.isFinite(raw.currentValue) ? raw.currentValue : null;

  let deltaAbsolute: number | null = null;
  let deltaPercent: number | null = null;

  if (prevNum !== null && currNum !== null) {
    deltaAbsolute = Number((currNum - prevNum).toFixed(4));
    if (prevNum !== 0) {
      deltaPercent = Number((((currNum - prevNum) / Math.abs(prevNum)) * 100).toFixed(2));
    }
  }

  const observedAt = raw.observedAt && !Number.isNaN(Date.parse(raw.observedAt))
    ? raw.observedAt
    : new Date().toISOString();

  return {
    id: raw.id || `chg:${validEntity.entityType}:${validEntity.id}:${raw.changeType}:${observedAt}`,
    entity: validEntity,
    changeType: raw.changeType,
    previousValue: raw.previousValue,
    currentValue: raw.currentValue,
    deltaPercent,
    deltaAbsolute,
    confidence: raw.confidence ?? 'verified',
    sourceId: raw.sourceId || 'radar-change-detector',
    observedAt,
  };
}
