/** @file src/features/knowledge/components/KnowledgeMethodologyView.tsx — 4-Stage Epistemic Pipeline, Contributors & Pulse/SEO Triggers */
import React from 'react';
import { Compass, Layers, ShieldCheck, UserCheck } from 'lucide-react';
import { toPersianNum, type EvaluatedNeighborhood } from '../../../data/neighborhoods';
import { KNOWLEDGE_CONTRIBUTORS } from '../data/knowledgeCatalog';

export interface KnowledgeMethodologyViewProps {
  selectedHood: EvaluatedNeighborhood;
  unitPrice: number;
  fxSample: string;
  onOpenPulseModal: () => void;
  onOpenSeoDrawer: () => void;
}

const EPISTEMIC_PIPELINE = [
  { step: '۱', titleFa: 'داده خام (Source)', descFa: 'گردآوری آگهی‌های پایش‌شده، ویژگی‌های فیزیکی و لایه‌های GIS شهری بدون ویرایش تحریریه.' },
  { step: '۲', titleFa: 'دیتاست پالایش‌شده (IQR)', descFa: 'حذف آگهی‌های تکراری و قیمت‌های طعمه/پرت با فیلتر Tukey IQR و ثبت بازه زمانی.' },
  { step: '۳', titleFa: 'شاخص محاسبه‌شده (Indicator)', descFa: 'محاسبه میانه پیشنهادی، سناریوی غیرثبتی v6.4 و برآورد هدونیک با شناسه فرمول صریح.' },
  { step: '۴', titleFa: 'تفسیر پژوهشی (Interpretation)', descFa: 'تحلیل نویسنده همراه با بازبینی فنی مستقل و ذکر محدودیت‌های عددی.' },
];

export const KnowledgeMethodologyView: React.FC<KnowledgeMethodologyViewProps> = ({
  selectedHood,
  unitPrice,
  fxSample,
  onOpenPulseModal,
  onOpenSeoDrawer,
}) => (
  <div data-testid="knowledge-methodology-view" className="space-y-5 text-xs animate-fadeIn">
    <section className="p-5 rounded-[14px] bg-white dark:bg-slate-900 border border-[#DCE3DF] dark:border-slate-800 space-y-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h2 className="text-base font-black text-[#182522] dark:text-white flex items-center gap-1.5">
          <Layers className="w-4 h-4 text-[#176B63]" />
          <span>زنجیره چهارمرحله‌ای تولید دانش در رادار تهران</span>
        </h2>
        <span className="text-[11px] text-[#586760] tabular-nums">
          نرخ مرجع محله {selectedHood.name}: {toPersianNum(unitPrice)} م.ت{fxSample}
        </span>
      </div>
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
        {EPISTEMIC_PIPELINE.map((item) => (
          <div key={item.step} className="p-3.5 rounded-[10px] bg-[#F8F9FA] dark:bg-slate-800/80 border border-[#DCE3DF] dark:border-slate-700 space-y-1">
            <span className="inline-flex items-center justify-center w-6 h-6 rounded-full bg-[#176B63] text-white font-black text-[11px]">
              {item.step}
            </span>
            <div className="font-black text-[#182522] dark:text-white">{item.titleFa}</div>
            <p className="text-[11px] text-[#586760] leading-relaxed">{item.descFa}</p>
          </div>
        ))}
      </div>
    </section>

    <section className="p-5 rounded-[14px] bg-white dark:bg-slate-900 border border-[#DCE3DF] dark:border-slate-800 space-y-3">
      <h2 className="text-base font-black text-[#182522] dark:text-white">واحدهای پژوهش، نویسندگان و کارگروه بازبینی فنی</h2>
      <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
        {KNOWLEDGE_CONTRIBUTORS.map((c) => (
          <div key={c.id} className="p-3.5 rounded-[10px] border border-[#DCE3DF] dark:border-slate-700 space-y-1">
            <div className="flex items-center gap-1.5 font-black text-[#182522] dark:text-white">
              {c.roleKind === 'technical_reviewer' ? <ShieldCheck className="w-4 h-4 text-[#176B63]" /> : <UserCheck className="w-4 h-4 text-[#176B63]" />}
              <span>{c.nameFa}</span>
            </div>
            <div className="text-[10.5px] font-bold text-[#176B63] dark:text-emerald-400">
              {c.roleKind === 'technical_reviewer' ? 'مرجع بازبینی فنی مستقل' : 'نویسنده و پژوهشگر داده'}
            </div>
            <p className="text-[11px] text-[#586760]">{c.specialtyFa}</p>
          </div>
        ))}
      </div>
      <div className="flex flex-wrap gap-2 pt-2">
        <button type="button" onClick={onOpenPulseModal} className="px-3.5 py-2 rounded-[9px] bg-[#176B63] hover:bg-[#14534E] text-white font-bold cursor-pointer">
          مشاهده پنجره نبض بازار و حباب
        </button>
        <button type="button" onClick={onOpenSeoDrawer} className="px-3.5 py-2 rounded-[9px] border border-[#DCE3DF] dark:border-slate-700 font-bold flex items-center gap-1.5 cursor-pointer">
          <Compass className="w-4 h-4" />
          <span>فهرست شناسنامه تمام محله‌ها</span>
        </button>
      </div>
    </section>
  </div>
);
