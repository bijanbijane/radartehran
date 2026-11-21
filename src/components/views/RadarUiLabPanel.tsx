/** @file src/components/views/RadarUiLabPanel.tsx — RT-UI-COMP-001 Section 18 Interactive Radar UI Lab */
import React, { useState } from 'react';
import { Calculator, MapPin, Trash2, X } from 'lucide-react';
import { RadarButton } from '../common/RadarButton';
import { RadarInputField, RadarEmptyStateCard } from '../common/RadarField';
import { DataCredibilityBadge, DataProvenanceBar, RadarCard, RadarMetricCard } from '../common/RadarDataBadges';
import { InteractionQaLabTab } from './InteractionQaLabTab';
import { ValidationAndImplementLabTab } from './ValidationAndImplementLabTab';
import { OnboardingAndResponsiveHelpCenter } from '../../features/onboarding/components/OnboardingAndResponsiveHelpCenter';
import { isRadarUiLabAvailable } from '../../features/tools/services/toolsCatalogEngine';

export interface RadarUiLabPanelProps {
  onClose: () => void;
  isDevEnvironment?: boolean;
}

export const RadarUiLabPanel: React.FC<RadarUiLabPanelProps> = ({ onClose, isDevEnvironment }) => {
  const [viewportMode, setViewportMode] = useState<'desktop' | 'mobile'>('desktop');
  const [activeLabTab, setActiveLabTab] = useState<'components' | 'interaction' | 'validation' | 'onboarding'>('components');
  const [loadingDemo, setLoadingDemo] = useState(false);
  const [areaSqm, setAreaSqm] = useState('95');
  const [budgetVal, setBudgetVal] = useState('12500');
  const [dealType, setDealType] = useState<'buy' | 'rent'>('buy');

  if (!isRadarUiLabAvailable(isDevEnvironment)) return null;

  const areaNum = Number(areaSqm);
  const areaError = areaSqm.trim() && (!Number.isFinite(areaNum) || areaNum < 20 || areaNum > 1000)
    ? 'متراژ معتبر باید بین ۲۰ تا ۱٬۰۰۰ مترمربع باشد.'
    : undefined;

  return (
    <section
      data-testid="radar-ui-lab-panel"
      aria-label="آزمایشگاه اجزای رابط رادار تهران"
      className="rounded-[16px] border-2 border-[var(--color-brand-600)]/40 bg-[var(--color-bg-canvas)] dark:bg-slate-950 p-4 sm:p-6 space-y-6"
    >
      <div className="flex flex-wrap items-center justify-between gap-3 border-b border-[var(--color-border-subtle)] dark:border-slate-800 pb-4">
        <div>
          <span className="text-[13px] font-semibold text-[var(--color-brand-600)] dark:text-emerald-400 block">
            {activeLabTab === 'components'
              ? 'RT-UI-COMP-001 · Section 18'
              : activeLabTab === 'interaction'
                ? 'RT-UI-INTERACTION-001 · Stage 9'
                : activeLabTab === 'validation'
                  ? 'RT-UI-VALIDATION-001 & RT-UI-IMPLEMENT-001 · Stages 10–11'
                  : 'RT-UI-ONBOARDING / RESPONSIVE / ACCESSIBILITY / MOTION · Stages 32–35'}
          </span>
          <h2 className="text-[20px] font-bold text-[var(--color-text-primary)] dark:text-white">Radar UI & Interaction QA Lab</h2>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <div role="group" aria-label="بخش آزمایشگاه" className="inline-flex flex-wrap rounded-[8px] border border-[var(--color-border-subtle)] dark:border-slate-700 bg-white dark:bg-slate-900 p-0.5">
            <button type="button" onClick={() => setActiveLabTab('components')} className={`px-3 py-1 rounded-[6px] text-[12px] font-semibold cursor-pointer ${activeLabTab === 'components' ? 'bg-[var(--color-brand-600)] text-white' : 'text-[var(--color-text-muted)]'}`}>اجزای رابط (۸)</button>
            <button type="button" data-testid="switch-interaction-qa-tab" onClick={() => setActiveLabTab('interaction')} className={`px-3 py-1 rounded-[6px] text-[12px] font-semibold cursor-pointer ${activeLabTab === 'interaction' ? 'bg-[var(--color-brand-600)] text-white' : 'text-[var(--color-text-muted)]'}`}>تعاملات (۹)</button>
            <button type="button" data-testid="switch-validation-qa-tab" onClick={() => setActiveLabTab('validation')} className={`px-3 py-1 rounded-[6px] text-[12px] font-semibold cursor-pointer ${activeLabTab === 'validation' ? 'bg-[var(--color-brand-600)] text-white' : 'text-[var(--color-text-muted)]'}`}>اعتبارسنجی و پایلوت (۱۰–۱۱)</button>
            <button type="button" data-testid="switch-onboarding-responsive-qa-tab" onClick={() => setActiveLabTab('onboarding')} className={`px-3 py-1 rounded-[6px] text-[12px] font-semibold cursor-pointer ${activeLabTab === 'onboarding' ? 'bg-[var(--color-brand-600)] text-white' : 'text-[var(--color-text-muted)]'}`}>ورود، واکنش‌گرایی، دسترس‌پذیری و حرکت (۳۲–۳۵)</button>
          </div>
          <div role="group" aria-label="نمای آزمایش" className="inline-flex rounded-[8px] border border-[var(--color-border-subtle)] dark:border-slate-700 bg-white dark:bg-slate-900 p-0.5">
            <button type="button" onClick={() => setViewportMode('desktop')} className={`px-3 py-1 rounded-[6px] text-[13px] font-semibold cursor-pointer ${viewportMode === 'desktop' ? 'bg-[var(--color-brand-600)] text-white' : 'text-[var(--color-text-muted)]'}`}>دسکتاپ</button>
            <button type="button" onClick={() => setViewportMode('mobile')} className={`px-3 py-1 rounded-[6px] text-[13px] font-semibold cursor-pointer ${viewportMode === 'mobile' ? 'bg-[var(--color-brand-600)] text-white' : 'text-[var(--color-text-muted)]'}`}>موبایل (۳۹۰px)</button>
          </div>
          <RadarButton variant="icon" size="sm" accessibleLabel="بستن آزمایشگاه رابط" onClick={onClose}>
            <X className="w-4 h-4" />
          </RadarButton>
        </div>
      </div>

      <div className={`space-y-6 transition-all ${viewportMode === 'mobile' ? 'max-w-[390px] mx-auto border border-[var(--color-border-strong)] dark:border-slate-700 rounded-[20px] p-4 bg-white dark:bg-slate-900' : ''}`}>
        {activeLabTab === 'interaction' ? (
          <InteractionQaLabTab />
        ) : activeLabTab === 'validation' ? (
          <ValidationAndImplementLabTab />
        ) : activeLabTab === 'onboarding' ? (
          <OnboardingAndResponsiveHelpCenter />
        ) : (
          <>
        <RadarCard padding="standard" elevated>
          <h3 className="text-[16px] font-semibold text-[var(--color-text-primary)] dark:text-white mb-3">۱. دکمه‌ها و حالت‌های تعاملی (C01 · 6 Variants)</h3>
          <div className="flex flex-wrap items-center gap-2.5">
            <RadarButton variant="primary" leadingIcon={<Calculator className="w-4 h-4" />} loading={loadingDemo} onClick={() => { setLoadingDemo(true); setTimeout(() => setLoadingDemo(false), 900); }}>
              محاسبه ارزش ملک
            </RadarButton>
            <RadarButton variant="secondary" leadingIcon={<MapPin className="w-4 h-4" />}>مشاهده روی نقشه</RadarButton>
            <RadarButton variant="outline">مقایسه محله</RadarButton>
            <RadarButton variant="tertiary">پاک کردن فیلتر</RadarButton>
            <RadarButton variant="destructive" leadingIcon={<Trash2 className="w-4 h-4" />}>حذف گزارش</RadarButton>
            <RadarButton variant="primary" disabled>غیرفعال</RadarButton>
          </div>
        </RadarCard>

        <RadarCard padding="standard" elevated>
          <h3 className="text-[16px] font-semibold text-[var(--color-text-primary)] dark:text-white mb-3">۲. ورودی‌های استاندارد و کنترل انتخاب (C02 & C04)</h3>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <RadarInputField
              label="متراژ مفید ملک"
              value={areaSqm}
              onChangeValue={setAreaSqm}
              numeric
              required
              unitLabel="مترمربع"
              helperText="بازه مجاز بین ۲۰ تا ۱٬۰۰۰ مترمربع (پشتیبانی از ارقام فارسی و انگلیسی)"
              errorText={areaError}
            />
            <RadarInputField
              label="بودجه کل هدف"
              value={budgetVal}
              onChangeValue={setBudgetVal}
              numeric
              unitLabel="میلیون تومان"
              helperText="ارقام به صورت خودکار به عدد خالص نرمال‌سازی می‌شوند."
            />
          </div>
          <div className="flex flex-wrap items-center gap-4 mt-4 pt-3 border-t border-[var(--color-border-subtle)] dark:border-slate-800 text-[14px]">
            <span className="font-medium text-[var(--color-text-secondary)] dark:text-slate-300">نوع معامله:</span>
            {(['buy', 'rent'] as const).map((opt) => (
              <label key={opt} className="inline-flex items-center gap-2 cursor-pointer">
                <input type="radio" name="lab-deal" checked={dealType === opt} onChange={() => setDealType(opt)} className="accent-[var(--color-brand-600)]" />
                <span>{opt === 'buy' ? 'خرید و فروش' : 'رهن و اجاره'}</span>
              </label>
            ))}
          </div>
        </RadarCard>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <RadarMetricCard
            title="شاخص مرجع هر مترمربع (CD02 / RTD05)"
            valueText="۱۲۵٬۰۰۰٬۰۰۰"
            unitText="تومان به ازای هر مترمربع"
            periodAndSource="میانگین پاییز ۱۴۰۵ · منبع: آرشیو قیمتی رادار"
            credibility="estimated"
          />
          <RadarCard padding="standard">
            <div className="text-[14px] font-semibold text-[var(--color-text-primary)] dark:text-white mb-2">وضعیت‌های اعتبار داده (CMP-15)</div>
            <div className="flex flex-wrap gap-2 mb-3">
              <DataCredibilityBadge status="verified" />
              <DataCredibilityBadge status="estimated" />
              <DataCredibilityBadge status="incomplete" />
              <DataCredibilityBadge status="stale" />
            </div>
            <DataProvenanceBar
              sourceLabel="داده میدانی و آگهی‌های هم‌تراز"
              updatedAtLabel="امروز · ۱۴:۳۰"
              methodLabel="میانگین پیراسته IQR + مدل هدونیک v6.4"
              credibility="estimated"
              limitationNote="برآورد آماری جایگزین کارشناسی حضوری ملک نیست."
            />
          </RadarCard>
        </div>

        <RadarEmptyStateCard
          title="هنوز فایلی با این فیلتر ثبت نشده است"
          description="برای مشاهده نتایج بیشتر، بازه بودجه را ۱۰٪ افزایش دهید یا محدوده جست‌وجو را روی نقشه گسترده‌تر کنید."
          action={<RadarButton variant="outline" size="sm" onClick={() => setAreaSqm('95')}>بازنشانی فیلتر آزمایشی</RadarButton>}
        />
          </>
        )}
      </div>
    </section>
  );
};
