/**
 * @file src/shared/engagement-ui/WatchRuleEditor.tsx
 * @description Editor for entity-specific WatchRules enforcing supported WatchConditionType per EntityType (Stage 8).
 */

import React, { useState } from 'react';
import {
  getSupportedWatchConditionsForEntity,
  type EngagementEntityRef,
  type WatchConditionType,
  type WatchRule,
} from '../../platform/entity-engagement';

export interface WatchRuleEditorProps {
  entity: EngagementEntityRef;
  existingRules: WatchRule[];
  onSaveRule: (params: {
    conditionType: WatchConditionType;
    thresholdPercent?: number;
    cooldownMinutes: number;
  }) => void;
  onToggleRule?: (ruleId: string, enabled: boolean) => void;
}

export const WatchRuleEditor: React.FC<WatchRuleEditorProps> = ({
  entity,
  existingRules,
  onSaveRule,
  onToggleRule,
}) => {
  const supported = getSupportedWatchConditionsForEntity(entity.entityType);
  const [selectedCondition, setSelectedCondition] = useState<WatchConditionType>(
    supported[0]?.conditionType || 'status_change'
  );
  const [thresholdPercent, setThresholdPercent] = useState<number>(3);
  const [cooldownMinutes, setCooldownMinutes] = useState<number>(60);

  const activeDesc = supported.find((d) => d.conditionType === selectedCondition);

  return (
    <div dir="rtl" data-testid="watch-rule-editor" className="rounded-xl border border-slate-800 bg-slate-900/90 p-4 space-y-3">
      <h3 className="text-xs font-bold text-slate-100">قواعد رصد تغییرات «{entity.title}»</h3>

      <div className="grid grid-cols-1 gap-2 sm:grid-cols-3">
        <select
          aria-label="نوع شرط رصد"
          value={selectedCondition}
          onChange={(e) => setSelectedCondition(e.target.value as WatchConditionType)}
          className="rounded-lg border border-slate-700 bg-slate-800 px-2.5 py-1.5 text-xs text-slate-100"
        >
          {supported.map((cond) => (
            <option key={cond.conditionType} value={cond.conditionType}>
              {cond.labelFa}
            </option>
          ))}
        </select>

        {activeDesc?.requiresThreshold && (
          <input
            type="number"
            min={1}
            max={90}
            value={thresholdPercent}
            onChange={(e) => setThresholdPercent(Number(e.target.value))}
            aria-label="آستانه درصد تغییر"
            className="rounded-lg border border-slate-700 bg-slate-800 px-2.5 py-1.5 text-xs text-slate-100"
          />
        )}

        <button
          type="button"
          data-testid="save-watch-rule-btn"
          onClick={() =>
            onSaveRule({
              conditionType: selectedCondition,
              thresholdPercent: activeDesc?.requiresThreshold ? thresholdPercent : undefined,
              cooldownMinutes,
            })
          }
          className="rounded-lg bg-emerald-600 px-3 py-1.5 text-xs font-semibold text-white hover:bg-emerald-500 cursor-pointer"
        >
          ثبت قاعده رصد
        </button>
      </div>

      {existingRules.length > 0 && (
        <div className="space-y-1.5 border-t border-slate-800 pt-2">
          {existingRules.map((r) => (
            <div
              key={r.id}
              data-testid={`watch-rule-item-${r.id}`}
              className="flex items-center justify-between rounded-lg bg-slate-950/60 px-3 py-1.5 text-xs text-slate-300"
            >
              <span>
                شرط: {r.conditionType}
                {r.thresholdPercent ? ` (${r.thresholdPercent}٪)` : ''}
              </span>
              <input
                type="checkbox"
                checked={r.enabled}
                onChange={(e) => onToggleRule?.(r.id, e.target.checked)}
                aria-label={`فعال‌سازی قاعده ${r.conditionType}`}
              />
            </div>
          ))}
        </div>
      )}
    </div>
  );
};
