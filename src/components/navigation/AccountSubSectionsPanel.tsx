/** @file src/components/navigation/AccountSubSectionsPanel.tsx — Sub-section Views for Account Module (RT-UI-NAV-001) */
import React, { useState } from 'react';
import { Bell, Bookmark, CheckCircle2, Compass, Download, MapPin, MessageSquarePlus, Settings, SlidersHorizontal, Trash2 } from 'lucide-react';
import type { User as FirebaseUser } from 'firebase/auth';
import { toPersianNum, type EvaluatedNeighborhood } from '../../data/neighborhoods';
import type { PrimaryViewId } from '../../utils/areaUnit';
import { deleteSavedMapView, readSavedMapViews } from '../../navigation/map/mapToolRailConfig';
import type { AccountSubTabId, SavedMapViewItem } from '../../navigation/registry/route.types';
import { SearchHistory } from '../SearchHistory';

export interface AccountSubSectionsPanelProps {
  activeSubTab: AccountSubTabId;
  currentUser: FirebaseUser | null;
  evaluatedNeighborhoods: EvaluatedNeighborhood[];
  mode: 'rent' | 'buy';
  visitedHomesCount: number;
  onOpenVisitedModal: () => void;
  onOpenBuyerAlertModal: () => void;
  onOpenBudgetFilter: () => void;
  onNavigateView?: (view: PrimaryViewId, subTab?: any) => void;
  onSelectNeighborhood: (hood: EvaluatedNeighborhood) => void;
  onRestoreSavedView?: (view: SavedMapViewItem) => void;
  onExportAccountData: () => void;
  onRequestDeleteAccount: () => void;
  busyAction: 'export' | 'delete' | null;
}

