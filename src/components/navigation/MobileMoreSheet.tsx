/** @file src/components/navigation/MobileMoreSheet.tsx — Categorized Mobile Bottom Sheet for More Menu (RT-UI-NAV-001 Section 9, Zero Admin Leakage) */
import React from 'react';
import {
  SlidersHorizontal, User, Briefcase, BookOpen, MessageSquarePlus, Home, Compass,
  MapPin, Moon, Sun, X, Bookmark,
} from 'lucide-react';
import type { CityId } from '../../data/multiCityData';
import type { PrimaryViewId, RadarLocale } from '../../utils/areaUnit';
import { AreaUnitToggle } from '../AreaUnitToggle';

export interface MobileMoreSheetProps {
  open: boolean;
  onClose: () => void;
  locale: RadarLocale;
  activeView: PrimaryViewId;
  activeCity: CityId;
  onSwitchCity: (cityId: CityId) => void;
  appleTheme: 'light' | 'dark';
  onToggleAppleTheme: () => void;
  onSelectDestination: (viewId: PrimaryViewId) => void;
  onOpenOnboarding: () => void;
  onOpenVisitedLog: () => void;
}

const CITY_LABELS: { id: CityId; fa: string; en: string }[] = [
  { id: 'tehran', fa: 'تهران', en: 'Tehran' },
  { id: 'karaj', fa: 'کرج', en: 'Karaj' },
  { id: 'mashhad', fa: 'مشهد', en: 'Mashhad' },
  { id: 'shiraz', fa: 'شیراز', en: 'Shiraz' },
  { id: 'isfahan', fa: 'اصفهان', en: 'Isfahan' },
];

