/** @file src/features/admin/components/AdminGovernanceModerationWorkspace.tsx — Content, Listing Reports & Service Complaints Moderation */
import React, { useState } from 'react';
import { CheckCircle2, FileWarning, MessageSquareWarning, ShieldAlert, XCircle } from 'lucide-react';
import { toPersianNum } from '../../../data/neighborhoods';
import { loadListingReports, loadMyListings } from '../../properties/services/listingService';
import { loadServiceComplaints } from '../../services/services/serviceWorkflowService';
import {
  KNOWLEDGE_PUBLICATIONS,
  loadKnowledgePublicationStatuses,
  transitionKnowledgePublicationStatus,
} from '../../knowledge/services/knowledgeSearchService';
import {
  appendAdminAuditLog,
  assertAdminGovernancePermission,
  moderateUserPropertyListing,
  resolveServiceComplaint,
} from '../services/adminGovernanceService';
import type { AdminGovernanceRole } from '../types/admin.types';
import { AdminCommunityModerationPanel } from './AdminCommunityModerationPanel';

export interface AdminGovernanceModerationWorkspaceProps {
  section: 'content' | 'users';
  isVerifiedAdmin: boolean;
  activeRole: AdminGovernanceRole;
}

export const AdminGovernanceModerationWorkspace: React.FC<AdminGovernanceModerationWorkspaceProps> = ({
  section,
  isVerifiedAdmin,
  activeRole,
}) => {
  const [listings, setListings] = useState(() => loadMyListings());
  const [reports] = useState(() => loadListingReports());
  const [pubStatuses, setPubStatuses] = useState(() => loadKnowledgePublicationStatuses());
  const [complaints, setComplaints] = useState(() => loadServiceComplaints());
  const [noteInput, setNoteInput] = useState('بررسی تخصصی مشخصات و تطبیق مدارک انجام شد.');
  const [feedbackFa, setFeedbackFa] = useState<string | null>(null);

  if (section === 'content') {
    const canModerate = assertAdminGovernancePermission({
      isVerifiedAdmin,
      role: activeRole,
      permission: 'admin:moderate_content',
    });

    const handleListingAction = (listingId: string, nextStatus: 'published' | 'suspended' | 'rejected') => {
      const res = moderateUserPropertyListing({
        listingId,
        nextStatus,
        moderatorNoteFa: noteInput,
        role: activeRole,
        isVerifiedAdmin,
      });
      setListings(res.listings);
      setFeedbackFa(res.ok ? `وضعیت آگهی به «${nextStatus}» تغییر یافت و در لاگ ممیزی ثبت شد.` : res.errorFa || 'خطا');
    };

    return (
      <div data-testid="admin-content-moderation-workspace" className="p-4 rounded-2xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 space-y-4 text-xs">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <strong className="text-sm font-black text-slate-900 dark:text-white flex items-center gap-1.5">
            <FileWarning className="w-4 h-4 text-emerald-600" />
            <span>صف ممیزی آگهی‌های ثبت‌شده و گزارش‌های کاربران</span>
          </strong>
          <span className="text-[11px] text-slate-500 tabular-nums">
            آگهی‌های ثبت‌شده: {toPersianNum(listings.length)} · گزارش‌های خطا/تخطی: {toPersianNum(reports.length)}
          </span>
        </div>

        <div>
          <label htmlFor="admin-moderation-note" className="block text-[11px] font-bold text-slate-600 dark:text-slate-300 mb-1">
            دلیل بررسی / یادداشت اجباری ممیز (ثبت در Audit Log):
          </label>
          <input
            id="admin-moderation-note"
            type="text"
            value={noteInput}
            onChange={(e) => setNoteInput(e.target.value)}
            className="w-full p-2 rounded-xl bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 font-medium"
          />
        </div>

        {!canModerate.allowed && (
          <div className="p-2.5 rounded-xl bg-amber-50 dark:bg-amber-950/40 border border-amber-200 dark:border-amber-800 text-amber-800 dark:text-amber-200 font-bold">
            {canModerate.errorFa}
          </div>
        )}
        {feedbackFa && (
          <div className="p-2.5 rounded-xl bg-emerald-50 dark:bg-emerald-950/40 border border-emerald-200 dark:border-emerald-800 text-emerald-800 dark:text-emerald-200 font-bold">
            {feedbackFa}
          </div>
        )}

        {listings.length === 0 ? (
          <p className="text-slate-500 py-2">آگهی کاربرثبت‌شده‌ای در صف بررسی نیست.</p>
        ) : (
          <div className="space-y-2">
            {listings.slice(0, 8).map((rec) => (
              <div key={rec.listing.listingId} className="p-3 rounded-xl bg-slate-50 dark:bg-slate-800/70 border border-slate-200 dark:border-slate-700 flex flex-wrap items-center justify-between gap-2">
                <div className="min-w-0">
                  <div className="font-bold text-slate-900 dark:text-white truncate">
                    {rec.listing.title} · محله {rec.property.hoodName}
                  </div>
                  <div className="text-[10.5px] text-slate-500">
                    وضعیت: <strong className="text-slate-700 dark:text-slate-200">{rec.listing.status}</strong> · ثبت‌کننده: {rec.listing.publisher.displayName}
                  </div>
                </div>
                <div className="flex items-center gap-1.5">
                  <button type="button" onClick={() => handleListingAction(rec.listing.listingId, 'published')} className="px-2.5 py-1 rounded-lg bg-emerald-600 text-white font-bold flex items-center gap-1 cursor-pointer">
                    <CheckCircle2 className="w-3.5 h-3.5" /><span>تأیید انتشار</span>
                  </button>
                  <button type="button" onClick={() => handleListingAction(rec.listing.listingId, 'suspended')} className="px-2.5 py-1 rounded-lg border border-amber-500 text-amber-700 font-bold cursor-pointer">
                    تعلیق / بازبینی
                  </button>
                  <button type="button" onClick={() => handleListingAction(rec.listing.listingId, 'rejected')} className="px-2.5 py-1 rounded-lg border border-rose-600 text-rose-700 font-bold flex items-center gap-1 cursor-pointer">
                    <XCircle className="w-3.5 h-3.5" /><span>رد</span>
                  </button>
                </div>
              </div>
            ))}
          </div>
        )}

        {reports.length > 0 && (
          <div className="pt-2 border-t border-slate-100 dark:border-slate-800 space-y-2">
            <strong className="font-black text-slate-800 dark:text-slate-100 block">گزارش‌های خطا و تخطی کاربران ({toPersianNum(reports.length)})</strong>
            {reports.slice(0, 5).map((r) => (
              <div key={r.id} className="p-2.5 rounded-xl border border-slate-200 dark:border-slate-800 flex items-center justify-between gap-2">
                <span>شناسه فایل {r.listingId} · علت: <strong>{r.reason}</strong></span>
                <span className="text-[10.5px] text-slate-500">{r.details || 'بدون توضیح اضافه'}</span>
              </div>
            ))}
          </div>
        )}

        <div className="pt-2 border-t border-slate-100 dark:border-slate-800 space-y-2" data-testid="admin-knowledge-publications-queue">
          <strong className="font-black text-slate-800 dark:text-slate-100 block">وضعیت انتشار گزارش‌ها و پایگاه دانش ({toPersianNum(KNOWLEDGE_PUBLICATIONS.length)})</strong>
          {KNOWLEDGE_PUBLICATIONS.slice(0, 4).map((pub) => {
            const st = pubStatuses[pub.id] || pub.defaultPublicationStatus;
            return (
              <div key={pub.id} className="p-2.5 rounded-xl bg-slate-50 dark:bg-slate-800/70 border border-slate-200 dark:border-slate-700 flex flex-wrap items-center justify-between gap-2">
                <div className="min-w-0">
                  <div className="font-bold text-slate-900 dark:text-white truncate">{pub.titleFa}</div>
                  <div className="text-[10.5px] text-slate-500">نسخه {pub.version} · وضعیت فعلی: <strong>{st}</strong></div>
                </div>
                <div className="flex items-center gap-1.5">
                  <button
                    type="button"
                    onClick={() => {
                      if (!canModerate.allowed) { setFeedbackFa(canModerate.errorFa || 'عدم مجوز'); return; }
                      setPubStatuses(transitionKnowledgePublicationStatus(pub.id, 'published'));
                      appendAdminAuditLog({
                        actorRole: activeRole,
                        actorLabelFa: 'ممیز محتوا و دانش',
                        actionCode: 'moderate_knowledge_pub',
                        targetType: 'listing',
                        targetId: pub.id,
                        reasonFa: noteInput,
                        severity: 'info',
                      });
                      setFeedbackFa(`انتشار «${pub.id}» به وضعیت published ثبت شد.`);
                    }}
                    className="px-2 py-1 rounded-lg bg-emerald-600 text-white font-bold cursor-pointer"
                  >
                    انتشار
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      if (!canModerate.allowed) { setFeedbackFa(canModerate.errorFa || 'عدم مجوز'); return; }
                      setPubStatuses(transitionKnowledgePublicationStatus(pub.id, 'archived'));
                      appendAdminAuditLog({
                        actorRole: activeRole,
                        actorLabelFa: 'ممیز محتوا و دانش',
                        actionCode: 'archive_knowledge_pub',
                        targetType: 'listing',
                        targetId: pub.id,
                        reasonFa: noteInput,
                        severity: 'warning',
                      });
                      setFeedbackFa(`گزارش «${pub.id}» به آرشیو منتقل شد.`);
                    }}
                    className="px-2 py-1 rounded-lg border border-slate-400 text-slate-700 dark:text-slate-200 font-bold cursor-pointer"
                  >
                    آرشیو
                  </button>
                </div>
              </div>
            );
          })}
        </div>

        <AdminCommunityModerationPanel
          isVerifiedAdmin={isVerifiedAdmin}
          activeRole={activeRole}
          canModerate={canModerate.allowed}
          moderatorNoteFa={noteInput}
          onFeedback={(msg) => setFeedbackFa(msg)}
        />
      </div>
    );
  }

  const canResolve = assertAdminGovernancePermission({
    isVerifiedAdmin,
    role: activeRole,
    permission: 'admin:resolve_disputes',
  });

  const handleResolveComplaint = (complaintId: string, nextStatus: 'under_review' | 'resolved') => {
    const res = resolveServiceComplaint({
      complaintId,
      nextStatus,
      resolutionNoteFa: noteInput,
      role: activeRole,
      isVerifiedAdmin,
    });
    setComplaints(res.complaints);
    setFeedbackFa(res.ok ? `وضعیت شکایت به «${nextStatus}» بروزرسانی و در لاگ ممیزی ثبت شد.` : res.errorFa || 'خطا');
  };

  return (
    <div data-testid="admin-complaints-disputes-queue" className="p-4 rounded-2xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 space-y-3 text-xs">
      <div className="flex items-center justify-between gap-2">
        <strong className="text-sm font-black text-slate-900 dark:text-white flex items-center gap-1.5">
          <MessageSquareWarning className="w-4 h-4 text-amber-600" />
          <span>رسیدگی به شکایات و اختلافات خصوصی خدمات ({toPersianNum(complaints.length)})</span>
        </strong>
        {!canResolve.allowed && (
          <span className="text-[11px] font-bold text-amber-700 flex items-center gap-1">
            <ShieldAlert className="w-3.5 h-3.5" /> دسترسی محدود
          </span>
        )}
      </div>
      <input
        type="text"
        aria-label="گزارش رسیدگی شکایت"
        value={noteInput}
        onChange={(e) => setNoteInput(e.target.value)}
        className="w-full p-2 rounded-xl bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700"
      />
      {feedbackFa && (
        <div className="p-2.5 rounded-xl bg-emerald-50 dark:bg-emerald-950/40 border border-emerald-200 dark:border-emerald-800 text-emerald-800 dark:text-emerald-200 font-bold">
          {feedbackFa}
        </div>
      )}
      {complaints.length === 0 ? (
        <p className="text-slate-500 py-2">در حال حاضر شکایت خصوصی بازی در بخش خدمات ثبت نشده است.</p>
      ) : (
        <div className="space-y-2">
          {complaints.slice(0, 6).map((c) => (
            <div key={c.complaintId} className="p-3 rounded-xl bg-slate-50 dark:bg-slate-800/70 border border-slate-200 dark:border-slate-700 flex flex-wrap items-center justify-between gap-2">
              <div>
                <div className="font-bold text-slate-900 dark:text-white">پرونده {c.complaintId} · علت: {c.reason}</div>
                <div className="text-[10.5px] text-slate-500">وضعیت: {c.status} · {c.details}</div>
              </div>
              <div className="flex items-center gap-1.5">
                <button type="button" onClick={() => handleResolveComplaint(c.complaintId, 'under_review')} className="px-2.5 py-1 rounded-lg border border-amber-500 text-amber-700 font-bold cursor-pointer">
                  در دست بررسی
                </button>
                <button type="button" onClick={() => handleResolveComplaint(c.complaintId, 'resolved')} className="px-2.5 py-1 rounded-lg bg-emerald-600 text-white font-bold cursor-pointer">
                  بستن و حل‌وفصل
                </button>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
};
