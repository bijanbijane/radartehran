/** @file src/features/account/components/AccountProfileAndSettingsPanel.tsx — Profile, Multi-Role Switcher, Privacy, Sessions, Export & Deletion */
import React, { useEffect, useRef, useState } from 'react';
import type { AuthUserSnapshot as FirebaseUser } from '../../../platform/auth';
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
import { AreaUnitToggle, ExperienceModeToggle } from '../../../components/AreaUnitToggle';

export interface AccountProfileAndSettingsPanelProps {
  modeTab: 'profile' | 'settings';
  currentUser: FirebaseUser | null;
  profile: AccountProfileSettings;
  privacy: AccountPrivacyPreferences;
  sessions: UserSessionDevice[];
  dataRequests: DataRequestRecord[];
  busyAction: 'export' | 'delete' | null;
  actionErrorFa?: string | null;
  onSaveProfile: (patch: Partial<AccountProfileSettings>) => void;
  onUpdatePrivacy: (patch: Partial<AccountPrivacyPreferences>) => void;
  onRevokeSession: (sessionId: string) => void;
  onExportAccountData: (includeLocalWorkspace: boolean) => void;
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
  const [includeLocalWorkspace, setIncludeLocalWorkspace] = useState(false);
  const savedTimerRef = useRef<number | null>(null);

  useEffect(() => {
    setNameInput(p.profile.displayName);
  }, [p.profile.ownerUserId, p.profile.displayName]);

  useEffect(() => () => {
    if (savedTimerRef.current !== null) window.clearTimeout(savedTimerRef.current);
  }, []);

