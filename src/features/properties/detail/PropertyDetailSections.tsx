/** @file src/features/properties/detail/PropertyDetailSections.tsx — Modular Sections for Property Detail View */
import React, { useEffect, useState } from 'react';
import { createPortal } from 'react-dom';
import { CheckCircle2, Clock, Flag, HelpCircle, MapPin, Phone, ShieldAlert, ShieldCheck, X } from 'lucide-react';
import { toPersianNum, type EvaluatedNeighborhood } from '../../../data/neighborhoods';
import { formatAreaShort, type AreaUnit } from '../../../utils/areaUnit';
import { useDialogFocus } from '../../../components/useDialogFocus';
import {
  AMENITY_VALUE_LABELS_FA,
  DOCUMENT_TYPE_LABELS_FA,
} from '../types/property.types';
import {
  PUBLISHER_ROLE_LABELS_FA,
  TRANSACTION_TYPE_LABELS_FA,
  type PropertyListingRecord,
  type VerificationDimensionStatus,
} from '../types/listing.types';
import {
  LISTING_REPORT_REASON_LABELS_FA,
  type ListingHistoryEvent,
  type ListingReportReason,
} from '../types/listing-history.types';
import { formatStraightLineDistanceFa, haversineDistanceKm } from '../services/propertyMapService';

const VERIF_LABELS: Record<VerificationDimensionStatus, { label: string; cls: string }> = {
  verified: { label: 'تأییدشده', cls: 'text-[#176B4C] dark:text-emerald-400' },
  partial: { label: 'جزئی / در انتظار تکمیل', cls: 'text-[#875000] dark:text-amber-300' },
  unverified: { label: 'تأییدنشده', cls: 'text-[#B3261E] dark:text-rose-400' },
};

