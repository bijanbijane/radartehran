import React, { useState } from 'react';
import { createPortal } from 'react-dom';
import { Check, RotateCcw, SlidersHorizontal, X } from 'lucide-react';
import { useDialogFocus } from '../../../components/useDialogFocus';
import type { AppliedMarketFilters, MarketFilterDraft, MarketGeoLevel, MarketPeriodId, PropertySubType } from '../types/market.types';
import { MARKET_TYPE_CAPABILITIES } from './MarketFilterDraft';

export interface MarketFilterPanelProps {
  draft: MarketFilterDraft;
  applied: AppliedMarketFilters;
  isDirty: boolean;
  availableZones: string[];
  onUpdateDraft: (patch: Partial<MarketFilterDraft>) => void;
  onApply: () => void;
  onReset: () => void;
}

export const MarketFilterPanel: React.FC<MarketFilterPanelProps> = ({
  draft,
  isDirty,
  availableZones,
  onUpdateDraft,
  onApply,
  onReset,
}) => {
  const [advancedOpen, setAdvancedOpen] = useState(false);
  const [mobileSheetOpen, setMobileSheetOpen] = useState(false);
  const mobileSheetRef = useDialogFocus(mobileSheetOpen, () => setMobileSheetOpen(false));
  const cap = MARKET_TYPE_CAPABILITIES[draft.marketType];

  const renderFilterControls = (mobileMode: boolean) => (
    <div className={`grid grid-cols-1 ${mobileMode ? 'gap-3.5' : 'sm:grid-cols-2 lg:grid-cols-4 gap-3'} text-xs`}>
      <label className="space-y-1 block">
        <span className="font-semibold text-[#586760] dark:text-slate-400 block">سطح جغرافیایی</span>
        <select
          aria-label="سطح جغرافیایی تحلیل"
          value={draft.geoLevel}
          onChange={(e) => onUpdateDraft({ geoLevel: e.target.value as MarketGeoLevel })}
          className="w-full min-h-[40px] px-2.5 rounded-lg border border-[#C5D0CA] dark:border-slate-700 bg-white dark:bg-slate-900 text-[#182522] dark:text-white font-semibold"
        >
          <option value="neighborhood">محله انتخابی نقشه</option>
          <option value="zone">منطقه / پهنه</option>
          <option value="city">کل شهر</option>
        </select>
      </label>

      {draft.geoLevel === 'zone' && availableZones.length > 0 && (
        <label className="space-y-1 block">
          <span className="font-semibold text-[#586760] dark:text-slate-400 block">منطقه هدف</span>
          <select
            aria-label="انتخاب منطقه تحلیل"
            value={draft.zoneName}
            onChange={(e) => onUpdateDraft({ zoneName: e.target.value })}
            className="w-full min-h-[40px] px-2.5 rounded-lg border border-[#C5D0CA] dark:border-slate-700 bg-white dark:bg-slate-900 text-[#182522] dark:text-white font-semibold"
          >
            {availableZones.map((z) => (
              <option key={z} value={z}>{z}</option>
            ))}
          </select>
        </label>
      )}

      <label className="space-y-1 block">
        <span className="font-semibold text-[#586760] dark:text-slate-400 block">نوع ملک</span>
        <select
          aria-label="نوع ملک"
          value={draft.propertySubType}
          onChange={(e) => onUpdateDraft({ propertySubType: e.target.value as PropertySubType })}
          className="w-full min-h-[40px] px-2.5 rounded-lg border border-[#C5D0CA] dark:border-slate-700 bg-white dark:bg-slate-900 text-[#182522] dark:text-white font-semibold"
        >
          {cap.availableSubTypes.map((st) => (
            <option key={st.id} value={st.id}>{st.labelFa}</option>
          ))}
        </select>
      </label>

      <label className="space-y-1 block">
        <span className="font-semibold text-[#586760] dark:text-slate-400 block">بازه زمانی</span>
        <select
          aria-label="بازه زمانی تحلیل"
          value={draft.period}
          onChange={(e) => onUpdateDraft({ period: e.target.value as MarketPeriodId })}
          className="w-full min-h-[40px] px-2.5 rounded-lg border border-[#C5D0CA] dark:border-slate-700 bg-white dark:bg-slate-900 text-[#182522] dark:text-white font-semibold"
        >
          <option value="30d">۳۰ روز اخیر</option>
          <option value="90d">۹۰ روز اخیر (فصلی)</option>
          <option value="180d">۶ ماه اخیر</option>
          <option value="365d">۱۲ ماه اخیر</option>
        </select>
      </label>

      {(advancedOpen || mobileMode) && (
        <>
          <label className="space-y-1 block">
            <span className="font-semibold text-[#586760] dark:text-slate-400 block">بازه متراژ</span>
            <select
              aria-label="بازه متراژ"
              value={draft.areaRange}
              onChange={(e) => onUpdateDraft({ areaRange: e.target.value as MarketFilterDraft['areaRange'] })}
              className="w-full min-h-[40px] px-2.5 rounded-lg border border-[#C5D0CA] dark:border-slate-700 bg-white dark:bg-slate-900 text-[#182522] dark:text-white font-semibold"
            >
              <option value="all">همه متراژها</option>
              <option value="under75">زیر ۷۵ متر</option>
              <option value="75to120">۷۵ تا ۱۲۰ متر</option>
              <option value="over120">بالای ۱۲۰ متر</option>
            </select>
          </label>

          {cap.supportsAgeRange && (
            <label className="space-y-1 block">
              <span className="font-semibold text-[#586760] dark:text-slate-400 block">سن بنا</span>
              <select
                aria-label="بازه سن بنا"
                value={draft.ageRange}
                onChange={(e) => onUpdateDraft({ ageRange: e.target.value as MarketFilterDraft['ageRange'] })}
                className="w-full min-h-[40px] px-2.5 rounded-lg border border-[#C5D0CA] dark:border-slate-700 bg-white dark:bg-slate-900 text-[#182522] dark:text-white font-semibold"
              >
                <option value="all">همه سال‌های ساخت</option>
                <option value="new_0_5">نوساز تا ۵ سال</option>
                <option value="mid_6_15">۶ تا ۱۵ سال</option>
                <option value="old_16plus">بالای ۱۵ سال</option>
              </select>
            </label>
          )}

          {cap.supportsRooms && (
            <label className="space-y-1 block">
              <span className="font-semibold text-[#586760] dark:text-slate-400 block">تعداد خواب</span>
              <select
                aria-label="تعداد اتاق خواب"
                value={draft.rooms}
                onChange={(e) => onUpdateDraft({ rooms: e.target.value as MarketFilterDraft['rooms'] })}
                className="w-full min-h-[40px] px-2.5 rounded-lg border border-[#C5D0CA] dark:border-slate-700 bg-white dark:bg-slate-900 text-[#182522] dark:text-white font-semibold"
              >
                <option value="all">همه واحدها</option>
                <option value="1">۱ خواب</option>
                <option value="2">۲ خواب</option>
                <option value="3plus">۳ خواب و بیشتر</option>
              </select>
            </label>
          )}

          <label className="flex items-center gap-2 min-h-[40px] pt-4 cursor-pointer">
            <input
              type="checkbox"
              checked={draft.onlyObserved}
              onChange={(e) => onUpdateDraft({ onlyObserved: e.target.checked })}
              className="w-4 h-4 accent-[#176B63]"
            />
            <span className="font-semibold text-[#34433E] dark:text-slate-300">فقط آگهی‌های زنده مشاهده‌شده</span>
          </label>
        </>
      )}
    </div>
  );

  return (
    <section
      aria-label="فیلترهای تحلیل بازار"
      className="p-4 rounded-[12px] bg-white dark:bg-slate-900 border border-[#DCE3DF] dark:border-slate-800 space-y-3"
    >
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="flex items-center gap-2 text-xs">
          <SlidersHorizontal className="w-4 h-4 text-[#176B63] dark:text-emerald-400" />
          <span className="font-bold text-[#182522] dark:text-white">فیلترهای تحلیلی (پیش‌نویس / اعمال قطعی)</span>
          {isDirty && (
            <span data-testid="market-filter-dirty-indicator" className="text-[11px] font-bold text-[#875000] dark:text-amber-300">
              · تغییر اعمال‌نشده
            </span>
          )}
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <button
            type="button"
            onClick={() => setMobileSheetOpen(true)}
            data-testid="market-mobile-filter-open-btn"
            className="sm:hidden min-h-[44px] px-3.5 py-2 rounded-lg border border-[#C5D0CA] dark:border-slate-700 text-xs font-bold text-[#182522] dark:text-white flex items-center gap-1.5 cursor-pointer"
          >
            <SlidersHorizontal className="w-4 h-4" />
            <span>فیلتر پیشرفته</span>
          </button>

          <button
            type="button"
            onClick={() => setAdvancedOpen((s) => !s)}
            className="hidden sm:inline-flex min-h-[34px] px-2.5 py-1 rounded-lg border border-[#DCE3DF] dark:border-slate-700 text-xs font-semibold text-[#34433E] dark:text-slate-300 hover:bg-[#F6F8F6] dark:hover:bg-slate-800 cursor-pointer"
          >
            {advancedOpen ? 'بستن فیلترهای بیشتر' : 'فیلترهای بیشتر (متراژ، سن، خواب)'}
          </button>

          <button
            type="button"
            onClick={onReset}
            data-testid="market-filter-reset-btn"
            className="min-h-[34px] px-2.5 py-1 rounded-lg text-xs font-semibold text-[#586760] hover:text-[#182522] dark:text-slate-400 dark:hover:text-white flex items-center gap-1 cursor-pointer"
          >
            <RotateCcw className="w-3.5 h-3.5" />
            <span>بازنشانی</span>
          </button>

          <button
            type="button"
            onClick={onApply}
            data-testid="market-filter-apply-btn"
            className={`min-h-[36px] px-3.5 py-1.5 rounded-lg text-xs font-bold flex items-center gap-1.5 cursor-pointer transition ${
              isDirty
                ? 'bg-[#176B63] hover:bg-[#14534E] text-white'
                : 'bg-[#EAF3F0] dark:bg-emerald-950/60 text-[#103B38] dark:text-emerald-200 border border-[#C5D0CA] dark:border-emerald-800'
            }`}
          >
            <Check className="w-3.5 h-3.5" />
            <span>{isDirty ? 'اعمال فیلترها' : 'فیلترها به‌روز است'}</span>
          </button>
        </div>
      </div>

      <div className="hidden sm:block">{renderFilterControls(false)}</div>

      {mobileSheetOpen && (() => {
        const sheetNode = (
          <div
            role="dialog"
            aria-modal="true"
            aria-label="فیلترهای پیشرفته بازار املاک"
            data-testid="market-mobile-filter-sheet"
            onClick={() => setMobileSheetOpen(false)}
            className="fixed inset-0 z-[9500] bg-slate-950/60 flex items-end justify-center sm:hidden"
          >
            <div
              ref={mobileSheetRef}
              tabIndex={-1}
              dir="rtl"
              onClick={(e) => e.stopPropagation()}
              className="w-full max-h-[82dvh] overflow-y-auto rounded-t-2xl bg-white dark:bg-slate-900 border-t border-[#DCE3DF] dark:border-slate-700 p-4 pb-[calc(1.5rem+var(--safe-bottom))] space-y-4 shadow-2xl"
            >
              <div className="flex items-center justify-between border-b border-[#DCE3DF] dark:border-slate-800 pb-3">
                <strong className="text-sm font-black text-[#182522] dark:text-white">فیلترهای تحلیل بازار</strong>
                <button
                  type="button"
                  aria-label="بستن پنل فیلتر"
                  onClick={() => setMobileSheetOpen(false)}
                  className="min-w-[44px] min-h-[44px] inline-flex items-center justify-center rounded-lg border border-[#DCE3DF] dark:border-slate-700 text-[#34433E] dark:text-slate-200 cursor-pointer"
                >
                  <X className="w-4 h-4" />
                </button>
              </div>
              {renderFilterControls(true)}
              <div className="sticky bottom-0 bg-white dark:bg-slate-900 border-t border-[#DCE3DF] dark:border-slate-800 flex items-center gap-2 pt-3 pb-1">
                <button
                  type="button"
                  onClick={() => {
                    onReset();
                    setMobileSheetOpen(false);
                  }}
                  className="flex-1 min-h-[44px] rounded-lg border border-[#C5D0CA] dark:border-slate-700 text-xs font-bold text-[#34433E] dark:text-slate-200 cursor-pointer"
                >
                  بازنشانی
                </button>
                <button
                  type="button"
                  onClick={() => {
                    onApply();
                    setMobileSheetOpen(false);
                  }}
                  className="flex-[2] min-h-[44px] rounded-lg bg-[#176B63] text-white text-xs font-bold cursor-pointer"
                >
                  اعمال و مشاهده نتایج
                </button>
              </div>
            </div>
          </div>
        );
        return typeof document !== 'undefined' ? createPortal(sheetNode, document.body) : sheetNode;
      })()}
    </section>
  );
};
