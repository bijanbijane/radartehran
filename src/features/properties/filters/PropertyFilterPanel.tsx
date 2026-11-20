/** @file src/features/properties/filters/PropertyFilterPanel.tsx — Responsive Drawer / Mobile Bottom Sheet Filters */
import React from 'react';
import { createPortal } from 'react-dom';
import { Check, RotateCcw, ShieldCheck, X } from 'lucide-react';
import { useDialogFocus } from '../../../components/useDialogFocus';
import {
  isMalformedOptionalNumber,
  normalizeFiltersForPropertyType,
  supportsElevatorFilter,
  supportsRoomsFilter,
  validatePropertyFilterDraft,
  validatePropertyFilterErrors,
  type PropertyFilterDraft,
} from './PropertyFilterDraft';
import { PROPERTY_TYPE_LABELS_FA, type AmenityValue, type PropertyType } from '../types/property.types';

export interface PropertyFilterPanelProps {
  open: boolean;
  draft: PropertyFilterDraft;
  selectedHoodName: string;
  onClose: () => void;
  onUpdateDraft: (next: PropertyFilterDraft) => void;
  onApply: () => void;
  onReset: () => void;
}

const TRI_STATE_OPTS: Array<{ id: AmenityValue | 'any'; label: string }> = [
  { id: 'any', label: 'همه' },
  { id: 'has', label: 'دارد' },
  { id: 'lacks', label: 'ندارد' },
  { id: 'unknown', label: 'نامشخص' },
];

