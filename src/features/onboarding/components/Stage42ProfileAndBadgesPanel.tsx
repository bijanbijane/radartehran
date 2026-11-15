/** @file src/features/onboarding/components/Stage42ProfileAndBadgesPanel.tsx — VRF-01..05, VRF-12, VRF-15..18, VRF-23..27 */
import React, { useState } from 'react';
import {
  TRUST_DIMENSIONS_SEPARATION,
  completePhoneVerificationOnly,
  evaluateSensitiveDocumentAccess,
  expireSpecificBadgeOnly,
  recordUnverifiedAbuseComplaint,
  type ProfessionalProfileRecord,
} from '../services/professionalVerificationEngine';

interface Props {
  profile: ProfessionalProfileRecord;
  onUpdateProfile: (p: ProfessionalProfileRecord) => void;
  onFeedbackFa: (msg: string) => void;
}

export const Stage42ProfileAndBadgesPanel: React.FC<Props> = ({
  profile,
  onUpdateProfile,
  onFeedbackFa,
}) => {
  const [selectedBadgeId, setSelectedBadgeId] = useState<string>(profile.badges[0]?.badgeId ?? '');
  const activeBadge = profile.badges.find((b) => b.badgeId === selectedBadgeId) ?? profile.badges[0];

  const handlePhoneVerify = () => {
    onUpdateProfile(completePhoneVerificationOnly(profile));
    onFeedbackFa('فقط شماره تماس تأیید شد؛ هیچ نشان صلاحیت حرفه‌ای یا مجوز تخصصی صادر نگردید.');
  };

  const handleExpireLicense = () => {
    const lic = profile.badges.find((b) => b.scope === 'credential_license');
    if (!lic) return;
    onUpdateProfile(expireSpecificBadgeOnly(profile, lic.badgeId));
    onFeedbackFa('فقط مدرک حرفه‌ای منقضی شد؛ سابقه قبلی حفظ گردید و سایر نشان‌های مستقل بدون تغییر ماندند.');
  };

  const handleReportAbuse = () => {
    const res = recordUnverifiedAbuseComplaint(profile);
    onUpdateProfile(res.updatedProfile);
    onFeedbackFa(res.noticeFa);
  };

  const handleTestPrivateDoc = () => {
    const res = evaluateSensitiveDocumentAccess('public_user');
    onFeedbackFa(res.reasonFa);
  };

  return (
    <div className="space-y-3 text-xs" data-testid="stage42-profile-badges" dir="rtl">
      {/* 4 Trust Dimensions Separation */}
      <div className="grid grid-cols-1 gap-2 sm:grid-cols-2 lg:grid-cols-4">
        {TRUST_DIMENSIONS_SEPARATION.map((d) => (
          <div key={d.kind} className="rounded-xl border border-slate-800 bg-slate-950/80 p-2.5 space-y-1">
            <div className="font-bold text-cyan-300">{d.titleFa}</div>
            <div className="text-[10.5px] text-emerald-300">اثبات می‌کند: {d.provesFa}</div>
            <div className="text-[10.5px] text-amber-300">اثبات نمی‌کند: {d.doesNotProveFa}</div>
          </div>
        ))}
      </div>

      {/* VRF-03 Header & VRF-15/16 Track Record vs Reputation */}
      <div className="rounded-xl border border-slate-800 bg-slate-950/80 p-3 space-y-2.5">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div>
            <div className="text-sm font-black text-white">{profile.displayNameFa}</div>
            <div className="text-[11px] text-slate-400">
              {profile.specialtyFa} {profile.parentCompanyNameFa ? `· مجموعه مادر: ${profile.parentCompanyNameFa}` : ''}
            </div>
          </div>
          <div className="flex flex-wrap gap-1.5 text-[10.5px]">
            <span className="rounded border border-slate-700 bg-slate-900 px-2 py-0.5 text-slate-200">
              سابقه اعلام‌شده کاربر: {profile.claimedExperienceYears} سال (اثبات‌شده: {profile.verifiedExperienceYears} سال)
            </span>
            <span className="rounded border border-cyan-500/40 bg-cyan-950/40 px-2 py-0.5 text-cyan-200">
              امتیاز رفتاری: {profile.reputationScore}/5 ({profile.verifiedInteractionReviewsCount} تعامل تأییدشده · {profile.unverifiedReviewsCount} نظر عادی)
            </span>
          </div>
        </div>

        {/* VRF-01 Clickable Scoped Badges */}
        <div className="flex flex-wrap gap-1.5">
          {profile.badges.map((b) => (
            <button
              key={b.badgeId}
              type="button"
              data-testid={`badge-pill-${b.badgeId}`}
              onClick={() => setSelectedBadgeId(b.badgeId)}
              className={`rounded-lg border px-2.5 py-1 text-[11px] font-bold ${
                activeBadge?.badgeId === b.badgeId
                  ? 'border-cyan-500 bg-cyan-950/60 text-cyan-200'
                  : 'border-slate-700 bg-slate-900 text-slate-300'
              }`}
            >
              {b.titleFa} ({b.status})
            </button>
          ))}
        </div>

        {/* VRF-02 Popover / Detail Explanation */}
        {activeBadge && (
          <div data-testid="stage42-badge-detail" className="rounded-lg border border-slate-800 bg-slate-900/90 p-2.5 space-y-1 text-[11px]">
            <div className="font-bold text-white">توضیح شفاف نشان (VRF-02): {activeBadge.titleFa} — وضعیت: {activeBadge.status}</div>
            <div className="text-slate-300">معنی دقیق: {activeBadge.meaningFa}</div>
            <div className="text-amber-300">محدودیت صریح: {activeBadge.limitationFa}</div>
            <div className="text-slate-400">مرجع بررسی: {activeBadge.authorityFa} · تاریخ بررسی: {activeBadge.reviewedAtLabelFa}</div>
          </div>
        )}

        <div className="flex flex-wrap gap-1.5 pt-1">
          <button type="button" data-testid="vrf-phone-only-btn" onClick={handlePhoneVerify} className="rounded bg-emerald-600 px-2.5 py-1 text-[11px] font-bold text-white">
            تأیید فقط شماره تماس
          </button>
          <button type="button" data-testid="vrf-expire-lic-btn" onClick={handleExpireLicense} className="rounded border border-amber-500/40 bg-amber-950/30 px-2.5 py-1 text-[11px] font-bold text-amber-200">
            انقضای مدرک حرفه‌ای (حفظ سابقه)
          </button>
          <button type="button" data-testid="vrf-complaint-btn" onClick={handleReportAbuse} className="rounded border border-rose-500/40 bg-rose-950/30 px-2.5 py-1 text-[11px] font-bold text-rose-300">
            ثبت گزارش تخلف بررسی‌نشده
          </button>
          <button type="button" data-testid="vrf-private-doc-test-btn" onClick={handleTestPrivateDoc} className="rounded border border-slate-700 px-2.5 py-1 text-[11px] text-slate-200">
            تست دسترسی عمومی به مدرک هویتی
          </button>
        </div>
        <div className="text-[10.5px] text-slate-400">
          شکایت‌های در انتظار بررسی: {profile.pendingComplaintsCount} · برچسب متخلف روی پروفایل عمومی: {profile.publiclyShowViolationLabel ? 'بله' : 'خیر (تا پیش از بررسی قطعی)'}
        </div>
      </div>
    </div>
  );
};
