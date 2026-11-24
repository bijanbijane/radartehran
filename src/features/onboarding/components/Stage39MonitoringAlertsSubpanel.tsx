import React, { useState } from 'react';
import {
  aggregateRepeatedPropertyEvents,
  transitionMonitoringLifecycle,
  type AlertRuleSpec,
  type MonitoringSubjectItem,
  type NotificationChannelSettings,
  type Stage39NotificationItem,
} from '../services/monitoringAlertsEngine';
import { Stage39AlertBuilderAndPrefs } from './Stage39AlertBuilderAndPrefs';

const INITIAL_MONITORINGS: MonitoringSubjectItem[] = [
  {
    id: 'mon-saadat-prop',
    kind: 'property',
    titleFa: 'واحد ۱۱۸ متری سعادت‌آباد',
    status: 'active',
    activeAlertRuleCount: 1,
    startedAtLabelFa: '۱۰ آبان ۱۴۰۵',
    lastChangeSummaryFa: 'کاهش ۵.۵٪ قیمت پیشنهادی آگهی در ۳ نوبت',
    targetRoute: '/properties/saadat-118',
  },
  {
    id: 'mon-niavaran-hood',
    kind: 'neighborhood',
    titleFa: 'محله نیاوران (شاخص قیمت مسکن)',
    status: 'active',
    activeAlertRuleCount: 1,
    startedAtLabelFa: '۵ آبان ۱۴۰۵',
    lastChangeSummaryFa: 'حجم نمونه فعلی (۴ آگهی) برای نتیجه‌گیری قطعی کافی نیست',
    targetRoute: '/tehran/niavaran',
  },
];

const INITIAL_NOTIFICATIONS: Stage39NotificationItem[] = [
  {
    id: 'notif-1',
    ruleId: 'rule-saadat-1',
    category: 'properties',
    priority: 'notable',
    titleFa: aggregateRepeatedPropertyEvents('واحد ۱۱۸ متری سعادت‌آباد', 3),
    bodyFa: 'قیمت پیشنهادی آگهی از ۲۰۳ به ۱۹۲ میلیون تومان/متر کاهش یافت (معادل قیمت قطعی معامله نیست).',
    eventOccurredAtLabelFa: '۱۲ آبان ۱۴۰۵',
    retrievedOrProcessedAtLabelFa: '۱۳ آبان ۱۴۰۵',
    notificationCreatedAtLabelFa: '۱۴ آبان ۱۴۰۵',
    dataSourceLabelFa: 'داده بازار (SRC-02)',
    isStaleSource: false,
    isSampleInsufficient: false,
    aggregatedEventCount: 3,
    deliveryStateByChannel: { inApp: 'created', browserPush: 'permission_denied', email: 'consent_not_granted' },
    read: false,
    archived: false,
    targetRoute: '/properties/saadat-118',
  },
  {
    id: 'notif-2',
    ruleId: 'rule-niavaran-1',
    category: 'market_neighborhood',
    priority: 'informational',
    titleFa: 'تغییر مشاهده‌شده در نیاوران — نیازمند احتیاط نمونه',
    bodyFa: 'در داده‌های جدید این محله تغییر مشاهده شده است، اما حجم نمونه برای نتیجه‌گیری درباره روند بازار کافی نیست.',
    eventOccurredAtLabelFa: '۱۱ آبان ۱۴۰۵',
    retrievedOrProcessedAtLabelFa: '۱۳ آبان ۱۴۰۵',
    notificationCreatedAtLabelFa: '۱۴ آبان ۱۴۰۵',
    dataSourceLabelFa: 'شاخص بازار (SRC-06) · قدیمی/نمونه کم',
    isStaleSource: true,
    isSampleInsufficient: true,
    aggregatedEventCount: 1,
    deliveryStateByChannel: { inApp: 'created', browserPush: 'failed', email: 'consent_not_granted' },
    read: false,
    archived: false,
    targetRoute: '/tehran/niavaran',
  },
];