  if (p.modeTab === 'profile') {
    const toggleRole = (role: UserRoleCapability) => {
      const exists = p.profile.activeRoles.includes(role);
      const next = exists ? p.profile.activeRoles.filter((r) => r !== role) : [...p.profile.activeRoles, role];
      p.onSaveProfile({ activeRoles: next.length > 0 ? next : ['seeker'] });
    };

    return (
      <div className="space-y-4 text-sm" data-testid="account-profile-panel">
        <div className="p-5 rounded-2xl bg-[var(--color-bg-surface)] border border-[var(--color-border-subtle)] space-y-4">
          <h2 className="text-base font-bold text-[var(--color-text-primary)] flex items-center gap-1.5">
            <UserCheck className="w-4 h-4 text-[var(--color-brand-fg)]" />
            <span>هویت کاربری، نقش‌ها و وضعیت دسترسی</span>
          </h2>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div className="p-3 rounded-xl bg-[var(--color-bg-subtle)] space-y-1.5">
              <label htmlFor="account-display-name-input" className="text-[var(--color-text-muted)] block text-xs font-medium">نام نمایشی در فضاهای کاری</label>
              <div className="flex gap-1.5">
                <input
                  id="account-display-name-input"
                  type="text"
                  value={nameInput}
                  onChange={(e) => setNameInput(e.target.value)}
                  className="flex-1 min-h-[44px] md:min-h-[36px] px-2.5 py-1.5 rounded-lg bg-[var(--color-bg-surface)] border border-[var(--color-border-strong)] text-[var(--color-text-primary)] font-bold"
                />
                <button
                  type="button"
                  onClick={() => {
                    p.onSaveProfile({ displayName: nameInput });
                    setSavedNotice(true);
                    if (savedTimerRef.current !== null) window.clearTimeout(savedTimerRef.current);
                    savedTimerRef.current = window.setTimeout(() => { setSavedNotice(false); savedTimerRef.current = null; }, 2000);
                  }}
                  className="min-h-[44px] md:min-h-[36px] px-3.5 py-1 rounded-lg bg-[var(--color-brand-600)] hover:bg-[var(--color-brand-700)] text-white font-bold cursor-pointer"
                >
                  {savedNotice ? 'ذخیره شد' : 'ثبت'}
                </button>
              </div>
            </div>
            <div className="p-3 rounded-xl bg-[var(--color-bg-subtle)]">
              <span className="text-[var(--color-text-muted)] block text-xs font-medium">ایمیل و وضعیت احراز</span>
              <strong className="text-[var(--color-text-primary)] flex items-center gap-1 mt-1.5">
                {p.currentUser?.email || 'حالت مهمان (ذخیره‌سازی محلی)'}
                {p.currentUser?.emailVerified && <CheckCircle2 className="w-3.5 h-3.5 text-[var(--color-brand-fg)]" />}
              </strong>
            </div>
          </div>

          <div className="space-y-2 pt-2 border-t border-[var(--color-border-subtle)]">
            <span className="font-bold text-[var(--color-text-secondary)] block">نقش‌های فعال شما در رادار تهران:</span>
            <div className="flex flex-wrap gap-2">
              {(Object.keys(ROLE_LABELS) as UserRoleCapability[]).map((role) => {
                const active = p.profile.activeRoles.includes(role);
                return (
                  <button
                    key={role}
                    type="button"
                    aria-pressed={active}
                    onClick={() => toggleRole(role)}
                    className={`min-h-[44px] md:min-h-[36px] px-3 py-1.5 rounded-lg font-bold cursor-pointer border transition ${
                      active
                        ? 'bg-[var(--color-brand-600)] text-white border-[var(--color-brand-600)]'
                        : 'bg-[var(--color-bg-subtle)] border-[var(--color-border-subtle)] text-[var(--color-text-secondary)] hover:text-[var(--color-text-primary)]'
                    }`}
                  >
                    {ROLE_LABELS[role]}
                  </button>
                );
              })}
            </div>
          </div>

          <div className="space-y-2 pt-2 border-t border-[var(--color-border-subtle)]" data-testid="account-workspace-switcher">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <strong className="font-bold text-[var(--color-text-primary)] flex items-center gap-1.5">
                <Briefcase className="w-3.5 h-3.5 text-[var(--color-brand-fg)]" />
                <span>تغییر نمای فضای کاری (بدون نیاز به حساب جداگانه)</span>
              </strong>
              <span className="text-xs text-[var(--color-text-muted)]">مجوزهای حساس همیشه در سمت سرور کنترل می‌شوند</span>
            </div>
            <div className="grid grid-cols-1 md:grid-cols-3 gap-2.5">
              {WORKSPACE_MODES.map((wm) => {
                const selected = p.profile.activeWorkspaceMode === wm.id;
                return (
                  <button
                    key={wm.id}
                    type="button"
                    aria-pressed={selected}
                    onClick={() => p.onSaveProfile({ activeWorkspaceMode: wm.id })}
                    className={`p-3 rounded-xl border text-start cursor-pointer transition ${
                      selected
                        ? 'border-[var(--color-brand-600)] bg-[var(--color-brand-soft)]/60'
                        : 'border-[var(--color-border-subtle)] hover:border-[var(--color-border-strong)]'
                    }`}
                  >
                    <div className="font-bold text-[var(--color-text-primary)]">{wm.labelFa}</div>
                    <div className="text-xs text-[var(--color-text-secondary)] mt-0.5 leading-relaxed">{wm.descFa}</div>
                  </button>
                );
              })}
            </div>
          </div>

          <div className="p-3.5 rounded-xl bg-[var(--color-brand-soft)]/50 border border-[var(--color-border-subtle)] flex flex-wrap items-center justify-between gap-2">
            <div>
              <strong className="text-[var(--color-text-primary)] block">سطح دسترسی فعلی: نسخه رایگان تحلیلی (Explorer)</strong>
              <span className="text-xs text-[var(--color-text-secondary)]">دسترسی کامل به نقشه، تحلیل بازار، ارزش‌گذاری هدونیک و بازار خدمات بدون اشتراک پولی فعال.</span>
            </div>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-4 text-sm" data-testid="account-settings-panel">
      <div className="p-5 rounded-2xl bg-[var(--color-bg-surface)] border border-[var(--color-border-subtle)] space-y-3" data-testid="account-display-preferences-card">
        <h2 className="text-base font-bold text-[var(--color-text-primary)]">تنظیمات نمایش و سطح جزئیات تحلیلی</h2>
        <p className="text-sm text-[var(--color-text-secondary)] leading-relaxed">
          حالت نمایش رابط کاربری را انتخاب کنید: «ساده» برای تصمیم‌گیری سریع و خلوت، یا «تخصصی» برای نمایش جزئیات آماری و ابزارهای پیشرفته.
        </p>
        <div className="flex flex-wrap items-center gap-3 pt-1">
          <div className="flex items-center gap-2">
            <span className="text-sm font-semibold text-[var(--color-text-secondary)]">حالت نمایش:</span>
            <ExperienceModeToggle />
          </div>
          <AreaUnitToggle showIntlControls />
        </div>
      </div>

      <div className="p-5 rounded-2xl bg-[var(--color-bg-surface)] border border-[var(--color-border-subtle)] space-y-3">
        <h2 className="text-base font-bold text-[var(--color-text-primary)] flex items-center gap-1.5">
          <Lock className="w-4 h-4 text-[var(--color-brand-fg)]" />
          <span>تنظیمات حریم خصوصی و انتشار اطلاعات</span>
        </h2>
        <div className="space-y-2.5">
          <label className="flex items-center justify-between gap-3 p-3 rounded-xl bg-[var(--color-bg-subtle)] cursor-pointer">
            <span className="font-bold text-[var(--color-text-primary)]">اشتراک‌گذاری شماره تماس فقط پس از تأیید صریح در هر درخواست</span>
            <input type="checkbox" checked={p.privacy.sharePhoneOnlyAfterConsent} onChange={(e) => p.onUpdatePrivacy({ sharePhoneOnlyAfterConsent: e.target.checked })} className="accent-[var(--color-brand-600)] w-4 h-4 shrink-0" />
          </label>
          <label className="flex items-center justify-between gap-3 p-3 rounded-xl bg-[var(--color-bg-subtle)] cursor-pointer">
            <span className="font-bold text-[var(--color-text-primary)]">ذخیره تاریخچه جست‌وجوهای اخیر در همین دستگاه</span>
            <input type="checkbox" checked={p.privacy.storeSearchHistoryLocally} onChange={(e) => p.onUpdatePrivacy({ storeSearchHistoryLocally: e.target.checked })} className="accent-[var(--color-brand-600)] w-4 h-4 shrink-0" />
          </label>
          <label className="flex items-center justify-between gap-3 p-3 rounded-xl bg-[var(--color-bg-subtle)] cursor-pointer">
            <span className="font-bold text-[var(--color-text-primary)]">ارسال رویدادهای غیرشخصی بهبود تجربه کاربری (بدون اطلاعات هویتی)</span>
            <input type="checkbox" checked={p.privacy.privacySafeTelemetryEnabled} onChange={(e) => p.onUpdatePrivacy({ privacySafeTelemetryEnabled: e.target.checked })} className="accent-[var(--color-brand-600)] w-4 h-4 shrink-0" />
          </label>
        </div>
      </div>

      <div className="p-5 rounded-2xl bg-[var(--color-bg-surface)] border border-[var(--color-border-subtle)] space-y-3">
        <h2 className="text-base font-bold text-[var(--color-text-primary)] flex items-center gap-1.5">
          <Laptop className="w-4 h-4 text-[var(--color-brand-fg)]" />
          <span>نشست‌ها و دستگاه‌های فعال ({p.sessions.length})</span>
        </h2>
        <div className="space-y-2">
          {p.sessions.map((s) => (
            <div key={s.sessionId} className="p-3 rounded-xl border border-[var(--color-border-subtle)] flex items-center justify-between gap-2">
              <div>
                <div className="font-bold text-[var(--color-text-primary)]">{s.deviceLabelFa}</div>
                <div className="text-xs text-[var(--color-text-muted)]">{s.browserSummaryFa} · {s.lastActiveLabelFa}</div>
              </div>
              {s.isCurrent ? (
                <span className="text-[var(--color-brand-fg)] font-bold flex items-center gap-1"><ShieldCheck className="w-3.5 h-3.5" /> نشست فعلی</span>
              ) : (
                <button type="button" onClick={() => p.onRevokeSession(s.sessionId)} className="min-h-[40px] md:min-h-[34px] px-3 py-1 rounded-lg border border-rose-200 dark:border-rose-800 text-rose-700 dark:text-rose-300 font-bold cursor-pointer">خاتمه نشست</button>
              )}
            </div>
          ))}
        </div>
      </div>

      <div className="p-5 rounded-2xl bg-[var(--color-bg-surface)] border border-[var(--color-border-subtle)] space-y-3" data-testid="account-data-retention-card">
        <h2 className="text-base font-bold text-[var(--color-text-primary)]">خروجی اطلاعات، مدیریت داده و حذف حساب</h2>
        <div className="p-3 rounded-xl bg-amber-50/70 dark:bg-amber-950/30 border border-amber-200 dark:border-amber-900 text-xs text-amber-900 dark:text-amber-200 flex items-start gap-2">
          <Info className="w-4 h-4 shrink-0 mt-0.5" />
          <p className="leading-relaxed">
            <strong>سیاست نگهداری داده‌ها:</strong> در صورت درخواست حذف حساب، داده‌های اختصاصی حساب شما در سرور و همین مرورگر پاکسازی می‌شوند؛ تنظیمات عمومی دستگاه (زبان و پوسته نمایش) باقی می‌مانند و سوابق ممیزی قانونی مطابق مقررات به‌صورت ناشناس نگهداری می‌شوند.
          </p>
        </div>
        {p.currentUser && (
          <label className="flex items-center gap-2 text-xs font-bold text-[var(--color-text-secondary)] cursor-pointer">
            <input type="checkbox" checked={includeLocalWorkspace} onChange={(e) => setIncludeLocalWorkspace(e.target.checked)} className="accent-[var(--color-brand-600)] w-4 h-4" />
            <span>همراه خروجی حساب سرور، داده‌های فضای کاری محلی همین مرورگر هم با تفکیک منشأ ضمیمه شود</span>
          </label>
        )}
        <div className="flex flex-wrap gap-2">
          {p.currentUser ? (
            <>
              <button type="button" onClick={() => p.onExportAccountData(includeLocalWorkspace)} disabled={p.busyAction !== null} className="min-h-[44px] md:min-h-[38px] px-3.5 py-2 rounded-xl bg-[var(--color-bg-muted)] hover:bg-[var(--color-border-subtle)] text-[var(--color-text-primary)] font-bold flex items-center gap-1.5 cursor-pointer disabled:opacity-50">
                <Download className="w-3.5 h-3.5" /><span>{p.busyAction === 'export' ? 'در حال دریافت خروجی...' : 'دانلود خروجی JSON اطلاعات من (سرور)'}</span>
              </button>
              <button type="button" onClick={p.onRequestDeleteAccount} disabled={p.busyAction !== null} className="min-h-[44px] md:min-h-[38px] px-3.5 py-2 rounded-xl bg-rose-50 dark:bg-rose-950 text-rose-700 dark:text-rose-300 border border-rose-200 dark:border-rose-800 font-bold flex items-center gap-1.5 cursor-pointer disabled:opacity-50">
                <Trash2 className="w-3.5 h-3.5" /><span>شروع درخواست حذف حساب</span>
              </button>
            </>
          ) : (
            <button type="button" onClick={p.onExportLocalGuestBundle} disabled={p.busyAction !== null} className="min-h-[44px] md:min-h-[38px] px-3.5 py-2 rounded-xl bg-[var(--color-bg-muted)] hover:bg-[var(--color-border-subtle)] text-[var(--color-text-primary)] font-bold flex items-center gap-1.5 cursor-pointer disabled:opacity-50">
              <Download className="w-3.5 h-3.5" /><span>دانلود خروجی JSON فضای کاری محلی</span>
            </button>
          )}
        </div>
        {p.actionErrorFa && (
          <p role="alert" className="text-xs font-bold text-rose-700 dark:text-rose-300">{p.actionErrorFa}</p>
        )}
        <div className="p-3 rounded-xl bg-[var(--color-bg-subtle)] border border-[var(--color-border-subtle)] text-xs text-[var(--color-text-secondary)] leading-relaxed" data-testid="account-seven-sources-disclosure">
          <strong className="text-[var(--color-text-primary)]">پوشش ۷ دسته اطلاعات قابل استخراج:</strong> پروفایل کاربری، علاقه‌مندی‌ها و فضاهای کاری، هشدارهای خریدار، آگهی‌های ثبت‌شده، سوابق حامیان، مشارکت‌های جمعی و فراداده فایل‌های رسانه. در صورت در دسترس نبودن هر منبع، خروجی به‌صراحت به‌عنوان «خروجی جزئی» مشخص می‌شود.
        </div>
        {p.dataRequests.length > 0 && (
          <div className="pt-2 border-t border-[var(--color-border-subtle)] space-y-1.5" data-testid="account-data-requests-history">
            <span className="text-xs font-bold text-[var(--color-text-muted)]">سوابق درخواست‌های داده (تفکیک منشأ سرور و مرورگر محلی):</span>
            {p.dataRequests.slice(0, 8).map((dr) => (
              <div key={dr.id} className="text-xs text-[var(--color-text-secondary)] flex items-center justify-between gap-2">
                <span>
                  {dr.kind === 'export' ? 'درخواست خروجی داده' : 'درخواست حذف حساب'} ·{' '}
                  <strong className="text-[var(--color-brand-fg)]">
                    [{dr.origin === 'server' ? 'منشأ: سرور معتبر' : 'منشأ: سابقه محلی مرورگر'}]
                  </strong>{' '}
                  · {dr.retentionNotesFa}
                </span>
                <span className={`px-2 py-0.5 rounded font-bold shrink-0 ${dr.status === 'failed' ? 'bg-rose-100 dark:bg-rose-950 text-rose-700 dark:text-rose-300' : 'bg-[var(--color-bg-muted)] text-[var(--color-text-primary)]'}`}>
                  {DATA_REQUEST_STATUS_LABELS[dr.status] || dr.status}{dr.errorCode ? ` (${dr.errorCode})` : ''}
                </span>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
};