export const AccountSubSectionsPanel: React.FC<AccountSubSectionsPanelProps> = (p) => {
  const [savedViews, setSavedViews] = useState<SavedMapViewItem[]>(() => readSavedMapViews());

  if (p.activeSubTab === 'profile') {
    return (
      <div className="p-5 rounded-2xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 space-y-3 text-xs">
        <h2 className="text-base font-black text-slate-900 dark:text-white">پروفایل و اطلاعات حساب</h2>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 pt-2 border-t border-slate-100 dark:border-slate-800">
          <div className="p-3 rounded-xl bg-slate-50 dark:bg-slate-800/70">
            <span className="text-slate-400 block text-[10.5px]">نام نمایشی</span>
            <strong className="text-slate-900 dark:text-white">{p.currentUser?.displayName || 'کاربر مهمان (بدون ورود ابری)'}</strong>
          </div>
          <div className="p-3 rounded-xl bg-slate-50 dark:bg-slate-800/70">
            <span className="text-slate-400 block text-[10.5px]">ایمیل / وضعیت تأیید</span>
            <strong className="text-slate-900 dark:text-white flex items-center gap-1">
              {p.currentUser?.email || 'ثبت‌نشده'}
              {p.currentUser?.emailVerified && <CheckCircle2 className="w-3.5 h-3.5 text-emerald-600" />}
            </strong>
          </div>
        </div>
      </div>
    );
  }

  if (p.activeSubTab === 'saved_views') {
    return (
      <div className="p-5 rounded-2xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 space-y-3 text-xs">
        <div className="flex items-center justify-between">
          <h2 className="text-base font-black text-slate-900 dark:text-white flex items-center gap-1.5">
            <Bookmark className="w-4 h-4 text-emerald-600" />
            <span>نماهای ذخیره‌شده نقشه ({toPersianNum(savedViews.length)})</span>
          </h2>
          <button type="button" onClick={() => p.onNavigateView?.('map')} className="px-3 py-1.5 rounded-xl bg-emerald-600 text-white font-bold cursor-pointer">
            ساخت نمای جدید روی نقشه
          </button>
        </div>
        {savedViews.length === 0 ? (
          <p className="text-slate-500 py-4 text-center">هنوز هیچ نمای نقشه‌ای ذخیره نکرده‌اید. از دکمه «نمای من» در نوار ابزار نقشه استفاده کنید.</p>
        ) : (
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            {savedViews.map((v) => (
              <div key={v.id} className="p-3.5 rounded-xl border border-slate-200 dark:border-slate-800 flex items-center justify-between gap-2">
                <div>
                  <div className="font-extrabold text-slate-900 dark:text-white">{v.label}</div>
                  <div className="text-[11px] text-slate-400">{v.hoodName} · لنز {v.lens} · {v.mode === 'rent' ? 'رهن/اجاره' : 'خرید'}</div>
                </div>
                <div className="flex items-center gap-1">
                  <button
                    type="button"
                    onClick={() => {
                      if (p.onRestoreSavedView) p.onRestoreSavedView(v);
                      else p.onNavigateView?.('map');
                    }}
                    className="px-2.5 py-1.5 rounded-lg bg-slate-900 dark:bg-white text-white dark:text-slate-900 font-bold cursor-pointer flex items-center gap-1"
                  >
                    <MapPin className="w-3 h-3" /><span>بازکردن</span>
                  </button>
                  <button type="button" onClick={() => setSavedViews(deleteSavedMapView(v.id))} aria-label={`حذف ${v.label}`} className="p-1.5 text-slate-400 hover:text-rose-600 cursor-pointer">
                    <Trash2 className="w-4 h-4" />
                  </button>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    );
  }

  if (p.activeSubTab === 'saved_searches') {
    return (
      <div className="p-5 rounded-2xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 space-y-4 text-xs">
        <div className="flex items-center justify-between">
          <h2 className="text-base font-black text-slate-900 dark:text-white flex items-center gap-1.5">
            <Compass className="w-4 h-4 text-emerald-600" />
            <span>جست‌وجوهای اخیر و بودجه ذخیره‌شده</span>
          </h2>
          <button type="button" onClick={p.onOpenBudgetFilter} className="px-3 py-1.5 rounded-xl border border-slate-200 dark:border-slate-700 font-bold flex items-center gap-1 cursor-pointer">
            <SlidersHorizontal className="w-3.5 h-3.5" /><span>ویرایش فیلتر بودجه</span>
          </button>
        </div>
        <SearchHistory
          variant="chips"
          title="تاریخچه محله‌های جست‌وجوشده"
          evaluatedNeighborhoods={p.evaluatedNeighborhoods}
          mode={p.mode}
          onSelectNeighborhood={(_n, matched) => {
            if (matched) {
              p.onSelectNeighborhood(matched);
              p.onNavigateView?.('map');
            }
          }}
        />
      </div>
    );
  }

  if (p.activeSubTab === 'activity') {
    return (
      <div className="p-5 rounded-2xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 flex items-center justify-between gap-3 text-xs">
        <div>
          <h2 className="text-base font-black text-slate-900 dark:text-white">دفترچه بازدیدهای میدانی و فعالیت</h2>
          <p className="text-slate-500 mt-1">تاکنون {toPersianNum(p.visitedHomesCount)} بازدید ملکی ثبت کرده‌اید.</p>
        </div>
        <button type="button" onClick={p.onOpenVisitedModal} className="px-4 py-2 rounded-xl bg-slate-900 dark:bg-white text-white dark:text-slate-900 font-bold cursor-pointer">
          مشاهده و ثبت بازدید
        </button>
      </div>
    );
  }

  if (p.activeSubTab === 'contributions') {
    return (
      <div className="p-5 rounded-2xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 flex items-center justify-between gap-3 text-xs">
        <div>
          <h2 className="text-base font-black text-slate-900 dark:text-white flex items-center gap-1.5">
            <MessageSquarePlus className="w-4 h-4 text-emerald-600" />
            <span>مشارکت‌های میدانی و راستی‌آزمایی محله</span>
          </h2>
          <p className="text-slate-500 mt-1">می‌توانید فایل زیر قیمت ثبت کنید یا به کیفیت سکونت محله رأی دهید.</p>
        </div>
        <button type="button" onClick={() => p.onNavigateView?.('contributions', 'submit')} className="px-4 py-2 rounded-xl bg-emerald-600 text-white font-bold cursor-pointer">
          ورود به بخش مشارکت
        </button>
      </div>
    );
  }

  if (p.activeSubTab === 'notifications') {
    return (
      <div className="p-5 rounded-2xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 flex items-center justify-between gap-3 text-xs">
        <div>
          <h2 className="text-base font-black text-slate-900 dark:text-white flex items-center gap-1.5">
            <Bell className="w-4 h-4 text-amber-500" />
            <span>اعلان‌ها و هشدارهای شکار ملک</span>
          </h2>
          <p className="text-slate-500 mt-1">تنظیم پیامک یا اعلان برای فایل‌های زیر قیمت مطابق با بودجه شما.</p>
        </div>
        <button type="button" onClick={p.onOpenBuyerAlertModal} className="px-4 py-2 rounded-xl bg-slate-900 dark:bg-white text-white dark:text-slate-900 font-bold cursor-pointer">
          مدیریت هشدارهای خرید
        </button>
      </div>
    );
  }

  return (
    <div className="p-5 rounded-2xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 space-y-4 text-xs">
      <h2 className="text-base font-black text-slate-900 dark:text-white flex items-center gap-1.5">
        <Settings className="w-4 h-4 text-emerald-600" />
        <span>تنظیمات و حریم خصوصی حساب</span>
      </h2>
      {p.currentUser ? (
        <div className="flex flex-wrap gap-2">
          <button type="button" onClick={p.onExportAccountData} disabled={p.busyAction !== null} className="px-3.5 py-2 rounded-xl bg-slate-100 dark:bg-slate-800 font-bold flex items-center gap-1.5 cursor-pointer">
            <Download className="w-3.5 h-3.5" /><span>دانلود خروجی JSON اطلاعات من</span>
          </button>
          <button type="button" onClick={p.onRequestDeleteAccount} disabled={p.busyAction !== null} className="px-3.5 py-2 rounded-xl bg-rose-50 dark:bg-rose-950 text-rose-700 dark:text-rose-300 border border-rose-200 dark:border-rose-800 font-bold flex items-center gap-1.5 cursor-pointer">
            <Trash2 className="w-3.5 h-3.5" /><span>درخواست حذف کامل حساب</span>
          </button>
        </div>
      ) : (
        <p className="text-slate-500">در حال حاضر با نشست مهمان محلی کار می‌کنید. داده‌های شما تنها روی مرورگر خودتان ذخیره شده است.</p>
      )}
    </div>
  );
};
