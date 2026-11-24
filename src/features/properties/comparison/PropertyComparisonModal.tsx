/** @file src/features/properties/comparison/PropertyComparisonModal.tsx — Semantic Multi-Listing Comparison Matrix */
import React from 'react';
import { createPortal } from 'react-dom';
import { AlertTriangle, Trash2, X } from 'lucide-react';
import { toPersianNum } from '../../../data/neighborhoods';
import { formatAreaShort, type AreaUnit } from '../../../utils/areaUnit';
import { useDialogFocus } from '../../../components/useDialogFocus';
import { AMENITY_VALUE_LABELS_FA, DOCUMENT_TYPE_LABELS_FA, PROPERTY_TYPE_LABELS_FA } from '../types/property.types';
import { TRANSACTION_TYPE_LABELS_FA, type PropertyListingRecord } from '../types/listing.types';

export interface PropertyComparisonModalProps {
  open: boolean;
  items: PropertyListingRecord[];
  areaUnit: AreaUnit;
  onClose: () => void;
  onRemoveItem: (listingId: string) => void;
  onOpenDetail: (listingId: string) => void;
}

export const PropertyComparisonModal: React.FC<PropertyComparisonModalProps> = ({
  open,
  items,
  areaUnit,
  onClose,
  onRemoveItem,
  onOpenDetail,
}) => {
  const dialogRef = useDialogFocus(open, onClose);
  if (!open) return null;

  const hasSale = items.some((r) => r.listing.transactionType === 'sale' || r.listing.transactionType === 'presale');
  const hasRent = items.some((r) => r.listing.transactionType === 'rent' || r.listing.transactionType === 'full_deposit');
  const mixedTransactionWarning = hasSale && hasRent;

  const modalContent = (
    <div
      role="dialog"
      aria-modal="true"
      aria-label="مقایسه ساختاریافته فایل‌های ملکی"
      className="fixed inset-0 z-[9500] bg-black/50 backdrop-blur-[2px] flex items-center justify-center p-3 sm:p-5"
      onClick={onClose}
    >
      <div
        ref={dialogRef}
        tabIndex={-1}
        dir="rtl"
        onClick={(e) => e.stopPropagation()}
        className="w-full max-w-5xl bg-white dark:bg-slate-900 rounded-2xl border border-[var(--color-border-subtle)] dark:border-slate-800 max-h-[88vh] flex flex-col overflow-hidden shadow-2xl"
      >
        <div className="px-5 py-4 border-b border-[var(--color-border-subtle)] dark:border-slate-800 flex items-center justify-between">
          <div>
            <h2 className="text-base font-bold text-[var(--color-text-primary)] dark:text-white">مقایسه فایل‌های انتخاب‌شده ({toPersianNum(items.length)})</h2>
            <p className="text-[11px] text-[var(--color-text-muted)] dark:text-slate-400">مقادیر نامشخص با «نامشخص» نمایش داده می‌شوند و با صفر/ندارد یکی گرفته نمی‌شوند.</p>
          </div>
          <button type="button" onClick={onClose} aria-label="بستن مقایسه" className="w-8 h-8 rounded-full bg-[var(--color-bg-muted)] dark:bg-slate-800 flex items-center justify-center cursor-pointer">
            <X className="w-4 h-4" />
          </button>
        </div>

        <div className="p-4 sm:p-5 overflow-auto space-y-4 text-xs">
          {mixedTransactionWarning && (
            <div className="p-3 rounded-[10px] bg-[#FFF4E5] dark:bg-amber-950/30 border border-[#F4D3A1] dark:border-amber-800 text-[#875000] dark:text-amber-200 flex items-center gap-2 font-bold">
              <AlertTriangle className="w-4 h-4 shrink-0" />
              <span>فایل‌های فروش و رهن/اجاره در فهرست مقایسه کنار هم قرار گرفته‌اند؛ برای مقایسه عددی یکسان، هر ستون نوع معامله مستقل خود را نشان می‌دهد.</span>
            </div>
          )}

          {items.length === 0 ? (
            <div className="text-center py-10 text-[var(--color-text-muted)]">فایلی برای مقایسه انتخاب نشده است.</div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full border-collapse text-right min-w-[640px] tabular-nums">
                <thead>
                  <tr className="border-b border-[var(--color-border-subtle)] dark:border-slate-800">
                    <th className="py-2.5 px-3 text-[var(--color-text-muted)] font-bold w-40">شاخص مقایسه</th>
                    {items.map((it) => (
                      <th key={it.listing.listingId} className="py-2.5 px-3 align-top">
                        <div className="flex items-start justify-between gap-1.5">
                          <button
                            type="button"
                            onClick={() => { onClose(); onOpenDetail(it.listing.listingId); }}
                            className="text-start font-bold text-[var(--color-brand-600)] dark:text-emerald-400 hover:underline cursor-pointer line-clamp-2"
                          >
                            {it.listing.title}
                          </button>
                          <button
                            type="button"
                            onClick={() => onRemoveItem(it.listing.listingId)}
                            aria-label="حذف از مقایسه"
                            className="text-[#B3261E] shrink-0 p-1 cursor-pointer"
                          >
                            <Trash2 className="w-3.5 h-3.5" />
                          </button>
                        </div>
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody className="divide-y divide-[var(--color-border-subtle)] dark:divide-slate-800">
                  <tr>
                    <td className="py-2.5 px-3 font-bold text-[var(--color-text-muted)]">محله و کاربری</td>
                    {items.map((it) => (
                      <td key={it.listing.listingId} className="py-2.5 px-3">
                        {it.property.hoodName} · {PROPERTY_TYPE_LABELS_FA[it.property.propertyType]}
                      </td>
                    ))}
                  </tr>
                  <tr>
                    <td className="py-2.5 px-3 font-bold text-[var(--color-text-muted)]">نوع معامله</td>
                    {items.map((it) => (
                      <td key={it.listing.listingId} className="py-2.5 px-3 font-bold">
                        {TRANSACTION_TYPE_LABELS_FA[it.listing.transactionType]}
                      </td>
                    ))}
                  </tr>
                  <tr>
                    <td className="py-2.5 px-3 font-bold text-[var(--color-text-muted)]">مبلغ اعلامی</td>
                    {items.map((it) => (
                      <td key={it.listing.listingId} className="py-2.5 px-3 font-bold text-[var(--color-text-primary)] dark:text-white">
                        {it.listing.price.priceType === 'undisclosed'
                          ? 'توافقی / نامشخص'
                          : it.listing.price.saleTotalMillion
                          ? `${toPersianNum((it.listing.price.saleTotalMillion / 1000).toFixed(2))} میلیارد`
                          : `ودیعه ${toPersianNum(Math.round(it.listing.price.depositMillion || 0).toLocaleString())} م`}
                      </td>
                    ))}
                  </tr>
                  <tr>
                    <td className="py-2.5 px-3 font-bold text-[var(--color-text-muted)]">متراژ</td>
                    {items.map((it) => (
                      <td key={it.listing.listingId} className="py-2.5 px-3">
                        {it.property.areaSqm ? formatAreaShort(it.property.areaSqm, areaUnit) : 'نامشخص'}
                      </td>
                    ))}
                  </tr>
                  <tr>
                    <td className="py-2.5 px-3 font-bold text-[var(--color-text-muted)]">نوع سند</td>
                    {items.map((it) => (
                      <td key={it.listing.listingId} className="py-2.5 px-3">
                        {DOCUMENT_TYPE_LABELS_FA[it.property.documentType]}
                      </td>
                    ))}
                  </tr>
                  <tr>
                    <td className="py-2.5 px-3 font-bold text-[var(--color-text-muted)]">پارکینگ / آسانسور</td>
                    {items.map((it) => (
                      <td key={it.listing.listingId} className="py-2.5 px-3">
                        {AMENITY_VALUE_LABELS_FA[it.property.unitFeatures.parking]} / {AMENITY_VALUE_LABELS_FA[it.property.unitFeatures.elevator]}
                      </td>
                    ))}
                  </tr>
                </tbody>
              </table>
            </div>
          )}
        </div>
      </div>
    </div>
  );

  return typeof document !== 'undefined' ? createPortal(modalContent, document.body) : modalContent;
};
