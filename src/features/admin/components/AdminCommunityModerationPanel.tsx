/** @file src/features/admin/components/AdminCommunityModerationPanel.tsx — Stage 25 Community Governance, Canonical Data Apply & Appeals Queue */
import React, { useState } from 'react';
import { CheckCircle2, Database, Lock, Scale, ShieldAlert, XCircle } from 'lucide-react';
import { toPersianNum } from '../../../data/neighborhoods';
import {
  loadCommunityAbuseReports,
  loadDataCorrectionProposals,
  moderateDataCorrectionProposal,
} from '../../community/services/communityTrustService';
import {
  loadModerationAppeals,
  recordModerationAction,
  resolveAbuseReportWorkflow,
  resolveModerationAppeal,
} from '../../community/services/communityEngagementService';
import { ABUSE_REASON_LABELS_FA } from '../../community/types/community.types';
import { appendAdminAuditLog } from '../services/adminGovernanceService';
import type { AdminGovernanceRole } from '../types/admin.types';

interface Props {
  isVerifiedAdmin: boolean;
  activeRole: AdminGovernanceRole;
  canModerate: boolean;
  moderatorNoteFa: string;
  onFeedback: (msg: string) => void;
}

export const AdminCommunityModerationPanel: React.FC<Props> = ({
  canModerate,
  moderatorNoteFa,
  activeRole,
  onFeedback,
}) => {
  const [corrections, setCorrections] = useState(() => loadDataCorrectionProposals());
  const [abuseReports, setAbuseReports] = useState(() => loadCommunityAbuseReports());
  const [appeals, setAppeals] = useState(() => loadModerationAppeals());

  const handleDataDecision = (id: string, titleFa: string, status: 'approved' | 'applied' | 'rejected') => {
    if (!canModerate) { onFeedback('نقش فعلی مجوز ممیزی داده را ندارد.'); return; }
    setCorrections(moderateDataCorrectionProposal({ proposalId: id, status, moderatorNoteFa }));
    const actionType = status === 'approved' ? 'approve_data' : status === 'applied' ? 'apply_data_version' : 'reject_data';
    recordModerationAction({ targetType: 'data_correction', targetId: id, actionType, reasonFa: moderatorNoteFa, actorRole: activeRole });
    appendAdminAuditLog({
      actorRole: activeRole,
      actorLabelFa: 'ممیز داده‌های جامعه',
      actionCode: status === 'applied' ? 'COMMUNITY_DATA_APPLIED' : status === 'approved' ? 'COMMUNITY_CORRECTION_APPROVED' : 'COMMUNITY_CORRECTION_REJECTED',
      targetType: 'listing',
      targetId: id,
      reasonFa: moderatorNoteFa,
      severity: status === 'rejected' ? 'warning' : 'info',
    });
    onFeedback(
      status === 'applied'
        ? `اصلاح داده «${titleFa}» در نسخه داده پایه اعمال شد.`
        : status === 'approved'
          ? `اصلاح داده «${titleFa}» تأیید شد (آماده اعمال در داده پایه).`
          : `اصلاح داده «${titleFa}» رد شد.`,
    );
  };

  return (
    <div className="pt-3 border-t border-slate-100 dark:border-slate-800 space-y-3 text-xs" data-testid="admin-community-moderation-queue">
      <strong className="font-black text-slate-800 dark:text-slate-100 block">
        پیشنهادهای اصلاح داده محله ({toPersianNum(corrections.length)})
      </strong>
      {corrections.slice(0, 5).map((c) => (
        <div key={c.id} className="p-2.5 rounded-xl bg-slate-50 dark:bg-slate-800/70 border border-slate-200 dark:border-slate-700 flex flex-wrap items-center justify-between gap-2">
          <div className="min-w-0">
            <div className="font-bold text-slate-900 dark:text-white truncate">{c.titleFa} · محله {c.neighborhoodNameFa}</div>
            <div className="text-[10.5px] text-slate-500">
              وضعیت: <strong>{c.status}</strong> · {c.suggestedValueFa}
              {c.appliedDataVersionId ? ` · نسخه: ${c.appliedDataVersionId}` : ''}
            </div>
          </div>
          <div className="flex flex-wrap items-center gap-1.5">
            <button type="button" onClick={() => handleDataDecision(c.id, c.titleFa, 'approved')} className="px-2 py-1 rounded-lg bg-emerald-600 text-white font-bold flex items-center gap-1 cursor-pointer">
              <CheckCircle2 className="w-3.5 h-3.5" /><span>تأیید ممیز</span>
            </button>
            <button type="button" onClick={() => handleDataDecision(c.id, c.titleFa, 'applied')} className="px-2 py-1 rounded-lg bg-sky-700 text-white font-bold flex items-center gap-1 cursor-pointer">
              <Database className="w-3.5 h-3.5" /><span>اعمال در داده پایه</span>
            </button>
            <button type="button" onClick={() => handleDataDecision(c.id, c.titleFa, 'rejected')} className="px-2 py-1 rounded-lg border border-rose-600 text-rose-700 font-bold flex items-center gap-1 cursor-pointer">
              <XCircle className="w-3.5 h-3.5" /><span>رد</span>
            </button>
          </div>
        </div>
      ))}

      {abuseReports.length > 0 && (
        <div className="space-y-1.5 pt-2">
          <span className="text-[11px] font-bold text-rose-700 dark:text-rose-400 flex items-center gap-1">
            <ShieldAlert className="w-3.5 h-3.5" /> گزارش‌های تخلف ۱۰گانه جامعه ({toPersianNum(abuseReports.length)})
          </span>
          {abuseReports.slice(0, 4).map((rep) => (
            <div key={rep.id} className="p-2 rounded-xl border border-rose-200 dark:border-rose-900 flex flex-wrap items-center justify-between gap-2">
              <span className="truncate">
                مطلب {rep.targetId} · {ABUSE_REASON_LABELS_FA[rep.reason] || rep.reason} ({rep.status})
              </span>
              <div className="flex items-center gap-1.5">
                <button
                  type="button"
                  onClick={() => {
                    if (!canModerate) return;
                    recordModerationAction({ targetType: rep.targetType, targetId: rep.targetId, actionType: 'hide', reasonFa: moderatorNoteFa, actorRole: activeRole });
                    setAbuseReports(resolveAbuseReportWorkflow(rep.id, 'decision_made', moderatorNoteFa));
                    appendAdminAuditLog({ actorRole: activeRole, actorLabelFa: 'ناظر جامعه', actionCode: 'COMMUNITY_POST_HIDDEN', targetType: 'listing', targetId: rep.targetId, reasonFa: moderatorNoteFa, severity: 'warning' });
                    onFeedback(`محتوای ${rep.targetId} پنهان و گزارش ثبت شد.`);
                  }}
                  className="px-2 py-0.5 rounded bg-rose-600 text-white font-bold cursor-pointer"
                >
                  پنهان‌سازی
                </button>
                <button
                  type="button"
                  onClick={() => {
                    if (!canModerate) return;
                    recordModerationAction({ targetType: rep.targetType, targetId: rep.targetId, actionType: 'lock', reasonFa: moderatorNoteFa, actorRole: activeRole });
                    setAbuseReports(resolveAbuseReportWorkflow(rep.id, 'decision_made', moderatorNoteFa));
                    onFeedback(`موضوع ${rep.targetId} قفل شد.`);
                  }}
                  className="px-2 py-0.5 rounded bg-amber-600 text-white font-bold inline-flex items-center gap-1 cursor-pointer"
                >
                  <Lock className="w-3 h-3" /><span>قفل</span>
                </button>
                <button
                  type="button"
                  onClick={() => {
                    if (!canModerate) return;
                    setAbuseReports(resolveAbuseReportWorkflow(rep.id, 'dismissed', moderatorNoteFa));
                    onFeedback('گزارش تخلف رد و مختومه شد.');
                  }}
                  className="px-2 py-0.5 rounded border border-slate-300 dark:border-slate-700 font-bold cursor-pointer"
                >
                  رد گزارش
                </button>
              </div>
            </div>
          ))}
        </div>
      )}

      {appeals.length > 0 && (
        <div className="space-y-1.5 pt-2">
          <span className="text-[11px] font-bold text-sky-700 dark:text-sky-400 flex items-center gap-1">
            <Scale className="w-3.5 h-3.5" /> صف بررسی اعتراض کاربران ({toPersianNum(appeals.length)})
          </span>
          {appeals.slice(0, 3).map((ap) => (
            <div key={ap.id} className="p-2 rounded-xl border border-sky-200 dark:border-sky-900 flex flex-wrap items-center justify-between gap-2">
              <span className="truncate">{ap.argumentFa} ({ap.status})</span>
              <div className="flex items-center gap-1.5">
                <button
                  type="button"
                  onClick={() => {
                    if (!canModerate) return;
                    setAppeals(resolveModerationAppeal(ap.id, 'overturned', moderatorNoteFa));
                    appendAdminAuditLog({ actorRole: activeRole, actorLabelFa: 'مرجع بازبینی', actionCode: 'COMMUNITY_APPEAL_OVERTURNED', targetType: 'listing', targetId: ap.targetId, reasonFa: moderatorNoteFa, severity: 'info' });
                    onFeedback(`اعتراض ${ap.id} پذیرفته شد و تصمیم قبلی لغو گردید.`);
                  }}
                  className="px-2 py-0.5 rounded bg-emerald-600 text-white font-bold cursor-pointer"
                >
                  پذیرش اعتراض
                </button>
                <button
                  type="button"
                  onClick={() => {
                    if (!canModerate) return;
                    setAppeals(resolveModerationAppeal(ap.id, 'upheld', moderatorNoteFa));
                    onFeedback(`تصمیم نظارتی در مورد ${ap.id} ابقا شد.`);
                  }}
                  className="px-2 py-0.5 rounded border border-slate-300 dark:border-slate-700 font-bold cursor-pointer"
                >
                  ابقای تصمیم
                </button>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
};
