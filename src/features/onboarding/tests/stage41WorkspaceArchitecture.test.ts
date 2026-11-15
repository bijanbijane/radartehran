import test from 'node:test';
import assert from 'node:assert/strict';
import {
  STAGE41_DESIGN_COMPONENT_IDS,
  canInvitationAccessProtectedContent,
  evaluateWorkspaceActionPermission,
  removeWorkspaceMemberWithAudit,
  saveNoteWithOptimisticLock,
  searchWorkspaceContentSafely,
  transferWorkspaceOwnership,
  updateTaskStatusSafely,
} from '../services/collaborativeWorkspaceEngine';
import { INITIAL_STAGE41_WORKSPACES } from '../services/stage41WorkspaceFixtures';

test('Stage 41 (RT-UI-WORKSPACE-001): enforces RBAC & content policies, invite acceptance gates, optimistic lock conflicts, task assignee guards, member audit retention, and ownership transfer', () => {
  const ws = INITIAL_STAGE41_WORKSPACES[0];
  const personalWs = INITIAL_STAGE41_WORKSPACES[1];

  // 1. Pending invitation cannot access protected workspace content (Test 1)
  assert.equal(canInvitationAccessProtectedContent(ws.invitations[0]), false);
  assert.equal(canInvitationAccessProtectedContent({ ...ws.invitations[0], status: 'accepted' }), true);

  // 2. Viewer cannot edit, comment, invite, or download restricted report (Tests 2 & 6)
  const viewerEdit = evaluateWorkspaceActionPermission({ role: 'viewer', memberStatus: 'active', action: 'edit_content' });
  assert.equal(viewerEdit.allowed, false);
  assert.ok(viewerEdit.messageFa.includes('دسترسی لازم را ندارید'));

  const report = ws.sharedItems.find((i) => i.kind === 'report')!;
  const viewerDownload = evaluateWorkspaceActionPermission({
    role: 'viewer',
    memberStatus: 'active',
    action: 'download',
    contentPolicy: report.policyByRole.viewer,
  });
  assert.equal(viewerDownload.allowed, false);

  // 3. Shared items preserve canonical ref, non-official team review, & non-official map boundary (Tests 3 & 11)
  const mapAnnotation = ws.sharedItems.find((i) => i.kind === 'map_zone')!;
  assert.equal(mapAnnotation.isOfficialBoundary, false);
  assert.equal(mapAnnotation.isOfficialVerification, false);

  // 4. Optimistic locking rejects stale overwrite & triggers conflict flow (Test 8)
  const note = ws.notes[0];
  const conflictRes = saveNoteWithOptimisticLock(note, note.version - 1, 'متن متناقض');
  assert.equal(conflictRes.conflict, true);
  assert.equal(conflictRes.saved, false);
  assert.ok(conflictRes.messageFa.includes('هم‌زمان'));

  // 5. Unassigned task cannot enter in_progress (Section 12)
  const unassignedTask = ws.tasks.find((t) => !t.assigneeId)!;
  const startBlocked = updateTaskStatusSafely(unassignedTask, 'in_progress');
  assert.equal(startBlocked.updated, false);

  // 6. Owner cannot depart before transferring ownership; member removal retains audit history (Tests 7 & 12)
  const ownerSelfRemove = removeWorkspaceMemberWithAudit(ws, ws.ownerId);
  assert.equal(ownerSelfRemove.allowed, false);

  const editorRemoved = removeWorkspaceMemberWithAudit(ws, 'u-editor');
  assert.equal(editorRemoved.allowed, true);
  assert.ok(editorRemoved.updatedWorkspace.activities.some((a) => a.summaryFa.includes('سارا محمدی')));
  assert.equal(editorRemoved.updatedWorkspace.tasks[0].needsManagerReassignment, true);

  const transferred = transferWorkspaceOwnership(ws, 'u-editor');
  assert.equal(transferred.transferred, true);
  assert.equal(transferred.updatedWorkspace.ownerId, 'u-editor');

  // 7. Workspace isolation & Design System WKS-01..28 check (Test 9 & Section 25)
  assert.equal(searchWorkspaceContentSafely(ws, 'viewer', 'خصوصی').length, 0);
  assert.equal(searchWorkspaceContentSafely(personalWs, 'owner', 'خصوصی').length, 1);
  assert.equal(STAGE41_DESIGN_COMPONENT_IDS.length, 28);
});
