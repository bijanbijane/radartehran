import React from 'react';
import { ImpersonationSession } from './impersonationState';

export interface ImpersonationBannerProps {
  session: ImpersonationSession | null;
  onExitImpersonation: () => void;
}

export const ImpersonationBanner: React.FC<ImpersonationBannerProps> = ({
  session,
  onExitImpersonation,
}) => {
  if (!session) return null;

  return (
    <div
      role="status"
      aria-live="polite"
      data-testid="impersonation-banner"
      className="w-full bg-amber-950/95 border-b border-amber-500/40 text-amber-100 px-4 py-2 flex items-center justify-between text-xs z-50"
    >
      <div className="flex items-center gap-2">
        <span className="font-bold text-amber-400">حالت پشتیبانی (Impersonation):</span>
        <span>
          در حال مشاهده نمای کاربر <strong>{session.targetUserDisplayName}</strong> ({session.targetRole}) توسط اپراتور{' '}
          <span className="font-mono">{session.operatorEmail}</span>
        </span>
        <span className="text-amber-300/80 hidden sm:inline">
          — عملیات مالی و تغییر اطلاعات امنیتی مسدود است.
        </span>
      </div>
      <button
        type="button"
        onClick={onExitImpersonation}
        className="px-2.5 py-1 rounded bg-amber-500 text-slate-950 font-semibold hover:bg-amber-400 transition-colors"
      >
        خروج از نمای کاربر
      </button>
    </div>
  );
};
