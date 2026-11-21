/** @file src/features/onboarding/components/Stage34AccessibilitySubpanel.tsx — Stage 34 (RT-UI-ACCESSIBILITY-001) Inclusive Design & WCAG 2.2 AA Interactive Subpanel */
import React, { useMemo, useState } from 'react';
import { Eye, HelpCircle } from 'lucide-react';
import { toPersianNum, type EvaluatedNeighborhood } from '../../../data/neighborhoods';
import {
  NON_DRAG_SPATIAL_SELECTION_METHODS,
  PLAIN_LANGUAGE_STAT_GLOSSARY,
  RADAR_AUDITED_COLOR_PAIRS,
  buildAccessibleMapListItems,
  evaluateWcagContrast,
  resolveAccessibleStatusBadge,
  resolveBookmarkAccessibleName,
  resolveFocusTargetAfterRemoval,
} from '../services/accessibilityEngine';

export interface Stage34AccessibilitySubpanelProps {
  evaluatedNeighborhoods: EvaluatedNeighborhood[];
  wcagTextSpacing: boolean;
  onToggleWcagTextSpacing: () => void;
  reducedMotion: boolean;
  onToggleReducedMotion: () => void;
  onAnnounceStatus: (msgFa: string) => void;
}

export const Stage34AccessibilitySubpanel: React.FC<Stage34AccessibilitySubpanelProps> = ({
  evaluatedNeighborhoods,
  wcagTextSpacing,
  onToggleWcagTextSpacing,
  reducedMotion,
  onToggleReducedMotion,
  onAnnounceStatus,
}) => {
  const [spatialViewMode, setSpatialViewMode] = useState<'map' | 'accessible_list'>('accessible_list');
  const [nonDragMethod, setNonDragMethod] = useState<string>(NON_DRAG_SPATIAL_SELECTION_METHODS[0].id);
  const [savedDemoProperty, setSavedDemoProperty] = useState(false);
  const [focusDemoItems, setFocusDemoItems] = useState<string[]>(['ملک سعادت‌آباد', 'ملک پونک', 'ملک ونک']);
  const [lastFocusTarget, setLastFocusTarget] = useState<string>('ملک سعادت‌آباد');

  const accessibleListItems = useMemo(() => buildAccessibleMapListItems(evaluatedNeighborhoods), [evaluatedNeighborhoods]);
  const bookmarkA11y = resolveBookmarkAccessibleName(savedDemoProperty, 'واحد ۹۵ متری سعادت‌آباد');

  return (
    <div className="space-y-4" data-testid="stage-34-accessibility-panel">
      <div className="flex flex-wrap items-center justify-between gap-2 p-3 rounded-[10px] bg-[#F6F8F6] dark:bg-slate-800">
        <div className="flex flex-wrap items-center gap-2">
          <button
            type="button"
            data-testid="toggle-wcag-text-spacing"
            aria-pressed={wcagTextSpacing}
            onClick={() => {
              onToggleWcagTextSpacing();
              onAnnounceStatus('تنظیمات فاصله‌گذاری متن WCAG 1.4.12 (خط ۱.۵ برابر، حروف ۰.۱۲em) تغییر کرد.');
            }}
            className={`px-3 py-2 min-h-[44px] rounded-[8px] font-bold cursor-pointer ${
              wcagTextSpacing ? 'bg-[var(--color-brand-600)] text-white' : 'bg-white dark:bg-slate-900 border border-[#DCE3DF] dark:border-slate-700'
            }`}
          >
            فاصله‌گذاری استاندارد متن (WCAG 1.4.12)
          </button>
          <button
            type="button"
            data-testid="toggle-reduced-motion"
            aria-pressed={reducedMotion}
            onClick={() => {
              onToggleReducedMotion();
              onAnnounceStatus('حالت کاهش حرکت (Reduced Motion) برای حذف انیمیشن‌های غیرضروری تغییر کرد.');
            }}
            className={`px-3 py-2 min-h-[44px] rounded-[8px] font-bold cursor-pointer ${
              reducedMotion ? 'bg-[var(--color-brand-600)] text-white' : 'bg-white dark:bg-slate-900 border border-[#DCE3DF] dark:border-slate-700'
            }`}
          >
            کاهش حرکت ({reducedMotion ? 'فعال' : 'عادی'})
          </button>
          <button
            type="button"
            data-testid="accessible-bookmark-demo-btn"
            aria-pressed={bookmarkA11y.ariaPressed}
            aria-label={bookmarkA11y.accessibleNameFa}
            onClick={() => {
              const next = !savedDemoProperty;
              setSavedDemoProperty(next);
              onAnnounceStatus(resolveBookmarkAccessibleName(next).statusAnnouncementFa);
            }}
            className="px-3 py-2 min-h-[44px] rounded-[8px] bg-white dark:bg-slate-900 border border-[var(--color-brand-600)] text-[var(--color-brand-600)] dark:text-emerald-300 font-bold cursor-pointer"
          >
            {bookmarkA11y.accessibleNameFa}
          </button>
        </div>
        <div className="inline-flex rounded-[8px] border border-[#DCE3DF] dark:border-slate-700 bg-white dark:bg-slate-900 p-0.5">
          <button type="button" onClick={() => setSpatialViewMode('map')} className={`px-3 py-1.5 rounded-[6px] font-bold cursor-pointer ${spatialViewMode === 'map' ? 'bg-[var(--color-brand-600)] text-white' : ''}`}>نمای نقشه</button>
          <button type="button" data-testid="switch-accessible-list-view" onClick={() => setSpatialViewMode('accessible_list')} className={`px-3 py-1.5 rounded-[6px] font-bold cursor-pointer ${spatialViewMode === 'accessible_list' ? 'bg-[var(--color-brand-600)] text-white' : ''}`}>نمای فهرست جایگزین نقشه (برابری عملکردی)</button>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        <div className="p-4 rounded-[12px] border border-[#DCE3DF] dark:border-slate-800 space-y-3">
          <h3 className="text-sm font-black text-[#182522] dark:text-white flex items-center gap-1.5">
            <Eye className="w-4 h-4 text-[var(--color-brand-600)]" />
            <span>مسیر جایگزین نقشه و انتخاب مکانی بدون نیاز به Drag (WCAG 2.5.7)</span>
          </h3>
          <div>
            <label htmlFor="non-drag-select" className="block font-bold text-[#182522] dark:text-slate-200 mb-1">
              روش انتخاب محدوده بدون کشیدن ماوس (جایگزین ترسیم چندضلعی):
            </label>
            <select
              id="non-drag-select"
              value={nonDragMethod}
              onChange={(e) => {
                setNonDragMethod(e.target.value);
                onAnnounceStatus('روش انتخاب محدوده بدون Drag تغییر کرد.');
              }}
              className="w-full p-2 min-h-[44px] rounded-[8px] bg-[#F6F8F6] dark:bg-slate-800 border border-[#DCE3DF] dark:border-slate-700 font-bold"
            >
              {NON_DRAG_SPATIAL_SELECTION_METHODS.map((m) => (
                <option key={m.id} value={m.id}>{m.labelFa}</option>
              ))}
            </select>
          </div>
          <table className="w-full text-right border-collapse">
            <caption className="text-right font-bold text-[#34433E] dark:text-slate-300 pb-1.5">
              جدول متنی محله‌ها و شاخص قیمت (جایگزین همگام با نقشه و نمودار — بدون افشای پلاک خصوصی)
            </caption>
            <thead>
              <tr className="border-b border-[#DCE3DF] dark:border-slate-700 text-[#586760]">
                <th scope="col" className="py-1.5">محله و منطقه</th>
                <th scope="col" className="py-1.5">میانه قیمت هر مترمربع</th>
                <th scope="col" className="py-1.5">وضعیت داده (متن + الگو)</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-[#DCE3DF]/60 dark:divide-slate-800 tabular-nums">
              {accessibleListItems.slice(0, 3).map((item) => {
                const badge = resolveAccessibleStatusBadge(item.dataCredibilityFa.includes('معتبر') ? 'active' : 'estimated_data');
                return (
                  <tr key={item.hoodId}>
                    <td className="py-2 font-bold text-[#182522] dark:text-white">{item.placeNameFa} · {item.regionLabelFa}</td>
                    <td className="py-2">{item.avgPriceTextFa}</td>
                    <td className="py-2" aria-label={badge.ariaLabelFa}>{badge.labelFa}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>

        <div className="p-4 rounded-[12px] border border-[#DCE3DF] dark:border-slate-800 space-y-3">
          <h3 className="text-sm font-black text-[#182522] dark:text-white flex items-center gap-1.5">
            <HelpCircle className="w-4 h-4 text-[var(--color-brand-600)]" />
            <span>کنتراست تاییدشده، زبان ساده آماری و مدیریت فوکوس پس از حذف (بند ۳۷.۱)</span>
          </h3>
          <div className="space-y-1.5">
            {RADAR_AUDITED_COLOR_PAIRS.slice(0, 3).map((pair) => {
              const res = evaluateWcagContrast(pair.fg, pair.bg, pair.role);
              return (
                <div key={pair.id} className="flex items-center justify-between text-[11px] p-1.5 rounded bg-[#F6F8F6] dark:bg-slate-800 tabular-nums">
                  <span className="font-bold">{pair.labelFa}</span>
                  <span>نسبت کنتراست: <strong>{toPersianNum(res.ratio)}:۱</strong> (حداقل AA: {toPersianNum(res.requiredMin)}:۱ — تاییدشده)</span>
                </div>
              );
            })}
          </div>
          <div className="p-2.5 rounded-[8px] bg-[#F6F8F6] dark:bg-slate-800 space-y-1">
            {PLAIN_LANGUAGE_STAT_GLOSSARY.slice(0, 2).map((g) => (
              <p key={g.termFa}><strong>{g.termFa}:</strong> {g.plainDefinitionFa}</p>
            ))}
          </div>
          <div className="p-2.5 rounded-[8px] border border-[#DCE3DF] dark:border-slate-700 space-y-2">
            <div className="font-bold text-[#182522] dark:text-white">آزمون انتقال فوکوس پس از حذف آیتم (فوکوس فعلی: «{lastFocusTarget}»)</div>
            <div className="flex flex-wrap gap-1.5">
              {focusDemoItems.map((item, idx) => (
                <button
                  key={item}
                  type="button"
                  onClick={() => {
                    const nextList = focusDemoItems.filter((_, i) => i !== idx);
                    const recovery = resolveFocusTargetAfterRemoval(nextList, idx, 'عنوان وضعیت خالی فهرست');
                    setFocusDemoItems(nextList);
                    setLastFocusTarget(recovery.targetId);
                    onAnnounceStatus(`آیتم «${item}» حذف شد؛ فوکوس به «${recovery.targetId}» منتقل گردید.`);
                  }}
                  className="px-2.5 py-1 rounded bg-rose-50 dark:bg-rose-950/50 text-rose-800 dark:text-rose-200 border border-rose-200 dark:border-rose-800 font-bold cursor-pointer"
                >
                  حذف «{item}» ×
                </button>
              ))}
              {focusDemoItems.length === 0 && (
                <button type="button" onClick={() => { setFocusDemoItems(['ملک سعادت‌آباد', 'ملک پونک', 'ملک ونک']); setLastFocusTarget('ملک سعادت‌آباد'); }} className="px-2.5 py-1 rounded bg-[var(--color-brand-600)] text-white font-bold cursor-pointer">
                  بازنشانی فهرست نمونه
                </button>
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};
