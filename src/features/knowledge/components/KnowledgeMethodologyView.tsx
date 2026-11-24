/** @file src/features/knowledge/components/KnowledgeMethodologyView.tsx — 4-Stage Epistemic Pipeline, Contributors & Pulse/SEO Triggers */
import React from 'react';
import { Compass, Globe2, Layers, ShieldCheck, UserCheck } from 'lucide-react';
import { toPersianNum, type EvaluatedNeighborhood } from '../../../data/neighborhoods';
import { RadarLink } from '../../../components/ui/RadarPrimitives';
import { KNOWLEDGE_CONTRIBUTORS } from '../data/knowledgeCatalog';

export interface KnowledgeMethodologyViewProps {
  selectedHood: EvaluatedNeighborhood;
  unitPrice: number;
  fxSample: string;
  onOpenPulseModal: () => void;
  onOpenSeoDrawer: () => void;
  onOpenRegistry?: () => void;
}

const EPISTEMIC_PIPELINE = [
  { step: '۱', titleFa: 'داده خام (Source)', descFa: 'گردآوری آگهی‌های پایش‌شده، ویژگی‌های فیزیکی و لایه‌های GIS شهری بدون ویرایش تحریریه.' },
  { step: '۲', titleFa: 'دیتاست پالایش‌شده (IQR)', descFa: 'حذف آگهی‌های تکراری و قیمت‌های طعمه/پرت با فیلتر Tukey IQR و ثبت بازه زمانی.' },
  { step: '۳', titleFa: 'شاخص محاسبه‌شده (Indicator)', descFa: 'محاسبه میانه پیشنهادی، برآورد معامله (غیرثبتی) و ارزش‌گذاری هدونیک با شناسه فرمول صریح.' },
  { step: '۴', titleFa: 'تفسیر پژوهشی (Interpretation)', descFa: 'تحلیل نویسنده همراه با بازبینی فنی مستقل و ذکر محدودیت‌های عددی.' },
];

export const KnowledgeMethodologyView: React.FC<KnowledgeMethodologyViewProps> = ({
  selectedHood,
  unitPrice,
  fxSample,
  onOpenPulseModal,
  onOpenSeoDrawer,
  onOpenRegistry,
}) => (
  <div data-testid="knowledge-methodology-view" className="space-y-5 text-xs animate-fadeIn">
    <section className="p-5 rounded-[14px] bg-[var(--color-bg-surface)] border border-[var(--color-border-subtle)] space-y-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h2 className="text-base font-bold text-[var(--color-text-primary)] flex items-center gap-1.5">
          <Layers className="w-4 h-4 text-[var(--color-brand-fg)]" />
          <span>زنجیره چهارمرحله‌ای تولید دانش در رادار تهران</span>
        </h2>
        <span className="text-xs text-[var(--color-text-muted)] tabular-nums">
          نرخ مرجع محله {selectedHood.name}: {toPersianNum(unitPrice)} م.ت{fxSample}
        </span>
      </div>
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
        {EPISTEMIC_PIPELINE.map((item) => (
          <div key={item.step} className="p-3.5 rounded-[10px] bg-[var(--color-bg-subtle)] border border-[var(--color-border-subtle)] space-y-1.5">
            <span className="inline-flex items-center justify-center w-6 h-6 rounded-full bg-[var(--color-brand-600)] text-white font-bold text-xs">
              {item.step}
            </span>
            <div className="font-bold text-[var(--color-text-primary)]">{item.titleFa}</div>
            <p className="text-xs text-[var(--color-text-secondary)] leading-relaxed">{item.descFa}</p>
          </div>
        ))}
      </div>
    </section>

    <section className="p-5 rounded-[14px] bg-[var(--color-bg-surface)] border border-[var(--color-border-subtle)] space-y-3">
      <h2 className="text-base font-bold text-[var(--color-text-primary)]">واحدهای پژوهش، نویسندگان و کارگروه بازبینی فنی</h2>
      <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
        {KNOWLEDGE_CONTRIBUTORS.map((c) => (
          <div key={c.id} className="p-3.5 rounded-[10px] border border-[var(--color-border-subtle)] space-y-1">
            <div className="flex items-center gap-1.5 font-bold text-[var(--color-text-primary)]">
              {c.roleKind === 'technical_reviewer' ? <ShieldCheck className="w-4 h-4 text-[var(--color-brand-fg)]" /> : <UserCheck className="w-4 h-4 text-[var(--color-brand-fg)]" />}
              <span>{c.nameFa}</span>
            </div>
            <div className="text-xs font-bold text-[var(--color-brand-fg)]">
              {c.roleKind === 'technical_reviewer' ? 'مرجع بازبینی فنی مستقل' : 'نویسنده و پژوهشگر داده'}
            </div>
            <p className="text-xs text-[var(--color-text-secondary)]">{c.specialtyFa}</p>
          </div>
        ))}
      </div>
      <div className="flex flex-wrap gap-2 pt-2">
        <button type="button" onClick={onOpenPulseModal} className="min-h-[44px] md:min-h-[38px] px-3.5 py-2 rounded-[9px] bg-[var(--color-brand-600)] hover:bg-[var(--color-brand-700)] text-white font-bold cursor-pointer">
          مشاهده پنجره نبض بازار و حباب
        </button>
        <RadarLink
          href="/areas/registry"
          data-testid="methodology-geographic-registry-link"
          onNavigate={onOpenRegistry}
          className="min-h-[44px] md:min-h-[38px] px-3.5 py-2 rounded-[9px] border border-[var(--color-brand-600)] text-[var(--color-brand-fg)] hover:bg-[var(--color-brand-soft)] font-bold inline-flex items-center gap-1.5"
        >
          <Globe2 className="w-4 h-4" />
          <span>مرجع رسمی جغرافیایی (رجیستری ملی محله‌ها)</span>
        </RadarLink>
        <button type="button" onClick={onOpenSeoDrawer} className="min-h-[44px] md:min-h-[38px] px-3.5 py-2 rounded-[9px] border border-[var(--color-border-subtle)] text-[var(--color-text-primary)] hover:bg-[var(--color-bg-muted)] font-bold flex items-center gap-1.5 cursor-pointer">
          <Compass className="w-4 h-4" />
          <span>فهرست شناسنامه تمام محله‌ها</span>
        </button>
      </div>
    </section>
  </div>
);
