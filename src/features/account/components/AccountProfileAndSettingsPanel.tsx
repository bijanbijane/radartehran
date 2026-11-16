/** @file src/features/account/components/AccountProfileAndSettingsPanel.tsx — Profile, Multi-Role Switcher, Privacy, Sessions, Export & Deletion */
import React, { useState } from 'react';
import type { User as FirebaseUser } from 'firebase/auth';
import { Briefcase, CheckCircle2, Download, Info, Laptop, Lock, ShieldCheck, Trash2, UserCheck } from 'lucide-react';
import {
  DATA_REQUEST_STATUS_LABELS,
  type AccountPrivacyPreferences,
  type AccountProfileSettings,
  type ActiveWorkspaceMode,
  type DataRequestRecord,
  type UserRoleCapability,
  type UserSessionDevice,
} from '../types/account.types';
import { SystemHealthDashboardCard } from './SystemHealthDashboardCard';

export interface AccountProfileAndSettingsPanelProps {
  modeTab: 'profile' | 'settings';
  currentUser: FirebaseUser | null;
  profile: AccountProfileSettings;
  privacy: AccountPrivacyPreferences;
  sessions: UserSessionDevice[];
  dataRequests: DataRequestRecord[];
  busyAction: 'export' | 'delete' | null;
  onSaveProfile: (patch: Partial<AccountProfileSettings>) => void;
  onUpdatePrivacy: (patch: Partial<AccountPrivacyPreferences>) => void;
  onRevokeSession: (sessionId: string) => void;
  onExportAccountData: () => void;
  onExportLocalGuestBundle: () => void;
  onRequestDeleteAccount: () => void;
}

const ROLE_LABELS: Record<UserRoleCapability, string> = {
  seeker: 'خریدار / مستأجر',
  owner: 'مالک / آگهی‌دهنده',
  advisor: 'مشاور املاک',
  provider: 'متخصص خدمات ملکی',
};

const WORKSPACE_MODES: Array<{ id: ActiveWorkspaceMode; labelFa: string; descFa: string }> = [
  { id: 'personal', labelFa: 'فضای شخصی (تحلیل و منتخب‌ها)', descFa: 'جست‌وجو، ارزش‌گذاری، منتخب‌ها و پیگیری درخواست‌های خدمت' },
  { id: 'listings_owner', labelFa: 'مدیریت فایل‌های ثبت‌شده', descFa: 'پایش آگهی‌های ثبت‌شده، اصلاح مشخصات و وضعیت بازبینی' },
  { id: 'service_provider', labelFa: 'پنل متخصص و خدمات حرفه‌ای', descFa: 'مدیریت پرونده احراز تخصصی و ارسال پیشنهاد به متقاضیان' },
];

