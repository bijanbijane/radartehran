/** @file src/features/onboarding/components/Stage41WorkspaceMembersAndPerms.tsx — WKS-05..10 & WKS-24 */
import React, { useState } from 'react';
import {
  WORKSPACE_ROLE_LABELS_FA,
  canInvitationAccessProtectedContent,
  evaluateWorkspaceActionPermission,
  removeWorkspaceMemberWithAudit,
  transferWorkspaceOwnership,
  type CollaborativeWorkspace,
  type WorkspaceRole,
} from '../services/collaborativeWorkspaceEngine';

interface Props {
  workspace: CollaborativeWorkspace;
  currentRole: WorkspaceRole;
  onUpdateWorkspace: (ws: CollaborativeWorkspace) => void;
  onFeedbackFa: (msg: string) => void;
}

export const Stage41WorkspaceMembersAndPerms: React.FC<Props> = ({
  workspace,
  currentRole,
  onUpdateWorkspace,
  onFeedbackFa,
}) => {
  const [inviteTarget, setInviteTarget] = useState('');
  const [inviteRole, setInviteRole] = useState<WorkspaceRole>('contributor');
  const [newOwnerId, setNewOwnerId] = useState<string>(workspace.members.find((m) => m.userId !== workspace.ownerId && m.status === 'active')?.userId ?? '');

  const handleInvite = () => {
    const perm = evaluateWorkspaceActionPermission({ role: currentRole, memberStatus: 'active', action: 'invite' });
    if (!perm.allowed) { onFeedbackFa(perm.messageFa); return; }
    if (!inviteTarget.trim()) return;
    onUpdateWorkspace({
      ...workspace,
      invitations: [
        { inviteId: `inv-${Date.now()}`, targetEmailOrName: inviteTarget.trim(), invitedByFa: workspace.ownerNameFa, proposedRole: inviteRole, status: 'pending', expiresInDays: 7, revoked: false },
        ...workspace.invitations,
      ],
    });
    setInviteTarget('');
    onFeedbackFa('دعوت‌نامه ثبت شد (تا زمان پذیرش، دسترسی به محتوای محافظت‌شده مسدود است).');
  };

  const handleRemoveMember = (userId: string) => {
    const res = removeWorkspaceMemberWithAudit(workspace, userId);
    onUpdateWorkspace(res.updatedWorkspace);
    onFeedbackFa(res.messageFa);
  };

  const handleTransferOwner = () => {
    if (!newOwnerId) return;
    const res = transferWorkspaceOwnership(workspace, newOwnerId);
    onUpdateWorkspace(res.updatedWorkspace);
    onFeedbackFa(res.messageFa);
  };

  const reportItem = workspace.sharedItems.find((i) => i.kind === 'report');
  const toggleReportDownloadForViewer = () => {
    if (!reportItem) return;
    const perm = evaluateWorkspaceActionPermission({ role: currentRole, memberStatus: 'active', action: 'change_role' });
    if (!perm.allowed) { onFeedbackFa(perm.messageFa); return; }
    const curViewer = reportItem.policyByRole.viewer ?? reportItem.defaultPolicy;
    const nextItems = workspace.sharedItems.map((it) =>
      it.itemId === reportItem.itemId
        ? { ...it, policyByRole: { ...it.policyByRole, viewer: { ...curViewer, canDownload: !curViewer.canDownload } } }
        : it,
    );
    onUpdateWorkspace({ ...workspace, sharedItems: nextItems });
    onFeedbackFa('سیاست دریافت فایل گزارش برای مشاهده‌گر بلافاصله به‌روزرسانی شد.');
  };

  return (
    <div className="grid grid-cols-1 gap-3 lg:grid-cols-2 text-xs" data-testid="stage41-members-perms" dir="rtl">
      {/* Members & Invitations */}
      <div className="rounded-xl border border-slate-800 bg-slate-950/80 p-3 space-y-2.5">
        <div className="font-bold text-white">اعضا، دعوت‌ها و خروج با حفظ سابقه (WKS-05..08)</div>
        <div className="flex flex-wrap gap-1.5">
          <input type="text" value={inviteTarget} onChange={(e) => setInviteTarget(e.target.value)} placeholder="ایمیل یا نام کاربری..." className="flex-1 rounded border border-slate-700 bg-slate-900 px-2 py-1 text-[11px] text-white" />
          <select value={inviteRole} onChange={(e) => setInviteRole(e.target.value as WorkspaceRole)} aria-label="نقش پیشنهادی" className="rounded border border-slate-700 bg-slate-900 px-2 py-1 text-[11px] text-white">
            <option value="contributor">مشارکت‌کننده</option>
            <option value="editor">ویرایشگر</option>
            <option value="viewer">مشاهده‌گر</option>
          </select>
          <button type="button" data-testid="wks-invite-btn" onClick={handleInvite} className="rounded bg-emerald-600 px-2.5 py-1 text-[11px] font-bold text-white">ارسال دعوت</button>
        </div>

        <div className="space-y-1.5">
          {workspace.members.map((m) => (
            <div key={m.userId} className="flex items-center justify-between rounded border border-slate-800 bg-slate-900 px-2.5 py-1.5">
              <div>
                <span className="font-bold text-white">{m.displayNameFa}</span>{' '}
                <span className="text-[10.5px] text-cyan-300">({WORKSPACE_ROLE_LABELS_FA[m.role]} · {m.status === 'active' ? 'فعال' : 'حذف‌شده/خارج‌شده'})</span>
              </div>
              {m.userId !== workspace.ownerId && m.status === 'active' && (
                <button type="button" data-testid={`remove-member-${m.userId}`} onClick={() => handleRemoveMember(m.userId)} className="rounded border border-rose-500/40 px-2 py-0.5 text-[10px] text-rose-300">
                  قطع دسترسی (حفظ سابقه)
                </button>
              )}
            </div>
          ))}
          {workspace.invitations.map((inv) => (
            <div key={inv.inviteId} className="rounded border border-amber-500/30 bg-amber-950/20 px-2.5 py-1 text-[10.5px] text-amber-200">
              دعوت: {inv.targetEmailOrName} ({WORKSPACE_ROLE_LABELS_FA[inv.proposedRole]}) · وضعیت: {inv.status} · دسترسی محتوا: {canInvitationAccessProtectedContent(inv) ? 'مجاز' : 'مسدود تا پذیرش'}
            </div>
          ))}
        </div>
      </div>

      {/* Content Access Panel & Ownership Transfer */}
      <div className="rounded-xl border border-slate-800 bg-slate-950/80 p-3 space-y-2.5">
        <div className="font-bold text-white">مجوزهای محتوای مشترک و انتقال مالکیت (WKS-09, WKS-10, WKS-24)</div>
        {reportItem && (
          <div className="rounded border border-slate-800 bg-slate-900 p-2.5 space-y-1.5">
            <div className="font-semibold text-slate-100">{reportItem.titleFa}</div>
            <div className="text-[10.5px] text-slate-300">
              دسترسی مشاهده‌گر به دریافت فایل: <strong>{(reportItem.policyByRole.viewer ?? reportItem.defaultPolicy).canDownload ? 'فعال' : 'غیرفعال'}</strong>
            </div>
            <button type="button" data-testid="toggle-viewer-download-btn" onClick={toggleReportDownloadForViewer} className="rounded border border-cyan-500/40 bg-cyan-950/40 px-2.5 py-1 text-[10.5px] font-bold text-cyan-200">
              تغییر مجوز دانلود مشاهده‌گر
            </button>
          </div>
        )}
        <div className="rounded border border-slate-800 bg-slate-900 p-2.5 space-y-1.5">
          <div className="font-semibold text-slate-100">انتقال مالکیت پیش از خروج مالک (الزامی):</div>
          <div className="flex flex-wrap gap-1.5">
            <select value={newOwnerId} onChange={(e) => setNewOwnerId(e.target.value)} aria-label="انتخاب مالک جدید" className="flex-1 rounded border border-slate-700 bg-slate-950 px-2 py-1 text-[11px] text-white">
              {workspace.members.filter((m) => m.userId !== workspace.ownerId && m.status === 'active').map((m) => (
                <option key={m.userId} value={m.userId}>{m.displayNameFa}</option>
              ))}
            </select>
            <button type="button" data-testid="wks-transfer-owner-btn" onClick={handleTransferOwner} className="rounded border border-amber-500/40 bg-amber-950/30 px-2.5 py-1 text-[11px] font-bold text-amber-200">
              انتقال مالکیت
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};
