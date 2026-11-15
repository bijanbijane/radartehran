/** @file src/features/onboarding/components/Stage52UrbanDataAtlasSubpanel.tsx — Stage 52 Main Subpanel */
import React, { useState } from 'react';
import { Stage52CatalogMetadataAndQualityPanel } from './Stage52CatalogMetadataAndQualityPanel';
import { Stage52ConflictsLineageAndGovernancePanel } from './Stage52ConflictsLineageAndGovernancePanel';
import {
  INITIAL_STAGE52_CONFLICTS,
  INITIAL_STAGE52_DATASETS,
} from '../services/stage52UrbanAtlasFixtures';
import {
  STAGE52_BOUNDARIES_8,
  STAGE52_UA_COMPONENT_IDS_45,
  STAGE52_UX_EVENTS_17,
} from '../services/urbanDataAtlasTypes';

type Stage52TabId =
  | 'catalog_metadata_and_quality'
  | 'dictionary_and_comparison'
  | 'conflicts_review_and_lineage'
  | 'participation_privacy_and_catalog';

export const Stage52UrbanDataAtlasSubpanel: React.FC = () => {
  const [activeTab, setActiveTab] = useState<Stage52TabId>('catalog_metadata_and_quality');
  const [bannerFa, setBannerFa] = useState<string>(
    'اطلس داده‌های شهری و کاتالوگ لایه‌های مرجع با تفکیک منشأ سه‌گانه، سه تاریخ متمایز، کیفیت ۹بُعدی و کنترل مجوز منبع.',
  );

  const tabs: Array<{ id: Stage52TabId; labelFa: string; badgeFa: string }> = [
    {
      id: 'catalog_metadata_and_quality',
      labelFa: '۱. شناسنامه داده، منشأ سه‌گانه، مجوز و کیفیت ۹بُعدی',
      badgeFa: 'UA-01..UA-21',
    },
    {
      id: 'dictionary_and_comparison',
      labelFa: '۲. فرهنگ داده، تفکیک صفر/گمشده و مقایسه کاربردی',
      badgeFa: 'UA-22..UA-35',
    },
    {
      id: 'conflicts_review_and_lineage',
      labelFa: '۳. مدیریت تعارض منابع، سررسید بازبینی و بازگشت نسخه',
      badgeFa: 'UA-25..UA-30',
    },
    {
      id: 'participation_privacy_and_catalog',
      labelFa: '۴. مشارکت اصلاح، درخواست داده و حریم خصوصی ترکیب لایه‌ها',
      badgeFa: 'UA-31..UA-45',
    },
  ];

  return (
    <section
      className="rounded-2xl border border-indigo-500/30 bg-slate-950/90 p-5 text-slate-100 shadow-xl space-y-4"
      dir="rtl"
      data-testid="stage52-urban-data-atlas-subpanel"
    >
      <header className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-800 pb-4">
        <div>
          <div className="flex items-center gap-2">
            <span className="rounded-md bg-indigo-500/20 px-2.5 py-0.5 text-xs font-bold text-indigo-300 border border-indigo-500/40">
              RT-UI-URBAN-DATA-ATLAS-001
            </span>
            <span className="text-xs text-slate-400">
              مرحله ۵۲: کاتالوگ داده‌های شهری، لایه‌های مرجع و اطلس اطلاعات شهر
            </span>
          </div>
          <h3 className="mt-1 text-base font-bold text-white">
            مرجع شناخت، جست‌وجو، اعتبارسنجی، مجوز دسترسی و حکمرانی لایه‌ها و مجموعه‌داده‌های شهری
          </h3>
        </div>

        <div className="flex flex-wrap gap-2 text-xs">
          <span className="rounded-lg bg-slate-900 px-2.5 py-1 text-slate-300 border border-slate-800">
            مرزهای مرحله: {STAGE52_BOUNDARIES_8.length}
          </span>
          <span className="rounded-lg bg-slate-900 px-2.5 py-1 text-slate-300 border border-slate-800">
            کامپوننت‌ها: {STAGE52_UA_COMPONENT_IDS_45.length}
          </span>
          <span className="rounded-lg bg-slate-900 px-2.5 py-1 text-slate-300 border border-slate-800">
            رویداد UX: {STAGE52_UX_EVENTS_17.length}
          </span>
        </div>
      </header>

      <div
        className="rounded-xl border border-indigo-500/30 bg-indigo-950/20 px-3 py-2 text-xs text-indigo-200"
        data-testid="stage52-status-banner"
      >
        {bannerFa}
      </div>

      <nav className="grid grid-cols-1 gap-2 sm:grid-cols-2 lg:grid-cols-4" aria-label="تب‌های مرحله ۵۲">
        {tabs.map((tab) => {
          const isActive = activeTab === tab.id;
          return (
            <button
              key={tab.id}
              type="button"
              onClick={() => setActiveTab(tab.id)}
              data-testid={`stage52-tab-${tab.id}`}
              className={`flex flex-col items-start justify-between rounded-xl border p-3 text-right transition cursor-pointer ${
                isActive
                  ? 'border-indigo-500/60 bg-indigo-950/30 text-white shadow-sm'
                  : 'border-slate-800 bg-slate-900/60 text-slate-300 hover:border-slate-700'
              }`}
            >
              <span className="text-xs font-bold leading-5">{tab.labelFa}</span>
              <span className="mt-1.5 rounded bg-slate-950/80 px-2 py-0.5 text-[10px] font-mono text-indigo-300">
                {tab.badgeFa}
              </span>
            </button>
          );
        })}
      </nav>

      {(activeTab === 'catalog_metadata_and_quality' || activeTab === 'dictionary_and_comparison') && (
        <Stage52CatalogMetadataAndQualityPanel
          section={activeTab}
          datasets={INITIAL_STAGE52_DATASETS}
          onFeedbackFa={setBannerFa}
        />
      )}

      {(activeTab === 'conflicts_review_and_lineage' || activeTab === 'participation_privacy_and_catalog') && (
        <Stage52ConflictsLineageAndGovernancePanel
          section={activeTab}
          datasets={INITIAL_STAGE52_DATASETS}
          conflicts={INITIAL_STAGE52_CONFLICTS}
          onFeedbackFa={setBannerFa}
        />
      )}
    </section>
  );
};
