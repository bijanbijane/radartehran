/** @file src/features/onboarding/components/Stage41WorkspaceNotesAndTasks.tsx — WKS-11..20 & WKS-27 */
import React, { useState } from 'react';
import {
  evaluateWorkspaceActionPermission,
  saveNoteWithOptimisticLock,
  updateTaskStatusSafely,
  type CollaborativeWorkspace,
  type WorkspaceRole,
} from '../services/collaborativeWorkspaceEngine';

interface Props {
  workspace: CollaborativeWorkspace;
  currentRole: WorkspaceRole;
  searchQuery: string;
  onUpdateWorkspace: (ws: CollaborativeWorkspace) => void;
  onFeedbackFa: (msg: string) => void;
}

export const Stage41WorkspaceNotesAndTasks: React.FC<Props> = ({
  workspace,
  currentRole,
  searchQuery,
  onUpdateWorkspace,
  onFeedbackFa,
}) => {
  const note = workspace.notes[0];
  const [noteDraft, setNoteDraft] = useState(note?.bodyFa ?? '');
  const [staleExpectedVer, setStaleExpectedVer] = useState<number>(note?.version ?? 1);

  const visibleItems = workspace.sharedItems.filter((item) => {
    const policy = item.policyByRole[currentRole] ?? item.defaultPolicy;
    if (!policy.canView) return false;
    return !searchQuery.trim() || item.titleFa.includes(searchQuery.trim());
  });

  const handleSaveNote = (simulateConcurrentEdit: boolean) => {
    if (!note) return;
    const perm = evaluateWorkspaceActionPermission({ role: currentRole, memberStatus: 'active', action: 'comment' });
    if (!perm.allowed) { onFeedbackFa(perm.messageFa); return; }
    const expected = simulateConcurrentEdit ? note.version - 1 : staleExpectedVer;
    const res = saveNoteWithOptimisticLock(note, expected, noteDraft);
    onFeedbackFa(res.messageFa);
    if (res.saved) {
      setStaleExpectedVer(res.note.version);
      onUpdateWorkspace({ ...workspace, notes: [res.note, ...workspace.notes.slice(1)] });
    }
  };

  const handleStartTask = (taskId: string) => {
    const task = workspace.tasks.find((t) => t.taskId === taskId);
    if (!task) return;
    const perm = evaluateWorkspaceActionPermission({ role: currentRole, memberStatus: 'active', action: 'edit_content' });
    if (!perm.allowed) { onFeedbackFa(perm.messageFa); return; }
    const res = updateTaskStatusSafely(task, 'in_progress');
    onFeedbackFa(res.messageFa);
    if (res.updated) {
      onUpdateWorkspace({ ...workspace, tasks: workspace.tasks.map((t) => (t.taskId === taskId ? res.task : t)) });
    }
  };

  return (
    <div className="space-y-3 text-xs" data-testid="stage41-notes-tasks" dir="rtl">
      {/* Shared Content & Map Annotations */}
      <div className="rounded-xl border border-slate-800 bg-slate-950/80 p-3 space-y-2">
        <div className="font-bold text-white">محتوای مشترک و علامت‌های نقشه (حفظ مرجع اصلی + مرز کاری غیررسمی)</div>
        <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
          {visibleItems.map((it) => (
            <div key={it.itemId} className="rounded-lg border border-slate-800 bg-slate-900 p-2.5 space-y-1">
              <div className="font-bold text-white">{it.titleFa}</div>
              <div className="text-[10.5px] text-slate-400">
                مرجع: <span dir="ltr">{it.canonicalRefId}</span> · افزوده توسط: {it.addedByNameFa}
              </div>
              <div className="flex flex-wrap gap-1.5 text-[10px]">
                <span className="rounded border border-cyan-500/40 bg-cyan-950/40 px-1.5 py-0.5 text-cyan-200">
                  بررسی گروهی (غیررسمی): {it.teamReviewStatus}
                </span>
                {it.kind === 'map_zone' && (
                  <span className="rounded border border-amber-500/40 bg-amber-950/30 px-1.5 py-0.5 text-amber-200">
                    مرز رسمی جغرافیایی نیست
                  </span>
                )}
              </div>
            </div>
          ))}
        </div>
      </div>

      <div className="grid grid-cols-1 gap-3 lg:grid-cols-2">
        {/* Optimistic Lock Note & Comment Thread */}
        {note && (
          <div className="rounded-xl border border-slate-800 bg-slate-950/80 p-3 space-y-2">
            <div className="font-bold text-white">یادداشت مشترک و مدیریت تعارض هم‌زمان (WKS-14 & WKS-27 · v{note.version})</div>
            <textarea value={noteDraft} onChange={(e) => setNoteDraft(e.target.value)} rows={2} aria-label="متن یادداشت مشترک" className="w-full rounded border border-slate-700 bg-slate-900 p-2 text-[11px] text-white" />
            <div className="flex flex-wrap gap-1.5">
              <button type="button" data-testid="wks-save-note-btn" onClick={() => handleSaveNote(false)} className="rounded bg-[var(--color-brand-600)] px-2.5 py-1 text-[11px] font-bold text-white">ذخیره یادداشت</button>
              <button type="button" data-testid="wks-conflict-note-btn" onClick={() => handleSaveNote(true)} className="rounded border border-amber-500/40 bg-amber-950/30 px-2.5 py-1 text-[11px] font-bold text-amber-200">شبیه‌سازی تعارض هم‌زمان</button>
            </div>
          </div>
        )}

        {/* Tasks & Assignee Invariant */}
        <div className="rounded-xl border border-slate-800 bg-slate-950/80 p-3 space-y-2">
          <div className="font-bold text-white">وظایف گروه و تاریخچه فعالیت (WKS-17..20)</div>
          {workspace.tasks.map((t) => (
            <div key={t.taskId} className="flex flex-wrap items-center justify-between gap-2 rounded border border-slate-800 bg-slate-900 px-2.5 py-1.5">
              <div>
                <div className="font-semibold text-white">{t.titleFa}</div>
                <div className="text-[10.5px] text-slate-400">مسئول: {t.assigneeNameFa ?? 'تعیین‌نشده'} · وضعیت: {t.status}</div>
              </div>
              {t.status === 'open' && (
                <button type="button" data-testid={`start-task-${t.taskId}`} onClick={() => handleStartTask(t.taskId)} className="rounded border border-cyan-500/40 px-2 py-0.5 text-[10.5px] text-cyan-200">
                  شروع کار
                </button>
              )}
            </div>
          ))}
          <div className="text-[10.5px] text-slate-400 pt-1">
            آخرین فعالیت ثبت‌شده: {workspace.activities[0]?.summaryFa ?? 'فعالیتی ثبت نشده'} ({workspace.activities.length} رویداد)
          </div>
        </div>
      </div>
    </div>
  );
};
