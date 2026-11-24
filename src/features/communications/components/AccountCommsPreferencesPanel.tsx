/** @file src/features/communications/components/AccountCommsPreferencesPanel.tsx — Preferences, Quiet Hours, Matrix & Devices */
import React, { useState } from 'react';
import { BellOff, Lock, ShieldAlert, Smartphone } from 'lucide-react';
import { toPersianNum } from '../../../data/neighborhoods';
import { COMMS_CATEGORY_META } from '../registries/eventPolicyAndTemplateRegistry';
import {
  registerOrRevokeDeviceClient,
  toggleCategoryChannelRule,
  updateCommsPreferencesClient,
} from '../services/commsClientService';
import type { DeviceTokenRecord, UserCommsPreferences } from '../types/comms.types';

export interface AccountCommsPreferencesPanelProps {
  uid: string;
  preferences: UserCommsPreferences;
  devices: DeviceTokenRecord[];
  onChanged: () => void;
}

export const AccountCommsPreferencesPanel: React.FC<AccountCommsPreferencesPanelProps> = ({
  uid,
  preferences,
  devices,
  onChanged,
}) => {
  const [newDeviceLabel, setNewDeviceLabel] = useState('');

  return (
    <div className="space-y-4 text-xs" data-testid="account-comms-preferences">
      {/* Global Channels & Mandatory Security Guard */}
      <div className="p-5 rounded-2xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 space-y-3">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <h3 className="font-bold text-sm text-slate-900 dark:text-white">کانال‌های دریافت اعلان</h3>
          <span className="inline-flex items-center gap-1 text-[11px] font-bold text-emerald-700 dark:text-emerald-300">
            <ShieldAlert className="w-3.5 h-3.5" />
            هشدارهای امنیتی غیرقابل غیرفعال‌سازی هستند
          </span>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-2.5">
          {[
            { key: 'inApp' as const, label: 'اعلان داخل سامانه' },
            { key: 'email' as const, label: 'ارسال ایمیل' },
            { key: 'sms' as const, label: 'پیامک وضعیت و پیشنهاد' },
            { key: 'push' as const, label: 'اعلان مرورگر / موبایل' },
          ].map((item) => (
            <label key={item.key} className="flex items-center justify-between gap-2 p-3 rounded-xl bg-slate-50 dark:bg-slate-800/70 cursor-pointer">
              <span className="font-bold text-slate-800 dark:text-slate-200">{item.label}</span>
              <input
                type="checkbox"
                checked={preferences.channels[item.key]}
                onChange={(e) => {
                  updateCommsPreferencesClient(
                    { channels: { ...preferences.channels, [item.key]: e.target.checked } },
                    uid,
                  );
                  onChanged();
                }}
                className="accent-emerald-600"
              />
            </label>
          ))}
        </div>
      </div>

      {/* Quiet Hours (Asia/Tehran) + Digest Cadence */}
      <div className="p-5 rounded-2xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 space-y-3">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <h3 className="font-bold text-sm text-slate-900 dark:text-white flex items-center gap-1.5">
            <BellOff className="w-4 h-4 text-amber-600" />
            <span>ساعات سکوت (منطقه زمانی تهران)</span>
          </h3>
          <label className="flex items-center gap-2 font-bold cursor-pointer">
            <input
              type="checkbox"
              data-testid="quiet-hours-toggle"
              checked={preferences.quietHours.enabled}
              onChange={(e) => {
                updateCommsPreferencesClient(
                  { quietHours: { ...preferences.quietHours, enabled: e.target.checked } },
                  uid,
                );
                onChanged();
              }}
              className="accent-emerald-600"
            />
            <span>فعال‌سازی ساعات سکوت</span>
          </label>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
          <label className="space-y-1">
            <span className="text-[11px] font-bold text-slate-500 block">ساعت شروع سکوت</span>
            <select
              aria-label="ساعت شروع سکوت"
              value={preferences.quietHours.startHourLocal}
              onChange={(e) => {
                updateCommsPreferencesClient(
                  { quietHours: { ...preferences.quietHours, startHourLocal: Number(e.target.value) } },
                  uid,
                );
                onChanged();
              }}
              className="w-full p-2.5 rounded-xl bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 font-bold tabular-nums"
            >
              {[21, 22, 23, 0].map((h) => (
                <option key={h} value={h}>ساعت {toPersianNum(h)}:۰۰</option>
              ))}
            </select>
          </label>
          <label className="space-y-1">
            <span className="text-[11px] font-bold text-slate-500 block">ساعت پایان سکوت</span>
            <select
              aria-label="ساعت پایان سکوت"
              value={preferences.quietHours.endHourLocal}
              onChange={(e) => {
                updateCommsPreferencesClient(
                  { quietHours: { ...preferences.quietHours, endHourLocal: Number(e.target.value) } },
                  uid,
                );
                onChanged();
              }}
              className="w-full p-2.5 rounded-xl bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 font-bold tabular-nums"
            >
              {[6, 7, 8, 9].map((h) => (
                <option key={h} value={h}>ساعت {toPersianNum(h)}:۰۰</option>
              ))}
            </select>
          </label>
          <label className="space-y-1">
            <span className="text-[11px] font-bold text-slate-500 block">بازه تجمیع خلاصه‌ها (Digest)</span>
            <select
              aria-label="بازه تجمیع خلاصه اعلان"
              value={preferences.digestFrequency}
              onChange={(e) => {
                updateCommsPreferencesClient(
                  { digestFrequency: e.target.value as UserCommsPreferences['digestFrequency'] },
                  uid,
                );
                onChanged();
              }}
              className="w-full p-2.5 rounded-xl bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 font-bold"
            >
              <option value="instant">فوری (غیرحساس)</option>
              <option value="daily_evening">خلاصه روزانه</option>
              <option value="weekly">خلاصه هفتگی</option>
            </select>
          </label>
        </div>
        <p className="text-[11px] text-slate-500">
          در ساعات سکوت، ارسال‌های فوری امنیتی و ورود همچنان ارسال می‌شوند؛ اعلان‌های تحلیلی و دیده‌بان به پس از پایان سکوت منتقل می‌گردند.
        </p>
      </div>

      {/* Granular Category x Channel Matrix */}
      <div className="p-5 rounded-2xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 space-y-3 overflow-x-auto">
        <h3 className="font-bold text-sm text-slate-900 dark:text-white">ماتریس تنظیمات هر دسته</h3>
        <table className="w-full text-start border-collapse min-w-[460px]">
          <thead>
            <tr className="border-b border-slate-200 dark:border-slate-800 text-[11px] text-slate-500">
              <th className="py-2 text-start font-bold">دسته رویداد</th>
              <th className="py-2 text-center font-bold">داخل سامانه</th>
              <th className="py-2 text-center font-bold">ایمیل</th>
              <th className="py-2 text-center font-bold">پیامک</th>
              <th className="py-2 text-center font-bold">Push</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
            {preferences.categoryRules.map((rule) => {
              const meta = COMMS_CATEGORY_META.find((c) => c.code === rule.category);
              const locked = Boolean(rule.lockedMandatory);
              return (
                <tr key={rule.category}>
                  <td className="py-2.5 font-bold text-slate-800 dark:text-slate-100 flex items-center gap-1.5">
                    <span>{meta?.labelFa || rule.category}</span>
                    {locked && <Lock className="w-3 h-3 text-rose-600" aria-label="الزامی امنیتی" />}
                  </td>
                  {(['inApp', 'email', 'sms', 'push'] as const).map((ch) => (
                    <td key={ch} className="py-2.5 text-center">
                      <input
                        type="checkbox"
                        disabled={locked}
                        checked={rule[ch]}
                        aria-label={`${meta?.labelFa || rule.category} - ${ch}`}
                        onChange={(e) => {
                          toggleCategoryChannelRule(rule.category, ch, e.target.checked, uid);
                          onChanged();
                        }}
                        className="accent-emerald-600 disabled:opacity-60"
                      />
                    </td>
                  ))}
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      {/* Registered Push Devices */}
      <div className="p-5 rounded-2xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 space-y-3">
        <h3 className="font-bold text-sm text-slate-900 dark:text-white flex items-center gap-1.5">
          <Smartphone className="w-4 h-4 text-[var(--color-brand-600)]" />
          <span>دستگاه‌های ثبت‌شده اعلان (Push)</span>
        </h3>
        <div className="flex flex-wrap gap-2">
          <input
            type="text"
            value={newDeviceLabel}
            onChange={(e) => setNewDeviceLabel(e.target.value)}
            placeholder="نام دستگاه جدید (مثلاً مرورگر دفتر کار)..."
            className="flex-1 min-w-[180px] p-2 rounded-xl bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700"
          />
          <button
            type="button"
            onClick={() => {
              registerOrRevokeDeviceClient('register', newDeviceLabel.trim() || 'مرورگر وب شخصی', uid);
              setNewDeviceLabel('');
              onChanged();
            }}
            className="px-3.5 py-2 rounded-xl bg-slate-900 dark:bg-white text-white dark:text-slate-900 font-bold cursor-pointer"
          >
            ثبت دستگاه فعلی
          </button>
        </div>
        <div className="divide-y divide-slate-100 dark:divide-slate-800">
          {devices.map((d) => (
            <div key={d.deviceId} className="py-2.5 flex flex-wrap items-center justify-between gap-2">
              <div>
                <div className="font-bold text-slate-900 dark:text-white">{d.labelFa}</div>
                <div className="text-[10.5px] text-slate-500 font-mono">{d.platform} · {d.tokenMasked} · {d.active ? 'فعال' : 'لغوشده'}</div>
              </div>
              {d.active && (
                <button
                  type="button"
                  onClick={() => { registerOrRevokeDeviceClient('revoke', d.deviceId, uid); onChanged(); }}
                  className="px-2.5 py-1 rounded-lg border border-rose-200 dark:border-rose-800 text-rose-700 dark:text-rose-300 font-bold cursor-pointer"
                >
                  لغو توکن دستگاه
                </button>
              )}
            </div>
          ))}
        </div>
      </div>
    </div>
  );
};
