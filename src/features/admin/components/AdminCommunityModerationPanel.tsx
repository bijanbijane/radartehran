/** @file src/features/admin/components/AdminCommunityModerationPanel.tsx — Server-Authoritative Community Governance, Data Apply & Appeals Queue */
import React, { useEffect, useState } from 'react';
import type { User } from 'firebase/auth';
import { CheckCircle2, Database, Lock, Scale, ShieldAlert, XCircle } from 'lucide-react';
import { toPersianNum } from '../../../data/neighborhoods';
import {
  getAdminCommunityModerationQueue,
  resolveAdminCommunityAppeal,
  submitAdminCommunityModerationAction,
} from '../../community/services/communityApiClient';
import {
  ABUSE_REASON_LABELS_FA,
  type CommunityAbuseReport,
  type DataCorrectionProposal,
  type ModerationAppeal,
} from '../../community/types/community.types';
import { appendAdminAuditLog } from '../services/adminGovernanceService';
import type { AdminGovernanceRole } from '../types/admin.types';
import {
  applyTrustSafetyDecision,
  claimTrustSafetyCase,
  listTrustSafetyCases,
  type TrustSafetyCaseItem,
  type TrustSafetyDecision,
} from '../services/trustSafetyApiClient';

interface Props {
  isVerifiedAdmin: boolean;
  currentUser?: User | null;
  activeRole: AdminGovernanceRole;
  canModerate: boolean;
  moderatorNoteFa: string;
  onFeedback: (msg: string) => void;
}

