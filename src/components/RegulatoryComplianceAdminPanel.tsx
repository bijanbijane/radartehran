import React, { useState } from 'react';
import { Shield, Lock, Scale, FileCheck, AlertTriangle, Archive, CheckCircle2, XCircle } from 'lucide-react';
import { formatMillionTomanAsIntlCurrency } from '../utils/areaUnit';

export interface ComplianceAdminHoldSummary {
  id: string;
  title: string;
  jurisdiction: string;
  status: 'ACTIVE' | 'PENDING_APPROVAL' | 'UNDER_REVIEW' | 'RELEASED' | 'REVOKED';
  coveredScopeSummary: string;
  propagatedRecordCount: number;
  approvingAuthority: string;
  nextReviewDate: string;
  sensitiveDetailsRestricted?: boolean;
}

export interface RetentionDecisionRow {
  decisionId: string;
  recordId: string;
  sourceModule: string;
  outcome:
    | 'PRESERVE_LEGAL_HOLD'
    | 'PRESERVE_MANDATORY_RETENTION'
    | 'PRESERVE_CONTRACTUAL_OBLIGATION'
    | 'PRESERVE_INTERNAL_POLICY'
    | 'ELIGIBLE_FOR_DISPOSITION'
    | 'ANONYMIZATION_REVIEW_REQUIRED'
    | 'LEGAL_REVIEW_REQUIRED'
    | 'RETENTION_CONFIGURATION_MISSING';
  precedenceReason: string;
  approvingAuthority: string;
  mandatoryPreservationUntil: string | null;
}

export interface RegulatoryComplianceAdminPanelProps {
  canViewSensitiveHolds?: boolean;
  onClose?: () => void;
}

const INITIAL_HOLDS: ComplianceAdminHoldSummary[] = [
  {
    id: 'lhold_teh_901',
    title: 'نگهداری قانونی پرونده معاملاتی و اسناد رهنی منطقه ۱ تهران',
    jurisdiction: 'IR-TEHRAN',
    status: 'ACTIVE',
    coveredScopeSummary: 'معامله #TX-8821 + اسناد قرارداد (Employee 63) + دفتر کل مالی (Employee 54)',
    propagatedRecordCount: 6,
    approvingAuthority: 'معاونت حقوقی و تطبیق مقررات (Legal Counsel)',
    nextReviewDate: '2026-12-15',
    sensitiveDetailsRestricted: true,
  },
  {
    id: 'lhold_frd_404',
    title: 'نگهداری شواهد بررسی ریسک و تخلف آگهی‌های تکراری (Employee 71)',
    jurisdiction: 'IR-NATIONAL',
    status: 'UNDER_REVIEW',
    coveredScopeSummary: 'پرونده بازرسی #FRD-404 + گزارش‌های تطبیق آگهی',
    propagatedRecordCount: 4,
    approvingAuthority: 'کمیته نظارت و بازرسی پلتفرم',
    nextReviewDate: '2026-11-25',
    sensitiveDetailsRestricted: true,
  },
];

const INITIAL_DECISIONS: RetentionDecisionRow[] = [
  { decisionId: 'rdec_01', recordId: 'rec_contract_8821', sourceModule: 'employee-63-documents', outcome: 'PRESERVE_LEGAL_HOLD', precedenceReason: 'رتبه ۱ تقدم: دستور نگهداری قانونی فعال (lhold_teh_901) بر درخواست حذف تقدم دارد', approvingAuthority: 'معاونت حقوقی و تطبیق مقررات', mandatoryPreservationUntil: null },
  { decisionId: 'rdec_02', recordId: 'rec_ledger_8821', sourceModule: 'employee-54-financial-ledger', outcome: 'PRESERVE_MANDATORY_RETENTION', precedenceReason: 'رتبه ۲ تقدم: الزام قانونی نگهداری اسناد مالیاتی و تسویه به مدت ۱۰ سال', approvingAuthority: 'سازمان امور مالیاتی / سیاست مصوب RET-FIN-10Y', mandatoryPreservationUntil: '2036-03-20' },
  { decisionId: 'rdec_03', recordId: 'rec_DraftPrefs_192', sourceModule: 'employee-64-privacy', outcome: 'ELIGIBLE_FOR_DISPOSITION', precedenceReason: 'رتبه ۶ تقدم: عدم وجود نگهداری قانونی یا الزام قانونی؛ واجد شرایط حذف در درخواست حریم خصوصی', approvingAuthority: 'موتور تقدم نگهداری RPE-2.1.0', mandatoryPreservationUntil: null },
];

