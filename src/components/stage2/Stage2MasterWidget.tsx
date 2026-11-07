/**
 * @file src/components/stage2/Stage2MasterWidget.tsx
 * @description Stage 2.3 — Self-Contained Master Tabbed Widget combining
 * NeighborhoodCrowdClaimsPanel and SocioeconomicReferenceCard for zero-conflict integration.
 */
import React, { useState } from 'react';
import { BookOpenCheck, Users } from 'lucide-react';
import { formatMillionTomanAsIntlCurrency, type IntlCurrencyCode } from '../../utils/areaUnit';
import {
  NeighborhoodCrowdClaimsPanel,
  type Stage2CurrentUser,
} from './NeighborhoodCrowdClaimsPanel';
import { SocioeconomicReferenceCard } from './SocioeconomicReferenceCard';

export interface Stage2MasterWidgetProps {
  hoodId: number;
  hoodName: string;
  cityId?: string;
  currentUser?: Stage2CurrentUser | null;
  basePriceSqm?: number;
  intlCurrency?: IntlCurrencyCode;
}

export type Stage2ActiveTab = 'CROWD_CLAIMS' | 'SOCIOECONOMIC_REFERENCE';

export const Stage2MasterWidget: React.FC<Stage2MasterWidgetProps> = ({
  hoodId,
  hoodName,
  cityId = 'tehran',
  currentUser = null,
  basePriceSqm = 125,
  intlCurrency = 'USD',
}) => {
  const [activeTab, setActiveTab] = useState<Stage2ActiveTab>('CROWD_CLAIMS');
  const intlPreview = formatMillionTomanAsIntlCurrency(basePriceSqm, intlCurrency, 'fa');

  return (
    <section
      dir="rtl"
      aria-label={`گراف دانش مردمی و شناسنامه پژوهشی محله ${hoodName}`}
      className="rounded-2xl border border-slate-200 bg-slate-50/70 p-3.5 shadow-sm space-y-3 text-right"
    >
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="flex items-center gap-1.5 rounded-xl bg-white p-1 border border-slate-200">
          <button
            type="button"
            role="tab"
            aria-selected={activeTab === 'CROWD_CLAIMS'}
            aria-label="تب مشارکت مردمی و گزارش‌های کوچه و محله"
            onClick={() => setActiveTab('CROWD_CLAIMS')}
            className={`inline-flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-xs font-bold transition ${
              activeTab === 'CROWD_CLAIMS'
                ? 'bg-blue-600 text-white shadow-xs'
                : 'text-slate-600 hover:bg-slate-100'
            }`}
          >
            <Users className="h-3.5 w-3.5" />
            <span>گزارش‌های مردمی کوچه و محله</span>
          </button>
          <button
            type="button"
            role="tab"
            aria-selected={activeTab === 'SOCIOECONOMIC_REFERENCE'}
            aria-label="تب شناسنامه پژوهشی و شاخص‌های اقتصادی-اجتماعی"
            onClick={() => setActiveTab('SOCIOECONOMIC_REFERENCE')}
            className={`inline-flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-xs font-bold transition ${
              activeTab === 'SOCIOECONOMIC_REFERENCE'
                ? 'bg-indigo-600 text-white shadow-xs'
                : 'text-slate-600 hover:bg-slate-100'
            }`}
          >
            <BookOpenCheck className="h-3.5 w-3.5" />
            <span>شناسنامه پژوهشی و کوچ تقاضا</span>
          </button>
        </div>
        <span className="text-[11px] text-slate-500">
          پایه ارزی محله: {intlPreview}
        </span>
      </div>

      {activeTab === 'CROWD_CLAIMS' ? (
        <NeighborhoodCrowdClaimsPanel
          hoodId={hoodId}
          hoodName={hoodName}
          cityId={cityId}
          currentUser={currentUser}
          intlCurrency={intlCurrency}
        />
      ) : (
        <SocioeconomicReferenceCard
          hoodId={hoodId}
          hoodName={hoodName}
          cityId={cityId}
          basePriceSqm={basePriceSqm}
          intlCurrency={intlCurrency}
        />
      )}
    </section>
  );
};

export default Stage2MasterWidget;
