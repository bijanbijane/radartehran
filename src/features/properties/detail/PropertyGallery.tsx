/** @file src/features/properties/detail/PropertyGallery.tsx — Accessible Media Gallery with Keyboard Lightbox & Honest Placeholder */
import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { createPortal } from 'react-dom';
import { Building2, ChevronLeft, ChevronRight, Maximize2, X } from 'lucide-react';
import { toPersianNum } from '../../../data/neighborhoods';
import { useDialogFocus } from '../../../components/useDialogFocus';
import type { PropertyMediaItem } from '../types/property.types';

export interface PropertyGalleryProps {
  media: PropertyMediaItem[];
  title: string;
  hoodName: string;
}

export const PropertyGallery: React.FC<PropertyGalleryProps> = ({ media, title, hoodName }) => {
  const [failedIds, setFailedIds] = useState<Record<string, boolean>>({});
  const [activeIndex, setActiveIndex] = useState(0);
  const [lightboxOpen, setLightboxOpen] = useState(false);

  const mediaKey = useMemo(
    () => media.map((m) => `${m.id}:${m.url ?? ''}`).join('|'),
    [media],
  );

  useEffect(() => {
    setActiveIndex(0);
    setLightboxOpen(false);
    setFailedIds({});
  }, [mediaKey]);

  const validItems = useMemo(
    () => media.filter((m) => m.valid && Boolean(m.url) && !failedIds[m.id]),
    [media, failedIds],
  );

  const closeLightbox = useCallback(() => setLightboxOpen(false), []);
  const lightboxRef = useDialogFocus(lightboxOpen, closeLightbox);

  const step = useCallback(
    (delta: number) => {
      if (validItems.length <= 1) return;
      setActiveIndex((prev) => {
        const clamped = Math.min(prev, validItems.length - 1);
        return (clamped + delta + validItems.length) % validItems.length;
      });
    },
    [validItems.length],
  );

  useEffect(() => {
    if (!lightboxOpen || validItems.length <= 1) return;
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'ArrowLeft') {
        e.preventDefault();
        step(1);
      } else if (e.key === 'ArrowRight') {
        e.preventDefault();
        step(-1);
      }
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [lightboxOpen, validItems.length, step]);

  if (validItems.length === 0) {
    return (
      <div className="aspect-[16/9] max-h-[340px] w-full rounded-[12px] bg-[var(--color-bg-muted)] dark:bg-slate-800/70 border border-[var(--color-border-subtle)] dark:border-slate-700 flex flex-col items-center justify-center text-center p-6 space-y-1.5">
        <Building2 className="w-9 h-9 text-[var(--color-text-muted)] opacity-70" />
        <p className="text-xs font-bold text-[var(--color-text-primary)] dark:text-slate-200">تصویر تأییدشده‌ای برای این فایل ثبت نشده است</p>
        <p className="text-[11px] text-[var(--color-text-muted)] dark:text-slate-400">
          مشخصات و محدوده ({hoodName}) به‌صورت متنی ثبت شده است؛ پیش از بازدید حضوری می‌توانید استعلام تصویر را از ثبت‌کننده درخواست کنید.
        </p>
      </div>
    );
  }

  const safeIndex = Math.min(activeIndex, validItems.length - 1);
  const current = validItems[safeIndex];
  const markImageFailed = (id: string) => {
    setFailedIds((prev) => (prev[id] ? prev : { ...prev, [id]: true }));
  };

  return (
    <div className="space-y-2">
      <div
        className="relative aspect-[16/9] max-h-[380px] w-full rounded-[12px] bg-[var(--color-bg-muted)] dark:bg-slate-800 overflow-hidden border border-[var(--color-border-subtle)] dark:border-slate-700"
        tabIndex={0}
        onKeyDown={(e) => {
          if (e.key === 'ArrowLeft') step(1);
          else if (e.key === 'ArrowRight') step(-1);
        }}
      >
        <img
          src={current.url as string}
          alt={`${title} - ${current.caption}`}
          onError={() => markImageFailed(current.id)}
          className="w-full h-full object-cover"
        />
        <button
          type="button"
          onClick={() => setLightboxOpen(true)}
          aria-label="نمایش تمام‌صفحه تصویر"
          className="absolute bottom-3 left-3 px-2.5 py-1 rounded-[8px] bg-slate-900/75 text-white text-[11px] font-bold flex items-center gap-1 cursor-pointer"
        >
          <Maximize2 className="w-3.5 h-3.5" />
          <span>بزرگ‌نمایی ({toPersianNum(safeIndex + 1)} از {toPersianNum(validItems.length)})</span>
        </button>
        {validItems.length > 1 && (
          <>
            <button
              type="button"
              onClick={() => step(-1)}
              aria-label="تصویر قبلی"
              className="absolute right-2.5 top-1/2 -translate-y-1/2 w-8 h-8 rounded-full bg-white/90 text-[var(--color-text-primary)] flex items-center justify-center shadow cursor-pointer"
            >
              <ChevronRight className="w-4 h-4" />
            </button>
            <button
              type="button"
              onClick={() => step(1)}
              aria-label="تصویر بعدی"
              className="absolute left-2.5 top-1/2 -translate-y-1/2 w-8 h-8 rounded-full bg-white/90 text-[var(--color-text-primary)] flex items-center justify-center shadow cursor-pointer"
            >
              <ChevronLeft className="w-4 h-4" />
            </button>
          </>
        )}
      </div>

      {validItems.length > 1 && (
        <div className="flex gap-2 overflow-x-auto pb-1">
          {validItems.map((m, i) => (
            <button
              key={m.id}
              type="button"
              onClick={() => setActiveIndex(i)}
              className={`w-16 h-12 rounded-[8px] overflow-hidden border-2 shrink-0 cursor-pointer ${
                i === safeIndex ? 'border-[var(--color-brand-600)]' : 'border-transparent opacity-70 hover:opacity-100'
              }`}
            >
              <img
                src={m.url as string}
                alt={m.caption}
                onError={() => markImageFailed(m.id)}
                className="w-full h-full object-cover"
              />
            </button>
          ))}
        </div>
      )}

      {lightboxOpen && (() => {
        const lightboxNode = (
          <div
            ref={lightboxRef}
            tabIndex={-1}
            role="dialog"
            aria-modal="true"
            aria-label={`نمایش تمام‌صفحه ${title}`}
            className="fixed inset-0 z-[9500] bg-black/90 flex items-center justify-center p-4"
            onClick={closeLightbox}
          >
            <button
              type="button"
              onClick={closeLightbox}
              aria-label="بستن نمایش تمام‌صفحه"
              className="absolute top-4 left-4 w-10 h-10 rounded-full bg-white/15 text-white flex items-center justify-center cursor-pointer"
            >
              <X className="w-5 h-5" />
            </button>
            {validItems.length > 1 && (
              <>
                <button
                  type="button"
                  onClick={(e) => { e.stopPropagation(); step(-1); }}
                  aria-label="تصویر قبلی"
                  className="absolute right-4 top-1/2 -translate-y-1/2 w-10 h-10 rounded-full bg-white/15 text-white flex items-center justify-center cursor-pointer"
                >
                  <ChevronRight className="w-5 h-5" />
                </button>
                <button
                  type="button"
                  onClick={(e) => { e.stopPropagation(); step(1); }}
                  aria-label="تصویر بعدی"
                  className="absolute left-4 top-1/2 -translate-y-1/2 w-10 h-10 rounded-full bg-white/15 text-white flex items-center justify-center cursor-pointer"
                >
                  <ChevronLeft className="w-5 h-5" />
                </button>
              </>
            )}
            <img
              src={current.url as string}
              alt={current.caption}
              onError={() => markImageFailed(current.id)}
              onClick={(e) => e.stopPropagation()}
              className="max-h-[88vh] max-w-full rounded-xl object-contain"
            />
          </div>
        );
        return typeof document !== 'undefined' ? createPortal(lightboxNode, document.body) : lightboxNode;
      })()}
    </div>
  );
};
