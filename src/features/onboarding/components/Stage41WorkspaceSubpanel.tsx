/** @file src/features/onboarding/components/Stage41WorkspaceSubpanel.tsx — Stage 41 Collaborative Workspace Hub */
import React, { useState } from 'react';
import {
  WORKSPACE_ROLE_LABELS_FA,
  type CollaborativeWorkspace,
  type WorkspaceRole,
} from '../services/collaborativeWorkspaceEngine';
import { INITIAL_STAGE41_WORKSPACES } from '../services/stage41WorkspaceFixtures';
import { Stage41WorkspaceMembersAndPerms } from './Stage41WorkspaceMembersAndPerms';
import { Stage41WorkspaceNotesAndTasks } from './Stage41WorkspaceNotesAndTasks';

export const Stage41WorkspaceSubpanel: React.FC = () => {
  const [workspaces, setWorkspaces] = useState<CollaborativeWorkspace[]>(INITIAL_STAGE41_WORKSPACES);
  const [activeWsId, setActiveWsId] = useState<string>(INITIAL_STAGE41_WORKSPACES[0].workspaceId);
  const [simulatedRole, setSimulatedRole] = useState<WorkspaceRole>('owner');
  const [subTab, setSubTab] = useState<'content' | 'members'>('content');
  const [searchQuery, setSearchQuery] = useState<string>('');
  const [feedbackFa, setFeedbackFa] = useState<string>('');
  const [newWsName, setNewWsName] = useState<string>('');

  const activeWs = workspaces.find((w) => w.workspaceId === activeWsId) ?? workspaces[0];

  const handleSwitchWorkspace = (id: string) => {
    setActiveWsId(id);
    setSearchQuery('');
    setFeedbackFa('فضای کاری تغییر یافت؛ فیلتر و جست‌وجو ایزوله و پاک‌سازی شدند تا اطلاعات فضاها مخلوط نشوند.');
  };

  const handleCreateGroupWorkspace = () => {
    if (!newWsName.trim()) return;
    const id = `wks-${Date.now()}`;
    const created: CollaborativeWorkspace = {
      workspaceId: id,
      nameFa: newWsName.trim(),
      kind: 'group',
      ownerId: 'u-owner',
      ownerNameFa: 'مهندس رضایی',
      archived: false,
      activeSearchFilter: '',
      members: [{ userId: 'u-owner', displayNameFa: 'مهندس رضایی', role: 'owner', status: 'active', joinedAtLabelFa: '۱۴ آبان ۱۴۰۵' }],
      invitations: [],
      sharedItems: [],
      notes: [],
      tasks: [],
      activities: [{ id: `act-${Date.now()}`, actorNameFa: 'مهندس رضایی', actionType: 'member', summaryFa: 'فضای گروهی جدید ساخته شد (دعوت فوری اجباری نیست).', timeLabelFa: '۱۴ آبان ۱۴۰۵' }],
    };
    setWorkspaces((prev) => [created, ...prev]);
    setNewWsName('');
    handleSwitchWorkspace(id);
  };

  return (
    <div className="space-y-4" data-testid="stage41-workspace-subpanel" dir="rtl">
      <div className="rounded-xl border border-slate-800 bg-slate-900/70 p-4 space-y-3.5">
        <div className="flex flex-wrap items-center justify-between gap-2 border-b border-slate-800 pb-3">
          <div>
            <h3 className="text-sm font-bold text-white">مرحله ۴۱: فضای کاری، اشتراک دانش و کار گروهی حول داده (RT-UI-WORKSPACE-001)</h3>
            <p className="mt-1 text-xs text-slate-400">جداسازی کامل فضای شخصی و گروهی؛ نقش‌ها و مجوز محتوا؛ یادداشت و تعارض هم‌زمان؛ وظایف و تاریخچه با حفظ سابقه</p>
          </div>
          <div className="flex flex-wrap gap-1.5">
            {workspaces.map((w) => (
              <button key={w.workspaceId} type="button" data-testid={`wks-switch-${w.workspaceId}`} onClick={() => handleSwitchWorkspace(w.workspaceId)} className={`rounded-lg border px-2.5 py-1 text-[11px] font-bold ${activeWs.workspaceId === w.workspaceId ? 'border-cyan-500 bg-cyan-950/50 text-cyan-200' : 'border-slate-700 bg-slate-950 text-slate-300'}`}>
                {w.nameFa} ({w.kind === 'personal' ? 'شخصی' : 'گروهی'})
              </button>
            ))}
          </div>
        </div>

        {/* Role Perspective & Search & Quick Create */}
        <div className="flex flex-wrap items-center justify-between gap-2 text-[11px]">
          <div className="flex flex-wrap items-center gap-1.5">
            <span className="text-slate-300">شبیه‌سازی نقش کاربر:</span>
            <select data-testid="wks-role-selector" value={simulatedRole} onChange={(e) => setSimulatedRole(e.target.value as WorkspaceRole)} aria-label="شبیه‌سازی نقش در فضای کاری" className="rounded border border-slate-700 bg-slate-950 px-2 py-1 text-white">
              {(['owner', 'admin', 'editor', 'contributor', 'viewer'] as WorkspaceRole[]).map((r) => (
                <option key={r} value={r}>{WORKSPACE_ROLE_LABELS_FA[r]}</option>
              ))}
            </select>
            <input type="text" value={searchQuery} onChange={(e) => setSearchQuery(e.target.value)} placeholder="جست‌وجوی داخلی در فضای فعال..." className="rounded border border-slate-700 bg-slate-950 px-2 py-1 text-white" />
          </div>
          <div className="flex flex-wrap items-center gap-1.5">
            <input type="text" value={newWsName} onChange={(e) => setNewWsName(e.target.value)} placeholder="نام فضای گروهی جدید..." className="rounded border border-slate-700 bg-slate-950 px-2 py-1 text-white" />
            <button type="button" data-testid="wks-create-btn" onClick={handleCreateGroupWorkspace} className="rounded bg-[var(--color-brand-600)] px-2.5 py-1 font-bold text-white">ساخت فضای گروهی</button>
          </div>
        </div>

        <div className="flex gap-1.5 text-[11px]">
          <button type="button" data-testid="wks-tab-content" onClick={() => setSubTab('content')} className={`rounded-lg border px-2.5 py-1 font-bold ${subTab === 'content' ? 'border-emerald-500 bg-emerald-950/40 text-emerald-200' : 'border-slate-700 text-slate-300'}`}>
            محتوای مشترک، یادداشت و وظایف ({activeWs.sharedItems.length})
          </button>
          <button type="button" data-testid="wks-tab-members" onClick={() => setSubTab('members')} className={`rounded-lg border px-2.5 py-1 font-bold ${subTab === 'members' ? 'border-emerald-500 bg-emerald-950/40 text-emerald-200' : 'border-slate-700 text-slate-300'}`}>
            اعضا، دعوت‌ها و دسترسی‌ها ({activeWs.members.length})
          </button>
        </div>

        {feedbackFa && (
          <div data-testid="stage41-feedback-banner" className="rounded-lg border border-cyan-500/40 bg-cyan-950/30 px-3 py-1.5 text-[11px] text-cyan-200">
            {feedbackFa}
          </div>
        )}

        {activeWs.sharedItems.length === 0 && subTab === 'content' ? (
          <div className="rounded-xl border border-slate-800 bg-slate-950/70 p-4 text-center text-xs text-slate-300">
            هنوز محتوای مشترکی در این فضا وجود ندارد. می‌توانید یک ملک، محله، محدوده یا گزارش اضافه کنید.
          </div>
        ) : subTab === 'content' ? (
          <Stage41WorkspaceNotesAndTasks
            workspace={activeWs}
            currentRole={simulatedRole}
            searchQuery={searchQuery}
            onUpdateWorkspace={(updated) => setWorkspaces((prev) => prev.map((w) => (w.workspaceId === updated.workspaceId ? updated : w)))}
            onFeedbackFa={setFeedbackFa}
          />
        ) : (
          <Stage41WorkspaceMembersAndPerms
            workspace={activeWs}
            currentRole={simulatedRole}
            onUpdateWorkspace={(updated) => setWorkspaces((prev) => prev.map((w) => (w.workspaceId === updated.workspaceId ? updated : w)))}
            onFeedbackFa={setFeedbackFa}
          />
        )}
      </div>
    </div>
  );
};
export default Stage41WorkspaceSubpanel;
