/** @file src/features/account/components/AccountSavedItemsPanel.tsx — Saved Properties, Search Watchlists, Map Views, Market Reports & Stage 31 Personalization Hub */
import React, { useState } from 'react';
import { BarChart3, Bookmark, Compass, Home, MapPin, Plus, SlidersHorizontal, Trash2 } from 'lucide-react';
import { toPersianNum, type EvaluatedNeighborhood } from '../../../data/neighborhoods';
import type { PrimaryViewId } from '../../../utils/areaUnit';
import type { ModuleSubTabId, SavedMapViewItem } from '../../../navigation/registry/route.types';
import type { SavedMarketAnalysis } from '../../market/types/market.types';
import type { SavedPropertySnapshot } from '../../properties/services/listingService';
import type { SavedSearchWatchlistItem } from '../types/account.types';
import { SearchHistory } from '../../../components/SearchHistory';
import { PersonalizationAndPreferencesHub } from './PersonalizationAndPreferencesHub';

export interface AccountSavedItemsPanelProps {
  modeTab: 'properties_only' | 'saved_searches' | 'saved_views';
  savedProperties: SavedPropertySnapshot[];
  savedSearches: SavedSearchWatchlistItem[];
  savedMapViews: SavedMapViewItem[];
  savedMarketAnalyses: SavedMarketAnalysis[];
  evaluatedNeighborhoods: EvaluatedNeighborhood[];
  dealMode: 'rent' | 'buy';
  onRemoveSavedProperty: (listingId: string) => void;
  onCreateSearchWatchlist: (title: string, querySummaryFa: string, module: SavedSearchWatchlistItem['module']) => void;
  onChangeSearchCadence: (id: string, cadence: SavedSearchWatchlistItem['alertCadence']) => void;
  onDeleteSearchWatchlist: (id: string) => void;
  onDeleteSavedMapView: (id: string) => void;
  onDeleteSavedMarketAnalysis: (id: string) => void;
  onRestoreSavedView?: (view: SavedMapViewItem) => void;
  onOpenBudgetFilter: () => void;
  onSelectNeighborhood: (hood: EvaluatedNeighborhood) => void;
  onNavigateView?: (view: PrimaryViewId, subTab?: ModuleSubTabId) => void;
}

