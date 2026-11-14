/** @file src/features/community/components/CommunityMembersAndGuidelinesTab.tsx — Zero-PII Public Profiles, 5-Axis Reputation & Policy Guidelines */
import React, { useMemo } from 'react';
import { Award, BadgeCheck, BookOpen, ShieldCheck } from 'lucide-react';
import { toPersianNum } from '../../../data/neighborhoods';
import {
  ABUSE_REASON_LABELS_FA,
  REPUTATION_AXIS_LABELS_FA,
  type CommunityProfile,
  type ReputationAxis,
} from '../types/community.types';

interface Props {
  mode: 'members' | 'guidelines';
  members: CommunityProfile[];
  selectedUsername: string | null;
  onSelectUsername: (username: string | null) => void;
}

const AXES_ORDER: ReputationAxis[] = ['data', 'community', 'research', 'sources', 'professional'];

export const CommunityMembersAndGuidelinesTab: React.FC<Props> = ({
  mode,
  members,
  selectedUsername,
  onSelectUsername,
}) => {
  const activeProfile = useMemo(
    () => (selectedUsername ? members.find((m) => m.username === selectedUsername) : members[0]) || null,
    [members, selectedUsername],
  );

  if (mode === 'guidelines') {
    const reasons = Object.values(ABUSE_REASON_LABELS_FA);
    return (
      <div className="space-y-4 text-xs" data-testid="community-guidelines-tab">
        <section className="p-5 rounded-[14px] bg-white dark:bg-slate-900 border border-[#DCE3DF] dark:border-slate-800 space-y-3">
          <h2 className="text-base font-black text-[#182522] dark:text-white flex items-center gap-1.5">
            <BookOpen className="w-4 h-4 text-[#176B63]" />
            <span>آیین‌نامه رفتار، حریم خصوصی، تخلفات ۱۰گانه و حق اعتراض</span>
          </h2>
          <p className="text-[#34433E] dark:text-slate-300 leading-relaxed">
            انتقاد مستند درباره کیفیت زیست محله، فشار آب، سروصدا، قیمت غیرمنطقی آگهی‌ها یا کیفیت ساخت‌وساز کاملاً مجاز است. آنچه محدود می‌شود تخریب شخصی، تبلیغات پنهان، قیمت‌سازی هماهنگ و افشای اطلاعات خصوصی افراد است.
          </p>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5 pt-2">
            {reasons.map((label, idx) => (
              <div key={label} className="p-2.5 rounded-[9px] bg-[#F8F9FA] dark:bg-slate-800/60 text-[#182522] dark:text-slate-200 tabular-nums">
                {toPersianNum(idx + 1)}. {label}
              </div>
            ))}
          </div>
        </section>

        <section className="p-5 rounded-[14px] bg-white dark:bg-slate-900 border border-[#DCE3DF] dark:border-slate-800 space-y-2">
          <h3 className="text-sm font-black text-[#182522] dark:text-white">فرآیند اعتراض و بازبینی تصمیم ناظر</h3>
          <p className="text-[#34433E] dark:text-slate-300 leading-relaxed">
            هر کاربر می‌تواند نسبت به تصمیم مخفی‌سازی یا قفل محتوای خود از مسیر «حساب کاربری / جامعه من» درخواست بازبینی ثبت کند. تمامی تصمیمات ممیزی و تغییر وضعیت نشان‌ها با تاریخ و دلیل در دفتر حسابرسی مرکز حاکمیت ثبت می‌شوند.
          </p>
        </section>
      </div>
    );
  }

  return (
    <div className="grid grid-cols-1 lg:grid-cols-12 gap-5 text-xs items-start" data-testid="community-members-tab">
      <div className="lg:col-span-5 space-y-2.5">
        {members.map((m) => (
          <button
            key={m.userId}
            type="button"
            onClick={() => onSelectUsername(m.username)}
            className={`w-full p-3.5 rounded-[12px] bg-white dark:bg-slate-900 border text-start space-y-1.5 cursor-pointer transition ${activeProfile?.username === m.username ? 'border-[#176B63]' : 'border-[#DCE3DF] dark:border-slate-800 hover:border-[#176B63]'}`}
          >
            <div className="flex items-center justify-between gap-2">
              <span className="font-black text-sm text-[#182522] dark:text-white">{m.displayNameFa}</span>
              <span className="text-[11px] font-mono text-[#586760] dark:text-slate-400">@{m.username}</span>
            </div>
            <p className="text-[11px] text-[#586760] dark:text-slate-400 line-clamp-2">{m.bioFa}</p>
            {m.verifiedCredentialFa && (
              <div className="text-[11px] font-bold text-amber-800 dark:text-amber-300 inline-flex items-center gap-1">
                <Award className="w-3.5 h-3.5 shrink-0" /><span>{m.verifiedCredentialFa}</span>
              </div>
            )}
          </button>
        ))}
      </div>

      {activeProfile && (
        <section className="lg:col-span-7 p-5 rounded-[14px] bg-white dark:bg-slate-900 border border-[#DCE3DF] dark:border-slate-800 space-y-4">
          <div className="flex flex-wrap items-start justify-between gap-2 border-b border-[#DCE3DF] dark:border-slate-800 pb-3">
            <div>
              <h2 className="text-base font-black text-[#182522] dark:text-white flex items-center gap-1.5">
                <span>{activeProfile.displayNameFa}</span>
                {activeProfile.identityStatus === 'verified_phone' && <BadgeCheck className="w-4 h-4 text-sky-600" />}
              </h2>
              <div className="text-[11px] text-[#586760] dark:text-slate-400">
                @{activeProfile.username} · عضویت از {activeProfile.memberSinceFa} · نمایه عمومی (بدون اطلاعات تماس)
              </div>
            </div>
          </div>

          <p className="text-[#34433E] dark:text-slate-300 leading-relaxed">{activeProfile.bioFa}</p>

          <div className="space-y-2">
            <h3 className="font-black text-[#182522] dark:text-white">تفکیک ۵ محور اعتبار (بدون ادغام در یک نمره ساختگی)</h3>
            <div className="space-y-2">
              {AXES_ORDER.map((axis) => {
                const val = activeProfile.reputation[axis] ?? 0;
                const widthPct = Math.min(100, val);
                return (
                  <div key={axis} className="space-y-1">
                    <div className="flex items-center justify-between text-[11px]">
                      <span className="text-[#34433E] dark:text-slate-300 font-medium">{REPUTATION_AXIS_LABELS_FA[axis]}</span>
                      <span className="font-bold tabular-nums text-[#182522] dark:text-white">{toPersianNum(val)}</span>
                    </div>
                    <div className="h-1.5 rounded-full bg-slate-100 dark:bg-slate-800 overflow-hidden">
                      <div className="h-full bg-[#176B63]" style={{ width: `${widthPct}%` }} />
                    </div>
                  </div>
                );
              })}
            </div>
          </div>

          {activeProfile.badges.length > 0 && (
            <div className="space-y-2 pt-2 border-t border-[#DCE3DF] dark:border-slate-800">
              <h3 className="font-black text-[#182522] dark:text-white">نشان‌های معتبر و دارای تاریخ انقضا</h3>
              <div className="divide-y divide-[#DCE3DF] dark:divide-slate-800">
                {activeProfile.badges.map((bdg) => (
                  <div key={bdg.id} className="py-2 first:pt-0 last:pb-0 space-y-0.5 text-[11px]">
                    <div className="font-bold text-[#14534E] dark:text-emerald-300 flex items-center gap-1">
                      <ShieldCheck className="w-3.5 h-3.5 shrink-0" /><span>{bdg.titleFa}</span>
                    </div>
                    <div className="text-[#586760] dark:text-slate-400">
                      دامنه: {bdg.scopeFa} · مرجع: {bdg.authorityFa} · ممیزی: {bdg.reviewedAtFa}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {activeProfile.recentPublicSummaryFa.length > 0 && (
            <div className="space-y-1.5 pt-2 border-t border-[#DCE3DF] dark:border-slate-800">
              <h3 className="font-black text-[#182522] dark:text-white">مشارکت‌های عمومی اخیر</h3>
              {activeProfile.recentPublicSummaryFa.map((line) => (
                <div key={line} className="text-[11px] text-[#34433E] dark:text-slate-300">· {line}</div>
              ))}
            </div>
          )}
        </section>
      )}
    </div>
  );
};
