/** @file src/features/services/components/ServiceProviderCard.tsx — Honest Provider Directory Card (Stage 21) */
import React from 'react';
import { Briefcase, CheckCircle2, MapPin, Phone, ShieldAlert, Sparkles } from 'lucide-react';
import { toPersianNum } from '../../../data/neighborhoods';
import { CANONICAL_CATEGORY_LABELS_FA, type ServiceProviderEntity } from '../types/service.types';

export interface ServiceProviderCardProps {
  provider: ServiceProviderEntity;
  onOpenDetail: (provider: ServiceProviderEntity) => void;
  onRequestQuote: (provider: ServiceProviderEntity) => void;
}

export const ServiceProviderCard: React.FC<ServiceProviderCardProps> = ({
  provider,
  onOpenDetail,
  onRequestQuote,
}) => {
  const { identity, credential, activity, listingTier, coverage, feedback } = provider;
  const verifiedTracksCount = credential.tracks.filter((t) => t.status === 'verified').length;

  return (
    <article
      data-testid={`service-provider-card-${identity.id}`}
      className="p-4 rounded-[12px] bg-white dark:bg-slate-900 border border-[#DCE3DF] dark:border-slate-800 hover:border-[#176B63] transition flex flex-col justify-between gap-3 text-xs"
    >
      <div className="space-y-2.5">
        <div className="flex flex-wrap items-center justify-between gap-1.5">
          <span className="text-[11px] font-bold text-[#176B63] dark:text-emerald-400">
            {CANONICAL_CATEGORY_LABELS_FA[provider.canonicalCategory]}
          </span>
          {listingTier === 'sponsored_ad' ? (
            <span className="px-2 py-0.5 rounded-[6px] bg-[#FFF4E5] border border-[#F4D3A1] text-[#875000] text-[10px] font-black flex items-center gap-1 whitespace-nowrap">
              <Sparkles className="w-3 h-3" />
              <span>{provider.adDisclosureLabelFa || 'نمایش تبلیغاتی'}</span>
            </span>
          ) : (
            <span className="text-[10px] font-bold text-[#586760] dark:text-slate-400 whitespace-nowrap">
              نمایه ارگانیک محله
            </span>
          )}
        </div>

        <div>
          <h3 className="text-sm font-black text-[#182522] dark:text-white">{identity.displayName}</h3>
          <p className="text-[11px] text-[#586760] dark:text-slate-400 flex flex-wrap items-center gap-1 mt-0.5">
            <MapPin className="w-3.5 h-3.5 text-[#176B63] shrink-0" />
            <span>دفتر: {coverage.officeNeighborhoodName} ({identity.zone})</span>
            <span>·</span>
            <span>پوشش: {coverage.coveredAreaNames.join('، ')}</span>
          </p>
        </div>

        <p className="text-[11px] text-[#34433E] dark:text-slate-300 leading-relaxed line-clamp-2">
          {provider.specialtyFa}
        </p>

        <div className="p-2.5 rounded-[8px] bg-[#F8F9FA] dark:bg-slate-800/70 space-y-1.5 text-[10.5px] text-[#586760] dark:text-slate-400">
          <div className="flex flex-wrap items-center justify-between gap-1 tabular-nums">
            <span className="flex items-center gap-1">
              <Briefcase className="w-3 h-3" />
              <span>سابقه اظهارشده: {toPersianNum(activity.experienceYearsDeclared)} سال</span>
            </span>
            <span>
              {feedback.verifiedReviewsCount > 0 && feedback.averageScore !== null
                ? `امتیاز واقعی: ${toPersianNum(feedback.averageScore)}/۵ (${toPersianNum(feedback.verifiedReviewsCount)} نظر)`
                : 'بدون نظر راستی‌آزمایی‌شده'}
            </span>
          </div>
          <div className="flex items-center justify-between gap-2 text-[10.5px]">
            <span className="truncate font-bold text-[#34433E] dark:text-slate-300">
              تعرفه: {provider.pricingModelFa}
            </span>
          </div>
          <div
            className={`flex items-center gap-1 font-bold ${
              verifiedTracksCount > 0
                ? 'text-[#176B63] dark:text-emerald-300'
                : 'text-[#875000] dark:text-amber-300'
            }`}
          >
            {verifiedTracksCount > 0 ? (
              <CheckCircle2 className="w-3 h-3 shrink-0" />
            ) : (
              <ShieldAlert className="w-3 h-3 shrink-0" />
            )}
            <span className="truncate">
              {credential.statusLabelFa} ({toPersianNum(verifiedTracksCount)} از ۴ مسیر تأیید)
            </span>
          </div>
        </div>
      </div>

      <div className="flex items-center gap-2 pt-2 border-t border-[#DCE3DF] dark:border-slate-800">
        <button
          type="button"
          data-testid={`service-request-btn-${identity.id}`}
          onClick={() => onRequestQuote(provider)}
          className="flex-1 py-2 rounded-[8px] bg-[#176B63] hover:bg-[#14534E] text-white font-bold cursor-pointer whitespace-nowrap"
        >
          درخواست مشاوره / کارشناسی
        </button>
        <button
          type="button"
          onClick={() => onOpenDetail(provider)}
          className="px-3 py-2 rounded-[8px] border border-[#DCE3DF] dark:border-slate-700 text-[#182522] dark:text-white font-bold flex items-center gap-1 cursor-pointer whitespace-nowrap"
        >
          <Phone className="w-3.5 h-3.5 text-[#176B63]" />
          <span>جزئیات</span>
        </button>
      </div>
    </article>
  );
};