export const PropertySpecsAndLocationSection: React.FC<{
  record: PropertyListingRecord;
  hood: EvaluatedNeighborhood;
  areaUnit: AreaUnit;
  historyEvents: ListingHistoryEvent[];
}> = ({ record, hood, areaUnit, historyEvents }) => {
  const { property, listing } = record;
  const distKm =
    property.lat !== null && property.lng !== null
      ? haversineDistanceKm(property.lat, property.lng, hood.lat, hood.lng)
      : null;

  return (
    <div className="space-y-4">
      {/* 1. Unit Specifications vs Building Specifications */}
      <section className="p-4 sm:p-5 rounded-[12px] bg-white dark:bg-slate-900 border border-[#DCE3DF] dark:border-slate-800 space-y-4">
        <h2 className="text-sm font-black text-[#182522] dark:text-white">مشخصات فنی واحد و ساختمان (تفکیک «نامشخص» از «ندارد»)</h2>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4 text-xs">
          <div className="space-y-2">
            <h3 className="text-[11px] font-bold text-[#586760] dark:text-slate-400">ویژگی‌های اختصاصی واحد</h3>
            <div className="divide-y divide-[#DCE3DF] dark:divide-slate-800 border border-[#DCE3DF] dark:border-slate-800 rounded-[10px] px-3 tabular-nums">
              <SpecRow label="متراژ" value={property.areaSqm ? formatAreaShort(property.areaSqm, areaUnit) : 'نامشخص'} />
              <SpecRow label="تعداد اتاق" value={property.roomsCount !== null ? `${toPersianNum(property.roomsCount)} خواب` : 'نامشخص'} />
              <SpecRow label="طبقه واحد" value={property.floorNumber !== null ? `طبقه ${toPersianNum(property.floorNumber)}` : 'نامشخص'} />
              <SpecRow label="پارکینگ" value={AMENITY_VALUE_LABELS_FA[property.unitFeatures.parking]} />
              <SpecRow label="انباری" value={AMENITY_VALUE_LABELS_FA[property.unitFeatures.storage]} />
              <SpecRow label="بالکن" value={AMENITY_VALUE_LABELS_FA[property.unitFeatures.balcony]} />
            </div>
          </div>

          <div className="space-y-2">
            <h3 className="text-[11px] font-bold text-[#586760] dark:text-slate-400">مشخصات ساختمان و وضعیت حقوقی</h3>
            <div className="divide-y divide-[#DCE3DF] dark:divide-slate-800 border border-[#DCE3DF] dark:border-slate-800 rounded-[10px] px-3 tabular-nums">
              <SpecRow label="سال ساخت" value={property.buildYearJalali ? toPersianNum(property.buildYearJalali) : 'نامشخص'} />
              <SpecRow label="آسانسور" value={AMENITY_VALUE_LABELS_FA[property.unitFeatures.elevator]} />
              <SpecRow label="تعداد کل طبقات" value={property.totalFloors !== null ? `${toPersianNum(property.totalFloors)} طبقه` : 'نامشخص'} />
              <SpecRow label="لابی / مشاعات" value={AMENITY_VALUE_LABELS_FA[property.buildingFeatures.hasLobby]} />
              <SpecRow label="نوع سند" value={DOCUMENT_TYPE_LABELS_FA[property.documentType]} />
            </div>
          </div>
        </div>
      </section>

      {/* 2. Multi-Dimensional Verification & Location Precision */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <section className="p-4 rounded-[12px] bg-white dark:bg-slate-900 border border-[#DCE3DF] dark:border-slate-800 space-y-2.5 text-xs">
          <div className="flex items-center gap-1.5 font-black text-[#182522] dark:text-white">
            <ShieldCheck className="w-4 h-4 text-[#176B63]" />
            <span>وضعیت راستی‌آزمایی چندبعدی</span>
          </div>
          <div className="space-y-2 pt-1">
            {[
              { label: 'هویت ثبت‌کننده', status: listing.verification.identity },
              { label: 'انطباق موقعیت و محله', status: listing.verification.location },
              { label: 'معقولیت قیمت نسبت به محله', status: listing.verification.priceReasonableness },
              { label: 'تازگی استعلام و وضعیت فایل', status: listing.verification.freshness },
            ].map((row) => (
              <div key={row.label} className="flex items-center justify-between py-1 border-b last:border-none border-[#DCE3DF] dark:border-slate-800">
                <span className="text-[#48534F] dark:text-slate-300">{row.label}</span>
                <strong className={`font-bold ${VERIF_LABELS[row.status].cls}`}>{VERIF_LABELS[row.status].label}</strong>
              </div>
            ))}
          </div>
        </section>

        <section className="p-4 rounded-[12px] bg-white dark:bg-slate-900 border border-[#DCE3DF] dark:border-slate-800 space-y-2.5 text-xs">
          <div className="flex items-center gap-1.5 font-black text-[#182522] dark:text-white">
            <MapPin className="w-4 h-4 text-[#176B63]" />
            <span>موقعیت و سطح دقت جغرافیایی</span>
          </div>
          <p className="text-[#34433E] dark:text-slate-300 leading-relaxed">
            محدوده ثبت‌شده: <strong>{property.hoodName} · {property.street}</strong>
          </p>
          <p className="text-[11px] text-[#586760] dark:text-slate-400 leading-relaxed">
            سطح دقت مکانی:{' '}
            <strong>
              {property.locationPrecision === 'exact'
                ? 'نقطه دقیق ثبت‌شده'
                : property.locationPrecision === 'approximate'
                ? `محدوده تقریبی حفاظتی (شعاع ~${toPersianNum(property.privacyRadiusMeters)} متر)`
                : property.locationPrecision === 'neighborhood'
                ? 'مرکز محله (مختصات خیابان دقیق ثبت نشده)'
                : 'مختصات نقشه ثبت نشده است'}
            </strong>
          </p>
          {distKm !== null && (
            <div className="text-[11px] text-[#586760] dark:text-slate-400 pt-1 border-t border-[#DCE3DF] dark:border-slate-800">
              فاصله تا مرکز محله {property.hoodName}: <strong>{formatStraightLineDistanceFa(distKm)}</strong>
            </div>
          )}
        </section>
      </div>

      {/* 3. Honest Price & Status History */}
      <section className="p-4 rounded-[12px] bg-white dark:bg-slate-900 border border-[#DCE3DF] dark:border-slate-800 space-y-2.5 text-xs">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-1.5 font-black text-[#182522] dark:text-white">
            <Clock className="w-4 h-4 text-[#176B63]" />
            <span>تاریخچه ثبت و تغییرات واقعی فایل</span>
          </div>
          <span className="text-[10.5px] text-[#586760] dark:text-slate-400">فقط رویدادهای مستند و قابل پیگیری</span>
        </div>
        <div className="space-y-2 pt-1">
          {historyEvents.map((ev) => (
            <div key={ev.id} className="flex items-start justify-between gap-3 py-1.5 border-b last:border-none border-[#DCE3DF] dark:border-slate-800">
              <div className="flex items-start gap-2">
                <CheckCircle2 className="w-3.5 h-3.5 text-[#176B63] shrink-0 mt-0.5" />
                <div>
                  <div className="font-bold text-[#182522] dark:text-slate-200">{ev.summaryFa}</div>
                  {ev.oldValue && ev.newValue && (
                    <div className="text-[10.5px] text-[#586760] dark:text-slate-400">
                      از «{ev.oldValue}» به «{ev.newValue}»
                    </div>
                  )}
                </div>
              </div>
              <span className="text-[10.5px] text-[#586760] dark:text-slate-400 tabular-nums shrink-0">
                {new Date(ev.atIso).toLocaleDateString('fa-IR')}
              </span>
            </div>
          ))}
        </div>
      </section>
    </div>
  );
};

const SpecRow: React.FC<{ label: string; value: string }> = ({ label, value }) => (
  <div className="flex items-center justify-between py-2">
    <span className="text-[#586760] dark:text-slate-400">{label}</span>
    <strong className={`font-bold ${value.includes('نامشخص') ? 'text-[#875000] dark:text-amber-300' : 'text-[#182522] dark:text-white'}`}>
      {value}
    </strong>
  </div>
);

export const PublisherAndReportBox: React.FC<{
  record: PropertyListingRecord;
  onReportSubmitted: (reason: ListingReportReason, details: string) => void;
}> = ({ record, onReportSubmitted }) => {
  const { listing } = record;
  const [showPhone, setShowPhone] = useState(false);
  const [reportOpen, setReportOpen] = useState(false);
  const [reason, setReason] = useState<ListingReportReason>('wrong_price');
  const [details, setDetails] = useState('');
  const [reported, setReported] = useState(false);
  const reportDialogRef = useDialogFocus(reportOpen, () => setReportOpen(false));

  useEffect(() => {
    setShowPhone(false);
    setReportOpen(false);
    setReason('wrong_price');
    setDetails('');
    setReported(false);
  }, [listing.listingId]);

  return (
    <div className="space-y-3 text-xs">
      <div className="p-4 rounded-[12px] bg-[#F8F9FA] dark:bg-slate-800/70 border border-[#DCE3DF] dark:border-slate-700 space-y-2">
        <div className="flex items-center justify-between">
          <span className="text-[11px] text-[#586760] dark:text-slate-400">{PUBLISHER_ROLE_LABELS_FA[listing.publisher.role]}</span>
          <strong className="text-[#182522] dark:text-white">{listing.publisher.displayName}</strong>
        </div>
        {listing.publisher.contactAuthorized && listing.publisher.maskedPhone ? (
          <button
            type="button"
            onClick={() => setShowPhone((v) => !v)}
            className="w-full py-2 px-3 rounded-[9px] bg-[#182522] dark:bg-white text-white dark:text-slate-900 font-bold flex items-center justify-center gap-1.5 cursor-pointer"
          >
            <Phone className="w-3.5 h-3.5" />
            <span className="tabular-nums">{showPhone ? listing.publisher.maskedPhone : 'نمایش شماره تماس مجاز'}</span>
          </button>
        ) : (
          <div className="p-2 rounded-[8px] bg-white dark:bg-slate-900 border border-[#DCE3DF] dark:border-slate-700 text-[11px] text-[#586760] dark:text-slate-400 flex items-center gap-1.5">
            <HelpCircle className="w-3.5 h-3.5 shrink-0" />
            <span>تماس مستقیم برای شاخص مرجع فعال نیست.</span>
          </div>
        )}
      </div>

      <button
        type="button"
        onClick={() => setReportOpen(true)}
        className="w-full py-2 rounded-[9px] border border-[#DCE3DF] dark:border-slate-700 text-[#B3261E] dark:text-rose-400 font-bold flex items-center justify-center gap-1.5 hover:bg-rose-50/60 dark:hover:bg-rose-950/20 cursor-pointer"
      >
        <Flag className="w-3.5 h-3.5" />
        <span>{reported ? 'گزارش مغایرت ثبت شد' : 'گزارش خطا یا مغایرت این فایل'}</span>
      </button>

      {reportOpen && (() => {
        const dialogNode = (
          <div role="dialog" aria-modal="true" aria-label="گزارش مغایرت یا مشکل فایل" className="fixed inset-0 z-[9500] bg-black/50 flex items-center justify-center p-4" onClick={() => setReportOpen(false)}>
            <div ref={reportDialogRef} tabIndex={-1} dir="rtl" onClick={(e) => e.stopPropagation()} className="w-full max-w-md max-h-[90dvh] overflow-y-auto rounded-2xl bg-white dark:bg-slate-900 border border-[#DCE3DF] dark:border-slate-800 p-5 space-y-3">
              <div className="flex items-center justify-between">
                <h3 className="text-sm font-black text-[#182522] dark:text-white flex items-center gap-1.5">
                  <ShieldAlert className="w-4 h-4 text-[#B3261E]" />
                  <span>گزارش مغایرت یا مشکل فایل</span>
                </h3>
                <button type="button" onClick={() => setReportOpen(false)} aria-label="بستن" className="cursor-pointer"><X className="w-4 h-4" /></button>
              </div>
              <p className="text-[11px] text-[#586760] dark:text-slate-400">
                موضوع: {listing.title} ({TRANSACTION_TYPE_LABELS_FA[listing.transactionType]})
              </p>
              <div className="space-y-1.5">
                {(Object.keys(LISTING_REPORT_REASON_LABELS_FA) as ListingReportReason[]).map((k) => (
                  <label key={k} className="flex items-center gap-2 p-2 rounded-lg border border-[#DCE3DF] dark:border-slate-700 cursor-pointer">
                    <input type="radio" name="report_reason" checked={reason === k} onChange={() => setReason(k)} className="accent-[#176B63]" />
                    <span>{LISTING_REPORT_REASON_LABELS_FA[k]}</span>
                  </label>
                ))}
              </div>
              <textarea
                rows={3}
                value={details}
                onChange={(e) => setDetails(e.target.value)}
                placeholder="توضیح تکمیلی برای بررسی تیم نظارت (اختیاری)..."
                className="w-full p-2.5 rounded-lg bg-[#F8F9FA] dark:bg-slate-800 border border-[#DCE3DF] dark:border-slate-700 text-xs"
              />
              <button
                type="button"
                onClick={() => {
                  onReportSubmitted(reason, details);
                  setReported(true);
                  setReportOpen(false);
                }}
                className="w-full py-2.5 rounded-[9px] bg-[#B3261E] text-white font-bold cursor-pointer"
              >
                ثبت گزارش بررسی
              </button>
            </div>
          </div>
        );
        return typeof document !== 'undefined' ? createPortal(dialogNode, document.body) : dialogNode;
      })()}
    </div>
  );
};
