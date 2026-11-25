/** @file src/features/knowledge/components/ConsumerHousingGuideView.tsx — Clean Consumer Guide for /knowledge/guide (F-01) */
import React from 'react';
import {
  BookOpen,
  Calculator,
  CheckCircle2,
  Compass,
  Map as MapIcon,
  Scale,
  ShieldCheck,
  SlidersHorizontal,
} from 'lucide-react';
import { toPersianNum, type EvaluatedNeighborhood } from '../../../data/neighborhoods';
import type { PrimaryViewId } from '../../../utils/areaUnit';
import type { ModuleSubTabId } from '../../../navigation/registry/route.types';
import { RadarLink } from '../../../components/ui/RadarPrimitives';

export interface ConsumerHousingGuideViewProps {
  evaluatedNeighborhoods: EvaluatedNeighborhood[];
  onNavigateView: (view: PrimaryViewId, subTab?: ModuleSubTabId) => void;
}

export const ConsumerHousingGuideView: React.FC<ConsumerHousingGuideViewProps> = ({
  evaluatedNeighborhoods,
  onNavigateView,
}) => {
  const totalCount = evaluatedNeighborhoods.length;

  return (
    <div className="space-y-6" data-testid="consumer-housing-guide">
      {/* Section 1: Quick Start */}
      <section
        aria-labelledby="guide-quickstart-heading"
        className="rounded-[14px] bg-[var(--color-bg-surface)] border border-[var(--color-border-subtle)] p-5 sm:p-6 space-y-4"
      >
        <div className="space-y-1">
          <p className="text-xs font-bold text-[var(--color-brand-fg)]">گام اول · انتخاب مسیر درست</p>
          <h2 id="guide-quickstart-heading" className="text-lg font-bold text-[var(--color-text-primary)]">
            شروع سریع بر اساس بودجه و هدف سکونت
          </h2>
          <p className="text-sm text-[var(--color-text-secondary)] leading-7 max-w-[72ch]">
            رادار تهران برای تصمیم‌گیری شفاف در خرید یا اجاره مسکن طراحی شده است. کافی است بودجه و متراژ هدف خود را وارد کنید تا از میان {toPersianNum(totalCount)} محله فعال، گزینه‌های هم‌تراز با توان مالی و سبک زندگی شما مشخص شوند.
          </p>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-3.5">
          {[
            {
              step: '۱',
              title: 'تنظیم بودجه و متراژ هدف',
              desc: 'حالت خرید یا رهن و اجاره را انتخاب کنید و بودجه واقعی (با یا بدون وام مسکن) را در نوار بالای نقشه یا فهرست محله‌ها ثبت کنید.',
              icon: SlidersHorizontal,
            },
            {
              step: '۲',
              title: 'مقایسه محله‌های هم‌سطح',
              desc: 'محله‌های سبز (در محدوده بودجه) و زرد (نزدیک به بودجه) را از نظر کیفیت هوا، مترو، امنیت و بافت بررسی و مقایسه کنید.',
              icon: Compass,
            },
            {
              step: '۳',
              title: 'ارزش‌گذاری پیش از بازدید و قولنامه',
              desc: 'مشخصات دقیق ملک (سن بنا، طبقه، پارکینگ، وضعیت بازسازی) را در ماشین‌حساب هدونیک وارد کنید و قیمت پیشنهادی فروشنده را بسنجید.',
              icon: Calculator,
            },
          ].map((item) => {
            const Icon = item.icon;
            return (
              <div
                key={item.step}
                className="rounded-[12px] bg-[var(--color-bg-canvas)] border border-[var(--color-border-subtle)] p-4 space-y-2"
              >
                <div className="flex items-center justify-between">
                  <span className="inline-flex items-center justify-center w-7 h-7 rounded-[8px] bg-[var(--color-brand-soft)] text-[var(--color-brand-fg)] text-xs font-bold">
                    {item.step}
                  </span>
                  <Icon className="w-4 h-4 text-[var(--color-brand-fg)]" aria-hidden="true" />
                </div>
                <h3 className="text-sm font-bold text-[var(--color-text-primary)]">{item.title}</h3>
                <p className="text-xs text-[var(--color-text-secondary)] leading-6">{item.desc}</p>
              </div>
            );
          })}
        </div>

        <div className="flex flex-wrap items-center gap-2.5 pt-1">
          <RadarLink
            href="/map"
            onNavigate={() => onNavigateView('map')}
            className="min-h-[44px] md:min-h-[38px] px-4 py-2 rounded-[9px] bg-[var(--color-brand-600)] hover:bg-[var(--color-brand-700)] text-white text-xs font-bold gap-1.5"
          >
            <MapIcon className="w-4 h-4" aria-hidden="true" />
            <span>شروع روی نقشه زنده</span>
          </RadarLink>
          <RadarLink
            href="/areas"
            onNavigate={() => onNavigateView('discover', 'results')}
            className="min-h-[44px] md:min-h-[38px] px-4 py-2 rounded-[9px] bg-[var(--color-bg-surface)] border border-[var(--color-border-strong)] hover:bg-[var(--color-bg-muted)] text-[var(--color-text-primary)] text-xs font-bold gap-1.5"
          >
            <Compass className="w-4 h-4 text-[var(--color-brand-fg)]" aria-hidden="true" />
            <span>مشاهده فهرست محله‌ها</span>
          </RadarLink>
          <RadarLink
            href="/tools/valuation"
            onNavigate={() => onNavigateView('tools', 'valuation')}
            className="min-h-[44px] md:min-h-[38px] px-4 py-2 rounded-[9px] bg-[var(--color-bg-surface)] border border-[var(--color-border-strong)] hover:bg-[var(--color-bg-muted)] text-[var(--color-text-primary)] text-xs font-bold gap-1.5"
          >
            <Calculator className="w-4 h-4 text-[var(--color-brand-fg)]" aria-hidden="true" />
            <span>ورود به ارزش‌گذاری ملک</span>
          </RadarLink>
        </div>
      </section>

      {/* Section 2: Reading Map & Indicators */}
      <section
        aria-labelledby="guide-reading-heading"
        className="rounded-[14px] bg-[var(--color-bg-surface)] border border-[var(--color-border-subtle)] p-5 sm:p-6 space-y-4"
      >
        <div className="space-y-1">
          <p className="text-xs font-bold text-[var(--color-brand-fg)]">گام دوم · درک درست اعداد</p>
          <h2 id="guide-reading-heading" className="text-lg font-bold text-[var(--color-text-primary)]">
            راهنمای خوانش نقشه، رنگ‌بندی بودجه و شاخص‌های قیمت
          </h2>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
          <div className="rounded-[12px] bg-[var(--color-bg-canvas)] border border-[var(--color-border-subtle)] p-4 space-y-3">
            <h3 className="text-sm font-bold text-[var(--color-text-primary)]">معنای رنگ محله‌ها نسبت به بودجه شما</h3>
            <ul className="space-y-2.5 text-xs text-[var(--color-text-secondary)] leading-6">
              <li className="flex items-start gap-2.5">
                <span className="w-3 h-3 rounded-full bg-emerald-600 shrink-0 mt-1.5" aria-hidden="true" />
                <span>
                  <strong className="text-[var(--color-text-primary)]">سبز (متناسب با بودجه):</strong> میانگین قیمت خرید یا رهن محله در محدوده توان مالی تنظیم‌شده شما قرار دارد.
                </span>
              </li>
              <li className="flex items-start gap-2.5">
                <span className="w-3 h-3 rounded-full bg-amber-500 shrink-0 mt-1.5" aria-hidden="true" />
                <span>
                  <strong className="text-[var(--color-text-primary)]">زرد (نزدیک به بودجه · تا ۱۵٪ بالاتر):</strong> با کمی تعدیل در متراژ، سن بنا یا مذاکره پای قرارداد قابل دسترسی است.
                </span>
              </li>
              <li className="flex items-start gap-2.5">
                <span className="w-3 h-3 rounded-full bg-rose-600 shrink-0 mt-1.5" aria-hidden="true" />
                <span>
                  <strong className="text-[var(--color-text-primary)]">قرمز (بالاتر از بودجه فعلی):</strong> اختلاف قیمتی محله با بودجه فعلی زیاد است؛ برای بررسی مقایسه‌ای نمایش داده می‌شود.
                </span>
              </li>
            </ul>
          </div>

          <div className="rounded-[12px] bg-[var(--color-bg-canvas)] border border-[var(--color-border-subtle)] p-4 space-y-3">
            <h3 className="text-sm font-bold text-[var(--color-text-primary)]">تفاوت «میانه اعلامی» با «سناریوی مذاکره»</h3>
            <ul className="space-y-2.5 text-xs text-[var(--color-text-secondary)] leading-6">
              <li className="flex items-start gap-2">
                <Scale className="w-4 h-4 text-[var(--color-brand-fg)] shrink-0 mt-0.5" aria-hidden="true" />
                <span>
                  <strong className="text-[var(--color-text-primary)]">میانه قیمت اعلامی:</strong> عدد میانی آگهی‌های معتبر محله (پاک‌سازی‌شده از آگهی‌های پرت). این عدد نرخ پیشنهادی فروشندگان است.
                </span>
              </li>
              <li className="flex items-start gap-2">
                <ShieldCheck className="w-4 h-4 text-[var(--color-brand-fg)] shrink-0 mt-0.5" aria-hidden="true" />
                <span>
                  <strong className="text-[var(--color-text-primary)]">سناریوی مذاکره (غیرثبتی):</strong> برآورد تحلیلی با اعمال ضریب تعدیل رایج مذاکره؛ این شاخص جایگزین آمار رسمی ثبت اسناد یا کارشناسی دادگستری نیست.
                </span>
              </li>
            </ul>
          </div>
        </div>
      </section>

      {/* Section 3: Practical Transaction Checklist */}
      <section
        aria-labelledby="guide-checklist-heading"
        className="rounded-[14px] bg-[var(--color-bg-surface)] border border-[var(--color-border-subtle)] p-5 sm:p-6 space-y-4"
      >
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div className="space-y-1">
            <p className="text-xs font-bold text-[var(--color-brand-fg)]">گام سوم · پیش از بازدید و قرارداد</p>
            <h2 id="guide-checklist-heading" className="text-lg font-bold text-[var(--color-text-primary)]">
              چک‌لیست عملی ارزیابی آگهی و کاهش ریسک معامله
            </h2>
          </div>
          <RadarLink
            href="/knowledge/glossary"
            onNavigate={() => onNavigateView('knowledge', 'glossary')}
            className="min-h-[44px] md:min-h-[36px] px-3.5 py-1.5 rounded-[8px] border border-[var(--color-border-strong)] text-xs font-bold text-[var(--color-brand-fg)] hover:bg-[var(--color-bg-muted)] gap-1.5"
          >
            <BookOpen className="w-3.5 h-3.5" aria-hidden="true" />
            <span>مطالعه واژه‌نامه تخصصی</span>
          </RadarLink>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-3 text-xs">
          {[
            'قیمت کل را به مترمربع تقسیم کنید و با بازه منطقی همان خیابان (نه فقط میانگین کل محله) مقایسه کنید.',
            'پارکینگ سندی، انباری، آسانسور و قدرالسهم زمین را در سند تک‌برگ استعلام بگیرید؛ نبود پارکینگ در مناطق پرتراکم افت نقدشوندگی جدی ایجاد می‌کند.',
            'ساعات اوج ترافیک عصرگاهی و جای پارک شبانه خیابان را یک‌بار در روز کاری و ساعت ۱۹ تا ۲۱ حضوری بررسی کنید.',
            'پیش از پرداخت بیعانه، کد رهگیری، مالکیت فروشنده، وضعیت رهن/توقیف سند و زمان دقیق تنظیم سند رسمی را در متن قرارداد قید کنید.',
          ].map((tip, idx) => (
            <div
              key={idx}
              className="flex items-start gap-2.5 p-3.5 rounded-[10px] bg-[var(--color-bg-canvas)] border border-[var(--color-border-subtle)] leading-6 text-[var(--color-text-secondary)]"
            >
              <CheckCircle2 className="w-4 h-4 text-[var(--color-brand-fg)] shrink-0 mt-1" aria-hidden="true" />
              <span>{tip}</span>
            </div>
          ))}
        </div>
      </section>
    </div>
  );
};
