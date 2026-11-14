/** @file src/components/views/PropertyDetailPanel.tsx — Property Detail View (RT-L07 & RT-UI-COMP-001) */
import React from 'react';
import { ArrowRight, Calculator, MapPin } from 'lucide-react';
import { toPersianNum, type EvaluatedNeighborhood } from '../../data/neighborhoods';
import { convertPricePerSqmToUnit, formatAreaShort, formatMillionTomanAsIntlCurrency, type AreaUnit, type IntlCurrencyCode, type PrimaryViewId, type RadarLocale } from '../../utils/areaUnit';
import { RadarButton } from '../common/RadarButton';
import { DataCredibilityBadge, DataProvenanceBar } from '../common/RadarDataBadges';

export interface FlattenedPropertyItem {
  id: string;
  hood: EvaluatedNeighborhood;
  title: string;
  street: string;
  dealKind: 'buy' | 'rent';
  sqm: number;
  askPricePerSqm: number;
  v64BenchmarkPerSqm: number;
  isLiveBargain: boolean;
}

export interface PropertyDetailPanelProps {
  property: FlattenedPropertyItem;
  areaUnit: AreaUnit;
  intlCurrency: IntlCurrencyCode;
  radarLocale: RadarLocale;
  onBack: () => void;
  onSelectNeighborhood: (hood: EvaluatedNeighborhood) => void;
  onNavigateView: (view: PrimaryViewId) => void;
  onOpenInspector: (hood: EvaluatedNeighborhood) => void;
  onOpenHedonicForProperty: (hood: EvaluatedNeighborhood, params?: { sqm?: number }) => void;
}

