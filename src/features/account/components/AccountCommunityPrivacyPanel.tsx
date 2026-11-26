/** @file src/features/account/components/AccountCommunityPrivacyPanel.tsx — Server-Backed /account/community Privacy Settings & Appeals */
import React, { useEffect, useState } from 'react';
import type { AuthUserSnapshot as User } from '../../../platform/auth';
import { Eye, Lock, LogIn, Scale, ShieldCheck } from 'lucide-react';
import { toPersianNum } from '../../../data/neighborhoods';
import type { PrimaryViewId } from '../../../utils/areaUnit';
import type { ModuleSubTabId } from '../../../navigation/registry/route.types';
import { COMMUNITY_AUTH_REQUIRED_FA, loadDataCorrectionDraft } from '../../community/services/communityTrustService';
import {
  getCommunityTopics,
  getMyCommunityActivity,
  submitCommunityAppeal,
  updateCommunityPrivacySettings,
} from '../../community/services/communityApiClient';
import {
  REPUTATION_AXIS_LABELS_FA,
  type CommunityProfile,
  type CommunityTopicNode,
  type DataCorrectionProposal,
  type ModerationAppeal,
  type ProfileVisibilityLevel,
} from '../../community/types/community.types';

interface Props {
  currentUser?: User | null;
  onNavigateView?: (view: PrimaryViewId, subTab?: ModuleSubTabId) => void;
}

