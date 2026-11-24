/** @file src/features/tools/components/FinancialCalculatorsWorkspace.tsx — Embedded Mortgage, Commission & Rahn-to-Rent Calculators (/tools/calculators) */
import React, { useMemo, useState } from 'react';
import { Calculator, Landmark, Percent, Repeat } from 'lucide-react';
import { toPersianNum } from '../../../data/neighborhoods';
import { useRadarLocale } from '../../../components/AreaUnitToggle';

export interface FinancialCalculatorsWorkspaceProps {
  defaultPropertyBillion?: number;
}

type CalcTab = 'mortgage' | 'commission' | 'rahn_rent';

export const FinancialCalculatorsWorkspace: React.FC<FinancialCalculatorsWorkspaceProps> = ({
  defaultPropertyBillion = 12,
}) => {
  const [locale] = useRadarLocale();
  const isEn = locale === 'en';
  const [activeTab, setActiveTab] = useState<CalcTab>('mortgage');

  // Mortgage state
  const [loanMillion, setLoanMillion] = useState<number>(960);
  const [annualRatePct, setAnnualRatePct] = useState<number>(22.5);
  const [termYears, setTermYears] = useState<number>(12);

  // Commission state
  const [dealBillion, setDealBillion] = useState<number>(defaultPropertyBillion);

  // Rahn <-> Rent state
  const [fullRahnMillion, setFullRahnMillion] = useState<number>(1200);
  const [cashDepositMillion, setCashDepositMillion] = useState<number>(500);
  const [conversionRatePct, setConversionRatePct] = useState<number>(3);

  const mortgage = useMemo(() => {
    const r = Math.max(0.001, annualRatePct / 100 / 12);
    const n = Math.max(12, termYears * 12);
    const factor = Math.pow(1 + r, n);
    const monthly = (loanMillion * r * factor) / (factor - 1);
    const totalRepayment = monthly * n;
    return {
      monthlyMillion: Number(monthly.toFixed(1)),
      totalRepaymentMillion: Math.round(totalRepayment),
      totalInterestMillion: Math.max(0, Math.round(totalRepayment - loanMillion)),
    };
  }, [loanMillion, annualRatePct, termYears]);

  const commission = useMemo(() => {
    const totalMillion = Math.max(0, dealBillion * 1000);
    // Standard Tehran real-estate union tariff: 0.25% each side + 10% VAT
    const basePerSide = totalMillion * 0.0025;
    const vatPerSide = basePerSide * 0.1;
    return {
      basePerSideMillion: Number(basePerSide.toFixed(1)),
      vatPerSideMillion: Number(vatPerSide.toFixed(1)),
      totalPerSideMillion: Number((basePerSide + vatPerSide).toFixed(1)),
    };
  }, [dealBillion]);

  const rentConv = useMemo(() => {
    const remainingDeposit = Math.max(0, fullRahnMillion - cashDepositMillion);
    const monthlyRentMillion = Number(((remainingDeposit * conversionRatePct) / 100).toFixed(1));
    return { remainingDeposit, monthlyRentMillion };
  }, [fullRahnMillion, cashDepositMillion, conversionRatePct]);

  const fmt = (n: number) => (isEn ? n.toLocaleString('en-US') : toPersianNum(n.toLocaleString('en-US')));

  const tabs: Array<{ id: CalcTab; label: string; Icon: React.ComponentType<{ className?: string }> }> = [
    { id: 'mortgage', label: isEn ? 'Mortgage Loan' : 'اقساط وام مسکن', Icon: Landmark },
    { id: 'commission', label: isEn ? 'Agency Commission' : 'کمیسیون و مالیات', Icon: Percent },
    { id: 'rahn_rent', label: isEn ? 'Deposit to Rent' : 'تبدیل رهن و اجاره', Icon: Repeat },
  ];

  return (
    <section
      dir={isEn ? 'ltr' : 'rtl'}
      data-testid="tools-calculators-workspace"
      aria-label={isEn ? 'Financial real estate calculators' : 'محاسبه‌گرهای مالی مسکن'}
      className="rounded-[16px] border border-[var(--color-border-subtle)] bg-[var(--color-bg-surface)] p-5 space-y-5"
    >
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-2">
          <Calculator className="w-5 h-5 text-[var(--color-brand-fg)]" aria-hidden="true" />
          <h2 className="text-base font-bold text-[var(--color-text-primary)]">
            {isEn ? 'Interactive Financial Calculators' : 'محاسبه‌گرهای مالی و معاملاتی مسکن'}
          </h2>
        </div>

        <div role="tablist" aria-label={isEn ? 'Calculator type' : 'انتخاب محاسبه‌گر'} className="flex flex-wrap items-center gap-1.5">
          {tabs.map(({ id, label, Icon }) => {
            const active = activeTab === id;
            return (
              <button
                key={id}
                type="button"
                role="tab"
                aria-selected={active}
                onClick={() => setActiveTab(id)}
                className={`inline-flex items-center gap-1.5 min-h-[44px] md:min-h-[36px] px-3 py-1.5 rounded-[8px] text-xs font-bold transition cursor-pointer ${
                  active
                    ? 'bg-[var(--color-brand-600)] text-white'
                    : 'bg-[var(--color-bg-muted)] text-[var(--color-text-secondary)] hover:text-[var(--color-text-primary)]'
                }`}
              >
                <Icon className="w-3.5 h-3.5" aria-hidden="true" />
                <span>{label}</span>
              </button>
            );
          })}
        </div>
      </div>

      {activeTab === 'mortgage' && (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-5 items-start">
          <div className="space-y-3 text-xs">
            <label className="block space-y-1">
              <span className="font-bold text-[var(--color-text-secondary)]">{isEn ? 'Loan Amount (Million Toman)' : 'مبلغ تسهیلات (میلیون تومان)'}</span>
              <input
                type="number"
                min={100}
                max={5000}
                step={40}
                value={loanMillion}
                onChange={(e) => setLoanMillion(Math.max(100, Number(e.target.value) || 100))}
                className="w-full min-h-[44px] md:min-h-[38px] px-3 rounded-[8px] border border-[var(--color-border-strong)] bg-[var(--color-bg-canvas)] text-[var(--color-text-primary)] font-bold tabular-nums"
              />
            </label>
            <div className="grid grid-cols-2 gap-3">
              <label className="block space-y-1">
                <span className="font-bold text-[var(--color-text-secondary)]">{isEn ? 'Annual Rate (%)' : 'نرخ سود سالانه (٪)'}</span>
                <input
                  type="number"
                  min={4}
                  max={36}
                  step={0.5}
                  value={annualRatePct}
                  onChange={(e) => setAnnualRatePct(Math.max(4, Number(e.target.value) || 4))}
                  className="w-full min-h-[44px] md:min-h-[38px] px-3 rounded-[8px] border border-[var(--color-border-strong)] bg-[var(--color-bg-canvas)] text-[var(--color-text-primary)] font-bold tabular-nums"
                />
              </label>
              <label className="block space-y-1">
                <span className="font-bold text-[var(--color-text-secondary)]">{isEn ? 'Term (Years)' : 'مدت بازپرداخت (سال)'}</span>
                <input
                  type="number"
                  min={1}
                  max={20}
                  value={termYears}
                  onChange={(e) => setTermYears(Math.max(1, Math.min(20, Number(e.target.value) || 1)))}
                  className="w-full min-h-[44px] md:min-h-[38px] px-3 rounded-[8px] border border-[var(--color-border-strong)] bg-[var(--color-bg-canvas)] text-[var(--color-text-primary)] font-bold tabular-nums"
                />
              </label>
            </div>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 tabular-nums">
            <div className="p-4 rounded-[12px] bg-[var(--color-brand-soft)]/50 border border-[var(--color-brand-600)]/30">
              <div className="text-xs font-semibold text-[var(--color-text-secondary)]">{isEn ? 'Monthly Payment' : 'قسط ماهانه'}</div>
              <div className="mt-1 text-lg font-bold text-[var(--color-brand-fg)]">{fmt(mortgage.monthlyMillion)} م</div>
            </div>
            <div className="p-4 rounded-[12px] bg-[var(--color-bg-canvas)] border border-[var(--color-border-subtle)]">
              <div className="text-xs font-semibold text-[var(--color-text-secondary)]">{isEn ? 'Total Interest' : 'کل سود بانکی'}</div>
              <div className="mt-1 text-lg font-bold text-[var(--color-text-primary)]">{fmt(mortgage.totalInterestMillion)} م</div>
            </div>
            <div className="p-4 rounded-[12px] bg-[var(--color-bg-canvas)] border border-[var(--color-border-subtle)]">
              <div className="text-xs font-semibold text-[var(--color-text-secondary)]">{isEn ? 'Total Repayment' : 'جمع بازپرداخت'}</div>
              <div className="mt-1 text-lg font-bold text-[var(--color-text-primary)]">{fmt(mortgage.totalRepaymentMillion)} م</div>
            </div>
          </div>
        </div>
      )}

      {activeTab === 'commission' && (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-5 items-start">
          <div className="space-y-3 text-xs">
            <label className="block space-y-1">
              <span className="font-bold text-[var(--color-text-secondary)]">{isEn ? 'Property Sale Price (Billion Toman)' : 'ارزش کل معامله خرید (میلیارد تومان)'}</span>
              <input
                type="number"
                min={1}
                max={500}
                step={0.5}
                value={dealBillion}
                onChange={(e) => setDealBillion(Math.max(0.5, Number(e.target.value) || 0.5))}
                className="w-full min-h-[44px] md:min-h-[38px] px-3 rounded-[8px] border border-[var(--color-border-strong)] bg-[var(--color-bg-canvas)] text-[var(--color-text-primary)] font-bold tabular-nums"
              />
            </label>
            <p className="text-xs text-[var(--color-text-muted)] leading-5">
              {isEn
                ? 'Calculated at the standard 0.25% union rate per side plus 10% statutory VAT.'
                : 'محاسبه بر مبنای تعرفه مصوب ۰.۲۵٪ برای هر طرف معامله به‌علاوه ۱۰٪ مالیات بر ارزش افزوده.'}
            </p>
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 tabular-nums">
            <div className="p-4 rounded-[12px] bg-[var(--color-bg-canvas)] border border-[var(--color-border-subtle)]">
              <div className="text-xs font-semibold text-[var(--color-text-secondary)]">{isEn ? 'Base Fee / Side' : 'کمیسیون پایه هر طرف'}</div>
              <div className="mt-1 text-lg font-bold text-[var(--color-text-primary)]">{fmt(commission.basePerSideMillion)} م</div>
            </div>
            <div className="p-4 rounded-[12px] bg-[var(--color-bg-canvas)] border border-[var(--color-border-subtle)]">
              <div className="text-xs font-semibold text-[var(--color-text-secondary)]">{isEn ? '10% VAT / Side' : 'ارزش افزوده (۱۰٪)'}</div>
              <div className="mt-1 text-lg font-bold text-[var(--color-text-primary)]">{fmt(commission.vatPerSideMillion)} م</div>
            </div>
            <div className="p-4 rounded-[12px] bg-[var(--color-brand-soft)]/50 border border-[var(--color-brand-600)]/30">
              <div className="text-xs font-semibold text-[var(--color-text-secondary)]">{isEn ? 'Payable / Side' : 'مبلغ قابل پرداخت هر طرف'}</div>
              <div className="mt-1 text-lg font-bold text-[var(--color-brand-fg)]">{fmt(commission.totalPerSideMillion)} م</div>
            </div>
          </div>
        </div>
      )}

      {activeTab === 'rahn_rent' && (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-5 items-start">
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 text-xs">
            <label className="block space-y-1">
              <span className="font-bold text-[var(--color-text-secondary)]">{isEn ? 'Full Deposit (M)' : 'رهن کامل (میلیون)'}</span>
              <input
                type="number"
                min={100}
                step={50}
                value={fullRahnMillion}
                onChange={(e) => setFullRahnMillion(Math.max(100, Number(e.target.value) || 100))}
                className="w-full min-h-[44px] md:min-h-[38px] px-3 rounded-[8px] border border-[var(--color-border-strong)] bg-[var(--color-bg-canvas)] text-[var(--color-text-primary)] font-bold tabular-nums"
              />
            </label>
            <label className="block space-y-1">
              <span className="font-bold text-[var(--color-text-secondary)]">{isEn ? 'Cash Deposit (M)' : 'ودیعه نقدی شما (میلیون)'}</span>
              <input
                type="number"
                min={0}
                step={50}
                value={cashDepositMillion}
                onChange={(e) => setCashDepositMillion(Math.max(0, Number(e.target.value) || 0))}
                className="w-full min-h-[44px] md:min-h-[38px] px-3 rounded-[8px] border border-[var(--color-border-strong)] bg-[var(--color-bg-canvas)] text-[var(--color-text-primary)] font-bold tabular-nums"
              />
            </label>
            <label className="block space-y-1">
              <span className="font-bold text-[var(--color-text-secondary)]">{isEn ? 'Rate (% / mo)' : 'نرخ تبدیل (درصد)'}</span>
              <input
                type="number"
                min={1.5}
                max={6}
                step={0.25}
                value={conversionRatePct}
                onChange={(e) => setConversionRatePct(Math.max(1, Number(e.target.value) || 3))}
                className="w-full min-h-[44px] md:min-h-[38px] px-3 rounded-[8px] border border-[var(--color-border-strong)] bg-[var(--color-bg-canvas)] text-[var(--color-text-primary)] font-bold tabular-nums"
              />
            </label>
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 tabular-nums">
            <div className="p-4 rounded-[12px] bg-[var(--color-bg-canvas)] border border-[var(--color-border-subtle)]">
              <div className="text-xs font-semibold text-[var(--color-text-secondary)]">{isEn ? 'Converted Portion' : 'مبلغ تبدیل‌شده به اجاره'}</div>
              <div className="mt-1 text-lg font-bold text-[var(--color-text-primary)]">{fmt(rentConv.remainingDeposit)} میلیون</div>
            </div>
            <div className="p-4 rounded-[12px] bg-[var(--color-brand-soft)]/50 border border-[var(--color-brand-600)]/30">
              <div className="text-xs font-semibold text-[var(--color-text-secondary)]">{isEn ? 'Monthly Rent' : 'اجاره ماهانه برآوردی'}</div>
              <div className="mt-1 text-lg font-bold text-[var(--color-brand-fg)]">{fmt(rentConv.monthlyRentMillion)} میلیون</div>
            </div>
          </div>
        </div>
      )}
    </section>
  );
};