export const AccountSavedItemsPanel: React.FC<AccountSavedItemsPanelProps> = (p) => {
  const [newTitle, setNewTitle] = useState('');
  const [newQuery, setNewQuery] = useState('');
  const [newMod, setNewMod] = useState<SavedSearchWatchlistItem['module']>('properties');

  if (p.modeTab === 'properties_only') {
    return (
      <div className="space-y-4">
        <PersonalizationAndPreferencesHub />
        <div className="p-5 rounded-2xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 space-y-3 text-xs" data-testid="account-saved-properties">
          <div className="flex items-center justify-between gap-2">
            <h2 className="text-base font-black text-slate-900 dark:text-white flex items-center gap-1.5">
              <Home className="w-4 h-4 text-emerald-600" />
              <span>فایل‌های ملکی ذخیره‌شده ({toPersianNum(p.savedProperties.length)})</span>
            </h2>
            <button type="button" onClick={() => p.onNavigateView?.('properties')} className="px-3 py-1.5 rounded-xl bg-slate-900 dark:bg-white text-white dark:text-slate-900 font-bold cursor-pointer">
              مرور فایل‌های ملکی
            </button>
          </div>
          {p.savedProperties.length === 0 ? (
            <p className="text-slate-500 py-3">هنوز ملکی را نشان نکرده‌اید. در بخش «املاک» روی دکمه ذخیره هر فایل بزنید.</p>
          ) : (
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              {p.savedProperties.map((prop) => (
                <div key={prop.listingId} className="p-3.5 rounded-xl border border-slate-200 dark:border-slate-800 flex items-center justify-between gap-2">
                  <div className="min-w-0">
                    <div className="font-black text-slate-900 dark:text-white truncate">{prop.titleSnapshot}</div>
                    <div className="text-[11px] text-slate-500 tabular-nums">
                      محله {prop.hoodNameSnapshot} · {prop.priceLabelSnapshot} · وضعیت: {prop.lastKnownStatus === 'published' ? 'فعال' : prop.lastKnownStatus}
                    </div>
                  </div>
                  <div className="flex items-center gap-1.5 shrink-0">
                    <button type="button" onClick={() => p.onNavigateView?.('properties')} className="px-2.5 py-1 rounded-lg bg-emerald-50 dark:bg-emerald-950/60 text-emerald-700 dark:text-emerald-300 font-bold cursor-pointer">
                      مشاهده
                    </button>
                    <button type="button" onClick={() => p.onRemoveSavedProperty(prop.listingId)} aria-label={`حذف ${prop.titleSnapshot}`} className="p-1.5 text-slate-400 hover:text-rose-600 cursor-pointer">
                      <Trash2 className="w-4 h-4" />
                    </button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    );
  }

  if (p.modeTab === 'saved_searches') {
    return (
      <div className="space-y-4 text-xs" data-testid="account-saved-searches">
        <PersonalizationAndPreferencesHub />
        <div className="p-5 rounded-2xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 space-y-4">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <h2 className="text-base font-black text-slate-900 dark:text-white flex items-center gap-1.5">
              <Compass className="w-4 h-4 text-emerald-600" />
              <span>جست‌وجوها و دیدبان‌های ذخیره‌شده ({toPersianNum(p.savedSearches.length)})</span>
            </h2>
            <button type="button" onClick={p.onOpenBudgetFilter} className="px-3 py-1.5 rounded-xl border border-slate-200 dark:border-slate-700 font-bold flex items-center gap-1 cursor-pointer">
              <SlidersHorizontal className="w-3.5 h-3.5" /><span>ویرایش فیلتر بودجه</span>
            </button>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-4 gap-2 p-3 rounded-xl bg-slate-50 dark:bg-slate-800/70">
            <input type="text" value={newTitle} onChange={(e) => setNewTitle(e.target.value)} placeholder="عنوان جست‌وجو (مثلاً آپارتمان ۸۰ متری پونک)" className="p-2 rounded-lg bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700" />
            <input type="text" value={newQuery} onChange={(e) => setNewQuery(e.target.value)} placeholder="شرایط (بودجه، متراژ یا رسته خدمات)" className="p-2 rounded-lg bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 sm:col-span-2" />
            <div className="flex gap-1.5">
              <select aria-label="ماژول دیدبان" value={newMod} onChange={(e) => setNewMod(e.target.value as SavedSearchWatchlistItem['module'])} className="p-2 rounded-lg bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 font-bold flex-1">
                <option value="properties">املاک</option>
                <option value="neighborhoods">محله‌ها</option>
                <option value="services">خدمات</option>
              </select>
              <button
                type="button"
                onClick={() => {
                  if (newTitle.trim().length < 2) return;
                  p.onCreateSearchWatchlist(newTitle.trim(), newQuery.trim() || 'جست‌وجوی سفارشی', newMod);
                  setNewTitle('');
                  setNewQuery('');
                }}
                className="px-3 py-2 rounded-lg bg-emerald-600 text-white font-bold flex items-center gap-1 cursor-pointer"
              >
                <Plus className="w-3.5 h-3.5" /><span>ذخیره</span>
              </button>
            </div>
          </div>

          {p.savedSearches.length > 0 && (
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              {p.savedSearches.map((s) => (
                <div key={s.id} className="p-3.5 rounded-xl border border-slate-200 dark:border-slate-800 flex items-center justify-between gap-2">
                  <div className="min-w-0">
                    <div className="font-black text-slate-900 dark:text-white truncate">{s.title}</div>
                    <div className="text-[11px] text-slate-500 truncate">{s.querySummaryFa}</div>
                  </div>
                  <div className="flex items-center gap-1.5 shrink-0">
                    <select
                      aria-label={`بازه اعلان ${s.title}`}
                      value={s.alertCadence}
                      onChange={(e) => p.onChangeSearchCadence(s.id, e.target.value as SavedSearchWatchlistItem['alertCadence'])}
                      className="p-1.5 rounded-lg bg-slate-100 dark:bg-slate-800 text-[10.5px] font-bold"
                    >
                      <option value="off">بی‌صدا</option>
                      <option value="daily_digest">خلاصه روزانه</option>
                      <option value="instant_important">فوری</option>
                    </select>
                    <button type="button" onClick={() => p.onDeleteSearchWatchlist(s.id)} aria-label={`حذف ${s.title}`} className="p-1.5 text-slate-400 hover:text-rose-600 cursor-pointer">
                      <Trash2 className="w-4 h-4" />
                    </button>
                  </div>
                </div>
              ))}
            </div>
          )}

          <SearchHistory
            variant="chips"
            title="تاریخچه محله‌های جست‌وجوشده"
            evaluatedNeighborhoods={p.evaluatedNeighborhoods}
            mode={p.dealMode}
            onSelectNeighborhood={(_n, matched) => {
              if (matched) {
                p.onSelectNeighborhood(matched);
                p.onNavigateView?.('map');
              }
            }}
          />
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-4 text-xs" data-testid="account-saved-views-and-reports">
      <PersonalizationAndPreferencesHub />
      <div className="p-5 rounded-2xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 space-y-3">
        <div className="flex items-center justify-between">
          <h2 className="text-base font-black text-slate-900 dark:text-white flex items-center gap-1.5">
            <Bookmark className="w-4 h-4 text-emerald-600" />
            <span>نماهای ذخیره‌شده نقشه ({toPersianNum(p.savedMapViews.length)})</span>
          </h2>
          <button type="button" onClick={() => p.onNavigateView?.('map')} className="px-3 py-1.5 rounded-xl bg-emerald-600 text-white font-bold cursor-pointer">
            ساخت نمای جدید روی نقشه
          </button>
        </div>
        {p.savedMapViews.length === 0 ? (
          <p className="text-slate-500 py-3">هنوز نمای نقشه‌ای ذخیره نکرده‌اید.</p>
        ) : (
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            {p.savedMapViews.map((v) => (
              <div key={v.id} className="p-3.5 rounded-xl border border-slate-200 dark:border-slate-800 flex items-center justify-between gap-2">
                <div>
                  <div className="font-extrabold text-slate-900 dark:text-white">{v.label}</div>
                  <div className="text-[11px] text-slate-400">نشانک زنده فیلترها · {v.hoodName} · لنز {v.lens} · {v.mode === 'rent' ? 'رهن/اجاره' : 'خرید'}</div>
                </div>
                <div className="flex items-center gap-1">
                  <button type="button" onClick={() => (p.onRestoreSavedView ? p.onRestoreSavedView(v) : p.onNavigateView?.('map'))} className="px-2.5 py-1.5 rounded-lg bg-slate-900 dark:bg-white text-white dark:text-slate-900 font-bold cursor-pointer flex items-center gap-1">
                    <MapPin className="w-3 h-3" /><span>بازکردن</span>
                  </button>
                  <button type="button" onClick={() => p.onDeleteSavedMapView(v.id)} aria-label={`حذف ${v.label}`} className="p-1.5 text-slate-400 hover:text-rose-600 cursor-pointer">
                    <Trash2 className="w-4 h-4" />
                  </button>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      <div className="p-5 rounded-2xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 space-y-3">
        <div className="flex items-center justify-between">
          <h2 className="text-base font-black text-slate-900 dark:text-white flex items-center gap-1.5">
            <BarChart3 className="w-4 h-4 text-emerald-600" />
            <span>گزارش‌ها و تحلیل‌های بازار ذخیره‌شده ({toPersianNum(p.savedMarketAnalyses.length)})</span>
          </h2>
          <button type="button" onClick={() => p.onNavigateView?.('intelligence', 'reports')} className="px-3 py-1.5 rounded-xl border border-slate-200 dark:border-slate-700 font-bold cursor-pointer">
            ورود به مرکز بازار
          </button>
        </div>
        {p.savedMarketAnalyses.length === 0 ? (
          <p className="text-slate-500 py-2">گزارش بازار ذخیره‌شده‌ای وجود ندارد.</p>
        ) : (
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            {p.savedMarketAnalyses.map((rep) => (
              <div key={rep.id} className="p-3.5 rounded-xl border border-slate-200 dark:border-slate-800 flex items-center justify-between gap-2">
                <div className="min-w-0">
                  <div className="font-bold text-slate-900 dark:text-white truncate">{rep.title}</div>
                  <div className="text-[11px] text-slate-500">تصویر لحظه‌ای (Snapshot) · بازار {rep.filters.marketType} · دوره {rep.filters.period}</div>
                </div>
                <div className="flex items-center gap-1 shrink-0">
                  <button type="button" onClick={() => p.onNavigateView?.('intelligence', 'overview')} className="px-2.5 py-1 rounded-lg bg-slate-100 dark:bg-slate-800 font-bold cursor-pointer">بازکردن</button>
                  <button type="button" onClick={() => p.onDeleteSavedMarketAnalysis(rep.id)} aria-label={`حذف ${rep.title}`} className="p-1.5 text-slate-400 hover:text-rose-600 cursor-pointer"><Trash2 className="w-4 h-4" /></button>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
};