export const Stage39MonitoringAlertsSubpanel: React.FC = () => {
  const [hubTab, setHubTab] = useState<'overview' | 'notifications' | 'monitorings' | 'builder'>('overview');
  const [monitorings, setMonitorings] = useState<MonitoringSubjectItem[]>(INITIAL_MONITORINGS);
  const [notifications, setNotifications] = useState<Stage39NotificationItem[]>(INITIAL_NOTIFICATIONS);
  const [rulesCount, setRulesCount] = useState<number>(2);
  const [notifFilter, setNotifFilter] = useState<'all' | 'unread' | 'important'>('all');
  const [settings, setSettings] = useState<NotificationChannelSettings>({
    inAppEnabled: true,
    browserPushConsentGranted: false,
    emailConsentGranted: false,
    smsConsentGranted: false,
    quietHoursStartHour: 22,
    quietHoursEndHour: 8,
    dailyNonEssentialCap: 10,
    securityAlertsMandatoryAlwaysOn: true,
  });

  const activeCount = monitorings.filter((m) => m.status === 'active').length;
  const pausedCount = monitorings.filter((m) => m.status === 'paused').length;
  const unreadCount = notifications.filter((n) => !n.read && !n.archived).length;

  const visibleNotifs = notifications.filter((n) => {
    if (n.archived) return false;
    if (notifFilter === 'unread') return !n.read;
    if (notifFilter === 'important') return n.priority !== 'informational';
    return true;
  });

  const handleTogglePause = (id: string) => {
    setMonitorings((prev) =>
      prev.map((m) => (m.id === id ? transitionMonitoringLifecycle(m, m.status === 'paused' ? 'resume' : 'pause') : m)),
    );
  };

  const handleDeleteMonitoring = (id: string) => {
    setMonitorings((prev) => prev.filter((m) => m.id !== id));
  };

  const handleCreateAlertRule = (rule: AlertRuleSpec) => {
    setRulesCount((c) => c + 1);
    setMonitorings((prev) => [
      {
        id: `mon-${Date.now()}`,
        kind: rule.subjectKind,
        titleFa: rule.subjectTitleFa,
        status: 'active',
        activeAlertRuleCount: 1,
        startedAtLabelFa: '۱۴ آبان ۱۴۰۵',
        lastChangeSummaryFa: `قانون جدید: آستانه ${rule.thresholdValue ?? 0}${rule.unitFa}`,
        targetRoute: '/market',
      },
      ...prev,
    ]);
    setHubTab('monitorings');
  };

  return (
    <div className="space-y-4" data-testid="stage39-monitoring-alerts-subpanel" dir="rtl">
      <div className="rounded-xl border border-slate-800 bg-slate-900/70 p-4 space-y-4">
        <div className="flex flex-wrap items-center justify-between gap-2 border-b border-slate-800 pb-3">
          <div>
            <h3 className="text-sm font-bold text-white">مرحله ۳۹: مرکز پایش تغییرات، هشدارها و اعلان‌های هوشمند (RT-UI-ALERTS-001)</h3>
            <p className="mt-1 text-xs text-slate-400">
              تفکیک پایش، هشدار و اعلان؛ توقف موقت جدا از حذف؛ تفکیک ۳ زمان (وقوع / پردازش / اعلان)؛ وضعیت تحویل صادقانه بدون ادعای جعلی
            </p>
          </div>
          <div className="flex flex-wrap gap-1.5">
            {([
              { id: 'overview', label: 'نمای کلی' },
              { id: 'notifications', label: `اعلان‌ها (${unreadCount})` },
              { id: 'monitorings', label: `پایش‌های من (${monitorings.length})` },
              { id: 'builder', label: 'ساخت هشدار و تنظیمات' },
            ] as const).map((t) => (
              <button
                key={t.id}
                type="button"
                data-testid={`alerts-hub-tab-${t.id}`}
                onClick={() => setHubTab(t.id)}
                className={`rounded-lg border px-2.5 py-1 text-[11px] font-bold ${
                  hubTab === t.id ? 'border-cyan-500 bg-cyan-950/50 text-cyan-200' : 'border-slate-700 bg-slate-950 text-slate-300'
                }`}
              >
                {t.label}
              </button>
            ))}
          </div>
        </div>

        {hubTab === 'overview' && (
          <div className="grid grid-cols-2 gap-2.5 sm:grid-cols-4 text-xs" data-testid="stage39-overview-stats">
            <div className="rounded-xl border border-slate-800 bg-slate-950/80 p-3">
              <div className="text-[11px] text-slate-400">پایش‌های فعال</div>
              <div className="mt-1 text-lg font-bold text-emerald-300">{activeCount}</div>
            </div>
            <div className="rounded-xl border border-slate-800 bg-slate-950/80 p-3">
              <div className="text-[11px] text-slate-400">قواعد هشدار</div>
              <div className="mt-1 text-lg font-bold text-white">{rulesCount}</div>
            </div>
            <div className="rounded-xl border border-slate-800 bg-slate-950/80 p-3">
              <div className="text-[11px] text-slate-400">اعلان‌های خوانده‌نشده</div>
              <div className="mt-1 text-lg font-bold text-cyan-300">{unreadCount}</div>
            </div>
            <div className="rounded-xl border border-slate-800 bg-slate-950/80 p-3">
              <div className="text-[11px] text-slate-400">پایش‌های متوقف‌شده</div>
              <div className="mt-1 text-lg font-bold text-amber-300">{pausedCount}</div>
            </div>
          </div>
        )}

        {(hubTab === 'overview' || hubTab === 'notifications') && (
          <div className="space-y-2.5 text-xs" data-testid="stage39-notifications-feed">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <span className="font-bold text-white">مرکز اعلان‌ها (ALT-03 & ALT-04 — تجمیع رویداد و تفکیک ۳ زمان)</span>
              <div className="flex gap-1">
                {(['all', 'unread', 'important'] as const).map((f) => (
                  <button
                    key={f}
                    type="button"
                    onClick={() => setNotifFilter(f)}
                    className={`rounded border px-2 py-0.5 text-[10.5px] ${notifFilter === f ? 'border-emerald-500 text-emerald-300' : 'border-slate-700 text-slate-400'}`}
                  >
                    {f === 'all' ? 'همه' : f === 'unread' ? 'خوانده‌نشده' : 'مهم و قابل‌توجه'}
                  </button>
                ))}
              </div>
            </div>
            {visibleNotifs.map((n) => (
              <div key={n.id} className="rounded-xl border border-slate-800 bg-slate-950/80 p-3 space-y-1.5">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <span className="font-bold text-white">{n.titleFa}</span>
                  <span className="rounded border border-slate-700 bg-slate-900 px-2 py-0.5 text-[10px] text-cyan-300">
                    وضعیت تحویل: داخلی ({n.deliveryStateByChannel.inApp}) · مرورگر ({n.deliveryStateByChannel.browserPush})
                  </span>
                </div>
                <p className="text-[11px] text-slate-300">{n.bodyFa}</p>
                <div className="flex flex-wrap items-center justify-between gap-2 text-[10px] text-slate-400">
                  <span>وقوع داده: {n.eventOccurredAtLabelFa} · پردازش: {n.retrievedOrProcessedAtLabelFa} · ثبت اعلان: {n.notificationCreatedAtLabelFa} · {n.dataSourceLabelFa}</span>
                  <div className="flex gap-1.5">
                    <button
                      type="button"
                      onClick={() => setNotifications((prev) => prev.map((x) => (x.id === n.id ? { ...x, read: !x.read } : x)))}
                      className="rounded border border-slate-700 px-2 py-0.5 text-slate-200"
                    >
                      {n.read ? 'علامت خوانده‌نشده' : 'خوانده شد'}
                    </button>
                    <button
                      type="button"
                      onClick={() => setNotifications((prev) => prev.map((x) => (x.id === n.id ? { ...x, archived: true } : x)))}
                      className="rounded border border-slate-700 px-2 py-0.5 text-amber-300"
                    >
                      بایگانی (حفظ قاعده)
                    </button>
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}

        {(hubTab === 'overview' || hubTab === 'monitorings') && (
          <div className="space-y-2 text-xs" data-testid="stage39-monitorings-list">
            <div className="font-bold text-white">موضوعات تحت پایش (ALT-10 — تفکیک توقف موقت از حذف)</div>
            {monitorings.map((m) => (
              <div key={m.id} className="flex flex-wrap items-center justify-between gap-2 rounded-xl border border-slate-800 bg-slate-950/80 p-3">
                <div>
                  <div className="font-bold text-white">{m.titleFa} ({m.status === 'active' ? 'فعال' : 'متوقف‌شده'})</div>
                  <div className="text-[11px] text-slate-400">شروع: {m.startedAtLabelFa} · {m.lastChangeSummaryFa}</div>
                </div>
                <div className="flex gap-1.5">
                  <button
                    type="button"
                    data-testid={`pause-monitoring-${m.id}`}
                    onClick={() => handleTogglePause(m.id)}
                    className="rounded border border-amber-500/40 bg-amber-950/30 px-2.5 py-1 text-[11px] font-bold text-amber-200"
                  >
                    {m.status === 'paused' ? 'فعال‌سازی مجدد' : 'توقف موقت'}
                  </button>
                  <button
                    type="button"
                    data-testid={`delete-monitoring-${m.id}`}
                    onClick={() => handleDeleteMonitoring(m.id)}
                    className="rounded border border-rose-500/40 bg-rose-950/30 px-2.5 py-1 text-[11px] font-bold text-rose-300"
                  >
                    حذف کامل
                  </button>
                </div>
              </div>
            ))}
          </div>
        )}

        {hubTab === 'builder' && (
          <Stage39AlertBuilderAndPrefs
            settings={settings}
            onUpdateSettings={(patch) => setSettings((s) => ({ ...s, ...patch }))}
            onCreateAlertRule={handleCreateAlertRule}
          />
        )}
      </div>
    </div>
  );
};

export default Stage39MonitoringAlertsSubpanel;