export const AdminCommunityModerationPanel: React.FC<Props> = ({
  isVerifiedAdmin,
  currentUser,
  canModerate,
  moderatorNoteFa,
  activeRole,
  onFeedback,
}) => {
  const [corrections, setCorrections] = useState<DataCorrectionProposal[]>([]);
  const [abuseReports, setAbuseReports] = useState<CommunityAbuseReport[]>([]);
  const [appeals, setAppeals] = useState<ModerationAppeal[]>([]);
  const [safetyCases, setSafetyCases] = useState<TrustSafetyCaseItem[]>([]);
  const [loadErrorFa, setLoadErrorFa] = useState<string | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);

  const reloadQueue = async (signal?: AbortSignal) => {
    const [res, tsRes] = await Promise.all([
      getAdminCommunityModerationQueue(signal, currentUser),
      listTrustSafetyCases(currentUser, undefined, signal),
    ]);
    if (signal?.aborted) return;
    if (tsRes.ok) setSafetyCases(tsRes.cases);
    if (res.ok && res.data) {
      setCorrections(res.data.corrections);
      setAbuseReports(res.data.reports);
      setAppeals(res.data.appeals);
      setLoadErrorFa(null);
    } else if (res.errorFa && res.errorFa !== 'ABORTED') {
      setLoadErrorFa(res.errorFa);
    }
  };

  useEffect(() => {
    if (!isVerifiedAdmin && !currentUser) return;
    const ctrl = new AbortController();
    reloadQueue(ctrl.signal);
    return () => ctrl.abort();
  }, [isVerifiedAdmin, currentUser?.uid]);

  const handleDataDecision = async (id: string, titleFa: string, status: 'approved' | 'applied' | 'rejected') => {
    if (!canModerate) { onFeedback('نقش فعلی مجوز ممیزی داده را ندارد.'); return; }
    const actionType = status === 'approved' ? 'approve_data' : status === 'applied' ? 'apply_data_version' : 'reject_data';
    setBusyId(id);
    const res = await submitAdminCommunityModerationAction(
      { targetType: 'data_correction', targetId: id, actionType, reasonFa: moderatorNoteFa, actorRole: activeRole },
      currentUser,
    );
    setBusyId(null);
    if (!res.ok) {
      onFeedback(res.errorFa || 'ثبت تصمیم در سرور ناموفق بود.');
      return;
    }
    await reloadQueue();
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
      {loadErrorFa && (
        <div className="p-2.5 rounded-xl bg-amber-50 dark:bg-amber-950/30 border border-amber-200 dark:border-amber-800 text-amber-800 dark:text-amber-200 font-bold">
          {loadErrorFa}
        </div>
      )}
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
            <button type="button" disabled={busyId === c.id} onClick={() => handleDataDecision(c.id, c.titleFa, 'approved')} className="px-2 py-1 rounded-lg bg-emerald-600 text-white font-bold flex items-center gap-1 cursor-pointer disabled:opacity-50">
              <CheckCircle2 className="w-3.5 h-3.5" /><span>تأیید ممیز</span>
            </button>
            <button type="button" disabled={busyId === c.id} onClick={() => handleDataDecision(c.id, c.titleFa, 'applied')} className="px-2 py-1 rounded-lg bg-sky-700 text-white font-bold flex items-center gap-1 cursor-pointer disabled:opacity-50">
              <Database className="w-3.5 h-3.5" /><span>اعمال در داده پایه</span>
            </button>
            <button type="button" disabled={busyId === c.id} onClick={() => handleDataDecision(c.id, c.titleFa, 'rejected')} className="px-2 py-1 rounded-lg border border-rose-600 text-rose-700 font-bold flex items-center gap-1 cursor-pointer disabled:opacity-50">
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
                  onClick={async () => {
                    if (!canModerate) return;
                    const res = await submitAdminCommunityModerationAction(
                      { targetType: rep.targetType, targetId: rep.targetId, actionType: 'hide', reasonFa: moderatorNoteFa, actorRole: activeRole },
                      currentUser,
                    );
                    if (!res.ok) { onFeedback(res.errorFa || 'خطا'); return; }
                    await reloadQueue();
                    appendAdminAuditLog({ actorRole: activeRole, actorLabelFa: 'ناظر جامعه', actionCode: 'COMMUNITY_POST_HIDDEN', targetType: 'listing', targetId: rep.targetId, reasonFa: moderatorNoteFa, severity: 'warning' });
                    onFeedback(`محتوای ${rep.targetId} پنهان و گزارش ثبت شد.`);
                  }}
                  className="px-2 py-0.5 rounded bg-rose-600 text-white font-bold cursor-pointer"
                >
                  پنهان‌سازی
                </button>
                <button
                  type="button"
                  onClick={async () => {
                    if (!canModerate) return;
                    const res = await submitAdminCommunityModerationAction(
                      { targetType: rep.targetType, targetId: rep.targetId, actionType: 'lock', reasonFa: moderatorNoteFa, actorRole: activeRole },
                      currentUser,
                    );
                    if (!res.ok) { onFeedback(res.errorFa || 'خطا'); return; }
                    await reloadQueue();
                    onFeedback(`موضوع ${rep.targetId} قفل شد.`);
                  }}
                  className="px-2 py-0.5 rounded bg-amber-600 text-white font-bold inline-flex items-center gap-1 cursor-pointer"
                >
                  <Lock className="w-3 h-3" /><span>قفل</span>
                </button>
                <button
                  type="button"
                  onClick={async () => {
                    if (!canModerate) return;
                    const res = await submitAdminCommunityModerationAction(
                      { targetType: rep.targetType, targetId: rep.id, actionType: 'dismiss_report', reasonFa: moderatorNoteFa, actorRole: activeRole },
                      currentUser,
                    );
                    if (!res.ok) { onFeedback(res.errorFa || 'خطا'); return; }
                    await reloadQueue();
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
                  onClick={async () => {
                    if (!canModerate) return;
                    const res = await resolveAdminCommunityAppeal(
                      { appealId: ap.id, decision: 'overturned', reviewerNoteFa: moderatorNoteFa },
                      currentUser,
                    );
                    if (!res.ok) { onFeedback(res.errorFa || 'خطا'); return; }
                    await reloadQueue();
                    appendAdminAuditLog({ actorRole: activeRole, actorLabelFa: 'مرجع بازبینی', actionCode: 'COMMUNITY_APPEAL_OVERTURNED', targetType: 'listing', targetId: ap.targetId, reasonFa: moderatorNoteFa, severity: 'info' });
                    onFeedback(`اعتراض ${ap.id} پذیرفته شد و تصمیم قبلی لغو گردید.`);
                  }}
                  className="px-2 py-0.5 rounded bg-emerald-600 text-white font-bold cursor-pointer"
                >
                  پذیرش اعتراض
                </button>
                <button
                  type="button"
                  onClick={async () => {
                    if (!canModerate) return;
                    const res = await resolveAdminCommunityAppeal(
                      { appealId: ap.id, decision: 'upheld', reviewerNoteFa: moderatorNoteFa },
                      currentUser,
                    );
                    if (!res.ok) { onFeedback(res.errorFa || 'خطا'); return; }
                    await reloadQueue();
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

      {safetyCases.length > 0 && (
        <div className="space-y-1.5 pt-2" data-testid="trust-safety-cases-section">
          <strong className="text-[11px] font-black text-indigo-700 dark:text-indigo-300 block">
            پرونده‌های نظارت و ایمنی جامعه (Stage 5 · {toPersianNum(safetyCases.length)})
          </strong>
          {safetyCases.slice(0, 5).map((sc) => (
            <div key={sc.id} className="p-2 rounded-xl border border-indigo-200 dark:border-indigo-900 flex flex-wrap items-center justify-between gap-2">
              <div className="min-w-0">
                <div className="font-bold truncate">{sc.targetId} ({sc.status} · {toPersianNum(sc.reportCount)} گزارش)</div>
                <div className="text-[10.5px] text-slate-500">
                  {sc.claimedByUid ? `قفل ناظر: ${sc.claimedByUid.slice(0, 10)}` : 'آزاد'}
                  {sc.lastDecision ? ` · آخرین تصمیم: ${sc.lastDecision}` : ''}
                </div>
              </div>
              <div className="flex flex-wrap items-center gap-1">
                <button
                  type="button"
                  onClick={async () => {
                    if (!canModerate) return;
                    const out = await claimTrustSafetyCase(sc.id, currentUser);
                    onFeedback(out.ok ? `پرونده ${sc.id} به شما تخصیص یافت.` : (out.errorFa || 'خطا'));
                    if (out.ok) await reloadQueue();
                  }}
                  className="px-2 py-0.5 rounded bg-indigo-600 text-white font-bold cursor-pointer"
                >
                  تخصیص پرونده
                </button>
                {(['dismiss', 'hide', 'soft_delete'] as TrustSafetyDecision[]).map((dec) => (
                  <button
                    key={dec}
                    type="button"
                    onClick={async () => {
                      if (!canModerate) return;
                      const out = await applyTrustSafetyDecision(sc.id, dec, moderatorNoteFa || 'بررسی نظارتی', currentUser);
                      onFeedback(out.ok ? `تصمیم ${dec} ثبت شد.` : (out.errorFa || 'خطا'));
                      if (out.ok) await reloadQueue();
                    }}
                    className="px-2 py-0.5 rounded border border-slate-300 dark:border-slate-700 font-bold cursor-pointer"
                  >
                    {dec}
                  </button>
                ))}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
};