export const AccountCommunityPrivacyPanel: React.FC<Props> = ({ currentUser, onNavigateView }) => {
  const [profile, setProfile] = useState<CommunityProfile | null>(null);
  const [topics, setTopics] = useState<CommunityTopicNode[]>([]);
  const [myContributions, setMyContributions] = useState<DataCorrectionProposal[]>([]);
  const [appeals, setAppeals] = useState<ModerationAppeal[]>([]);
  const [appealTargetId, setAppealTargetId] = useState('');
  const [appealReasonFa, setAppealReasonFa] = useState('');
  const [submittingAppeal, setSubmittingAppeal] = useState(false);
  const [feedback, setFeedback] = useState<{ tone: 'success' | 'error'; text: string } | null>(null);
  const [appealFeedback, setAppealFeedback] = useState<{ tone: 'success' | 'error'; text: string } | null>(null);
  const [loading, setLoading] = useState(false);

  const draftCorrection = loadDataCorrectionDraft();

  useEffect(() => {
    if (!currentUser?.uid) {
      setProfile(null);
      setMyContributions([]);
      setAppeals([]);
      return;
    }
    const ctrl = new AbortController();
    setLoading(true);
    Promise.all([
      getMyCommunityActivity(currentUser, ctrl.signal),
      getCommunityTopics(currentUser, ctrl.signal),
    ]).then(([actRes, topicsRes]) => {
      if (ctrl.signal.aborted) return;
      if (actRes.ok && actRes.data) {
        setProfile(actRes.data.myProfile);
        setMyContributions(actRes.data.myContributions);
        setAppeals(actRes.data.myAppeals);
      } else if (actRes.errorFa) {
        setFeedback({ tone: 'error', text: actRes.errorFa });
      }
      if (topicsRes.ok && topicsRes.data) setTopics(topicsRes.data);
      setLoading(false);
    });
    return () => ctrl.abort();
  }, [currentUser?.uid]);

  if (!currentUser?.uid) {
    return (
      <div className="p-5 rounded-2xl bg-white dark:bg-[var(--color-bg-surface)] border border-slate-200 dark:border-[var(--color-border-subtle)] space-y-3 text-xs" data-testid="account-community-privacy-panel">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div>
            <h2 className="text-base font-bold text-slate-900 dark:text-white flex items-center gap-1.5">
              <Lock className="w-4 h-4 text-[var(--color-brand-600)]" />
              <span>تنظیمات حریم خصوصی و فعالیت‌های جامعه من</span>
            </h2>
            <p className="text-[11px] text-slate-500 dark:text-[var(--color-text-muted)] mt-1">
              {COMMUNITY_AUTH_REQUIRED_FA}
            </p>
          </div>
          <button
            type="button"
            onClick={() => onNavigateView?.('userspace', 'overview')}
            className="px-3.5 py-2 rounded-lg bg-[var(--color-brand-600)] text-white font-bold inline-flex items-center gap-1.5 cursor-pointer"
          >
            <LogIn className="w-3.5 h-3.5" /><span>ورود به حساب</span>
          </button>
        </div>
      </div>
    );
  }

  const handleVisibilityChange = async (visibility: ProfileVisibilityLevel) => {
    const res = await updateCommunityPrivacySettings({ visibility }, currentUser);
    if (res.ok && res.data) {
      setProfile(res.data);
      setFeedback({ tone: 'success', text: 'سطح نمایش نمایه عمومی جامعه در سرور به‌روزرسانی شد.' });
    } else {
      setFeedback({ tone: 'error', text: res.errorFa || 'خطا در به‌روزرسانی تنظیمات حریم خصوصی' });
    }
  };

  const handleToggleDisplay = async (key: 'showBadges' | 'showContributions' | 'showFollowedTopics') => {
    if (!profile) return;
    const res = await updateCommunityPrivacySettings({ [key]: !profile[key] }, currentUser);
    if (res.ok && res.data) {
      setProfile(res.data);
      setFeedback(null);
    } else if (res.errorFa) {
      setFeedback({ tone: 'error', text: res.errorFa });
    }
  };

  const handleAppealSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (submittingAppeal) return;
    const trimmedReason = appealReasonFa.trim();
    if (trimmedReason.length < 5) {
      setAppealFeedback({ tone: 'error', text: 'لطفاً دلیل درخواست بازبینی را (حداقل ۵ کاراکتر) وارد کنید.' });
      return;
    }
    setSubmittingAppeal(true);
    setAppealFeedback(null);
    try {
      const res = await submitCommunityAppeal(
        {
          moderationActionId: 'mod-act-latest',
          targetId: appealTargetId.trim() || myContributions[0]?.id || 'post-review',
          argumentFa: trimmedReason,
        },
        currentUser,
      );
      if (res.ok && res.data) {
        setAppeals((prev) => [res.data!, ...prev]);
        setAppealReasonFa('');
        setAppealTargetId('');
        setAppealFeedback({ tone: 'success', text: 'درخواست بازبینی و اعتراض شما در سرور برای تیم نظارت ثبت شد.' });
      } else {
        setAppealFeedback({ tone: 'error', text: res.errorFa || 'خطا در ثبت درخواست' });
      }
    } finally {
      setSubmittingAppeal(false);
    }
  };

  const followedTopics = topics.filter((t) => t.isFollowedByMe);
  const visibility = profile?.visibility ?? 'public';

  return (
    <div className="space-y-4 text-xs" data-testid="account-community-privacy-panel">
      <section className="p-5 rounded-2xl bg-white dark:bg-[var(--color-bg-surface)] border border-slate-200 dark:border-[var(--color-border-subtle)] space-y-3">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div>
            <h2 className="text-base font-bold text-slate-900 dark:text-white flex items-center gap-1.5">
              <Lock className="w-4 h-4 text-[var(--color-brand-600)]" />
              <span>تنظیمات حریم خصوصی و فعالیت‌های جامعه من</span>
            </h2>
            <p className="text-[11px] text-slate-500 dark:text-[var(--color-text-muted)] mt-0.5">
              اطلاعات تماس، ایمیل و پیش‌نویس‌های شما هرگز در نمایه عمومی جامعه نمایش داده نمی‌شوند.
            </p>
          </div>
          <button type="button" onClick={() => onNavigateView?.('contributions', 'overview')} className="px-3 py-1.5 rounded-lg bg-[var(--color-brand-600)] text-white font-bold cursor-pointer">
            ورود به جامعه کاربران
          </button>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
          {([
            { id: 'public', label: 'عمومی (پیشنهادی · بدون PII)' },
            { id: 'members_only', label: 'فقط کاربران عضو رادار' },
            { id: 'private', label: 'خصوصی (پنهان از فهرست اعضا)' },
          ] as const).map((opt) => (
            <button
              key={opt.id}
              type="button"
              disabled={loading}
              onClick={() => handleVisibilityChange(opt.id)}
              className={`p-2.5 rounded-xl border text-start font-bold cursor-pointer transition ${
                visibility === opt.id
                  ? 'border-[var(--color-brand-600)] bg-[#EAF3F0]/60 dark:bg-emerald-950/40 text-[var(--color-brand-700)] dark:text-emerald-200'
                  : 'border-slate-200 dark:border-[var(--color-border-strong)] text-slate-700 dark:text-[var(--color-text-secondary)]'
              }`}
            >
              <span className="flex items-center gap-1.5"><Eye className="w-3.5 h-3.5" />{opt.label}</span>
            </button>
          ))}
        </div>

        <div className="flex flex-wrap gap-3 pt-1">
          {([
            { key: 'showBadges', label: 'نمایش نشان‌های معتبر در نمایه عمومی' },
            { key: 'showContributions', label: 'نمایش خلاصه مشارکت‌های عمومی' },
            { key: 'showFollowedTopics', label: 'نمایش موضوعات دنبال‌شده' },
          ] as const).map((t) => (
            <label key={t.key} className="inline-flex items-center gap-1.5 cursor-pointer text-slate-700 dark:text-[var(--color-text-secondary)] font-medium">
              <input
                type="checkbox"
                checked={profile ? profile[t.key] : true}
                disabled={loading || !profile}
                onChange={() => handleToggleDisplay(t.key)}
                className="accent-[var(--color-brand-600)]"
              />
              <span>{t.label}</span>
            </label>
          ))}
        </div>

        {feedback && (
          <div
            role={feedback.tone === 'error' ? 'alert' : 'status'}
            className={`p-2.5 rounded-xl font-bold ${
              feedback.tone === 'error'
                ? 'bg-rose-50 dark:bg-rose-950/40 text-rose-800 dark:text-rose-200 border border-rose-200 dark:border-rose-800'
                : 'bg-emerald-50 dark:bg-emerald-950/40 text-emerald-800 dark:text-emerald-200 border border-emerald-200 dark:border-emerald-800'
            }`}
          >
            {feedback.text}
          </div>
        )}
      </section>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        <section className="p-4 rounded-2xl bg-white dark:bg-[var(--color-bg-surface)] border border-slate-200 dark:border-[var(--color-border-subtle)] space-y-2.5">
          <h3 className="font-bold text-sm text-slate-900 dark:text-white flex items-center gap-1.5">
            <ShieldCheck className="w-4 h-4 text-[var(--color-brand-600)]" />
            <span>وضعیت اعتبار ۵ محوری و مشارکت‌های ثبت‌شده ({toPersianNum(myContributions.length)})</span>
          </h3>
          {profile && (
            <div className="grid grid-cols-2 gap-2">
              {(['data', 'community', 'research', 'sources', 'professional'] as const).map((axis) => (
                <div key={axis} className="p-2 rounded-lg bg-slate-50 dark:bg-[var(--color-bg-muted)] flex items-center justify-between gap-2">
                  <span className="text-[11px] text-slate-600 dark:text-[var(--color-text-secondary)]">{REPUTATION_AXIS_LABELS_FA[axis]}</span>
                  <span className="font-bold tabular-nums text-emerald-700 dark:text-emerald-300">{toPersianNum(profile.reputation[axis])}</span>
                </div>
              ))}
            </div>
          )}
          {draftCorrection && (
            <div className="p-2.5 rounded-xl bg-amber-50/70 dark:bg-amber-950/30 text-amber-800 dark:text-amber-200 text-[11px]">
              پیش‌نویس ذخیره‌شده اصلاح داده: «{String(draftCorrection.titleFa || 'بدون عنوان')}»
            </div>
          )}
          <div className="text-[11px] text-slate-500 pt-1">
            موضوعات دنبال‌شده: {followedTopics.map((t) => t.titleFa).join(' · ') || 'موردی انتخاب نشده'}
          </div>
        </section>

        <section className="p-4 rounded-2xl bg-white dark:bg-[var(--color-bg-surface)] border border-slate-200 dark:border-[var(--color-border-subtle)] space-y-2.5">
          <h3 className="font-bold text-sm text-slate-900 dark:text-white flex items-center gap-1.5">
            <Scale className="w-4 h-4 text-sky-600" />
            <span>ثبت اعتراض و پیگیری تصمیمات نظارت</span>
          </h3>
          <form onSubmit={handleAppealSubmit} className="space-y-2">
            <input type="text" aria-label="شناسه مطلب یا تصمیم نظارتی" value={appealTargetId} onChange={(e) => { setAppealTargetId(e.target.value); if (appealFeedback) setAppealFeedback(null); }} placeholder="شناسه مطلب (اختیاری)" className="w-full p-2 rounded-lg bg-slate-50 dark:bg-[var(--color-bg-muted)] border border-slate-200 dark:border-[var(--color-border-strong)]" />
            <textarea rows={2} aria-label="دلیل درخواست بازبینی" value={appealReasonFa} onChange={(e) => { setAppealReasonFa(e.target.value); if (appealFeedback) setAppealFeedback(null); }} placeholder="دلایل و شواهد خود را برای بازبینی تصمیم ناظر بنویسید..." className="w-full p-2 rounded-lg bg-slate-50 dark:bg-[var(--color-bg-muted)] border border-slate-200 dark:border-[var(--color-border-strong)]" />
            {appealFeedback && (
              <div
                role={appealFeedback.tone === 'error' ? 'alert' : 'status'}
                className={`p-2 rounded-lg font-bold text-[11px] ${
                  appealFeedback.tone === 'error'
                    ? 'bg-rose-50 dark:bg-rose-950/40 text-rose-800 dark:text-rose-200 border border-rose-200 dark:border-rose-800'
                    : 'bg-emerald-50 dark:bg-emerald-950/40 text-emerald-800 dark:text-emerald-200 border border-emerald-200 dark:border-emerald-800'
                }`}
              >
                {appealFeedback.text}
              </div>
            )}
            <button type="submit" disabled={submittingAppeal} data-testid="submit-community-appeal-btn" className="px-3.5 py-1.5 rounded-lg bg-[var(--color-brand-600)] text-white font-bold cursor-pointer disabled:opacity-50">
              {submittingAppeal ? 'در حال ارسال...' : 'ارسال درخواست بازبینی'}
            </button>
          </form>
          {appeals.length > 0 && (
            <div className="divide-y divide-slate-100 dark:divide-[var(--color-border-subtle)] pt-1">
              {appeals.slice(0, 3).map((a) => (
                <div key={a.id} className="py-1.5 text-[11px] flex items-center justify-between gap-2">
                  <span className="truncate text-slate-700 dark:text-[var(--color-text-secondary)]">{a.argumentFa}</span>
                  <span className="font-bold shrink-0">{a.status === 'overturned' ? 'لغو تصمیم قبلی' : a.status === 'upheld' ? 'تأیید تصمیم قبلی' : 'در صف بررسی'}</span>
                </div>
              ))}
            </div>
          )}
        </section>
      </div>
    </div>
  );
};
