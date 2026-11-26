/** @file src/features/admin/components/AdminGovernanceModerationWorkspace.tsx — Stage 81 & 86 Server-Authoritative Content, Knowledge & Service Moderation */
import React, { useEffect, useState } from 'react';
import type { AuthUserSnapshot as User } from '../../../platform/auth';
import { CheckCircle2, FileWarning, MessageSquareWarning, ShieldAlert, XCircle } from 'lucide-react';
import { toPersianNum } from '../../../data/neighborhoods';
import { loadListingReports, loadMyListings } from '../../properties/services/listingService';
import { loadServiceComplaints } from '../../services/services/serviceWorkflowService';
import { KNOWLEDGE_PUBLICATIONS } from '../../knowledge/services/knowledgeSearchService';
import {
  getAdminKnowledgeGovernanceState,
  transitionAdminKnowledgePublicationStatus,
} from '../../knowledge/services/knowledgeApiClient';
import type { KnowledgeEditorialRole, KnowledgePublicationStatus } from '../../knowledge/types/knowledge.types';
import {
  assertAdminGovernancePermission,
  moderateUserPropertyListing,
  resolveServiceComplaint,
} from '../services/adminGovernanceService';
import type { AdminGovernanceRole } from '../types/admin.types';
import { AdminCommunityModerationPanel } from './AdminCommunityModerationPanel';

export interface AdminGovernanceModerationWorkspaceProps {
  section: 'content' | 'users';
  currentUser?: User | null;
  isVerifiedAdmin: boolean;
  activeRole: AdminGovernanceRole;
}