export const PropertyFilterPanel: React.FC<PropertyFilterPanelProps> = ({
  open,
  draft,
  selectedHoodName,
  onClose,
  onUpdateDraft,
  onApply,
  onReset,
}) => {
  const dialogRef = useDialogFocus(open, onClose);
  const [attemptedApply, setAttemptedApply] = React.useState(false);

  React.useEffect(() => {
    if (!open) setAttemptedApply(false);
  }, [open]);

  if (!open) return null;

  const warnings = validatePropertyFilterDraft(draft);
  const errors = validatePropertyFilterErrors(draft);
  const showRooms = supportsRoomsFilter(draft.propertyType);
  const showElevator = supportsElevatorFilter(draft.propertyType);
  const isRent = draft.transactionType === 'rent' || draft.transactionType === 'full_deposit';

  const patch = (p: Partial<PropertyFilterDraft>) => {
    if (attemptedApply) setAttemptedApply(false);
    onUpdateDraft({ ...draft, ...p });
  };

  const renderTriState = (label: string, key: 'parking' | 'elevator' | 'storage') => (
    <div className="space-y-1.5">
      <span className="text-[11px] font-bold text-[#34433E] dark:text-slate-300 block">{label}</span>
      <div className="grid grid-cols-4 gap-1">
        {TRI_STATE_OPTS.map((opt) => (
          <button
            key={opt.id}
            type="button"
            onClick={() => patch({ [key]: opt.id } as Partial<PropertyFilterDraft>)}
            className={`py-1.5 rounded-[7px] border text-[11px] font-bold cursor-pointer transition ${
              draft[key] === opt.id
                ? 'bg-[#176B63] text-white border-[#176B63]'
                : 'bg-[#F8F9FA] dark:bg-slate-800 border-[#DCE3DF] dark:border-slate-700 text-[#48534F] dark:text-slate-300'
            }`}
          >
            {opt.label}
          </button>
        ))}
      </div>
    </div>
  );

  const modalContent = (
    <div
      role="dialog"
      aria-modal="true"
      aria-label="فیلترهای پیشرفته جست‌وجوی ملک"
      className="fixed inset-0 z-[9500] bg-black/45 backdrop-blur-[2px] flex items-end sm:items-center justify-center sm:p-4"
      onClick={onClose}
    >
      <div
        ref={dialogRef}
        tabIndex={-1}
        dir="rtl"
        onClick={(e) => e.stopPropagation()}
        className="w-full sm:max-w-xl bg-white dark:bg-slate-900 rounded-t-2xl sm:rounded-2xl border border-[#DCE3DF] dark:border-slate-800 max-h-[88vh] flex flex-col overflow-hidden shadow-2xl"
      >
        <div className="px-4 py-3.5 border-b border-[#DCE3DF] dark:border-slate-800 flex items-center justify-between">
          <h2 className="text-sm font-black text-[#182522] dark:text-white">فیلترهای دقیق جست‌وجوی ملک</h2>
          <button
            type="button"
            onClick={onClose}
            aria-label="بستن پنل فیلترها"
            className="w-8 h-8 rounded-full bg-[#F1F4F2] dark:bg-slate-800 flex items-center justify-center text-[#586760] cursor-pointer"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        <form
          noValidate
          onSubmit={(e) => {
            e.preventDefault();
            if (errors.length > 0) {
              setAttemptedApply(true);
              return;
            }
            setAttemptedApply(false);
            onApply();
            onClose();
          }}
          className="flex flex-col flex-1 min-h-0"
        >
        <div className="p-4 space-y-4 overflow-y-auto text-xs flex-1">
          <div className="space-y-1.5">
            <label className="text-[11px] font-bold text-[#34433E] dark:text-slate-300 block">نوع ملک (فیلترهای مرتبط پویا نمایش داده می‌شوند)</label>
            <div className="flex flex-wrap gap-1.5">
              {(['all', 'apartment', 'villa_house', 'commercial', 'office', 'land'] as const).map((pt) => (
                <button
                  key={pt}
                  type="button"
                  onClick={() => {
                    if (attemptedApply) setAttemptedApply(false);
                    onUpdateDraft(normalizeFiltersForPropertyType(draft, pt));
                  }}
                  className={`px-2.5 py-1.5 rounded-[8px] border text-[11px] font-bold cursor-pointer ${
                    draft.propertyType === pt
                      ? 'bg-[#176B63] text-white border-[#176B63]'
                      : 'bg-[#F8F9FA] dark:bg-slate-800 border-[#DCE3DF] dark:border-slate-700 text-[#48534F] dark:text-slate-300'
                  }`}
                >
                  {pt === 'all' ? 'همه' : PROPERTY_TYPE_LABELS_FA[pt as PropertyType]}
                </button>
              ))}
            </div>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1">
              <label className="text-[11px] font-bold text-[#586760] block">حداقل متراژ (متر)</label>
              <input
                type="text"
                inputMode="numeric"
                aria-invalid={isMalformedOptionalNumber(draft.areaMin)}
                value={draft.areaMin}
                onChange={(e) => patch({ areaMin: e.target.value })}
                placeholder="مثلاً ۶۰"
                className="w-full px-3 py-2 rounded-[8px] bg-[#F8F9FA] dark:bg-slate-800 border border-[#DCE3DF] dark:border-slate-700 text-[#182522] dark:text-white tabular-nums"
              />
            </div>
            <div className="space-y-1">
              <label className="text-[11px] font-bold text-[#586760] block">حداکثر متراژ (متر)</label>
              <input
                type="text"
                inputMode="numeric"
                aria-invalid={isMalformedOptionalNumber(draft.areaMax)}
                value={draft.areaMax}
                onChange={(e) => patch({ areaMax: e.target.value })}
                placeholder="مثلاً ۱۵۰"
                className="w-full px-3 py-2 rounded-[8px] bg-[#F8F9FA] dark:bg-slate-800 border border-[#DCE3DF] dark:border-slate-700 text-[#182522] dark:text-white tabular-nums"
              />
            </div>
          </div>

          {!isRent ? (
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1">
                <label className="text-[11px] font-bold text-[#586760] block">حداقل قیمت کل (میلیون تومان)</label>
                <input
                  type="text"
                  inputMode="numeric"
                  aria-invalid={isMalformedOptionalNumber(draft.priceMinMillion)}
                  value={draft.priceMinMillion}
                  onChange={(e) => patch({ priceMinMillion: e.target.value })}
                  placeholder="مثلاً ۵۰۰۰"
                  className="w-full px-3 py-2 rounded-[8px] bg-[#F8F9FA] dark:bg-slate-800 border border-[#DCE3DF] dark:border-slate-700 text-[#182522] dark:text-white tabular-nums"
                />
              </div>
              <div className="space-y-1">
                <label className="text-[11px] font-bold text-[#586760] block">حداکثر قیمت کل (میلیون تومان)</label>
                <input
                  type="text"
                  inputMode="numeric"
                  aria-invalid={isMalformedOptionalNumber(draft.priceMaxMillion)}
                  value={draft.priceMaxMillion}
                  onChange={(e) => patch({ priceMaxMillion: e.target.value })}
                  placeholder="مثلاً ۵۰۰۰۰"
                  className="w-full px-3 py-2 rounded-[8px] bg-[#F8F9FA] dark:bg-slate-800 border border-[#DCE3DF] dark:border-slate-700 text-[#182522] dark:text-white tabular-nums"
                />
              </div>
            </div>
          ) : (
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1">
                <label className="text-[11px] font-bold text-[#586760] block">حداکثر ودیعه (میلیون تومان)</label>
                <input
                  type="text"
                  inputMode="numeric"
                  aria-invalid={isMalformedOptionalNumber(draft.depositMaxMillion)}
                  value={draft.depositMaxMillion}
                  onChange={(e) => patch({ depositMaxMillion: e.target.value })}
                  placeholder="مثلاً ۴۰۰۰"
                  className="w-full px-3 py-2 rounded-[8px] bg-[#F8F9FA] dark:bg-slate-800 border border-[#DCE3DF] dark:border-slate-700 text-[#182522] dark:text-white tabular-nums"
                />
              </div>
              <div className="space-y-1">
                <label className="text-[11px] font-bold text-[#586760] block">حداکثر اجاره ماهانه (میلیون)</label>
                <input
                  type="text"
                  inputMode="numeric"
                  aria-invalid={isMalformedOptionalNumber(draft.rentMaxMillion)}
                  value={draft.rentMaxMillion}
                  onChange={(e) => patch({ rentMaxMillion: e.target.value })}
                  placeholder="مثلاً ۸۰"
                  className="w-full px-3 py-2 rounded-[8px] bg-[#F8F9FA] dark:bg-slate-800 border border-[#DCE3DF] dark:border-slate-700 text-[#182522] dark:text-white tabular-nums"
                />
              </div>
            </div>
          )}

          {showRooms && (
            <div className="space-y-1.5">
              <span className="text-[11px] font-bold text-[#34433E] dark:text-slate-300 block">حداقل تعداد خواب</span>
              <div className="flex gap-1.5">
                {[null, 1, 2, 3, 4].map((r) => (
                  <button
                    key={String(r)}
                    type="button"
                    onClick={() => patch({ roomsMin: r })}
                    className={`px-3 py-1.5 rounded-[7px] border text-[11px] font-bold cursor-pointer ${
                      draft.roomsMin === r
                        ? 'bg-[#176B63] text-white border-[#176B63]'
                        : 'bg-[#F8F9FA] dark:bg-slate-800 border-[#DCE3DF] dark:border-slate-700 text-[#48534F] dark:text-slate-300'
                    }`}
                  >
                    {r === null ? 'مهم نیست' : `${r}+ خواب`}
                  </button>
                ))}
              </div>
            </div>
          )}

          {renderTriState('پارکینگ (حفظ وضعیت نامشخص)', 'parking')}
          {showElevator && renderTriState('آسانسور', 'elevator')}
          {renderTriState('انباری', 'storage')}

          <div className="pt-2 border-t border-[#DCE3DF] dark:border-slate-800 space-y-2">
            <label className="flex items-center gap-2 cursor-pointer font-bold text-[#182522] dark:text-slate-200">
              <input
                type="checkbox"
                checked={draft.onlySelectedHood}
                onChange={(e) => patch({ onlySelectedHood: e.target.checked })}
                className="rounded accent-[#176B63]"
              />
              <span>فقط فایل‌های محله انتخاب‌شده ({selectedHoodName})</span>
            </label>
            <label className="flex items-center gap-2 cursor-pointer font-bold text-[#182522] dark:text-slate-200">
              <input
                type="checkbox"
                checked={draft.verifiedOnly}
                onChange={(e) => patch({ verifiedOnly: e.target.checked })}
                className="rounded accent-[#176B63]"
              />
              <span className="flex items-center gap-1">
                <ShieldCheck className="w-3.5 h-3.5 text-[#176B63]" />
                فقط فایل‌های راستی‌آزمایی‌شده (موقعیت، قیمت و تازگی تأییدشده)
              </span>
            </label>
          </div>

          {attemptedApply && errors.length > 0 && (
            <div role="alert" className="p-2.5 rounded-lg bg-rose-50 dark:bg-rose-950/40 border border-rose-200 dark:border-rose-800 text-[11px] font-bold text-[#B3261E] dark:text-rose-200">
              {errors.join(' · ')}
            </div>
          )}

          {warnings.length > 0 && (
            <div className="p-2.5 rounded-lg bg-[#FFF4E5] border border-[#F4D3A1] text-[11px] text-[#875000]">
              {warnings.join(' · ')}
            </div>
          )}
        </div>

        <div className="px-4 py-3 border-t border-[#DCE3DF] dark:border-slate-800 bg-[#F8F9FA] dark:bg-slate-950 flex items-center justify-between gap-2 pb-[calc(0.75rem+env(safe-area-inset-bottom))]">
          <button
            type="button"
            onClick={() => { setAttemptedApply(false); onReset(); onClose(); }}
            className="min-h-[42px] px-3.5 rounded-[9px] border border-[#DCE3DF] dark:border-slate-700 text-xs font-bold text-[#48534F] dark:text-slate-300 flex items-center gap-1.5 cursor-pointer"
          >
            <RotateCcw className="w-3.5 h-3.5" />
            <span>بازنشانی</span>
          </button>
          <button
            type="submit"
            data-testid="apply-property-filters-btn"
            className="flex-1 min-h-[42px] px-4 rounded-[9px] bg-[#176B63] hover:bg-[#14534E] text-white text-xs font-bold flex items-center justify-center gap-1.5 cursor-pointer"
          >
            <Check className="w-4 h-4" />
            <span>اعمال فیلترها</span>
          </button>
        </div>
        </form>
      </div>
    </div>
  );

  return typeof document !== 'undefined' ? createPortal(modalContent, document.body) : modalContent;
};
