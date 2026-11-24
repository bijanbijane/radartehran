/** @file src/features/admin/components/AdminOperationsOverviewCard.tsx — Stage 23 Admin Operations Overview & Queues */
import React from 'react';
import { AlertTriangle, CheckCircle2, ClipboardCheck, ShieldCheck, Users } from 'lucide-react';
import { toPersianNum } from '../../../data/neighborhoods';
import type { AdminSectionId } from '../../../navigation/registry/route.types';
import { ADMIN_ROLE_DEFINITIONS, computeAdminQueueCounts } from '../services/adminGovernanceService';
import type { AdminGovernanceRole } from '../types/admin.types';

export interface AdminOperationsOverviewCardProps {
  isVerifiedAdmin: boolean;
  activeRole: AdminGovernanceRole;
  onChangeRole: (role: AdminGovernanceRole) => void;
  sponsorRequestsCount: number;
  liveBargainsCount: number;
  onJumpSection: (sec: AdminSectionId) => void;
}

export const AdminOperationsOverviewCard: React.FC<AdminOperationsOverviewCardProps> = (p) => {
  const counts = computeAdminQueueCounts({
    sponsorRequestsCount: p.sponsorRequestsCount,
    liveBargainsCount: p.liveBargainsCount,
  });
  const activeRoleMeta = ADMIN_ROLE_DEFINITIONS.find((r) => r.role === p.activeRole) || ADMIN_ROLE_DEFINITIONS[0];

  const queueCards: Array<{ label: string; count: number; target: AdminSectionId; urgent: boolean }> = [
    { label: 'آگهی‌های ثبت‌شده در صف بازبینی', count: counts.pendingUserListings, target: 'content', urgent: counts.pendingUserListings > 0 },
    { label: 'پرونده‌های احراز متخصصان خدمات', count: counts.pendingProviders, target: 'users', urgent: counts.pendingProviders > 0 },
    { label: 'شکایات و اختلافات باز خدمات', count: counts.openComplaints, target: 'users', urgent: counts.openComplaints > 0 },
    { label: 'گزارش‌های تخطی کاربران', count: counts.listingReports, target: 'content', urgent: counts.listingReports > 0 },
    { label: 'درخواست‌های حامی محله (CRM)', count: counts.pendingSponsorRequests, target: 'users', urgent: counts.pendingSponsorRequests > 0 },
    { label: 'فایل‌های شکار فعال نقشه', count: counts.liveBargainsCount, target: 'content', urgent: false },
  ];

  return (
    <div data-testid="admin-operations-overview-card" className="p-4 rounded-2xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 space-y-4 text-xs">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h2 className="text-sm font-bold text-slate-900 dark:text-white flex items-center gap-1.5">
            <ClipboardCheck className="w-4 h-4 text-[var(--color-brand-600)]" />
            <span>نمای کلی صف‌های عملیاتی و ماتریس نقش حاکمیتی</span>
          </h2>
          <p className="text-[11px] text-slate-500 mt-0.5">{activeRoleMeta.scopeSummaryFa}</p>
        </div>
        <div className="flex items-center gap-2">
          <label htmlFor="admin-role-preview-select" className="text-[11px] font-bold text-slate-500">نقش عملیاتی فعال:</label>
          <select
            id="admin-role-preview-select"
            value={p.activeRole}
            onChange={(e) => p.onChangeRole(e.target.value as AdminGovernanceRole)}
            className="px-2.5 py-1.5 rounded-xl bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 font-bold text-slate-800 dark:text-slate-100"
          >
            {ADMIN_ROLE_DEFINITIONS.map((r) => (
              <option key={r.role} value={r.role}>{r.labelFa}</option>
            ))}
          </select>
        </div>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-2.5">
        {queueCards.map((q) => (
          <button
            key={q.label}
            type="button"
            onClick={() => p.onJumpSection(q.target)}
            className={`p-3.5 rounded-xl border text-start transition cursor-pointer flex items-center justify-between gap-2 ${
              q.urgent
                ? 'bg-amber-50/70 dark:bg-amber-950/30 border-amber-200 dark:border-amber-800 hover:border-amber-400'
                : 'bg-slate-50 dark:bg-slate-800/70 border-slate-200 dark:border-slate-700 hover:border-emerald-500'
            }`}
          >
            <div className="min-w-0">
              <div className="font-bold text-slate-700 dark:text-slate-200 truncate">{q.label}</div>
              <div className="text-[10.5px] text-slate-500 mt-0.5">{q.urgent ? 'نیازمند بررسی ممیز' : 'صف پایدار'}</div>
            </div>
            <strong className="text-base font-bold text-slate-900 dark:text-white tabular-nums shrink-0">
              {toPersianNum(q.count)}
            </strong>
          </button>
        ))}
      </div>

      <div className="flex flex-wrap items-center justify-between gap-2 pt-2 border-t border-slate-100 dark:border-slate-800 text-[11px]">
        <span className="inline-flex items-center gap-1.5 font-bold text-slate-600 dark:text-slate-300">
          {p.isVerifiedAdmin ? (
            <>
              <CheckCircle2 className="w-3.5 h-3.5 text-[var(--color-brand-600)]" />
              <span>احراز هویت سرور (Firebase Admin Auth) برقرار است؛ تغییرات در لاگ ممیزی ثبت می‌شوند.</span>
            </>
          ) : (
            <>
              <AlertTriangle className="w-3.5 h-3.5 text-amber-600" />
              <span>حالت پیش‌نمایش قفل‌شده (Zero-Trust): برای اعمال تغییرات حاکمیتی، ورود مدیر الزامی است.</span>
            </>
          )}
        </span>
        <button
          type="button"
          onClick={() => p.onJumpSection('security')}
          className="text-emerald-700 dark:text-emerald-400 font-bold flex items-center gap-1 cursor-pointer"
        >
          <ShieldCheck className="w-3.5 h-3.5" />
          <span>مشاهده ماتریس RBAC و لاگ ممیزی</span>
        </button>
      </div>
    </div>
  );
};