export function PropertyDetailPanel({
  property, areaUnit, intlCurrency, radarLocale, onBack, onSelectNeighborhood, onNavigateView, onOpenInspector, onOpenHedonicForProperty,
}: PropertyDetailPanelProps): React.ReactElement {
  const askUnit = convertPricePerSqmToUnit(property.askPricePerSqm, areaUnit);
  const benchUnit = convertPricePerSqmToUnit(property.v64BenchmarkPerSqm, areaUnit);
  const estTotalMillions = Math.round(property.askPricePerSqm * property.sqm);
  const deltaPct = property.v64BenchmarkPerSqm > 0
    ? Math.round(((property.askPricePerSqm - property.v64BenchmarkPerSqm) / property.v64BenchmarkPerSqm) * 100)
    : 0;

  return (
    <div className="w-full max-w-[1360px] mx-auto px-4 py-6 space-y-5 animate-fadeIn" data-testid="property-detail-panel">
      <div className="flex flex-wrap items-center justify-between gap-3 border-b border-[#DCE3DF] dark:border-slate-800 pb-4">
        <RadarButton variant="outline" size="sm" leadingIcon={<ArrowRight className="w-4 h-4" />} onClick={onBack}>
          بازگشت به فهرست نتایج
        </RadarButton>
        <div className="flex flex-wrap items-center gap-2">
          <RadarButton variant="secondary" size="sm" leadingIcon={<MapPin className="w-4 h-4" />} onClick={() => { onSelectNeighborhood(property.hood); onNavigateView('map'); }}>
            نمایش محله روی نقشه
          </RadarButton>
          <RadarButton variant="primary" size="md" leadingIcon={<Calculator className="w-4 h-4" />} onClick={() => onOpenHedonicForProperty(property.hood, { sqm: property.sqm })}>
            ارزش‌گذاری هدونیک این مشخصات
          </RadarButton>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-12 gap-5">
        <div className="lg:col-span-8 p-5 rounded-[12px] bg-white dark:bg-slate-900 border border-[#DCE3DF] dark:border-slate-800 space-y-4">
          <div className="flex flex-wrap items-center justify-between gap-2 text-[13px]">
            <span className="font-semibold text-[#586760] dark:text-slate-400">محله {property.hood.name} · {property.street}</span>
            <DataCredibilityBadge status={property.isLiveBargain ? 'verified' : 'estimated'} />
          </div>
          <h1 className="text-xl sm:text-2xl font-bold text-[#182522] dark:text-white">{property.title}</h1>
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 pt-3 border-t border-[#DCE3DF] dark:border-slate-800 text-[13px] tabular-nums">
            <div className="p-3 rounded-[8px] bg-[#F1F4F2] dark:bg-slate-800/70">
              <span className="text-[#586760] block">متراژ مبنا</span>
              <strong className="text-sm font-bold text-[#182522] dark:text-white">{formatAreaShort(property.sqm, areaUnit)}</strong>
            </div>
            <div className="p-3 rounded-[8px] bg-[#F1F4F2] dark:bg-slate-800/70">
              <span className="text-[#586760] block">قیمت اعلامی هر واحد</span>
              <strong className="text-sm font-bold text-[#182522] dark:text-white">{toPersianNum(askUnit)} م</strong>
            </div>
            <div className="p-3 rounded-[8px] bg-[#EAF3F0] dark:bg-emerald-950/30">
              <span className="text-[#14534E] dark:text-emerald-400 block">سناریو v6.4 (غیرثبتی)</span>
              <strong className="text-sm font-bold text-[#103B38] dark:text-emerald-300">{toPersianNum(benchUnit)} م</strong>
            </div>
            <div className="p-3 rounded-[8px] bg-[#F1F4F2] dark:bg-slate-800/70">
              <span className="text-[#586760] block">برآورد کل ({property.dealKind === 'rent' ? 'رهن' : 'خرید'})</span>
              <strong className="text-sm font-bold text-[#182522] dark:text-white">
                {toPersianNum((estTotalMillions / 1000).toFixed(2))} م.د
                {intlCurrency !== 'IRT' ? ` (${formatMillionTomanAsIntlCurrency(estTotalMillions, intlCurrency, radarLocale)})` : ''}
              </strong>
            </div>
          </div>
          <p className="text-[14px] text-[#34433E] dark:text-slate-300 leading-[1.8] pt-2 border-t border-[#DCE3DF] dark:border-slate-800">
            شکاف قیمت اعلامی این فایل نسبت به سناریوی تخمینی معاملاتی محله {property.hood.name} معادل{' '}
            <strong className="tabular-nums">{toPersianNum(Math.abs(deltaPct))}٪ {deltaPct <= 0 ? 'پایین‌تر (فرصت مذاکره مناسب)' : 'بالاتر'}</strong>{' '}
            برآورد می‌شود.
          </p>
          <DataProvenanceBar
            sourceLabel={property.isLiveBargain ? 'فایل ثبت‌شده کاربران و مشاوران همکار' : 'شاخص مرجع محله در رادار تهران'}
            updatedAtLabel="بروزرسانی مستمر روزانه"
            methodLabel="تطبیق با مدل هدونیک v6.4 و پالایش داده پرت"
            credibility={property.isLiveBargain ? 'verified' : 'estimated'}
            limitationNote="این تحلیل جایگزین کارشناسی فنی، بازدید حضوری و استعلام ثبتی نیست."
          />
        </div>

        <aside className="lg:col-span-4 p-5 rounded-[12px] bg-white dark:bg-slate-900 border border-[#DCE3DF] dark:border-slate-800 space-y-3 text-[13px]">
          <h2 className="text-[16px] font-bold text-[#182522] dark:text-white">زمینه شهری محله {property.hood.name}</h2>
          <div className="space-y-2 tabular-nums">
            <div className="flex justify-between py-1.5 border-b border-[#DCE3DF] dark:border-slate-800"><span className="text-[#586760]">امتیاز کل سکونت</span><strong className="font-bold text-[#182522] dark:text-white">{toPersianNum(property.hood.overallScore)} / ۱۰</strong></div>
            <div className="flex justify-between py-1.5 border-b border-[#DCE3DF] dark:border-slate-800"><span className="text-[#586760]">دسترسی مترو</span><strong className="font-bold text-[#182522] dark:text-white">{toPersianNum(property.hood.metro)} / ۱۰</strong></div>
            <div className="flex justify-between py-1.5 border-b border-[#DCE3DF] dark:border-slate-800"><span className="text-[#586760]">کیفیت هوا</span><strong className="font-bold text-[#182522] dark:text-white">{toPersianNum(property.hood.air)} / ۱۰</strong></div>
          </div>
          <RadarButton variant="secondary" fullWidth onClick={() => { onSelectNeighborhood(property.hood); onOpenInspector(property.hood); }}>
            باز کردن کارنامه کامل محله {property.hood.name}
          </RadarButton>
        </aside>
      </div>
    </div>
  );
}