export const AdminGovernanceModerationWorkspace: React.FC<AdminGovernanceModerationWorkspaceProps> = ({
  section,
  currentUser,
  isVerifiedAdmin,
  activeRole,
}) => {
  const [listings, setListings] = useState(() => loadMyListings());
  const [reports] = useState(() => loadListingReports());
  const [pubStatuses, setPubStatuses] = useState<Record<string, KnowledgePublicationStatus>>(() => {
    const initial: Record<string, KnowledgePublicationStatus> = {};
    for (const p of KNOWLEDGE_PUBLICATIONS) initial[p.id] = p.status ?? p.defaultPublicationStatus;
    return initial;
  });
  const [editorialRole, setEditorialRole] = useState<KnowledgeEditorialRole>('release_manager');
  const [busyPubId, setBusyPubId] = useState<string | null>(null);
  const [complaints, setComplaints] = useState(() => loadServiceComplaints());
  const [noteInput, setNoteInput] = useState('بررسی تخصصی مشخصات و تطبیق مدارک انجام شد.');
  const [feedbackFa, setFeedbackFa] = useState<string | null>(null);

  useEffect(() => {
    if (section !== 'content') return;
    const ctrl = new AbortController();
    getAdminKnowledgeGovernanceState(currentUser, ctrl.signal).then((res) => {
      if (!ctrl.signal.aborted && res.ok && res.data && Object.keys(res.data.statuses).length > 0) {
        setPubStatuses(res.data.statuses);
      }
    });
    return () => ctrl.abort();
  }, [section, currentUser?.uid]);

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

    const handleKnowledgeTransition = async (pubId: string, toStatus: KnowledgePublicationStatus) => {
      if (!canModerate.allowed) {
        setFeedbackFa(canModerate.errorFa || 'عدم مجوز');
        return;
      }
      setBusyPubId(pubId);
      const res = await transitionAdminKnowledgePublicationStatus({
        publicationId: pubId,
        toStatus,
        actorUserId: currentUser?.uid || `admin-${activeRole}`,
        actorRole: editorialRole,
        reasonFa: noteInput,
        currentUser,
      });
      setBusyPubId(null);
      if (!res.ok) {
        setFeedbackFa(res.errorFa || 'تغییر وضعیت انتشار در سرور رد شد؛ وضعیت قبلی حفظ گردید.');
        return;
      }
      if (res.data?.statuses) {
        setPubStatuses(res.data.statuses);
      } else {
        setPubStatuses((prev) => ({ ...prev, [pubId]: toStatus }));
      }
      setFeedbackFa(`وضعیت گزارش «${pubId}» در سرور به «${toStatus}» تغییر یافت و در تاریخچه تصمیم ثبت شد.`);
    };

    return (
      <div data-testid="admin-content-moderation-workspace" className="p-4 rounded-2xl bg-white dark:bg-[var(--color-bg-surface)] border border-slate-200 dark:border-[var(--color-border-subtle)] space-y-4 text-xs">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <strong className="text-sm font-bold text-slate-900 dark:text-white flex items-center gap-1.5">
            <FileWarning className="w-4 h-4 text-[var(--color-brand-600)]" />
            <span>صف ممیزی آگهی‌های ثبت‌شده و گزارش‌های کاربران</span>
          </strong>
          <span className="text-[11px] text-slate-500 tabular-nums">
            آگهی‌های ثبت‌شده: {toPersianNum(listings.length)} · گزارش‌های خطا/تخطی: {toPersianNum(reports.length)}
          </span>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
          <div className="sm:col-span-2">
            <label htmlFor="admin-moderation-note" className="block text-[11px] font-bold text-slate-600 dark:text-[var(--color-text-secondary)] mb-1">
              دلیل بررسی / یادداشت اجباری ممیز (حداقل ۵ نویسه):
            </label>
            <input
              id="admin-moderation-note"
              type="text"
              value={noteInput}
              onChange={(e) => setNoteInput(e.target.value)}
              className="w-full p-2 rounded-xl bg-slate-50 dark:bg-[var(--color-bg-muted)] border border-slate-200 dark:border-[var(--color-border-strong)] font-medium"
            />
          </div>
          <div>
            <label htmlFor="admin-editorial-role" className="block text-[11px] font-bold text-slate-600 dark:text-[var(--color-text-secondary)] mb-1">
              نقش تحریریه دانش:
            </label>
            <select
              id="admin-editorial-role"
              value={editorialRole}
              onChange={(e) => setEditorialRole(e.target.value as KnowledgeEditorialRole)}
              className="w-full p-2 rounded-xl bg-slate-50 dark:bg-[var(--color-bg-muted)] border border-slate-200 dark:border-[var(--color-border-strong)] font-bold"
            >
              <option value="release_manager">مدیر انتشار (Release Manager)</option>
              <option value="technical_reviewer">داور فنی (Technical Reviewer)</option>
              <option value="editor">سردبیر (Editor)</option>
              <option value="author">نویسنده پژوهشی (Author)</option>
            </select>
          </div>
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
              <div key={rec.listing.listingId} className="p-3 rounded-xl bg-slate-50 dark:bg-[var(--color-bg-muted)] border border-slate-200 dark:border-[var(--color-border-strong)] flex flex-wrap items-center justify-between gap-2">
                <div className="min-w-0">
                  <div className="font-bold text-slate-900 dark:text-white truncate">
                    {rec.listing.title} · محله {rec.property.hoodName}
                  </div>
                  <div className="text-[10.5px] text-slate-500">
                    وضعیت: <strong className="text-slate-700 dark:text-[var(--color-text-primary)]">{rec.listing.status}</strong> · ثبت‌کننده: {rec.listing.publisher.displayName}
                  </div>
                </div>
                <div className="flex items-center gap-1.5">
                  <button type="button" onClick={() => handleListingAction(rec.listing.listingId, 'published')} className="px-2.5 py-1 rounded-lg bg-[var(--color-brand-600)] text-white font-bold flex items-center gap-1 cursor-pointer">
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
          <div className="pt-2 border-t border-slate-100 dark:border-[var(--color-border-subtle)] space-y-2">
            <strong className="font-bold text-slate-800 dark:text-[var(--color-text-primary)] block">گزارش‌های خطا و تخطی کاربران ({toPersianNum(reports.length)})</strong>
            {reports.slice(0, 5).map((r) => (
              <div key={r.id} className="p-2.5 rounded-xl border border-slate-200 dark:border-[var(--color-border-subtle)] flex items-center justify-between gap-2">
                <span>شناسه فایل {r.listingId} · علت: <strong>{r.reason}</strong></span>
                <span className="text-[10.5px] text-slate-500">{r.details || 'بدون توضیح اضافه'}</span>
              </div>
            ))}
          </div>
        )}

        <div className="pt-2 border-t border-slate-100 dark:border-[var(--color-border-subtle)] space-y-2" data-testid="admin-knowledge-publications-queue">
          <strong className="font-bold text-slate-800 dark:text-[var(--color-text-primary)] block">
            گردش‌کار تحریریه و وضعیت انتشار سرور پایگاه دانش ({toPersianNum(KNOWLEDGE_PUBLICATIONS.length)})
          </strong>
          {KNOWLEDGE_PUBLICATIONS.slice(0, 6).map((pub) => {
            const st = pubStatuses[pub.id] || pub.status || pub.defaultPublicationStatus;
            const isBusy = busyPubId === pub.id;
            return (
              <div key={pub.id} className="p-2.5 rounded-xl bg-slate-50 dark:bg-[var(--color-bg-muted)] border border-slate-200 dark:border-[var(--color-border-strong)] flex flex-wrap items-center justify-between gap-2">
                <div className="min-w-0">
                  <div className="font-bold text-slate-900 dark:text-white truncate">{pub.titleFa}</div>
                  <div className="text-[10.5px] text-slate-500">
                    نسخه {pub.version} · وضعیت سرور: <strong>{st}</strong> · داور فنی: {pub.technicalReviewer.nameFa}
                  </div>
                </div>
                <div className="flex flex-wrap items-center gap-1.5">
                  <button
                    type="button"
                    disabled={isBusy}
                    onClick={() => handleKnowledgeTransition(pub.id, 'published')}
                    className="px-2 py-1 rounded-lg bg-[var(--color-brand-600)] text-white font-bold cursor-pointer disabled:opacity-50"
                  >
                    انتشار
                  </button>
                  <button
                    type="button"
                    disabled={isBusy}
                    onClick={() => handleKnowledgeTransition(pub.id, 'archived')}
                    className="px-2 py-1 rounded-lg border border-slate-400 text-slate-700 dark:text-[var(--color-text-primary)] font-bold cursor-pointer disabled:opacity-50"
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
          currentUser={currentUser}
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
    <div data-testid="admin-complaints-disputes-queue" className="p-4 rounded-2xl bg-white dark:bg-[var(--color-bg-surface)] border border-slate-200 dark:border-[var(--color-border-subtle)] space-y-3 text-xs">
      <div className="flex items-center justify-between gap-2">
        <strong className="text-sm font-bold text-slate-900 dark:text-white flex items-center gap-1.5">
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
        className="w-full p-2 rounded-xl bg-slate-50 dark:bg-[var(--color-bg-muted)] border border-slate-200 dark:border-[var(--color-border-strong)]"
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
            <div key={c.complaintId} className="p-3 rounded-xl bg-slate-50 dark:bg-[var(--color-bg-muted)] border border-slate-200 dark:border-[var(--color-border-strong)] flex flex-wrap items-center justify-between gap-2">
              <div>
                <div className="font-bold text-slate-900 dark:text-white">پرونده {c.complaintId} · علت: {c.reason}</div>
                <div className="text-[10.5px] text-slate-500">وضعیت: {c.status} · {c.details}</div>
              </div>
              <div className="flex items-center gap-1.5">
                <button type="button" onClick={() => handleResolveComplaint(c.complaintId, 'under_review')} className="px-2.5 py-1 rounded-lg border border-amber-500 text-amber-700 font-bold cursor-pointer">
                  در دست بررسی
                </button>
                <button type="button" onClick={() => handleResolveComplaint(c.complaintId, 'resolved')} className="px-2.5 py-1 rounded-lg bg-[var(--color-brand-600)] text-white font-bold cursor-pointer">
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
