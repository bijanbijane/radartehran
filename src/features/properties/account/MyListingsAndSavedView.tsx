/** @file src/features/properties/account/MyListingsAndSavedView.tsx — Saved Properties & User Listings Lifecycle */
import React from 'react';
import { Bookmark, PauseCircle, PlayCircle, PlusCircle, Trash2 } from 'lucide-react';
import { toPersianNum } from '../../../data/neighborhoods';
import { LISTING_STATUS_LABELS_FA, type PropertyListingRecord } from '../types/listing.types';
import type { SavedPropertySnapshot } from '../services/listingService';

export interface MyListingsAndSavedViewProps {
  mode: 'saved' | 'my_listings';
  savedItems: SavedPropertySnapshot[];
  allRecords: PropertyListingRecord[];
  myListings: PropertyListingRecord[];
  onOpenDetail: (listingId: string) => void;
  onRemoveSaved: (record: PropertyListingRecord | SavedPropertySnapshot) => void;
  onTogglePublishStatus: (listingId: string) => void;
  onDeleteMyListing: (listingId: string) => void;
  onOpenSubmitWizard: () => void;
}

export const MyListingsAndSavedView: React.FC<MyListingsAndSavedViewProps> = ({
  mode,
  savedItems,
  allRecords,
  myListings,
  onOpenDetail,
  onRemoveSaved,
  onTogglePublishStatus,
  onDeleteMyListing,
  onOpenSubmitWizard,
}) => {
  if (mode === 'saved') {
    return (
      <div className="space-y-3" data-testid="saved-properties-panel">
        <div className="flex items-center justify-between">
          <h2 className="text-sm font-black text-[var(--color-text-primary)] dark:text-white flex items-center gap-1.5">
            <Bookmark className="w-4 h-4 text-[var(--color-brand-600)]" />
            <span>فایل‌های ذخیره‌شده ({toPersianNum(savedItems.length)})</span>
          </h2>
          <span className="text-[11px] text-[var(--color-text-muted)]">فایل‌های منقضی‌شده با اعلان وضعیت شفاف باقی می‌مانند تا تاریخچه شما حفظ شود.</span>
        </div>

        {savedItems.length === 0 ? (
          <div className="p-8 rounded-[12px] bg-white dark:bg-slate-900 border border-[var(--color-border-subtle)] dark:border-slate-800 text-center text-xs text-[var(--color-text-muted)]">
            هنوز فایلی ذخیره نکرده‌اید. روی آیکون نشان‌گذاری هر کارت کلیک کنید تا اینجا نگهداری شود.
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
            {savedItems.map((s) => {
              const live = allRecords.find((r) => r.listing.listingId === s.listingId);
              const currentStatus = live?.listing.status || 'removed';
              const isInactive = currentStatus !== 'published';
              return (
                <div key={s.listingId} className="p-4 rounded-[12px] bg-white dark:bg-slate-900 border border-[var(--color-border-subtle)] dark:border-slate-800 flex items-center justify-between gap-3 text-xs">
                  <div className="min-w-0 space-y-1">
                    <div className="font-black text-[var(--color-text-primary)] dark:text-white truncate">{live?.listing.title || s.titleSnapshot}</div>
                    <div className="text-[11px] text-[var(--color-text-muted)] tabular-nums">
                      {s.hoodNameSnapshot} · {s.priceLabelSnapshot}
                    </div>
                    {isInactive && (
                      <div className="text-[10.5px] font-bold text-[#875000]">
                        وضعیت کنونی: {LISTING_STATUS_LABELS_FA[currentStatus]}
                      </div>
                    )}
                  </div>
                  <div className="flex items-center gap-1.5 shrink-0">
                    {live && (
                      <button type="button" onClick={() => onOpenDetail(live.listing.listingId)} className="px-3 py-1.5 rounded-[8px] bg-[var(--color-brand-600)] text-white font-bold cursor-pointer">
                        مشاهده
                      </button>
                    )}
                    <button type="button" onClick={() => onRemoveSaved(live || s)} aria-label="حذف از ذخیره‌شده‌ها" className="p-1.5 rounded-[8px] border border-[var(--color-border-subtle)] dark:border-slate-700 text-[#B3261E] cursor-pointer">
                      <Trash2 className="w-3.5 h-3.5" />
                    </button>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>
    );
  }

  return (
    <div className="space-y-3" data-testid="my-listings-panel">
      <div className="flex items-center justify-between gap-2">
        <h2 className="text-sm font-black text-[var(--color-text-primary)] dark:text-white">فایل‌های ثبت‌شده توسط شما ({toPersianNum(myListings.length)})</h2>
        <button type="button" onClick={onOpenSubmitWizard} className="px-3 py-1.5 rounded-[8px] bg-[var(--color-brand-600)] text-white text-xs font-bold flex items-center gap-1 cursor-pointer">
          <PlusCircle className="w-3.5 h-3.5" />
          <span>ثبت فایل جدید</span>
        </button>
      </div>

      {myListings.length === 0 ? (
        <div className="p-8 rounded-[12px] bg-white dark:bg-slate-900 border border-[var(--color-border-subtle)] dark:border-slate-800 text-center space-y-3 text-xs">
          <p className="text-[var(--color-text-muted)]">شما هنوز فایلی ثبت نکرده‌اید.</p>
          <button type="button" onClick={onOpenSubmitWizard} className="px-4 py-2 rounded-[9px] bg-[var(--color-brand-600)] text-white font-bold cursor-pointer">
            شروع ثبت فایل ۷ مرحله‌ای
          </button>
        </div>
      ) : (
        <div className="space-y-2.5">
          {myListings.map((rec) => (
            <div key={rec.listing.listingId} className="p-4 rounded-[12px] bg-white dark:bg-slate-900 border border-[var(--color-border-subtle)] dark:border-slate-800 flex flex-wrap items-center justify-between gap-3 text-xs">
              <div className="min-w-0 space-y-1">
                <div className="flex items-center gap-2">
                  <button type="button" onClick={() => onOpenDetail(rec.listing.listingId)} className="font-black text-[var(--color-text-primary)] dark:text-white hover:text-[var(--color-brand-600)] cursor-pointer">
                    {rec.listing.title}
                  </button>
                  <span className="px-2 py-0.5 rounded-[6px] bg-[var(--color-bg-muted)] dark:bg-slate-800 text-[10.5px] font-bold">
                    {LISTING_STATUS_LABELS_FA[rec.listing.status]}
                  </span>
                </div>
                <div className="text-[11px] text-[var(--color-text-muted)] tabular-nums">
                  {rec.property.hoodName} · نسخه {toPersianNum(rec.listing.version)} · آخرین تغییر: {new Date(rec.listing.updatedAtIso).toLocaleDateString('fa-IR')}
                </div>
              </div>

              <div className="flex items-center gap-1.5">
                {rec.listing.status !== 'pending_review' && (
                  <button
                    type="button"
                    onClick={() => onTogglePublishStatus(rec.listing.listingId)}
                    className="px-2.5 py-1.5 rounded-[8px] border border-[var(--color-border-subtle)] dark:border-slate-700 font-bold flex items-center gap-1 cursor-pointer"
                  >
                    {rec.listing.status === 'published' ? <PauseCircle className="w-3.5 h-3.5 text-[#875000]" /> : <PlayCircle className="w-3.5 h-3.5 text-[var(--color-brand-600)]" />}
                    <span>{rec.listing.status === 'published' ? 'توقف موقت' : 'انتشار مجدد'}</span>
                  </button>
                )}
                <button
                  type="button"
                  onClick={() => onDeleteMyListing(rec.listing.listingId)}
                  aria-label="حذف فایل من"
                  className="p-1.5 rounded-[8px] border border-[var(--color-border-subtle)] dark:border-slate-700 text-[#B3261E] cursor-pointer"
                >
                  <Trash2 className="w-3.5 h-3.5" />
                </button>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
};
