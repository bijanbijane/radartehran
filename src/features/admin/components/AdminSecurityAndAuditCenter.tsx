/** @file src/features/admin/components/AdminSecurityAndAuditCenter.tsx — RBAC Matrix, Filterable Audit Log & Two-Step Sensitive Ops */
import React, { useState } from 'react';
import { AlertOctagon, CheckCircle2, FileSearch, Lock } from 'lucide-react';
import { clearDiagnosticEvents } from '../../../utils/security';
import {
  ADMIN_ROLE_DEFINITIONS,
  SENSITIVE_OPERATIONS_CATALOG,
  appendAdminAuditLog,
  loadAdminAuditLogs,
  validateSensitiveActionConfirmation,
} from '../services/adminGovernanceService';
import type { AdminAuditLogEntry, AdminGovernanceRole, SensitiveOperationSpec } from '../types/admin.types';

export interface AdminSecurityAndAuditCenterProps {
  section: 'operations' | 'security';
  isVerifiedAdmin: boolean;
  activeRole: AdminGovernanceRole;
}

export const AdminSecurityAndAuditCenter: React.FC<AdminSecurityAndAuditCenterProps> = ({
  section,
  isVerifiedAdmin,
  activeRole,
}) => {
  const [auditLogs, setAuditLogs] = useState<AdminAuditLogEntry[]>(() => loadAdminAuditLogs());
  const [severityFilter, setSeverityFilter] = useState<'all' | 'info' | 'warning' | 'critical'>('all');
  const [selectedOp, setSelectedOp] = useState<SensitiveOperationSpec | null>(null);
  const [reasonFa, setReasonFa] = useState('');
  const [typedConfirm, setTypedConfirm] = useState('');
  const [opFeedback, setOpFeedback] = useState<{ ok: boolean; msg: string } | null>(null);

  const visibleLogs = severityFilter === 'all' ? auditLogs : auditLogs.filter((l) => l.severity === severityFilter);

  const executeSensitiveOp = () => {
    if (!selectedOp) return;
    const check = validateSensitiveActionConfirmation({
      isVerifiedAdmin,
      role: activeRole,
      reasonFa,
      typedConfirm,
      expectedPhrase: selectedOp.confirmationPhrase,
    });
    if (!check.ok) {
      setOpFeedback({ ok: false, msg: check.errorFa || 'تأیید نامعتبر است.' });
      return;
    }

    if (selectedOp.opId === 'reset_local_diagnostics') {
      clearDiagnosticEvents();
    } else if (selectedOp.opId === 'purge_resolved_reports' && typeof window !== 'undefined') {
      window.localStorage.removeItem('radar_listing_reports_v1');
    }

    const updatedLogs = appendAdminAuditLog({
      actorRole: activeRole,
      actorLabelFa: ADMIN_ROLE_DEFINITIONS.find((r) => r.role === activeRole)?.labelFa || activeRole,
      actionCode: `SENSITIVE_${selectedOp.opId.toUpperCase()}`,
      targetType: 'security_op',
      targetId: selectedOp.opId,
      reasonFa,
      severity: 'critical',
    });
    setAuditLogs(updatedLogs);
    setOpFeedback({ ok: true, msg: `عملیات حساس «${selectedOp.titleFa}» اجرا و در لاگ ممیزی ثبت شد.` });
    setSelectedOp(null);
    setReasonFa('');
    setTypedConfirm('');
  };

  return (
    <div data-testid="admin-security-audit-center" className="space-y-4 text-xs">
      {/* Two-Step Sensitive Operation Execution Card */}
      <div className="p-4 rounded-2xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 space-y-3">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <strong className="text-sm font-bold text-slate-900 dark:text-white flex items-center gap-1.5">
            <AlertOctagon className="w-4 h-4 text-rose-600" />
            <span>عملیات حساس حاکمیتی (نیازمند تأیید دومرحله‌ای + ثبت دلیل)</span>
          </strong>
          <span className="text-[11px] text-slate-500">بخش فعال: {section === 'operations' ? 'عملیات' : 'امنیت و ممیزی'}</span>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-2.5">
          {SENSITIVE_OPERATIONS_CATALOG.map((op) => (
            <div key={op.opId} className="p-3 rounded-xl bg-slate-50 dark:bg-slate-800/70 border border-slate-200 dark:border-slate-700 flex items-center justify-between gap-2">
              <div>
                <div className="font-bold text-slate-900 dark:text-white">{op.titleFa}</div>
                <div className="text-[10.5px] text-slate-500 mt-0.5">{op.impactFa}</div>
              </div>
              <button
                type="button"
                onClick={() => { setSelectedOp(op); setOpFeedback(null); }}
                className="px-3 py-1.5 rounded-lg bg-rose-50 dark:bg-rose-950/60 text-rose-700 dark:text-rose-300 border border-rose-200 dark:border-rose-800 font-bold shrink-0 cursor-pointer"
              >
                اجرا با تأیید
              </button>
            </div>
          ))}
        </div>

        {selectedOp && (
          <div data-testid="admin-sensitive-confirm-dialog" className="p-4 rounded-xl bg-rose-50/70 dark:bg-rose-950/30 border border-rose-200 dark:border-rose-800 space-y-2.5">
            <div className="font-bold text-rose-900 dark:text-rose-200">تأیید دومرحله‌ای: {selectedOp.titleFa}</div>
            <input
              type="text"
              value={reasonFa}
              onChange={(e) => setReasonFa(e.target.value)}
              placeholder="دلیل دقیق اجرایی (حداقل ۸ کاراکتر)..."
              className="w-full p-2 rounded-lg bg-white dark:bg-slate-900 border border-rose-200 dark:border-rose-800"
            />
            <div className="flex flex-wrap items-center gap-2">
              <input
                type="text"
                value={typedConfirm}
                onChange={(e) => setTypedConfirm(e.target.value)}
                placeholder="عبارت CONFIRM را تایپ کنید"
                className="flex-1 min-w-[180px] p-2 rounded-lg bg-white dark:bg-slate-900 border border-rose-200 dark:border-rose-800 font-mono"
              />
              <button type="button" onClick={executeSensitiveOp} className="px-3.5 py-2 rounded-lg bg-rose-600 text-white font-bold cursor-pointer">
                تأیید و ثبت در Audit Log
              </button>
              <button type="button" onClick={() => setSelectedOp(null)} className="px-3 py-2 rounded-lg bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 font-bold cursor-pointer">
                انصراف
              </button>
            </div>
          </div>
        )}

        {opFeedback && (
          <div className={`p-2.5 rounded-xl font-bold flex items-center gap-1.5 ${opFeedback.ok ? 'bg-emerald-50 text-emerald-800' : 'bg-amber-50 text-amber-800'}`}>
            <CheckCircle2 className="w-4 h-4 shrink-0" />
            <span>{opFeedback.msg}</span>
          </div>
        )}
      </div>

      {/* RBAC Matrix + Audit Log Viewer */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-4">
        <div className="lg:col-span-5 p-4 rounded-2xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 space-y-2.5">
          <strong className="text-sm font-bold text-slate-900 dark:text-white flex items-center gap-1.5">
            <Lock className="w-4 h-4 text-[var(--color-brand-600)]" />
            <span>ماتریس تفکیک مجوزهای نقش (RBAC)</span>
          </strong>
          <div className="space-y-2">
            {ADMIN_ROLE_DEFINITIONS.map((roleDef) => (
              <div key={roleDef.role} className={`p-2.5 rounded-xl border ${roleDef.role === activeRole ? 'border-emerald-600 bg-emerald-50/40 dark:bg-emerald-950/20' : 'border-slate-200 dark:border-slate-800'}`}>
                <div className="flex items-center justify-between gap-2">
                  <span className="font-bold text-slate-900 dark:text-white">{roleDef.labelFa}</span>
                  <span className="text-[10px] px-1.5 py-0.5 rounded bg-slate-100 dark:bg-slate-800 font-bold">
                    {roleDef.canMutateData ? 'مشاهده + اقدام مجاز' : 'فقط مشاهده (Read-Only)'}
                  </span>
                </div>
                <div className="text-[10.5px] text-slate-500 mt-1">{roleDef.scopeSummaryFa}</div>
              </div>
            ))}
          </div>
        </div>

        <div className="lg:col-span-7 p-4 rounded-2xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 space-y-2.5">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <strong className="text-sm font-bold text-slate-900 dark:text-white flex items-center gap-1.5">
              <FileSearch className="w-4 h-4 text-[var(--color-brand-600)]" />
              <span>گزارش ممیزی اقدامات حاکمیتی ({visibleLogs.length})</span>
            </strong>
            <select
              aria-label="فیلتر سطح لاگ ممیزی"
              value={severityFilter}
              onChange={(e) => setSeverityFilter(e.target.value as 'all' | 'info' | 'warning' | 'critical')}
              className="px-2.5 py-1 rounded-lg bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 font-bold"
            >
              <option value="all">همه سطوح</option>
              <option value="info">عادی (Info)</option>
              <option value="warning">هشدار (Warning)</option>
              <option value="critical">حساس (Critical)</option>
            </select>
          </div>
          {visibleLogs.length === 0 ? (
            <p className="text-slate-500 py-4 text-center">هنوز اقدام ممیزی حاکمیتی در این نشست ثبت نشده است.</p>
          ) : (
            <div className="max-h-72 overflow-y-auto divide-y divide-slate-100 dark:divide-slate-800">
              {visibleLogs.map((log) => (
                <div key={log.id} className="py-2 flex items-start justify-between gap-2">
                  <div>
                    <div className="font-bold text-slate-900 dark:text-white">
                      {log.actionCode} · <span className="text-emerald-700 dark:text-emerald-400">{log.targetId}</span>
                    </div>
                    <div className="text-[11px] text-slate-500">{log.actorLabelFa} · دلیل: {log.reasonFa}</div>
                  </div>
                  <span className="text-[10px] px-1.5 py-0.5 rounded bg-slate-100 dark:bg-slate-800 font-mono shrink-0">{log.severity}</span>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
};