export const MobileMoreSheet: React.FC<MobileMoreSheetProps> = ({
  open,
  onClose,
  locale,
  activeView,
  activeCity,
  onSwitchCity,
  appleTheme,
  onToggleAppleTheme,
  onSelectDestination,
  onOpenOnboarding,
  onOpenVisitedLog,
}) => {
  const isEn = locale === 'en';
  const destinations: { id: PrimaryViewId; labelFa: string; labelEn: string; descFa: string; Icon: React.ComponentType<{ className?: string }> }[] = [
    { id: 'tools', labelFa: 'ابزارها و محاسبه‌گرها', labelEn: 'Tools & Calculators', descFa: 'ارزش‌گذاری، وام و کمیسیون', Icon: SlidersHorizontal },
    { id: 'userspace', labelFa: 'حساب کاربری و منتخب‌ها', labelEn: 'My Account', descFa: 'ذخیره‌شده‌ها و هشدارها', Icon: User },
    { id: 'services', labelFa: 'خدمات تخصصی ملک', labelEn: 'Services', descFa: 'کارشناسی، قولنامه و بازدید', Icon: Briefcase },
    { id: 'knowledge', labelFa: 'دانش و گزارش‌ها', labelEn: 'Knowledge', descFa: 'روش‌شناسی و تحلیل بازار', Icon: BookOpen },
    { id: 'contributions', labelFa: 'مشارکت کاربران', labelEn: 'Contribute', descFa: 'ثبت قیمت قولنامه و رأی', Icon: MessageSquarePlus },
    { id: 'home', labelFa: 'صفحه نخست رادار', labelEn: 'Home', descFa: 'نمای خلاصه و ارزیابی آگهی', Icon: Home },
  ];

  React.useEffect(() => {
    if (!open) return;
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.preventDefault();
        onClose();
      }
    };
    document.addEventListener('keydown', onKeyDown);
    return () => document.removeEventListener('keydown', onKeyDown);
  }, [open, onClose]);

  return (
    <>
      {open && (
        <div
          aria-hidden="true"
          onClick={onClose}
          className="lg:hidden fixed inset-0 z-[39] bg-slate-950/40 backdrop-blur-[2px]"
        />
      )}
      <div
        id="radar-mobile-more-menu"
        role="region"
        aria-label={isEn ? 'More sections' : 'بخش‌های بیشتر'}
        aria-hidden={!open}
        onKeyDown={(event) => {
          if (event.key === 'Escape') onClose();
        }}
        style={{ bottom: 'calc(4.25rem + var(--safe-bottom))' }}
        className={`lg:hidden fixed inset-x-3 z-[41] max-h-[72dvh] overflow-y-auto p-3.5 rounded-2xl border border-slate-200 dark:border-slate-700 bg-white/98 dark:bg-slate-900/98 shadow-2xl backdrop-blur-md space-y-3.5 transition-all duration-150 ${
          open ? 'visible opacity-100 translate-y-0 pointer-events-auto' : 'invisible opacity-0 translate-y-2 pointer-events-none'
        }`}
      >
        <div className="flex items-center justify-between border-b border-slate-100 dark:border-slate-800 pb-2">
          <span className="text-xs font-black text-slate-900 dark:text-white">
            {isEn ? 'All Platform Modules' : 'سایر بخش‌ها و خدمات تخصصی'}
          </span>
          <button type="button" onClick={onClose} aria-label={isEn ? 'Close menu' : 'بستن منو'} className="p-1.5 rounded-lg hover:bg-slate-100 dark:hover:bg-slate-800 text-slate-500 cursor-pointer">
            <X className="w-4 h-4" />
          </button>
        </div>

        <div className="grid grid-cols-2 gap-2">
          {destinations.map((item) => {
            const Icon = item.Icon;
            const isActive = activeView === item.id;
            return (
              <button
                key={item.id}
                type="button"
                aria-current={isActive ? 'page' : undefined}
                onClick={() => {
                  onClose();
                  onSelectDestination(item.id);
                }}
                className={`min-h-12 flex items-center gap-2.5 rounded-xl px-2.5 py-2 text-start border transition cursor-pointer ${
                  isActive
                    ? 'bg-emerald-50 border-emerald-200 text-emerald-900 dark:bg-emerald-950/60 dark:border-emerald-800 dark:text-emerald-200'
                    : 'bg-slate-50/70 border-slate-200/70 text-slate-800 dark:bg-slate-800/70 dark:border-slate-700/70 dark:text-slate-100'
                }`}
              >
                <Icon className="h-4 w-4 text-[var(--color-brand-600)] dark:text-emerald-400 shrink-0" aria-hidden="true" />
                <div className="min-w-0">
                  <div className="text-[11px] font-extrabold truncate">{isEn ? item.labelEn : item.labelFa}</div>
                  <div className="text-[9.5px] text-slate-500 dark:text-slate-400 truncate">{item.descFa}</div>
                </div>
              </button>
            );
          })}
        </div>

        <div className="pt-2 border-t border-slate-100 dark:border-slate-800 space-y-2">
          <div className="flex items-center justify-between text-[11px] font-bold text-slate-500">
            <span className="flex items-center gap-1"><MapPin className="w-3.5 h-3.5 text-[var(--color-brand-600)]" /><span>{isEn ? 'Active City' : 'تغییر کلان‌شهر'}</span></span>
          </div>
          <div className="grid grid-cols-5 gap-1 bg-slate-100 dark:bg-slate-800 p-1 rounded-xl">
            {CITY_LABELS.map((c) => (
              <button
                key={c.id}
                type="button"
                onClick={() => { onSwitchCity(c.id); onClose(); }}
                className={`py-1.5 rounded-lg text-[10.5px] font-bold cursor-pointer transition ${
                  activeCity === c.id ? 'bg-white dark:bg-slate-900 text-emerald-700 dark:text-emerald-400 shadow-xs' : 'text-slate-600 dark:text-slate-300'
                }`}
              >
                {isEn ? c.en : c.fa}
              </button>
            ))}
          </div>
        </div>

        <div className="pt-2 border-t border-slate-100 dark:border-slate-800 flex flex-wrap items-center justify-between gap-2">
          <div className="flex items-center gap-1.5">
            <button type="button" onClick={() => { onClose(); onOpenVisitedLog(); }} className="px-2.5 py-1.5 rounded-lg bg-slate-100 dark:bg-slate-800 text-[11px] font-bold text-slate-700 dark:text-slate-200 flex items-center gap-1 cursor-pointer">
              <Bookmark className="w-3.5 h-3.5 text-[var(--color-brand-600)]" /><span>{isEn ? 'Visits Log' : 'دفترچه بازدید'}</span>
            </button>
            <button type="button" onClick={() => { onClose(); onOpenOnboarding(); }} className="px-2.5 py-1.5 rounded-lg bg-slate-100 dark:bg-slate-800 text-[11px] font-bold text-slate-700 dark:text-slate-200 flex items-center gap-1 cursor-pointer">
              <Compass className="w-3.5 h-3.5 text-[var(--color-brand-600)]" /><span>{isEn ? 'Guide' : 'راهنما'}</span>
            </button>
            <button type="button" onClick={onToggleAppleTheme} className="px-2.5 py-1.5 rounded-lg bg-slate-100 dark:bg-slate-800 text-[11px] font-bold text-slate-700 dark:text-slate-200 flex items-center gap-1 cursor-pointer">
              {appleTheme === 'dark' ? <Sun className="w-3.5 h-3.5 text-amber-500" /> : <Moon className="w-3.5 h-3.5" />}
              <span>{appleTheme === 'dark' ? 'روشن' : 'تیره'}</span>
            </button>
          </div>
          <AreaUnitToggle compact showIntlControls />
        </div>
      </div>
    </>
  );
};
