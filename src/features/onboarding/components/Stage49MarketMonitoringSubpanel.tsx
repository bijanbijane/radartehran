/** @file src/features/onboarding/components/Stage49MarketMonitoringSubpanel.tsx — Stage 49 Main Subpanel */
import React, { useState } from 'react';
import { Stage49AlertsAndMonitorsPanel } from './Stage49AlertsAndMonitorsPanel';
import { Stage49MarketIndexAndChannelsPanel } from './Stage49MarketIndexAndChannelsPanel';
import {
  INITIAL_STAGE49_ALERTS,
  INITIAL_STAGE49_FEEDBACKS,
  INITIAL_STAGE49_MONITORS,
} from '../services/stage49MonitoringFixtures';
import {
  STAGE49_BOUNDARIES_8,
  STAGE49_MM_COMPONENT_IDS_45,
  STAGE49_UI_MM_TASKS_35,
  STAGE49_UX_EVENTS_20,
  type AlertFeedbackReport,
  type MarketAlertItemRecord,
  type MarketMonitorRuleRecord,
} from '../services/marketMonitoringTypes';

type Stage49TabId =
  | 'alerts_center_detail'
  | 'active_monitors_rules'
  | 'market_index_timeline'
  | 'channels_quiet_hours_admin';

export const Stage49MarketMonitoringSubpanel: React.FC = () => {
  const [activeTab, setActiveTab] = useState<Stage49TabId>('alerts_center_detail');
  const [alerts, setAlerts] = useState<MarketAlertItemRecord[]>(INITIAL_STAGE49_ALERTS);
  const [monitors, setMonitors] = useState<MarketMonitorRuleRecord[]>(INITIAL_STAGE49_MONITORS);
  const [feedbacks, setFeedbacks] = useState<AlertFeedbackReport[]>(INITIAL_STAGE49_FEEDBACKS);
  const [bannerFa, setBannerFa] = useState<string>(
    'آماده پایش تغییرات قیمت آگهی، شاخص محله و محدوده نقشه با تفکیک دقیق زمان مشاهده و زمان تغییر.',
  );

  const tabs: Array<{ id: Stage49TabId; labelFa: string; badgeFa: string }> = [
    {
      id: 'alerts_center_detail',
      labelFa: '۱. مرکز هشدارها، تغییر قیمت و تفکیک مشاهده/تغییر',
      badgeFa: 'MM-01..MM-25',
    },
    {
      id: 'active_monitors_rules',
      labelFa: '۲. پایش‌های فعال، ایزولاسیون فیلتر و پلیگون نقشه',
      badgeFa: 'MM-12..MM-41',
    },
    {
      id: 'market_index_timeline',
      labelFa: '۳. پایش شاخص محله، ۳ مفهوم قیمت و وضعیت منبع',
      badgeFa: 'MM-15..MM-40',
    },
    {
      id: 'channels_quiet_hours_admin',
      labelFa: '۴. کانال‌های ارسال، ساعات سکوت و پیش‌نمایش مرحله ۵۰',
      badgeFa: 'MM-26..MM-45',
    },
  ];

  return (
    <section
      className="rounded-2xl border border-emerald-500/30 bg-slate-950/90 p-5 text-slate-100 shadow-xl space-y-4"
      dir="rtl"
      data-testid="stage49-market-monitoring-subpanel"
    >
      <header className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-800 pb-4">
        <div>
          <div className="flex items-center gap-2">
            <span className="rounded-md bg-emerald-500/20 px-2.5 py-0.5 text-xs font-bold text-emerald-300 border border-emerald-500/40">
              RT-UI-MARKET-MONITORING-001
            </span>
            <span className="text-xs text-slate-400">
              مرحله ۴۹: پایش بازار، هشدارهای هوشمند و رصد تغییرات ملکی
            </span>
          </div>
          <h3 className="mt-1 text-base font-bold text-white">
            مرکز پایش آگهی، شاخص محله، محدوده نقشه و هشدارهای مبتنی بر منبع و سطح اطمینان
          </h3>
        </div>

        <div className="flex flex-wrap gap-2 text-xs">
          <span className="rounded-lg bg-slate-900 px-2.5 py-1 text-slate-300 border border-slate-800">
            مرزهای مرحله: {STAGE49_BOUNDARIES_8.length}
          </span>
          <span className="rounded-lg bg-slate-900 px-2.5 py-1 text-slate-300 border border-slate-800">
            کامپوننت‌ها: {STAGE49_MM_COMPONENT_IDS_45.length}
          </span>
          <span className="rounded-lg bg-slate-900 px-2.5 py-1 text-slate-300 border border-slate-800">
            رویداد UX: {STAGE49_UX_EVENTS_20.length}
          </span>
          <span className="rounded-lg bg-slate-900 px-2.5 py-1 text-slate-300 border border-slate-800">
            تسک/تست: {STAGE49_UI_MM_TASKS_35.length} / 18
          </span>
        </div>
      </header>

      <div
        className="rounded-xl border border-emerald-500/30 bg-emerald-950/20 px-3 py-2 text-xs text-emerald-200"
        data-testid="stage49-status-banner"
      >
        {bannerFa}
      </div>

      <nav className="grid grid-cols-1 gap-2 sm:grid-cols-2 lg:grid-cols-4" aria-label="تب‌های مرحله ۴۹">
        {tabs.map((tab) => {
          const isActive = activeTab === tab.id;
          return (
            <button
              key={tab.id}
              type="button"
              onClick={() => setActiveTab(tab.id)}
              data-testid={`stage49-tab-${tab.id}`}
              className={`flex flex-col items-start justify-between rounded-xl border p-3 text-right transition cursor-pointer ${
                isActive
                  ? 'border-emerald-500/60 bg-emerald-950/30 text-white shadow-sm'
                  : 'border-slate-800 bg-slate-900/60 text-slate-300 hover:border-slate-700'
              }`}
            >
              <span className="text-xs font-bold leading-5">{tab.labelFa}</span>
              <span className="mt-1.5 rounded bg-slate-950/80 px-2 py-0.5 text-[10px] font-mono text-emerald-300">
                {tab.badgeFa}
              </span>
            </button>
          );
        })}
      </nav>

      {(activeTab === 'alerts_center_detail' || activeTab === 'active_monitors_rules') && (
        <Stage49AlertsAndMonitorsPanel
          section={activeTab}
          alerts={alerts}
          monitors={monitors}
          feedbacks={feedbacks}
          onUpdateAlert={(next) =>
            setAlerts((prev) => prev.map((a) => (a.alertId === next.alertId ? next : a)))
          }
          onUpdateMonitor={(next) =>
            setMonitors((prev) => prev.map((m) => (m.monitorId === next.monitorId ? next : m)))
          }
          onAddFeedback={(fb) => setFeedbacks((prev) => [fb, ...prev])}
          onFeedbackFa={setBannerFa}
        />
      )}

      {(activeTab === 'market_index_timeline' || activeTab === 'channels_quiet_hours_admin') && (
        <Stage49MarketIndexAndChannelsPanel section={activeTab} onFeedbackFa={setBannerFa} />
      )}
    </section>
  );
};
