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
      className="p-4 sm:p-5 rounded-2xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 space-y-5 text-xs"
      dir="rtl"
    >
      <div className="space-y-3" data-testid="unified-saved-items-section">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div>
            <strong className="text-sm font-black text-slate-900 dark:text-white flex items-center gap-1.5">
              <Bookmark className="w-4 h-4 text-emerald-600" />
              <span>ذخیره‌های من (نگهداری یکپارچه املاک، محله‌ها، جست‌وجوها، نقشه‌ها و مطالب)</span>
            </strong>
            <p className="text-[11px] text-slate-500 mt-0.5">
              ذخیره‌سازی بر پایه شناسه پایدار موجودیت · پشتیبانی از بازگردانی فوری (Undo)، حذف گروهی و نمایش وضعیت آگهی‌های منقضی
            </p>
          </div>
          {selectedIds.length > 0 && (
            <button
              type="button"
              data-testid="btn-bulk-delete-saved"
              onClick={handleBulkDelete}
              className="px-3 py-1.5 rounded-xl bg-rose-600 text-white font-bold flex items-center gap-1 cursor-pointer"
            >
              <Trash2 className="w-3.5 h-3.5" />
              <span>حذف گروهی ({formatValueWithNumberPreference(selectedIds.length, prefs.display.numberFormat)} مورد)</span>
            </button>
          )}
        </div>

        {undoBannerFa && (
          <div data-testid="saved-item-undo-banner" className="p-2.5 rounded-xl bg-amber-50 dark:bg-amber-950/40 border border-amber-200 dark:border-amber-800 flex items-center justify-between gap-2">
            <span className="font-bold text-amber-900 dark:text-amber-200">{undoBannerFa}</span>
            <button type="button" data-testid="btn-undo-removed-saved-item" onClick={handleUndoRemove} className="px-2.5 py-1 rounded-lg bg-amber-600 text-white font-bold flex items-center gap-1 cursor-pointer">
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
              className={`px-2.5 py-1.5 rounded-xl font-bold cursor-pointer ${filterKind === t.id ? 'bg-emerald-600 text-white' : 'bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-300'}`}
            >
              {t.label}
            </button>
          ))}
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-2.5">
          {filteredItems.map((it) => {
            const formattedPrice = it.priceMillionToman !== undefined ? formatPriceByUserPreference(it.priceMillionToman, prefs.display) : null;
            return (
              <div key={it.id} data-testid={`unified-saved-card-${it.id}`} className="p-3 rounded-xl bg-slate-50 dark:bg-slate-800/60 border border-slate-200 dark:border-slate-700 flex items-start justify-between gap-2">
                <div className="flex items-start gap-2 min-w-0">
                  <input type="checkbox" aria-label={`انتخاب ${it.titleFa}`} checked={selectedIds.includes(it.id)} onChange={() => toggleSelect(it.id)} className="mt-1 accent-emerald-600" />
                  <div className="space-y-1 min-w-0">
                    <div className="flex flex-wrap items-center gap-1.5">
                      <strong className="font-black text-slate-900 dark:text-white truncate">{it.titleFa}</strong>
                      <span className={`px-2 py-0.5 rounded text-[10px] font-bold ${it.targetLifecycleStatus === 'ACTIVE' ? 'bg-emerald-100 text-emerald-800' : 'bg-amber-100 text-amber-900'}`}>
                        {it.targetLifecycleStatus === 'ACTIVE' ? 'فعال' : it.targetLifecycleStatus === 'EXPIRED' ? 'آگهی منقضی (نگهداری جهت مقایسه)' : 'هشدار لایه غیرفعال نقشه'}
                      </span>
                    </div>
                    <div className="text-[11px] text-slate-500">{it.subtitleFa}</div>
                    {formattedPrice && (
                      <div className="text-[11px] font-bold text-emerald-700 dark:text-emerald-300 tabular-nums">
                        مبلغ نمایشی: {formattedPrice.displayAmount} {formattedPrice.unitLabelFa} (شناسه فنی: {formatValueWithNumberPreference(it.entityId, prefs.display.numberFormat, true)})
                      </div>
                    )}
                    {it.unavailableLayerNamesFa && it.unavailableLayerNamesFa.length > 0 && (
                      <div className="text-[10.5px] text-amber-800 dark:text-amber-300 font-bold">
                        توجه: یکی از لایه‌های این نقشه ({it.unavailableLayerNamesFa.join('، ')}) در حال حاضر در دسترس نیست؛ سایر لایه‌ها قابل بازگردانی‌اند.
                      </div>
                    )}
                  </div>
                </div>
                <button type="button" data-testid={`btn-remove-saved-${it.id}`} onClick={() => handleRemoveSingle(it.id)} className="p-1.5 text-slate-400 hover:text-rose-600 cursor-pointer shrink-0" aria-label={`حذف ${it.titleFa}`}>
                  <Trash2 className="w-4 h-4" />
                </button>
              </div>
            );
          })}
        </div>
      </div>

      <div className="pt-4 border-t border-slate-200 dark:border-slate-800 space-y-3" data-testid="user-preferences-and-personalization-section">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <strong className="text-sm font-black text-slate-900 dark:text-white flex items-center gap-1.5">
            <Sliders className="w-4 h-4 text-emerald-600" />
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
                className={`px-2.5 py-1.5 rounded-xl font-bold cursor-pointer ${activePrefSection === sec.id ? 'bg-slate-900 dark:bg-white text-white dark:text-slate-900' : 'bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-300'}`}
              >
                {sec.label}
              </button>
            ))}
          </div>
        </div>

        {activePrefSection === 'DISPLAY' && (
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 p-3 rounded-xl bg-slate-50 dark:bg-slate-800/60 border border-slate-200 dark:border-slate-700" data-testid="prefs-display-panel">
            <div>
              <label className="font-bold text-slate-700 dark:text-slate-200 block mb-1">قالب نمایش اعداد (شناسه فنی دست‌نخورده می‌ماند):</label>
              <select
                aria-label="قالب اعداد"
                data-testid="pref-select-number-format"
                value={prefs.display.numberFormat}
                onChange={(e) => setPrefs(defaultPersonalizationEngine.updatePreferences(userId, { display: { numberFormat: e.target.value as 'fa' | 'en' } }))}
                className="w-full p-2 rounded-lg bg-white dark:bg-slate-900 border border-slate-300 dark:border-slate-700 font-bold"
              >
                <option value="fa">اعداد فارسی (۱۴٬۹۰۰)</option>
                <option value="en">اعداد لاتین (14,900)</option>
              </select>
            </div>
            <div>
              <label className="font-bold text-slate-700 dark:text-slate-200 block mb-1">واحد نمایش قیمت (فقط تبدیل ظاهری):</label>
              <select
                aria-label="واحد نمایش قیمت"
                data-testid="pref-select-currency-unit"
                value={prefs.display.currencyUnit}
                onChange={(e) => setPrefs(defaultPersonalizationEngine.updatePreferences(userId, { display: { currencyUnit: e.target.value as 'toman' | 'rial' } }))}
                className="w-full p-2 rounded-lg bg-white dark:bg-slate-900 border border-slate-300 dark:border-slate-700 font-bold"
              >
                <option value="toman">تومان (میلیون تومان)</option>
                <option value="rial">ریال (میلیون ریال · ×۱۰ نمایشی)</option>
              </select>
            </div>
            <div className="p-2.5 rounded-lg bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700">
              <span className="text-[10.5px] text-slate-500 block">پیش‌نمایش زنده (مقدار خام دیتابیس: 14900 م.ت):</span>
              <strong data-testid="pref-live-price-preview" className="text-sm font-black text-emerald-700 dark:text-emerald-400 block mt-0.5 tabular-nums">
                {samplePricePreview.displayAmount} {samplePricePreview.unitLabelFa}
              </strong>
            </div>
          </div>
        )}

        {activePrefSection === 'MAP' && (
          <div className="p-3 rounded-xl bg-slate-50 dark:bg-slate-800/60 border border-slate-200 dark:border-slate-700 space-y-2" data-testid="prefs-map-panel">
            <div className="font-bold text-slate-800 dark:text-slate-100 flex items-center gap-1.5">
              <Layers className="w-4 h-4 text-emerald-600" />
              <span>تفکیک سه وضعیت مکانی نقشه (مشاهده موقت شهر دیگر، شهر پیش‌فرض حساب شما را بازنویسی نمی‌کند):</span>
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
              <div className="p-2 rounded-lg bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700">
                <span className="text-slate-500 block text-[10.5px]">۱. شهر پیش‌فرض ثابت حساب:</span>
                <strong className="font-black text-slate-900 dark:text-white">{prefs.map.defaultCityId}</strong>
              </div>
              <div className="p-2 rounded-lg bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700">
                <span className="text-slate-500 block text-[10.5px]">۲. آخرین محدوده مشاهده‌شده:</span>
                <strong className="font-black text-slate-900 dark:text-white">{prefs.map.lastViewedCityId}</strong>
              </div>
              <div className="p-2 rounded-lg bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700">
                <span className="text-slate-500 block text-[10.5px]">۳. نقشه‌های ذخیره‌شده من:</span>
                <strong className="font-black text-emerald-700">{items.filter((i) => i.entityType === 'MAP_PRESET').length} نمای قابل بازسازی</strong>
              </div>
            </div>
          </div>
        )}

        {activePrefSection === 'SEARCH' && (
          <div className="p-3 rounded-xl bg-slate-50 dark:bg-slate-800/60 border border-slate-200 dark:border-slate-700 space-y-2" data-testid="prefs-search-panel">
            <div className="text-slate-700 dark:text-slate-200 font-bold">
              شهر پیش‌فرض جست‌وجو: <span className="text-emerald-700">{prefs.search.defaultCityId}</span> (همیشه به‌صورت شفاف در نوار فیلتر نشان داده می‌شود و فیلتر پنهان ایجاد نمی‌کند)
            </div>
          </div>
        )}

        {activePrefSection === 'PERSONALIZATION' && (
          <div className="p-3 rounded-xl bg-slate-50 dark:bg-slate-800/60 border border-slate-200 dark:border-slate-700 space-y-2" data-testid="prefs-personalization-panel">
            <label className="flex items-center justify-between gap-2 p-2 rounded-lg bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 cursor-pointer">
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
