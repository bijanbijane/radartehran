/**
 * @file src/platform/entity-engagement/monitoring/WatchRuleService.ts
 * @description Service managing WatchRule creation, validation, enable/disable, and workspace-isolated storage (Stage 8).
 */

import {
  buildEngagementIsolationKey,
  ensureValidEngagementEntityRef,
} from '../core/EngagementContract';
import { normalizeWatchRuleThresholds } from '../core/EngagementNormalizer';
import { isWatchConditionSupportedForEntity } from '../core/EngagementRegistry';
import type {
  EngagementEntityRef,
  EntityType,
  WatchConditionType,
  WatchRule,
} from '../core/EngagementTypes';

export class WatchRuleService {
  private rulesByContext = new Map<string, Map<string, WatchRule>>();
  private activeContextKey: string | null = null;

  public setContext(userId: string, workspaceId: string, permissionVersion = 1): string {
    const key = buildEngagementIsolationKey(userId, workspaceId, permissionVersion);
    this.activeContextKey = key;
    if (!this.rulesByContext.has(key)) {
      this.rulesByContext.set(key, new Map());
    }
    return key;
  }

  private getActiveMap(): Map<string, WatchRule> {
    if (!this.activeContextKey) {
      throw new Error('WATCH_RULE_NO_ACTIVE_CONTEXT');
    }
    let m = this.rulesByContext.get(this.activeContextKey);
    if (!m) {
      m = new Map();
      this.rulesByContext.set(this.activeContextKey, m);
    }
    return m;
  }

  public upsertWatchRule(params: {
    userId: string;
    workspaceId: string;
    permissionVersion?: number;
    entity: Partial<EngagementEntityRef>;
    conditionType: WatchConditionType;
    thresholdPercent?: number;
    thresholdAbsolute?: number;
    cooldownMinutes?: number;
    enabled?: boolean;
  }): { ok: boolean; rule?: WatchRule; errorFa?: string } {
    this.setContext(params.userId, params.workspaceId, params.permissionVersion ?? 1);
    const validEntity = ensureValidEngagementEntityRef(params.entity);

    if (!isWatchConditionSupportedForEntity(validEntity.entityType, params.conditionType)) {
      return {
        ok: false,
        errorFa: `شرط رصد «${params.conditionType}» برای موجودیت از نوع «${validEntity.entityType}» مجاز نیست.`,
      };
    }

    const normalized = normalizeWatchRuleThresholds({
      thresholdPercent: params.thresholdPercent,
      thresholdAbsolute: params.thresholdAbsolute,
      cooldownMinutes: params.cooldownMinutes,
    });

    const map = this.getActiveMap();
    const ruleId = `watch:${params.userId}:${params.workspaceId}:${validEntity.entityType}:${validEntity.id}:${params.conditionType}`;
    const existing = map.get(ruleId);
    const now = new Date().toISOString();

    const rule: WatchRule = {
      id: ruleId,
      userId: params.userId,
      workspaceId: params.workspaceId,
      entity: validEntity,
      conditionType: params.conditionType,
      thresholdPercent: normalized.thresholdPercent,
      thresholdAbsolute: normalized.thresholdAbsolute,
      cooldownMinutes: normalized.cooldownMinutes,
      enabled: params.enabled ?? true,
      createdAt: existing?.createdAt || now,
      updatedAt: now,
      lastTriggeredAt: existing?.lastTriggeredAt,
    };

    map.set(ruleId, rule);
    return { ok: true, rule };
  }

  public setRuleEnabled(
    userId: string,
    workspaceId: string,
    ruleId: string,
    enabled: boolean,
    permissionVersion = 1
  ): WatchRule | null {
    this.setContext(userId, workspaceId, permissionVersion);
    const map = this.getActiveMap();
    const existing = map.get(ruleId);
    if (!existing) return null;
    const updated: WatchRule = {
      ...existing,
      enabled,
      updatedAt: new Date().toISOString(),
    };
    map.set(ruleId, updated);
    return updated;
  }

  public recordRuleTriggered(
    userId: string,
    workspaceId: string,
    ruleId: string,
    triggeredAtIso: string,
    permissionVersion = 1
  ): WatchRule | null {
    this.setContext(userId, workspaceId, permissionVersion);
    const map = this.getActiveMap();
    const existing = map.get(ruleId);
    if (!existing) return null;
    const updated: WatchRule = {
      ...existing,
      lastTriggeredAt: triggeredAtIso,
      updatedAt: triggeredAtIso,
    };
    map.set(ruleId, updated);
    return updated;
  }

  public listRulesForEntity(
    userId: string,
    workspaceId: string,
    entityType: EntityType,
    entityId: string,
    permissionVersion = 1
  ): WatchRule[] {
    this.setContext(userId, workspaceId, permissionVersion);
    return Array.from(this.getActiveMap().values()).filter(
      (r) => r.entity.entityType === entityType && r.entity.id === entityId
    );
  }

  public listAllRules(userId: string, workspaceId: string, permissionVersion = 1): WatchRule[] {
    this.setContext(userId, workspaceId, permissionVersion);
    return Array.from(this.getActiveMap().values());
  }

  public deleteRule(userId: string, workspaceId: string, ruleId: string, permissionVersion = 1): boolean {
    this.setContext(userId, workspaceId, permissionVersion);
    return this.getActiveMap().delete(ruleId);
  }

  public clearAllForSecurityTransition(): void {
    this.rulesByContext.clear();
    this.activeContextKey = null;
  }
}
