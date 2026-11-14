/** @file src/features/properties/detail/PropertyGallery.tsx — Accessible Media Gallery with Keyboard Lightbox & Honest Placeholder */
import React, { useState } from 'react';
import { Building2, ChevronLeft, ChevronRight, Maximize2, X } from 'lucide-react';
import { toPersianNum } from '../../../data/neighborhoods';
import type { PropertyMediaItem } from '../types/property.types';

export interface PropertyGalleryProps {
  media: PropertyMediaItem[];
  title: string;
  hoodName: string;
}

export const PropertyGallery: React.FC<PropertyGalleryProps> = ({ media, title, hoodName }) => {
  const validItems = media.filter((m) => m.valid && Boolean(m.url));
  const [activeIndex, setActiveIndex] = useState(0);
  const [lightboxOpen, setLightboxOpen] = useState(false);

  if (validItems.length === 0) {
    return (
      <div className="aspect-[16/9] max-h-[340px] w-full rounded-[12px] bg-[#F1F4F2] dark:bg-slate-800/70 border border-[#DCE3DF] dark:border-slate-700 flex flex-col items-center justify-center text-center p-6 space-y-1.5">
        <Building2 className="w-9 h-9 text-[#586760] opacity-70" />
        <p className="text-xs font-bold text-[#182522] dark:text-slate-200">تصویر تأییدشده‌ای برای این فایل ثبت نشده است</p>
        <p className="text-[11px] text-[#586760] dark:text-slate-400">
          مشخصات و محدوده ({hoodName}) به‌صورت متنی ثبت شده است؛ پیش از بازدید حضوری می‌توانید استعلام تصویر را از ثبت‌کننده درخواست کنید.
        </p>
      </div>
    );
  }

  const current = validItems[Math.min(activeIndex, validItems.length - 1)];
  const step = (delta: number) => {
    setActiveIndex((prev) => (prev + delta + validItems.length) % validItems.length);
  };

  return (
    <div className="space-y-2">
      <div
        className="relative aspect-[16/9] max-h-[380px] w-full rounded-[12px] bg-[#F1F4F2] dark:bg-slate-800 overflow-hidden border border-[#DCE3DF] dark:border-slate-700"
        tabIndex={0}
        onKeyDown={(e) => {
          if (e.key === 'ArrowLeft') step(1);
          else if (e.key === 'ArrowRight') step(-1);
        }}
      >
        <img src={current.url as string} alt={`${title} - ${current.caption}`} className="w-full h-full object-cover" />
        <button
          type="button"
          onClick={() => setLightboxOpen(true)}
          aria-label="نمایش تمام‌صفحه تصویر"
          className="absolute bottom-3 left-3 px-2.5 py-1 rounded-[8px] bg-slate-900/75 text-white text-[11px] font-bold flex items-center gap-1 cursor-pointer"
        >
          <Maximize2 className="w-3.5 h-3.5" />
          <span>بزرگ‌نمایی ({toPersianNum(activeIndex + 1)} از {toPersianNum(validItems.length)})</span>
        </button>
        {validItems.length > 1 && (
          <>
            <button
              type="button"
              onClick={() => step(-1)}
              aria-label="تصویر قبلی"
              className="absolute right-2.5 top-1/2 -translate-y-1/2 w-8 h-8 rounded-full bg-white/90 text-[#182522] flex items-center justify-center shadow cursor-pointer"
            >
              <ChevronRight className="w-4 h-4" />
            </button>
            <button
              type="button"
              onClick={() => step(1)}
              aria-label="تصویر بعدی"
              className="absolute left-2.5 top-1/2 -translate-y-1/2 w-8 h-8 rounded-full bg-white/90 text-[#182522] flex items-center justify-center shadow cursor-pointer"
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
                i === activeIndex ? 'border-[#176B63]' : 'border-transparent opacity-70 hover:opacity-100'
              }`}
            >
              <img src={m.url as string} alt={m.caption} className="w-full h-full object-cover" />
            </button>
          ))}
        </div>
      )}

      {lightboxOpen && (
        <div
          role="dialog"
          aria-modal="true"
          className="fixed inset-0 z-[80] bg-black/90 flex items-center justify-center p-4"
          onClick={() => setLightboxOpen(false)}
        >
          <button
            type="button"
            onClick={() => setLightboxOpen(false)}
            aria-label="بستن نمایش تمام‌صفحه"
            className="absolute top-4 left-4 w-10 h-10 rounded-full bg-white/15 text-white flex items-center justify-center cursor-pointer"
          >
            <X className="w-5 h-5" />
          </button>
          <img
            src={current.url as string}
            alt={current.caption}
            onClick={(e) => e.stopPropagation()}
            className="max-h-[88vh] max-w-full rounded-xl object-contain"
          />
        </div>
      )}
    </div>
  );
};