type TabKey = 'OVERVIEW' | 'OBLIGATIONS_AND_CONTROLS' | 'LEGAL_HOLDS_AND_PROPAGATION' | 'RETENTION_AND_PRECEDENCE' | 'CONFLICTS_AND_DISPOSITION' | 'AUDIT_TRAIL';

export const RegulatoryComplianceAdminPanel: React.FC<RegulatoryComplianceAdminPanelProps> = ({
  canViewSensitiveHolds = true,
  onClose,
}) => {
  const [activeTab, setActiveTab] = useState<TabKey>('LEGAL_HOLDS_AND_PROPAGATION');
  const [holds] = useState<ComplianceAdminHoldSummary[]>(INITIAL_HOLDS);
  const [decisions] = useState<RetentionDecisionRow[]>(INITIAL_DECISIONS);

  return (
    <div dir="rtl" className="bg-slate-950 text-slate-100 border border-slate-800 rounded-lg p-5 space-y-5 font-sans">
      <div className="flex flex-wrap items-center justify-between gap-4 border-b border-slate-800 pb-4">
        <div className="flex items-center gap-3">
          <Scale className="w-6 h-6 text-amber-400" />
          <div>
            <h2 className="text-lg font-bold text-white">
              مرکز حاکمیت، تطبیق مقررات، نگهداری قانونی (Legal Hold) و تقدم نگهداری داده‌ها
            </h2>
            <p className="text-xs text-slate-400">
              مدیریت متمرکز الزامات قانونی، کنترل‌ها، شواهد، دستورات نگهداری قانونی و موتور ۶ سطحی تقدم نگهداری و امحا
            </p>
          </div>
        </div>
        {onClose && (
          <button
            type="button"
            onClick={onClose}
            className="px-3 py-1.5 text-xs font-medium bg-slate-800 hover:bg-slate-700 text-slate-200 rounded border border-slate-700"
          >
            بستن پنل
          </button>
        )}
      </div>

      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        {[
          { label: 'الزامات قانونی فعال', value: '19 / 19', sub: 'منابع رسمی تاییدشده', color: 'text-emerald-400' },
          { label: 'دستورات نگهداری قانونی فعال', value: String(holds.length), sub: `سقف ارزش پرونده: ${formatMillionTomanAsIntlCurrency(25_000, 'IRT')}`, color: 'text-amber-400' },
          { label: 'تعارضات حقوقی در صف بررسی', value: '1', sub: 'مسدودسازی خودکار حذف تا تعیین تکلیف', color: 'text-rose-400' },
          { label: 'درخواست‌های حذف جزئی (Employee 64)', value: 'تفکیک‌شده', sub: 'حفظ فقط رکوردهای مشمول الزام قانونی', color: 'text-sky-400' },
        ].map((kpi) => (
          <div key={kpi.label} className="bg-slate-900 border border-slate-800 p-3 rounded">
            <div className="text-xs text-slate-400">{kpi.label}</div>
            <div className={`text-xl font-bold font-mono mt-1 ${kpi.color}`}>{kpi.value}</div>
            <div className="text-[11px] text-slate-500 mt-0.5">{kpi.sub}</div>
          </div>
        ))}
      </div>

      <div className="flex flex-wrap gap-2 border-b border-slate-800 pb-3 text-xs">
        {[
          { key: 'LEGAL_HOLDS_AND_PROPAGATION', label: 'نگهداری قانونی و انتشار دامنه (Legal Holds)' },
          { key: 'RETENTION_AND_PRECEDENCE', label: 'سیاست‌ها و تصمیم‌گیرنده تقدم نگهداری' },
          { key: 'CONFLICTS_AND_DISPOSITION', label: 'صف تعارضات حذف و مجوز امحا' },
          { key: 'OBLIGATIONS_AND_CONTROLS', label: 'الزامات، کنترل‌ها و شواهد تطبیق' },
          { key: 'AUDIT_TRAIL', label: 'تاریخچه ممیزی تغییرناپذیر' },
        ].map((tab) => (
          <button
            key={tab.key}
            type="button"
            onClick={() => setActiveTab(tab.key as TabKey)}
            className={`px-3 py-1.5 rounded border transition-colors ${
              activeTab === tab.key
                ? 'bg-amber-500/20 border-amber-500/50 text-amber-300 font-semibold'
                : 'bg-slate-900 border-slate-800 text-slate-400 hover:text-slate-200'
            }`}
          >
            {tab.label}
          </button>
        ))}
      </div>

      {activeTab === 'LEGAL_HOLDS_AND_PROPAGATION' && (
        <div className="space-y-3">
          <div className="flex items-center justify-between">
            <h3 className="text-sm font-semibold text-slate-200 flex items-center gap-2">
              <Lock className="w-4 h-4 text-amber-400" />
              فهرست دستورات نگهداری قانونی (Legal Hold Registry) و وضعیت انتشار دامنه
            </h3>
            <span className="text-xs text-slate-400">
              آزادسازی یک دستور نگهداری هرگز سایر دستورات فعال یا الزامات قانونی مستقل را لغو نمی‌کند
            </span>
          </div>
          <div className="overflow-x-auto border border-slate-800 rounded">
            <table className="w-full text-right text-xs">
              <thead className="bg-slate-900 text-slate-300 border-b border-slate-800">
                <tr>
                  <th className="p-2.5">شناسه</th>
                  <th className="p-2.5">عنوان و دامنه تحت پوشش</th>
                  <th className="p-2.5">حوزه قضایی</th>
                  <th className="p-2.5">وضعیت</th>
                  <th className="p-2.5">رکوردهای منتشرشده</th>
                  <th className="p-2.5">مرجع تصویب‌کننده</th>
                  <th className="p-2.5">موعد بازبینی بعدی</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-800">
                {holds.map((h) => (
                  <tr key={h.id} className="bg-slate-950/60">
                    <td className="p-2.5 font-mono text-amber-300">{h.id}</td>
                    <td className="p-2.5">
                      <div className="font-medium text-slate-100">
                        {canViewSensitiveHolds || !h.sensitiveDetailsRestricted
                          ? h.title
                          : 'دستور نگهداری قانونی حفاظت‌شده (نیازمند مجوز حقوقی)'}
                      </div>
                      <div className="text-slate-400 mt-0.5">{h.coveredScopeSummary}</div>
                    </td>
                    <td className="p-2.5 font-mono text-slate-300">{h.jurisdiction}</td>
                    <td className="p-2.5">
                      <span className="px-2 py-0.5 bg-amber-500/15 text-amber-300 border border-amber-500/30 rounded">
                        {h.status}
                      </span>
                    </td>
                    <td className="p-2.5 font-mono text-emerald-400">{h.propagatedRecordCount} رکورد مرتبط</td>
                    <td className="p-2.5 text-slate-300">{h.approvingAuthority}</td>
                    <td className="p-2.5 font-mono text-slate-400">{h.nextReviewDate}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {activeTab === 'RETENTION_AND_PRECEDENCE' && (
        <div className="space-y-3">
          <h3 className="text-sm font-semibold text-slate-200 flex items-center gap-2">
            <Archive className="w-4 h-4 text-sky-400" />
            مشاهده‌گر تصمیمات موتور تقدم نگهداری (Retention Precedence Decision Viewer)
          </h3>
          <div className="overflow-x-auto border border-slate-800 rounded">
            <table className="w-full text-right text-xs">
              <thead className="bg-slate-900 text-slate-300 border-b border-slate-800">
                <tr>
                  <th className="p-2.5">رکورد هدف</th>
                  <th className="p-2.5">ماژول منبع</th>
                  <th className="p-2.5">نتیجه تصمیم تقدم</th>
                  <th className="p-2.5">علت تقدم و سیاست حاکم</th>
                  <th className="p-2.5">مرجع تصویب</th>
                  <th className="p-2.5">نگهداری اجباری تا</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-800">
                {decisions.map((d) => (
                  <tr key={d.decisionId} className="bg-slate-950/60">
                    <td className="p-2.5 font-mono text-slate-200">{d.recordId}</td>
                    <td className="p-2.5 font-mono text-slate-400">{d.sourceModule}</td>
                    <td className="p-2.5 font-mono">
                      {d.outcome === 'ELIGIBLE_FOR_DISPOSITION' ? (
                        <span className="text-emerald-400 flex items-center gap-1">
                          <CheckCircle2 className="w-3.5 h-3.5" /> {d.outcome}
                        </span>
                      ) : (
                        <span className="text-amber-300 flex items-center gap-1">
                          <Shield className="w-3.5 h-3.5" /> {d.outcome}
                        </span>
                      )}
                    </td>
                    <td className="p-2.5 text-slate-200">{d.precedenceReason}</td>
                    <td className="p-2.5 text-slate-300">{d.approvingAuthority}</td>
                    <td className="p-2.5 font-mono text-slate-400">{d.mandatoryPreservationUntil ?? 'تا رفع دستور'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {activeTab === 'CONFLICTS_AND_DISPOSITION' && (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4 text-xs">
          <div className="bg-slate-900/90 border border-rose-500/30 rounded p-4 space-y-2">
            <div className="flex items-center gap-2 text-rose-300 font-semibold">
              <AlertTriangle className="w-4 h-4" />
              صف تعارضات حذف و دستورات متناقض (Deletion Conflict Queue)
            </div>
            <p className="text-slate-300 leading-relaxed">
              تعارض شناسایی‌شده روی رکورد <span className="font-mono text-white">rec_conflict_77</span>: دستور نگهداری
              قانونی فعال در برابر دستور حذف بیرونی. سیستم هرگز تعارضات حقوقی را صرفاً با ترتیب زمانی (Timestamp) حل
              نمی‌کند؛ عملیات امحا مسدود و پرونده بررسی حقوقی <span className="font-mono">EMP66-CONFLICT</span> ایجاد شد.
            </p>
          </div>
          <div className="bg-slate-900/90 border border-slate-800 rounded p-4 space-y-2">
            <div className="flex items-center gap-2 text-emerald-300 font-semibold">
              <FileCheck className="w-4 h-4" />
              کنترل متمرکز امحا و حذف (Disposition Approval Queue)
            </div>
            <p className="text-slate-300 leading-relaxed">
              هرگونه حذف، ناشناس‌سازی یا آرشیو نیازمند ارزیابی مجدد لحظه‌ای، نبود Legal Hold، نبود الزام قانونی فعال،
              تایید قابلیت ماژول منبع و مجوز <span className="font-mono">compliance.disposition.approve</span> است.
            </p>
          </div>
        </div>
      )}

      {(activeTab === 'OBLIGATIONS_AND_CONTROLS' || activeTab === 'AUDIT_TRAIL') && (
        <div className="bg-slate-900/70 border border-slate-800 rounded p-4 text-xs text-slate-300 space-y-2">
          <div className="flex items-center gap-2 font-semibold text-white">
            <XCircle className="w-4 h-4 text-amber-400" />
            تضمین‌های تغییرناپذیری و ممیزی (Immutable Governance & Audit Guarantees)
          </div>
          <p>
            تمامی تصمیمات تطبیق، نسخه‌های الزامات قانونی، استثنائات (با تفکیک وظایف)، دستورات نگهداری قانونی، انتشار
            دامنه و ارزیابی‌های تقدم نگهداری با شناسه همبستگی (Correlation ID)، وضعیت قبلی و وضعیت جدید ثبت شده و توسط
            مدیران عادی قابل ویرایش یا حذف نیستند.
          </p>
        </div>
      )}
    </div>
  );
};
