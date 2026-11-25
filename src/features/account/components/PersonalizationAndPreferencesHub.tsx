/**
 * RT-UI-PERSONALIZATION-001 (Stage 31) | Personal Workspace, Saved Items & User Preferences Hub
 * Covers: Unified Saved Items (Properties, Neighborhoods, Searches, Map Layer Presets, Knowledge),
 * Undoable Removal, Bulk Delete, Expired Listing & Unavailable Map Layer Notices,
 * Display/Map/Search Preferences, Live Currency/Number Preview, and 3-Tier Personalization Controls.
 */

import React, { useState } from 'react';
import { Bookmark, CheckSquare, Eye, Layers, MapPin, RotateCcw, Sliders, Sparkles, Trash2 } from 'lucide-react';
import {
  defaultPersonalizationEngine,
  formatPriceByUserPreference,
  formatValueWithNumberPreference,
  type SavedEntityKind,
} from '../services/personalizationAndPreferencesEngine';

export const PersonalizationAndPreferencesHub: React.FC = () => {
  const [userId] = useState('usr-current');
  const [items, setItems] = useState(() => defaultPersonalizationEngine.listSavedItems('usr-current').items);
  const [prefs, setPrefs] = useState(() => defaultPersonalizationEngine.getPreferences('usr-current'));
  const [filterKind, setFilterKind] = useState<'ALL' | SavedEntityKind>('ALL');
  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  const [undoBannerFa, setUndoBannerFa] = useState<string | null>(null);
  const [activePrefSection, setActivePrefSection] = useState<'DISPLAY' | 'MAP' | 'SEARCH' | 'PERSONALIZATION'>('DISPLAY');

  const filteredItems = items.filter((it) => filterKind === 'ALL' || it.entityType === filterKind);
  const toggleSelect = (id: string) => setSelectedIds((prev) => (prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]));

  const handleRemoveSingle = (id: string) => {
    const res = defaultPersonalizationEngine.removeSavedItemWithUndo(userId, id);
    if (res.removed) {
      setItems(defaultPersonalizationEngine.listSavedItems(userId).items);
      setSelectedIds((prev) => prev.filter((x) => x !== id));
      setUndoBannerFa(res.undoMessageFa || 'حذف شد.');
    }
  };

  const handleUndoRemove = () => {
    const restored = defaultPersonalizationEngine.undoLastRemovedItem(userId);
    if (restored) {
      setItems(defaultPersonalizationEngine.listSavedItems(userId).items);
      setUndoBannerFa(null);
    }
  };

  const handleBulkDelete = () => {
    if (selectedIds.length === 0) return;
    defaultPersonalizationEngine.bulkDeleteSavedItems(userId, selectedIds);
    setItems(defaultPersonalizationEngine.listSavedItems(userId).items);
    setSelectedIds([]);
    setUndoBannerFa('موارد انتخاب‌شده به‌صورت گروهی حذف شدند.');
  };

  const samplePricePreview = formatPriceByUserPreference(14900, prefs.display);

  return (
    <section
      data-testid="personalization-and-preferences-hub"
      className="p-4 sm:p-5 rounded-2xl bg-[var(--color-bg-surface)] border border-[var(--color-border-subtle)] space-y-5 text-sm"
    >
      <div className="space-y-3" data-testid="unified-saved-items-section">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div>
            <strong className="text-base font-bold text-[var(--color-text-primary)] flex items-center gap-1.5">
              <Bookmark className="w-4 h-4 text-[var(--color-brand-fg)]" />
              <span>ذخیره‌های من (نگهداری یکپارچه املاک، محله‌ها، جست‌وجوها، نقشه‌ها و مطالب)</span>
            </strong>
            <p className="text-sm text-[var(--color-text-muted)] mt-0.5">
              ذخیره‌سازی بر پایه شناسه پایدار موجودیت · پشتیبانی از بازگردانی فوری (Undo)، حذف گروهی و نمایش وضعیت آگهی‌های منقضی
            </p>
          </div>
          {selectedIds.length > 0 && (
            <button
              type="button"
              data-testid="btn-bulk-delete-saved"
              onClick={handleBulkDelete}
              className="min-h-[44px] md:min-h-[34px] px-3 py-1.5 rounded-xl bg-rose-600 text-white font-bold flex items-center gap-1 cursor-pointer"
            >
              <Trash2 className="w-3.5 h-3.5" />
              <span>حذف گروهی ({formatValueWithNumberPreference(selectedIds.length, prefs.display.numberFormat)} مورد)</span>
            </button>
          )}
        </div>

        {undoBannerFa && (
          <div data-testid="saved-item-undo-banner" className="p-2.5 rounded-xl bg-amber-50 dark:bg-amber-950/40 border border-amber-200 dark:border-amber-800 flex items-center justify-between gap-2">
            <span className="font-bold text-amber-900 dark:text-amber-200">{undoBannerFa}</span>
            <button type="button" data-testid="btn-undo-removed-saved-item" onClick={handleUndoRemove} className="min-h-[44px] md:min-h-[32px] px-3 py-1 rounded-lg bg-amber-600 text-white font-bold flex items-center gap-1 cursor-pointer">
              <RotateCcw className="w-3.5 h-3.5" /><span>بازگردانی</span>
            </button>
          </div>
        )}

        <div className="flex flex-wrap items-center gap-1.5" role="tablist" aria-label="دسته‌بندی ذخیره‌ها">
          {[
            { id: 'ALL', label: 'همه ذخیره‌ها' },
            { id: 'PROPERTY', label: 'املاک ذخیره‌شده' },
            { id: 'NEIGHBORHOOD', label: 'محله‌های ذخیره‌شده' },
            { id: 'MAP_PRESET', label: 'نقشه‌ها و لایه‌ها' },
            { id: 'KNOWLEDGE_ARTICLE', label: 'مطالب دانشنامه' },
          ].map((t) => (
            <button
              key={t.id}
              type="button"
              role="tab"
              aria-selected={filterKind === t.id}
              data-testid={`saved-filter-tab-${t.id.toLowerCase()}`}
              onClick={() => setFilterKind(t.id as typeof filterKind)}
              className={`min-h-[44px] md:min-h-[36px] inline-flex items-center px-3 py-1.5 rounded-xl text-sm font-bold cursor-pointer ${filterKind === t.id ? 'bg-[var(--color-brand-600)] text-white' : 'bg-[var(--color-bg-muted)] text-[var(--color-text-secondary)]'}`}
            >
              {t.label}
            </button>
          ))}
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-2.5">
          {filteredItems.map((it) => {
            const formattedPrice = it.priceMillionToman !== undefined ? formatPriceByUserPreference(it.priceMillionToman, prefs.display) : null;
            return (
              <div key={it.id} data-testid={`unified-saved-card-${it.id}`} className="p-3 rounded-xl bg-[var(--color-bg-subtle)] border border-[var(--color-border-subtle)] flex items-start justify-between gap-2">
                <div className="flex items-start gap-2 min-w-0">
                  <input type="checkbox" aria-label={`انتخاب ${it.titleFa}`} checked={selectedIds.includes(it.id)} onChange={() => toggleSelect(it.id)} className="mt-1 accent-[var(--color-brand-600)] w-4 h-4 shrink-0" />
                  <div className="space-y-1 min-w-0">
                    <div className="flex flex-wrap items-center gap-1.5">
                      <strong className="font-bold text-[var(--color-text-primary)] truncate">{it.titleFa}</strong>
                      <span className={`px-2 py-0.5 rounded text-xs font-bold ${it.targetLifecycleStatus === 'ACTIVE' ? 'bg-[var(--color-brand-soft)] text-[var(--color-brand-fg)]' : 'bg-amber-100 dark:bg-amber-950/60 text-amber-900 dark:text-amber-200'}`}>
                        {it.targetLifecycleStatus === 'ACTIVE' ? 'فعال' : it.targetLifecycleStatus === 'EXPIRED' ? 'آگهی منقضی (نگهداری جهت مقایسه)' : 'هشدار لایه غیرفعال نقشه'}
                      </span>
                    </div>
                    <div className="text-xs text-[var(--color-text-muted)]">{it.subtitleFa}</div>
                    {formattedPrice && (
                      <div className="text-xs font-bold text-[var(--color-brand-fg)] tabular-nums">
                        مبلغ نمایشی: {formattedPrice.displayAmount} {formattedPrice.unitLabelFa} (شناسه فنی: {formatValueWithNumberPreference(it.entityId, prefs.display.numberFormat, true)})
                      </div>
                    )}
                    {it.unavailableLayerNamesFa && it.unavailableLayerNamesFa.length > 0 && (
                      <div className="text-xs text-amber-800 dark:text-amber-300 font-bold">
                        توجه: یکی از لایه‌های این نقشه ({it.unavailableLayerNamesFa.join('، ')}) در حال حاضر در دسترس نیست؛ سایر لایه‌ها قابل بازگردانی‌اند.
                      </div>
                    )}
                  </div>
                </div>
                <button type="button" data-testid={`btn-remove-saved-${it.id}`} onClick={() => handleRemoveSingle(it.id)} className="min-h-[44px] min-w-[44px] inline-flex items-center justify-center rounded-xl p-2 text-[var(--color-text-muted)] hover:text-rose-600 hover:bg-rose-50 dark:hover:bg-rose-950/40 cursor-pointer shrink-0 transition" aria-label={`حذف ${it.titleFa}`}>
                  <Trash2 className="w-4 h-4" />
                </button>
              </div>
            );
          })}
        </div>
      </div>

      <div className="pt-4 border-t border-[var(--color-border-subtle)] space-y-3" data-testid="user-preferences-and-personalization-section">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <strong className="text-base font-bold text-[var(--color-text-primary)] flex items-center gap-1.5">
            <Sliders className="w-4 h-4 text-[var(--color-brand-fg)]" />
            <span>ترجیحات من و کنترل سطح شخصی‌سازی (بدون تغییر حقیقت داده پایگاه داده)</span>
          </strong>
          <div className="flex flex-wrap items-center gap-1.5">
            {[
              { id: 'DISPLAY', label: 'ترجیحات نمایش', icon: Eye },
              { id: 'MAP', label: 'ترجیحات نقشه', icon: MapPin },
              { id: 'SEARCH', label: 'ترجیحات جست‌وجو', icon: CheckSquare },
              { id: 'PERSONALIZATION', label: 'سطوح شخصی‌سازی (۱ تا ۳)', icon: Sparkles },
            ].map((sec) => (
              <button
                key={sec.id}
                type="button"
                data-testid={`pref-tab-${sec.id.toLowerCase()}`}
                onClick={() => setActivePrefSection(sec.id as typeof activePrefSection)}
                className={`min-h-[44px] md:min-h-[36px] inline-flex items-center px-3 py-1.5 rounded-xl text-sm font-bold cursor-pointer ${activePrefSection === sec.id ? 'bg-[var(--color-brand-600)] text-white' : 'bg-[var(--color-bg-muted)] text-[var(--color-text-secondary)]'}`}
              >
                {sec.label}
              </button>
            ))}
          </div>
        </div>

        {activePrefSection === 'DISPLAY' && (
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 p-3 rounded-xl bg-[var(--color-bg-subtle)] border border-[var(--color-border-subtle)]" data-testid="prefs-display-panel">
            <div>
              <label className="font-bold text-[var(--color-text-primary)] block mb-1">قالب نمایش اعداد (شناسه فنی دست‌نخورده می‌ماند):</label>
              <select
                aria-label="قالب اعداد"
                data-testid="pref-select-number-format"
                value={prefs.display.numberFormat}
                onChange={(e) => setPrefs(defaultPersonalizationEngine.updatePreferences(userId, { display: { numberFormat: e.target.value as 'fa' | 'en' } }))}
                className="w-full p-2 rounded-lg bg-[var(--color-bg-surface)] border border-[var(--color-border-strong)] text-[var(--color-text-primary)] font-bold"
              >
                <option value="fa">اعداد فارسی (۱۴٬۹۰۰)</option>
                <option value="en">اعداد لاتین (14,900)</option>
              </select>
            </div>
            <div className="p-2.5 rounded-lg bg-[var(--color-bg-surface)] border border-[var(--color-border-subtle)]">
              <span className="text-xs text-[var(--color-text-muted)] block">پیش‌نمایش زنده (مقدار خام دیتابیس: 14900 م.ت):</span>
              <strong data-testid="pref-live-price-preview" className="text-sm font-bold text-[var(--color-brand-fg)] block mt-0.5 tabular-nums">
                {samplePricePreview.displayAmount} {samplePricePreview.unitLabelFa}
              </strong>
            </div>
          </div>
        )}

        {activePrefSection === 'MAP' && (
          <div className="p-3 rounded-xl bg-[var(--color-bg-subtle)] border border-[var(--color-border-subtle)] space-y-2" data-testid="prefs-map-panel">
            <div className="font-bold text-[var(--color-text-primary)] flex items-center gap-1.5">
              <Layers className="w-4 h-4 text-[var(--color-brand-fg)]" />
              <span>تفکیک سه وضعیت مکانی نقشه (مشاهده موقت شهر دیگر، شهر پیش‌فرض حساب شما را بازنویسی نمی‌کند):</span>
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
              <div className="p-2 rounded-lg bg-[var(--color-bg-surface)] border border-[var(--color-border-subtle)]">
                <span className="text-[var(--color-text-muted)] block text-xs">۱. شهر پیش‌فرض ثابت حساب:</span>
                <strong className="font-bold text-[var(--color-text-primary)]">{prefs.map.defaultCityId}</strong>
              </div>
              <div className="p-2 rounded-lg bg-[var(--color-bg-surface)] border border-[var(--color-border-subtle)]">
                <span className="text-[var(--color-text-muted)] block text-xs">۲. آخرین محدوده مشاهده‌شده:</span>
                <strong className="font-bold text-[var(--color-text-primary)]">{prefs.map.lastViewedCityId}</strong>
              </div>
              <div className="p-2 rounded-lg bg-[var(--color-bg-surface)] border border-[var(--color-border-subtle)]">
                <span className="text-[var(--color-text-muted)] block text-xs">۳. نقشه‌های ذخیره‌شده من:</span>
                <strong className="font-bold text-[var(--color-brand-fg)]">{items.filter((i) => i.entityType === 'MAP_PRESET').length} نمای قابل بازسازی</strong>
              </div>
            </div>
          </div>
        )}

        {activePrefSection === 'SEARCH' && (
          <div className="p-3 rounded-xl bg-slate-50 dark:bg-[var(--color-bg-muted)] border border-slate-200 dark:border-[var(--color-border-strong)] space-y-2" data-testid="prefs-search-panel">
            <div className="text-slate-700 dark:text-[var(--color-text-primary)] font-bold">
              شهر پیش‌فرض جست‌وجو: <span className="text-emerald-700">{prefs.search.defaultCityId}</span> (همیشه به‌صورت شفاف در نوار فیلتر نشان داده می‌شود و فیلتر پنهان ایجاد نمی‌کند)
            </div>
          </div>
        )}

        {activePrefSection === 'PERSONALIZATION' && (
          <div className="p-3 rounded-xl bg-slate-50 dark:bg-[var(--color-bg-muted)] border border-slate-200 dark:border-[var(--color-border-strong)] space-y-2" data-testid="prefs-personalization-panel">
            <label className="flex items-center justify-between gap-2 p-2 rounded-lg bg-white dark:bg-[var(--color-bg-surface)] border border-slate-200 dark:border-[var(--color-border-strong)] cursor-pointer">
              <span><strong>سطح ۲ و ۳ شخصی‌سازی:</strong> استفاده از سابقه فعالیت و جست‌وجوهای ذخیره‌شده برای پیشنهادهای هوشمند</span>
              <input
                type="checkbox"
                data-testid="toggle-level23-personalization"
                checked={prefs.personalizationLevels.level2ActivityBasedEnabled}
                onChange={(e) =>
                  setPrefs(
                    defaultPersonalizationEngine.updatePreferences(userId, {
                      personalizationLevels: { level2ActivityBasedEnabled: e.target.checked, level3SmartRecommendationsEnabled: e.target.checked },
                    })
                  )
                }
                className="accent-emerald-600"
              />
            </label>
          </div>
        )}
      </div>
    </section>
  );
};
