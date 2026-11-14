/** @file src/features/account/components/AccountCommunityPrivacyPanel.tsx — Stage 25 Private /account/community Settings & History */
import React, { useState } from 'react';
import { Eye, Lock, Scale, ShieldCheck } from 'lucide-react';
import { toPersianNum } from '../../../data/neighborhoods';
import type { PrimaryViewId } from '../../../utils/areaUnit';
import type { ModuleSubTabId } from '../../../navigation/registry/route.types';
import { loadDataCorrectionDraft } from '../../community/services/communityTrustService';
import {
  loadCommunityTopics,
  loadFollowedTopicIds,
  loadModerationActions,
  loadModerationAppeals,
  loadMyCommunityPrivacyProfile,
  loadReputationEvents,
  submitModerationAppeal,
  updateMyCommunityPrivacyProfile,
} from '../../community/services/communityEngagementService';
import {
  REPUTATION_AXIS_LABELS_FA,
  type ProfileVisibilityLevel,
} from '../../community/types/community.types';

interface Props {
  onNavigateView?: (view: PrimaryViewId, subTab?: ModuleSubTabId) => void;
}

export const AccountCommunityPrivacyPanel: React.FC<Props> = ({ onNavigateView }) => {
  const [profile, setProfile] = useState(() => loadMyCommunityPrivacyProfile());
  const [appeals, setAppeals] = useState(() => loadModerationAppeals());
  const [appealTargetId, setAppealTargetId] = useState('');
  const [appealReasonFa, setAppealReasonFa] = useState('');
  const [feedback, setFeedback] = useState<string | null>(null);

  const followedTopics = loadFollowedTopicIds();
  const topics = loadCommunityTopics();
  const repEvents = loadReputationEvents();
  const actions = loadModerationActions();
  const draftCorrection = loadDataCorrectionDraft();

  const handleVisibilityChange = (visibility: ProfileVisibilityLevel) => {
    setProfile(updateMyCommunityPrivacyProfile({ visibility }));
    setFeedback('سطح نمایش نمایه عمومی جامعه به‌روزرسانی شد.');
  };

  const handleToggleDisplay = (key: 'showBadges' | 'showContributions' | 'showFollowedTopics') => {
    setProfile(updateMyCommunityPrivacyProfile({ [key]: !profile[key] }));
  };

  const handleAppealSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    const res = submitModerationAppeal({
      moderationActionId: actions[0]?.id || 'mod-act-1',
      targetId: appealTargetId || 'post-seed-1',
      appellantUserId: profile.userId,
      argumentFa: appealReasonFa,
    });
    if (res.ok) {
      setAppeals(res.items);
      setAppealReasonFa('');
      setFeedback('درخواست بازبینی و اعتراض شما برای تیم نظارت ثبت شد.');
    } else {
      setFeedback(res.errorFa || 'خطا در ثبت درخواست');
    }
  };

  return (
    <div className="space-y-4 text-xs" data-testid="account-community-privacy-panel">
      <section className="p-5 rounded-2xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 space-y-3">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div>
            <h2 className="text-base font-black text-slate-900 dark:text-white flex items-center gap-1.5">
              <Lock className="w-4 h-4 text-[#176B63]" />
              <span>تنظیمات حریم خصوصی و فعالیت‌های جامعه من</span>
            </h2>
            <p className="text-[11px] text-slate-500 dark:text-slate-400 mt-0.5">
              اطلاعات تماس، ایمیل و پیش‌نویس‌های شما هرگز در نمایه عمومی جامعه نمایش داده نمی‌شوند.
            </p>
          </div>
          <button type="button" onClick={() => onNavigateView?.('contributions', 'overview')} className="px-3 py-1.5 rounded-lg bg-[#176B63] text-white font-bold cursor-pointer">
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
              onClick={() => handleVisibilityChange(opt.id)}
              className={`p-2.5 rounded-xl border text-start font-bold cursor-pointer transition ${
                profile.visibility === opt.id
                  ? 'border-[#176B63] bg-[#EAF3F0]/60 dark:bg-emerald-950/40 text-[#14534E] dark:text-emerald-200'
                  : 'border-slate-200 dark:border-slate-700 text-slate-700 dark:text-slate-300'
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
            <label key={t.key} className="inline-flex items-center gap-1.5 cursor-pointer text-slate-700 dark:text-slate-300 font-medium">
              <input type="checkbox" checked={profile[t.key]} onChange={() => handleToggleDisplay(t.key)} className="accent-[#176B63]" />
              <span>{t.label}</span>
            </label>
          ))}
        </div>

        {feedback && (
          <div className="p-2.5 rounded-xl bg-emerald-50 dark:bg-emerald-950/40 text-emerald-800 dark:text-emerald-200 font-bold">
            {feedback}
          </div>
        )}
      </section>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        <section className="p-4 rounded-2xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 space-y-2.5">
          <h3 className="font-black text-sm text-slate-900 dark:text-white flex items-center gap-1.5">
            <ShieldCheck className="w-4 h-4 text-[#176B63]" />
            <span>تاریخچه تغییرات اعتبار ۵ محوری ({toPersianNum(repEvents.length)})</span>
          </h3>
          <div className="divide-y divide-slate-100 dark:divide-slate-800">
            {repEvents.map((ev) => (
              <div key={ev.id} className="py-2 first:pt-0 last:pb-0 flex items-start justify-between gap-2">
                <div>
                  <div className="font-bold text-slate-800 dark:text-slate-200">{ev.reasonFa}</div>
                  <div className="text-[11px] text-slate-500">محور: {REPUTATION_AXIS_LABELS_FA[ev.axis]} · {ev.createdAtFa}</div>
                </div>
                <span className="font-black tabular-nums text-emerald-700 dark:text-emerald-300">+{toPersianNum(ev.delta)}</span>
              </div>
            ))}
          </div>
          {draftCorrection && (
            <div className="p-2.5 rounded-xl bg-amber-50/70 dark:bg-amber-950/30 text-amber-800 dark:text-amber-200 text-[11px]">
              پیش‌نویس ذخیره‌شده اصلاح داده: «{String(draftCorrection.titleFa || 'بدون عنوان')}»
            </div>
          )}
          <div className="text-[11px] text-slate-500 pt-1">
            موضوعات دنبال‌شده: {followedTopics.map((id) => topics.find((t) => t.id === id)?.titleFa || id).join(' · ') || 'موردی انتخاب نشده'}
          </div>
        </section>

        <section className="p-4 rounded-2xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 space-y-2.5">
          <h3 className="font-black text-sm text-slate-900 dark:text-white flex items-center gap-1.5">
            <Scale className="w-4 h-4 text-sky-600" />
            <span>ثبت اعتراض و پیگیری تصمیمات نظارت</span>
          </h3>
          <form onSubmit={handleAppealSubmit} className="space-y-2">
            <input type="text" aria-label="شناسه مطلب یا تصمیم نظارتی" value={appealTargetId} onChange={(e) => setAppealTargetId(e.target.value)} placeholder="شناسه مطلب (اختیاری، پیش‌فرض: آخرین اقدام نظارتی)" className="w-full p-2 rounded-lg bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700" />
            <textarea rows={2} aria-label="دلیل درخواست بازبینی" value={appealReasonFa} onChange={(e) => setAppealReasonFa(e.target.value)} placeholder="دلایل و شواهد خود را برای بازبینی تصمیم ناظر بنویسید..." className="w-full p-2 rounded-lg bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700" />
            <button type="submit" data-testid="submit-community-appeal-btn" className="px-3.5 py-1.5 rounded-lg bg-slate-900 dark:bg-white text-white dark:text-slate-900 font-bold cursor-pointer">
              ارسال درخواست بازبینی
            </button>
          </form>
          {appeals.length > 0 && (
            <div className="divide-y divide-slate-100 dark:divide-slate-800 pt-1">
              {appeals.slice(0, 3).map((a) => (
                <div key={a.id} className="py-1.5 text-[11px] flex items-center justify-between gap-2">
                  <span className="truncate text-slate-700 dark:text-slate-300">{a.argumentFa}</span>
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
