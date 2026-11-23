/** @file src/features/admin/components/AdminDataAndModelCenter.tsx — Data Governance, Hedonic Model Registry, Search Governance & Analytics Pipelines */
import React from 'react';
import { Cpu, Database, Layers, ShieldCheck } from 'lucide-react';
import { toPersianNum, type Neighborhood } from '../../../data/neighborhoods';
import { FAST_SALE_FACTOR } from '../../../data/hedonicPricingEngine';
import type { AdminGovernanceRole } from '../types/admin.types';
import { assertAdminGovernancePermission } from '../services/adminGovernanceService';
import { AdminDataGovernanceWorkspace } from '../../data-governance/components/AdminDataGovernanceWorkspace';
import { AdminSearchControlPanel } from '../../search/components/AdminSearchControlPanel';

export interface AdminDataAndModelCenterProps {
  neighborhoods: Neighborhood[];
  activeCity: string;
  isVerifiedAdmin: boolean;
  activeRole: AdminGovernanceRole;
}

export const AdminDataAndModelCenter: React.FC<AdminDataAndModelCenterProps> = ({
  neighborhoods,
  activeCity,
  isVerifiedAdmin,
  activeRole,
}) => {
  const canEditData = assertAdminGovernancePermission({
    isVerifiedAdmin,
    role: activeRole,
    permission: 'admin:edit_market_data',
  });

  const avgBuy =
    neighborhoods.length > 0
      ? Math.round(neighborhoods.reduce((acc, n) => acc + n.buyPerSqm, 0) / neighborhoods.length)
      : 0;

  return (
    <div data-testid="admin-data-model-center" className="p-4 rounded-2xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 space-y-4 text-xs">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <strong className="text-sm font-black text-slate-900 dark:text-white flex items-center gap-1.5">
          <Cpu className="w-4 h-4 text-[var(--color-brand-600)]" />
          <span>حاکمیت داده، رجیستری مدل ارزش‌گذاری، شاخص‌های رسمی و کنترل جست‌وجو</span>
        </strong>
        <span className={`px-2.5 py-0.5 rounded-lg font-bold text-[11px] ${canEditData.allowed ? 'bg-emerald-50 text-emerald-700' : 'bg-amber-50 text-amber-700'}`}>
          {canEditData.allowed ? 'مجوز انتشار نرخ مرجع فعال' : 'فقط مشاهده (تغییر نرخ نیازمند مجوز)'}
        </span>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
        <div className="p-3.5 rounded-xl bg-slate-50 dark:bg-slate-800/70 border border-slate-200 dark:border-slate-700 space-y-1">
          <div className="text-[11px] text-slate-500 flex items-center gap-1"><Database className="w-3.5 h-3.5 text-[var(--color-brand-600)]" /> نسخه مدل هدونیک فعال</div>
          <strong className="text-sm font-black text-slate-900 dark:text-white block">Hedonic Rule Heuristic v1405.1</strong>
          <div className="text-[11px] text-slate-500 tabular-nums">ضریب فروش فوری: {toPersianNum(FAST_SALE_FACTOR)} · منبع: سناریو محاسباتی (غیرثبتی)</div>
        </div>
        <div className="p-3.5 rounded-xl bg-slate-50 dark:bg-slate-800/70 border border-slate-200 dark:border-slate-700 space-y-1">
          <div className="text-[11px] text-slate-500 flex items-center gap-1"><Layers className="w-3.5 h-3.5 text-[var(--color-brand-600)]" /> پوشش جغرافیایی شهر فعال ({activeCity})</div>
          <strong className="text-sm font-black text-slate-900 dark:text-white block tabular-nums">{toPersianNum(neighborhoods.length)} محله پایش‌شده</strong>
          <div className="text-[11px] text-slate-500 tabular-nums">میانگین پایه اعلامی: {toPersianNum(avgBuy)} م.ت / متر</div>
        </div>
        <div className="p-3.5 rounded-xl bg-slate-50 dark:bg-slate-800/70 border border-slate-200 dark:border-slate-700 space-y-1">
          <div className="text-[11px] text-slate-500 flex items-center gap-1"><ShieldCheck className="w-3.5 h-3.5 text-[var(--color-brand-600)]" /> انضباط تفکیک نوع داده</div>
          <strong className="text-sm font-black text-slate-900 dark:text-white block">پیشنهادی ≠ معامله‌شده ≠ برآوردی</strong>
          <div className="text-[11px] text-slate-500">هیچ خروجی برآوردی به‌عنوان ثبت رسمی معامله نمایش داده نمی‌شود.</div>
        </div>
      </div>

      <AdminDataGovernanceWorkspace />
      <AdminSearchControlPanel />
    </div>
  );
};