export const AccountProfileAndSettingsPanel: React.FC<AccountProfileAndSettingsPanelProps> = (p) => {
  const [nameInput, setNameInput] = useState(p.profile.displayName);
  const [savedNotice, setSavedNotice] = useState(false);

  if (p.modeTab === 'profile') {
    const toggleRole = (role: UserRoleCapability) => {
      const exists = p.profile.activeRoles.includes(role);
      const next = exists ? p.profile.activeRoles.filter((r) => r !== role) : [...p.profile.activeRoles, role];
      p.onSaveProfile({ activeRoles: next.length > 0 ? next : ['seeker'] });
    };

    return (
      <div className="space-y-4 text-xs" data-testid="account-profile-panel">
        <div className="p-5 rounded-2xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 space-y-4">
          <h2 className="text-base font-black text-slate-900 dark:text-white flex items-center gap-1.5">
            <UserCheck className="w-4 h-4 text-emerald-600" />
            <span>هویت کاربری، نقش‌ها و وضعیت دسترسی</span>
          </h2>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div className="p-3 rounded-xl bg-slate-50 dark:bg-slate-800/70 space-y-1.5">
              <label className="text-slate-400 block text-[10.5px]">نام نمایشی در فضاهای کاری</label>
              <div className="flex gap-1.5">
                <input type="text" value={nameInput} onChange={(e) => setNameInput(e.target.value)} className="flex-1 p-1.5 rounded-lg bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 font-bold" />
                <button
                  type="button"
                  onClick={() => {
                    p.onSaveProfile({ displayName: nameInput });
                    setSavedNotice(true);
                    setTimeout(() => setSavedNotice(false), 2000);
                  }}
                  className="px-3 py-1 rounded-lg bg-emerald-600 text-white font-bold cursor-pointer"
                >
                  {savedNotice ? 'ذخیره شد' : 'ثبت'}
                </button>
              </div>
            </div>
            <div className="p-3 rounded-xl bg-slate-50 dark:bg-slate-800/70">
              <span className="text-slate-400 block text-[10.5px]">ایمیل و وضعیت احراز</span>
              <strong className="text-slate-900 dark:text-white flex items-center gap-1 mt-1">
                {p.currentUser?.email || 'حالت مهمان (ذخیره‌سازی محلی)'}
                {p.currentUser?.emailVerified && <CheckCircle2 className="w-3.5 h-3.5 text-emerald-600" />}
              </strong>
            </div>
          </div>

          <div className="space-y-2 pt-2 border-t border-slate-100 dark:border-slate-800">
            <span className="font-bold text-slate-700 dark:text-slate-300 block">نقش‌های فعال شما در رادار تهران:</span>
            <div className="flex flex-wrap gap-2">
              {(Object.keys(ROLE_LABELS) as UserRoleCapability[]).map((role) => {
                const active = p.profile.activeRoles.includes(role);
                return (
                  <button
                    key={role}
                    type="button"
                    onClick={() => toggleRole(role)}
                    className={`px-3 py-1.5 rounded-lg font-bold cursor-pointer border ${
                      active
                        ? 'bg-emerald-600 text-white border-emerald-600'
                        : 'bg-slate-50 dark:bg-slate-800 border-slate-200 dark:border-slate-700 text-slate-600 dark:text-slate-300'
                    }`}
                  >
                    {ROLE_LABELS[role]}
                  </button>
                );
              })}
            </div>
          </div>

          {/* Multi-Role Professional Workspace Switcher */}
          <div className="space-y-2 pt-2 border-t border-slate-100 dark:border-slate-800" data-testid="account-workspace-switcher">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <strong className="font-bold text-slate-800 dark:text-slate-200 flex items-center gap-1.5">
                <Briefcase className="w-3.5 h-3.5 text-emerald-600" />
                <span>تغییر نمای فضای کاری (بدون نیاز به حساب جداگانه)</span>
              </strong>
              <span className="text-[10.5px] text-slate-500">مجوزهای حساس همیشه در سمت سرور کنترل می‌شوند</span>
            </div>
            <div className="grid grid-cols-1 md:grid-cols-3 gap-2.5">
              {WORKSPACE_MODES.map((wm) => {
                const selected = p.profile.activeWorkspaceMode === wm.id;
                return (
                  <button
                    key={wm.id}
                    type="button"
                    onClick={() => p.onSaveProfile({ activeWorkspaceMode: wm.id })}
                    className={`p-3 rounded-xl border text-start cursor-pointer transition ${
                      selected
                        ? 'border-emerald-600 bg-emerald-50/70 dark:bg-emerald-950/40'
                        : 'border-slate-200 dark:border-slate-800 hover:border-slate-400'
                    }`}
                  >
                    <div className="font-black text-slate-900 dark:text-white">{wm.labelFa}</div>
                    <div className="text-[10.5px] text-slate-500 mt-0.5 leading-relaxed">{wm.descFa}</div>
                  </button>
                );
              })}
            </div>
          </div>

          <div className="p-3.5 rounded-xl bg-emerald-50/60 dark:bg-emerald-950/30 border border-emerald-200 dark:border-emerald-900 flex flex-wrap items-center justify-between gap-2">
            <div>
              <strong className="text-slate-900 dark:text-white block">سطح دسترسی فعلی: نسخه رایگان تحلیلی (Explorer)</strong>
              <span className="text-[11px] text-slate-500">دسترسی کامل به نقشه، تحلیل بازار، ارزش‌گذاری هدونیک و بازار خدمات بدون اشتراک پولی فعال.</span>
            </div>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-4 text-xs" data-testid="account-settings-panel">
      <SystemHealthDashboardCard />
      <div className="p-5 rounded-2xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 space-y-3">
        <h2 className="text-base font-black text-slate-900 dark:text-white flex items-center gap-1.5">
          <Lock className="w-4 h-4 text-emerald-600" />
          <span>تنظیمات حریم خصوصی و انتشار اطلاعات</span>
        </h2>
        <div className="space-y-2.5">
          <label className="flex items-center justify-between gap-3 p-3 rounded-xl bg-slate-50 dark:bg-slate-800/70 cursor-pointer">
            <span className="font-bold text-slate-800 dark:text-slate-200">اشتراک‌گذاری شماره تماس فقط پس از تأیید صریح در هر درخواست</span>
            <input type="checkbox" checked={p.privacy.sharePhoneOnlyAfterConsent} onChange={(e) => p.onUpdatePrivacy({ sharePhoneOnlyAfterConsent: e.target.checked })} className="accent-emerald-600" />
          </label>
          <label className="flex items-center justify-between gap-3 p-3 rounded-xl bg-slate-50 dark:bg-slate-800/70 cursor-pointer">
            <span className="font-bold text-slate-800 dark:text-slate-200">ذخیره تاریخچه جست‌وجوهای اخیر در همین دستگاه</span>
            <input type="checkbox" checked={p.privacy.storeSearchHistoryLocally} onChange={(e) => p.onUpdatePrivacy({ storeSearchHistoryLocally: e.target.checked })} className="accent-emerald-600" />
          </label>
          <label className="flex items-center justify-between gap-3 p-3 rounded-xl bg-slate-50 dark:bg-slate-800/70 cursor-pointer">
            <span className="font-bold text-slate-800 dark:text-slate-200">ارسال رویدادهای غیرشخصی بهبود تجربه کاربری (بدون PII)</span>
            <input type="checkbox" checked={p.privacy.privacySafeTelemetryEnabled} onChange={(e) => p.onUpdatePrivacy({ privacySafeTelemetryEnabled: e.target.checked })} className="accent-emerald-600" />
          </label>
        </div>
      </div>

      <div className="p-5 rounded-2xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 space-y-3">
        <h2 className="text-base font-black text-slate-900 dark:text-white flex items-center gap-1.5">
          <Laptop className="w-4 h-4 text-emerald-600" />
          <span>نشست‌ها و دستگاه‌های فعال ({p.sessions.length})</span>
        </h2>
        <div className="space-y-2">
          {p.sessions.map((s) => (
            <div key={s.sessionId} className="p-3 rounded-xl border border-slate-200 dark:border-slate-800 flex items-center justify-between gap-2">
              <div>
                <div className="font-bold text-slate-900 dark:text-white">{s.deviceLabelFa}</div>
                <div className="text-[11px] text-slate-500">{s.browserSummaryFa} · {s.lastActiveLabelFa}</div>
              </div>
              {s.isCurrent ? (
                <span className="text-emerald-700 dark:text-emerald-300 font-bold flex items-center gap-1"><ShieldCheck className="w-3.5 h-3.5" /> نشست فعلی</span>
              ) : (
                <button type="button" onClick={() => p.onRevokeSession(s.sessionId)} className="px-2.5 py-1 rounded-lg border border-rose-200 text-rose-700 font-bold cursor-pointer">خاتمه نشست</button>
              )}
            </div>
          ))}
        </div>
      </div>

      {/* Retention-aware Data Export & Account Deletion Workflow */}
      <div className="p-5 rounded-2xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 space-y-3" data-testid="account-data-retention-card">
        <h2 className="text-base font-black text-slate-900 dark:text-white">خروجی اطلاعات، مدیریت داده و حذف حساب</h2>
        <div className="p-3 rounded-xl bg-amber-50/70 dark:bg-amber-950/30 border border-amber-200 dark:border-amber-900 text-[11px] text-amber-900 dark:text-amber-200 flex items-start gap-2">
          <Info className="w-4 h-4 shrink-0 mt-0.5" />
          <p className="leading-relaxed">
            <strong>استثناهای نگهداری (Retention Policy):</strong> در صورت درخواست حذف حساب، اطلاعات پروفایل و منتخب‌ها پاک می‌شوند؛ اما سوابق درخواست‌های خدمتِ در جریان، پرونده‌های اختلاف/شکایت و لاگ‌های امنیتی و مالی مطابق الزامات حقوقی برای مدت مقرر نگهداری خواهند شد.
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          {p.currentUser ? (
            <>
              <button type="button" onClick={p.onExportAccountData} disabled={p.busyAction !== null} className="px-3.5 py-2 rounded-xl bg-slate-100 dark:bg-slate-800 font-bold flex items-center gap-1.5 cursor-pointer">
                <Download className="w-3.5 h-3.5" /><span>دانلود خروجی JSON اطلاعات من (سرور + ابری)</span>
              </button>
              <button type="button" onClick={p.onRequestDeleteAccount} disabled={p.busyAction !== null} className="px-3.5 py-2 rounded-xl bg-rose-50 dark:bg-rose-950 text-rose-700 dark:text-rose-300 border border-rose-200 dark:border-rose-800 font-bold flex items-center gap-1.5 cursor-pointer">
                <Trash2 className="w-3.5 h-3.5" /><span>شروع درخواست حذف حساب</span>
              </button>
            </>
          ) : (
            <button type="button" onClick={p.onExportLocalGuestBundle} className="px-3.5 py-2 rounded-xl bg-slate-100 dark:bg-slate-800 font-bold flex items-center gap-1.5 cursor-pointer">
              <Download className="w-3.5 h-3.5" /><span>دانلود خروجی JSON فضای کاری محلی</span>
            </button>
          )}
        </div>
        {p.dataRequests.length > 0 && (
          <div className="pt-2 border-t border-slate-100 dark:border-slate-800 space-y-1">
            <span className="text-[11px] font-bold text-slate-500">سوابق درخواست‌های داده اخیر:</span>
            {p.dataRequests.slice(0, 3).map((dr) => (
              <div key={dr.id} className="text-[11px] text-slate-600 dark:text-slate-300 flex items-center justify-between gap-2">
                <span>{dr.kind === 'export' ? 'درخواست خروجی داده' : 'درخواست حذف حساب'} · {dr.retentionNotesFa}</span>
                <span className="px-2 py-0.5 rounded bg-slate-100 dark:bg-slate-800 font-bold shrink-0">{DATA_REQUEST_STATUS_LABELS[dr.status] || dr.status}</span>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
};
