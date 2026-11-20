import React, { useState } from 'react';
import { NumericDraftInput } from '../../../components/ui/NumericDraftInput';
import {
  evaluateAlertTriggerQualification,
  shouldDeliverNotificationInQuietHours,
  type AlertDeliveryFrequency,
  type AlertRuleSpec,
  type MonitoringSubjectKind,
  type NotificationChannelSettings,
} from '../services/monitoringAlertsEngine';

interface Props {
  settings: NotificationChannelSettings;
  onUpdateSettings: (patch: Partial<NotificationChannelSettings>) => void;
  onCreateAlertRule: (rule: AlertRuleSpec) => void;
}

const SUBJECT_KINDS: Array<{ id: MonitoringSubjectKind; labelFa: string }> = [
  { id: 'property', labelFa: 'ملک' },
  { id: 'neighborhood', labelFa: 'محله' },
  { id: 'map_zone', labelFa: 'محدوده نقشه' },
  { id: 'market_index', labelFa: 'بازار' },
  { id: 'saved_search', labelFa: 'جست‌وجو' },
  { id: 'valuation', labelFa: 'ارزش‌گذاری' },
];

export const Stage39AlertBuilderAndPrefs: React.FC<Props> = ({
  settings,
  onUpdateSettings,
  onCreateAlertRule,
}) => {
  const [subjectKind, setSubjectKind] = useState<MonitoringSubjectKind>('property');
  const [subjectTitleFa, setSubjectTitleFa] = useState('واحد ۱۱۸ متری سعادت‌آباد');
  const [thresholdPct, setThresholdPct] = useState(5);
  const [frequency, setFrequency] = useState<AlertDeliveryFrequency>('daily_digest');
  const [cooldownHours, setCooldownHours] = useState(24);
  const [testHour, setTestHour] = useState(23);
  const [titleError, setTitleError] = useState<string>('');

  const previewRule: AlertRuleSpec = {
    ruleId: `rule-preview-${subjectKind}`,
    monitoringId: 'mon-preview',
    subjectKind,
    subjectTitleFa,
    thresholdKind: 'percent_change',
    thresholdValue: thresholdPct,
    unitFa: '٪',
    comparisonBasisFa: 'نسبت به دوره مقایسه قبلی',
    frequency,
    cooldownHours,
    paused: false,
    requiresSampleSufficiency: subjectKind === 'neighborhood' || subjectKind === 'market_index',
  };

  const sampleEval = evaluateAlertTriggerQualification({
    rule: previewRule,
    observedChangePctOrValue: -6,
    uniqueSampleCount: subjectKind === 'neighborhood' ? 4 : 1,
    minRequiredSamples: 10,
    dataAgeDays: 1,
    maxAllowedAgeDays: 7,
    hoursSinceLastSimilarNotification: 30,
  });

  const quietCheck = shouldDeliverNotificationInQuietHours({
    category: 'properties',
    currentHour24: testHour,
    settings,
  });

  return (
    <div className="grid grid-cols-1 gap-3 lg:grid-cols-2" dir="rtl">
      {/* ALT-06 Alert Builder */}
      <form
        noValidate
        onSubmit={(e) => {
          e.preventDefault();
          const trimmed = subjectTitleFa.trim();
          if (trimmed.length < 2) {
            setTitleError('عنوان موضوع پایش باید حداقل ۲ کاراکتر باشد.');
            return;
          }
          setTitleError('');
          onCreateAlertRule({ ...previewRule, subjectTitleFa: trimmed, ruleId: `rule-${Date.now()}` });
        }}
        data-testid="stage39-alert-builder"
        className="rounded-xl border border-slate-800 bg-slate-950/80 p-3.5 text-xs space-y-2.5"
      >
        <div className="font-bold text-white">سازنده مرحله‌ای هشدار (ALT-06) + پیش‌نمایش صداقت داده</div>
        <div className="flex flex-wrap gap-1">
          {SUBJECT_KINDS.map((k) => (
            <button
              key={k.id}
              type="button"
              data-testid={`builder-kind-${k.id}`}
              onClick={() => setSubjectKind(k.id)}
              className={`rounded border px-2 py-1 text-[11px] font-bold ${
                subjectKind === k.id ? 'border-cyan-500 bg-cyan-950/50 text-cyan-200' : 'border-slate-700 bg-slate-900 text-slate-300'
              }`}
            >
              {k.labelFa}
            </button>
          ))}
        </div>
        <div className="grid grid-cols-2 gap-2">
          <label className="text-[11px] text-slate-300">
            موضوع پایش:
            <input
              type="text"
              value={subjectTitleFa}
              aria-invalid={Boolean(titleError)}
              onChange={(e) => {
                setSubjectTitleFa(e.target.value);
                if (titleError) setTitleError('');
              }}
              className="mt-1 w-full rounded border border-slate-700 bg-slate-900 px-2 py-1 text-white"
            />
          </label>
          <label className="text-[11px] text-slate-300">
            آستانه تغییر (٪):
            <NumericDraftInput
              min={1}
              max={50}
              fallback={5}
              value={thresholdPct}
              onValueChange={setThresholdPct}
              className="mt-1 w-full rounded border border-slate-700 bg-slate-900 px-2 py-1 text-white"
            />
          </label>
          <label className="text-[11px] text-slate-300">
            بازه اطلاع‌رسانی:
            <select
              value={frequency}
              onChange={(e) => setFrequency(e.target.value as AlertDeliveryFrequency)}
              className="mt-1 w-full rounded border border-slate-700 bg-slate-900 px-2 py-1 text-white"
            >
              <option value="center_only">فقط نمایش در مرکز پایش</option>
              <option value="daily_digest">خلاصه روزانه</option>
              <option value="weekly_digest">خلاصه هفتگی</option>
              <option value="immediate_when_supported">به‌محض شناسایی رویداد</option>
            </select>
          </label>
          <label className="text-[11px] text-slate-300">
            زمان خنک‌سازی (Cooldown ساعت):
            <NumericDraftInput
              min={1}
              max={168}
              fallback={24}
              value={cooldownHours}
              onValueChange={setCooldownHours}
              className="mt-1 w-full rounded border border-slate-700 bg-slate-900 px-2 py-1 text-white"
            />
          </label>
        </div>
        {titleError && (
          <div role="alert" className="rounded border border-rose-500/40 bg-rose-950/30 p-2 text-[11px] text-rose-200">
            {titleError}
          </div>
        )}
        <div className="rounded border border-amber-500/30 bg-amber-950/20 p-2 text-[11px] text-amber-200">
          پیش‌نمایش خروجی شرط: {sampleEval.safeWordingFa}
        </div>
        <button
          type="submit"
          data-testid="create-alert-rule-btn"
          className="rounded-lg bg-emerald-600 px-3 py-1.5 text-[11px] font-bold text-white hover:bg-emerald-500"
        >
          ثبت نمایشی قاعده هشدار
        </button>
      </form>

      {/* ALT-13 & ALT-14 Preferences & Quiet Hours */}
      <div data-testid="stage39-preferences-panel" className="rounded-xl border border-slate-800 bg-slate-950/80 p-3.5 text-xs space-y-2.5">
        <div className="font-bold text-white">تنظیمات کانال، رضایت کاربر و ساعات سکوت (ALT-13 & ALT-14)</div>
        <div className="space-y-1.5 text-[11px] text-slate-300">
          <label className="flex items-center justify-between rounded border border-slate-800 bg-slate-900 px-2.5 py-1.5">
            <span>اعلان ضروری و امنیتی حساب (همیشه فعال — خارج از محدودیت سکوت)</span>
            <input type="checkbox" checked disabled className="accent-emerald-500" />
          </label>
          <label className="flex items-center justify-between rounded border border-slate-800 bg-slate-900 px-2.5 py-1.5 cursor-pointer">
            <span>اعلان مرورگر (اختیاری و نیازمند رضایت صریح)</span>
            <input
              type="checkbox"
              checked={settings.browserPushConsentGranted}
              onChange={(e) => onUpdateSettings({ browserPushConsentGranted: e.target.checked })}
              className="accent-emerald-500"
            />
          </label>
          <label className="flex items-center justify-between rounded border border-slate-800 bg-slate-900 px-2.5 py-1.5 cursor-pointer">
            <span>ارسال خلاصه ایمیلی (فقط با رضایت کاربر)</span>
            <input
              type="checkbox"
              checked={settings.emailConsentGranted}
              onChange={(e) => onUpdateSettings({ emailConsentGranted: e.target.checked })}
              className="accent-emerald-500"
            />
          </label>
        </div>
        <div className="flex flex-wrap items-center gap-2 text-[11px] text-slate-300">
          <span>ساعات سکوت: {settings.quietHoursStartHour}:00 تا {settings.quietHoursEndHour}:00</span>
          <label className="flex items-center gap-1">
            <span>ساعت تست ارسال:</span>
            <NumericDraftInput
              min={0}
              max={23}
              fallback={23}
              value={testHour}
              onValueChange={setTestHour}
              className="w-14 rounded border border-slate-700 bg-slate-900 px-1.5 py-0.5 text-white"
            />
          </label>
        </div>
        <p className="text-[11px] text-cyan-300">{quietCheck.reasonFa}</p>
      </div>
    </div>
  );
};
