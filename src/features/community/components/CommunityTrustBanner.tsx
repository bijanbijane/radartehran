/** @file src/features/community/components/CommunityTrustBanner.tsx — Stage 25 Independent Trust Axes & Clean Metadata Renderer */
import React from 'react';
import { Award, BadgeCheck, ShieldCheck } from 'lucide-react';
import { toPersianNum } from '../../../data/neighborhoods';
import type { CommunityTrustBadgeProfile } from '../types/community.types';

interface AuthorBadgesProps {
  profile: CommunityTrustBadgeProfile;
  onSelectUsername?: (username: string) => void;
}

export const CommunityAuthorBadges: React.FC<AuthorBadgesProps> = ({ profile, onSelectUsername }) => {
  const canClickProfile = Boolean(profile.username && onSelectUsername);
  return (
    <div className="flex flex-wrap items-center gap-x-2 gap-y-1 text-xs text-[var(--color-text-muted)]">
      {canClickProfile ? (
        <button
          type="button"
          onClick={() => onSelectUsername?.(profile.username!)}
          className="font-bold text-[var(--color-text-primary)] hover:text-[var(--color-brand-600)] dark:hover:text-emerald-400 underline-offset-4 hover:underline cursor-pointer"
        >
          {profile.displayNameFa}
        </button>
      ) : (
        <span className="font-bold text-[var(--color-text-primary)]">{profile.displayNameFa}</span>
      )}
      {profile.identityStatus === 'verified_phone' && (
        <>
          <span aria-hidden="true">·</span>
          <span className="inline-flex items-center gap-1 text-sky-700 dark:text-sky-300 font-medium">
            <BadgeCheck className="w-3.5 h-3.5 shrink-0" />
            <span>هویت تأییدشده</span>
          </span>
        </>
      )}
      <span aria-hidden="true">·</span>
      <span className="text-[var(--color-brand-700)] dark:text-emerald-300 font-medium tabular-nums">
        {profile.participationTierFa} ({toPersianNum(profile.participationScore)})
      </span>
      {profile.verifiedCredentialFa && (
        <>
          <span aria-hidden="true">·</span>
          <span className="inline-flex items-center gap-1 text-amber-800 dark:text-amber-300 font-semibold">
            <Award className="w-3.5 h-3.5 shrink-0" />
            <span>صلاحیت تخصصی: {profile.verifiedCredentialFa}</span>
          </span>
        </>
      )}
    </div>
  );
};

export const CommunityTrustBanner: React.FC = () => (
  <div
    data-testid="community-trust-separation-banner"
    className="p-3.5 rounded-[12px] bg-[var(--color-brand-soft)]/70 border border-[var(--color-border-subtle)] text-xs space-y-1"
  >
    <div className="font-bold text-[var(--color-brand-700)] dark:text-emerald-200 flex items-center gap-1.5">
      <ShieldCheck className="w-4 h-4 shrink-0" />
      <span>اصل تفکیک اعتماد و شفافیت در جامعه رادار تهران</span>
    </div>
    <p className="text-xs text-[var(--color-text-secondary)] leading-relaxed">
      <strong>«هویت تأییدشده»</strong>، <strong>«اعتبار مشارکت»</strong> و <strong>«صلاحیت تخصصی»</strong> کاملاً مستقل‌اند؛ امتیاز بالای مشارکت به‌معنای صلاحیت فنی یا حقوقی نیست.
    </p>
  </div>
);
