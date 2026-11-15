/** @file src/features/onboarding/components/Stage42VerificationSubpanel.tsx — Stage 42 Professional Verification Hub */
import React, { useState } from 'react';
import type { ProfessionalProfileRecord, VerificationCaseRecord } from '../services/professionalVerificationEngine';
import { INITIAL_STAGE42_CASE, INITIAL_STAGE42_PROFILES } from '../services/stage42VerificationFixtures';
import { Stage42ProfileAndBadgesPanel } from './Stage42ProfileAndBadgesPanel';
import { Stage42RequestAndReviewerPanel } from './Stage42RequestAndReviewerPanel';

export const Stage42VerificationSubpanel: React.FC = () => {
  const [profiles, setProfiles] = useState<ProfessionalProfileRecord[]>(INITIAL_STAGE42_PROFILES);
  const [selectedProfileId, setSelectedProfileId] = useState<string>(INITIAL_STAGE42_PROFILES[0].profileId);
  const [reqCase, setReqCase] = useState<VerificationCaseRecord>(INITIAL_STAGE42_CASE);
  const [subTab, setSubTab] = useState<'profile' | 'reviewer'>('profile');
  const [feedbackFa, setFeedbackFa] = useState<string>('');

  const activeProfile = profiles.find((p) => p.profileId === selectedProfileId) ?? profiles[0];

  return (
    <div className="space-y-4" data-testid="stage42-verification-subpanel" dir="rtl">
      <div className="rounded-xl border border-slate-800 bg-slate-900/70 p-4 space-y-3.5">
        <div className="flex flex-wrap items-center justify-between gap-2 border-b border-slate-800 pb-3">
          <div>
            <h3 className="text-sm font-bold text-white">مرحله ۴۲: اعتبار حرفه‌ای، تأیید هویت و نظام اعتماد کاربران (RT-UI-VERIFICATION-001)</h3>
            <p className="mt-1 text-xs text-slate-400">تفکیک هویت، صلاحیت، سابقه و رفتار؛ نشان‌های مستقل و قابل‌استعلام؛ استقلال شعب از دفتر مرکزی؛ حفظ محرمانگی مدارک</p>
          </div>
          <div className="flex flex-wrap gap-1.5">
            {profiles.map((p) => (
              <button
                key={p.profileId}
                type="button"
                data-testid={`vrf-select-profile-${p.profileId}`}
                onClick={() => setSelectedProfileId(p.profileId)}
                className={`rounded-lg border px-2.5 py-1 text-[11px] font-bold ${
                  activeProfile.profileId === p.profileId ? 'border-cyan-500 bg-cyan-950/50 text-cyan-200' : 'border-slate-700 bg-slate-950 text-slate-300'
                }`}
              >
                {p.displayNameFa}
              </button>
            ))}
          </div>
        </div>

        <div className="flex gap-1.5 text-[11px]">
          <button type="button" data-testid="vrf-tab-profile" onClick={() => setSubTab('profile')} className={`rounded-lg border px-2.5 py-1 font-bold ${subTab === 'profile' ? 'border-emerald-500 bg-emerald-950/40 text-emerald-200' : 'border-slate-700 text-slate-300'}`}>
            پروفایل عمومی و نشان‌های مستقل
          </button>
          <button type="button" data-testid="vrf-tab-reviewer" onClick={() => setSubTab('reviewer')} className={`rounded-lg border px-2.5 py-1 font-bold ${subTab === 'reviewer' ? 'border-emerald-500 bg-emerald-950/40 text-emerald-200' : 'border-slate-700 text-slate-300'}`}>
            اعتراض، درخواست و پنل بازبین
          </button>
        </div>

        {feedbackFa && (
          <div data-testid="stage42-feedback-banner" className="rounded-lg border border-cyan-500/40 bg-cyan-950/30 px-3 py-1.5 text-[11px] text-cyan-200">
            {feedbackFa}
          </div>
        )}

        {subTab === 'profile' ? (
          <Stage42ProfileAndBadgesPanel
            profile={activeProfile}
            onUpdateProfile={(updated) => setProfiles((prev) => prev.map((p) => (p.profileId === updated.profileId ? updated : p)))}
            onFeedbackFa={setFeedbackFa}
          />
        ) : (
          <Stage42RequestAndReviewerPanel reqCase={reqCase} onUpdateCase={setReqCase} onFeedbackFa={setFeedbackFa} />
        )}
      </div>
    </div>
  );
};
export default Stage42VerificationSubpanel;
