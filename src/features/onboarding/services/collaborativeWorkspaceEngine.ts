/** @file src/features/onboarding/services/collaborativeWorkspaceEngine.ts — Stage 41 (RT-UI-WORKSPACE-001) Pure Engine */
export type WorkspaceKind = 'personal' | 'group' | 'professional' | 'enterprise';
export type WorkspaceRole = 'owner' | 'admin' | 'editor' | 'contributor' | 'viewer';
export type InvitationStatus = 'pending' | 'accepted' | 'expired' | 'revoked' | 'declined';
export type TeamReviewStatus = 'unreviewed' | 'in_review' | 'needs_info' | 'reviewed' | 'rejected';
export type WorkspaceTaskStatus = 'open' | 'in_progress' | 'needs_review' | 'done' | 'cancelled';
export type ReportCollabAction = 'comment' | 'revision_suggestion' | 'new_version';

export interface ContentAccessPolicy {
  canView: boolean;
  canComment: boolean;
  canEdit: boolean;
  canDownload: boolean;
  canShareExternal: boolean;
}

export interface WorkspaceMember {
  userId: string;
  displayNameFa: string;
  role: WorkspaceRole;
  status: 'active' | 'removed';
  joinedAtLabelFa: string;
}

export interface WorkspaceInvitation {
  inviteId: string;
  targetEmailOrName: string;
  invitedByFa: string;
  proposedRole: WorkspaceRole;
  status: InvitationStatus;
  expiresInDays: number;
  revoked: boolean;
}

export interface SharedWorkspaceItem {
  itemId: string;
  kind: 'property' | 'neighborhood' | 'map_zone' | 'report' | 'comparison' | 'valuation';
  canonicalRefId: string;
  titleFa: string;
  addedByNameFa: string;
  addedAtLabelFa: string;
  teamReviewStatus: TeamReviewStatus;
  isOfficialVerification: false;
  isOfficialBoundary: false;
  policyByRole: Partial<Record<WorkspaceRole, ContentAccessPolicy>>;
  defaultPolicy: ContentAccessPolicy;
}

export interface WorkspaceNoteRecord {
  noteId: string;
  targetItemId: string;
  authorNameFa: string;
  bodyFa: string;
  version: number;
  updatedAtLabelFa: string;
  comments: Array<{ id: string; authorFa: string; textFa: string; timeLabelFa: string }>;
}

export interface WorkspaceTaskRecord {
  taskId: string;
  titleFa: string;
  assigneeId?: string;
  assigneeNameFa?: string;
  status: WorkspaceTaskStatus;
  priority: 'low' | 'medium' | 'high';
  dueLabelFa: string;
  needsManagerReassignment?: boolean;
}

export interface WorkspaceActivityEntry {
  id: string;
  actorNameFa: string;
  actionType: 'member' | 'content' | 'report' | 'task' | 'permission' | 'ownership';
  summaryFa: string;
  timeLabelFa: string;
  restrictedToManagers?: boolean;
}

export interface CollaborativeWorkspace {
  workspaceId: string;
  nameFa: string;
  kind: WorkspaceKind;
  ownerId: string;
  ownerNameFa: string;
  archived: boolean;
  activeSearchFilter: string;
  members: WorkspaceMember[];
  invitations: WorkspaceInvitation[];
  sharedItems: SharedWorkspaceItem[];
  notes: WorkspaceNoteRecord[];
  tasks: WorkspaceTaskRecord[];
  activities: WorkspaceActivityEntry[];
}

export const STAGE41_DESIGN_COMPONENT_IDS = [
  'WKS-01', 'WKS-02', 'WKS-03', 'WKS-04', 'WKS-05', 'WKS-06', 'WKS-07', 'WKS-08', 'WKS-09', 'WKS-10',
  'WKS-11', 'WKS-12', 'WKS-13', 'WKS-14', 'WKS-15', 'WKS-16', 'WKS-17', 'WKS-18', 'WKS-19', 'WKS-20',
  'WKS-21', 'WKS-22', 'WKS-23', 'WKS-24', 'WKS-25', 'WKS-26', 'WKS-27', 'WKS-28',
] as const;

export const STAGE41_UX_EVENTS = [
  'workspace_created', 'workspace_member_invited', 'workspace_invitation_accepted', 'workspace_role_changed',
  'workspace_content_added', 'workspace_note_created', 'workspace_comment_added', 'workspace_task_created',
  'workspace_task_completed', 'workspace_report_added', 'workspace_map_annotation_created',
  'workspace_access_changed', 'workspace_member_removed', 'workspace_archived',
] as const;

export const WORKSPACE_ROLE_LABELS_FA: Record<WorkspaceRole, string> = {
  owner: 'مالک',
  admin: 'مدیر',
  editor: 'ویرایشگر',
  contributor: 'مشارکت‌کننده',
  viewer: 'مشاهده‌گر',
};

export function evaluateWorkspaceActionPermission(params: {
  role: WorkspaceRole;
  memberStatus: 'active' | 'removed';
  action: 'view' | 'invite' | 'change_role' | 'add_content' | 'edit_content' | 'comment' | 'download' | 'share_external' | 'delete_workspace';
  contentPolicy?: ContentAccessPolicy;
}): { allowed: boolean; messageFa: string } {
  if (params.memberStatus !== 'active') {
    return { allowed: false, messageFa: 'دسترسی شما در این فضای کاری قطع شده یا هنوز پذیرفته نشده است.' };
  }
  const denialMsg = 'برای انجام این عملیات دسترسی لازم را ندارید. نقش یا مجوز شما اجازه این تغییر را نمی‌دهد.';
  if (params.action === 'delete_workspace') {
    return params.role === 'owner' ? { allowed: true, messageFa: 'مجاز' } : { allowed: false, messageFa: denialMsg };
  }
  if (params.action === 'invite' || params.action === 'change_role') {
    return params.role === 'owner' || params.role === 'admin' ? { allowed: true, messageFa: 'مجاز' } : { allowed: false, messageFa: denialMsg };
  }
  if (params.action === 'edit_content' || params.action === 'add_content') {
    if (params.role === 'viewer') return { allowed: false, messageFa: denialMsg };
    if (params.contentPolicy && params.action === 'edit_content' && !params.contentPolicy.canEdit) {
      return { allowed: false, messageFa: denialMsg };
    }
    return params.role === 'contributor' && params.action === 'edit_content'
      ? { allowed: false, messageFa: denialMsg }
      : { allowed: true, messageFa: 'مجاز' };
  }
  if (params.action === 'comment') {
    if (params.role === 'viewer') return { allowed: false, messageFa: denialMsg };
    if (params.contentPolicy && !params.contentPolicy.canComment) return { allowed: false, messageFa: denialMsg };
    return { allowed: true, messageFa: 'مجاز' };
  }
  if (params.action === 'download' && params.contentPolicy && !params.contentPolicy.canDownload) {
    return { allowed: false, messageFa: denialMsg };
  }
  if (params.action === 'share_external' && params.contentPolicy && !params.contentPolicy.canShareExternal) {
    return { allowed: false, messageFa: denialMsg };
  }
  return { allowed: true, messageFa: 'مجاز' };
}

export function canInvitationAccessProtectedContent(inv: WorkspaceInvitation): boolean {
  return inv.status === 'accepted' && !inv.revoked && inv.expiresInDays > 0;
}

export function saveNoteWithOptimisticLock(
  existing: WorkspaceNoteRecord,
  expectedVersion: number,
  nextBodyFa: string,
): { saved: boolean; conflict: boolean; messageFa: string; note: WorkspaceNoteRecord } {
  if (expectedVersion !== existing.version) {
    return {
      saved: false,
      conflict: true,
      messageFa: 'این محتوا هم‌زمان توسط عضو دیگری تغییر کرده است. پیش از ذخیره، تغییرات را بررسی کنید.',
      note: existing,
    };
  }
  return {
    saved: true,
    conflict: false,
    messageFa: 'یادداشت با حفظ نسخه قبلی ذخیره شد.',
    note: { ...existing, bodyFa: nextBodyFa, version: existing.version + 1, updatedAtLabelFa: '۱۴ آبان ۱۴۰۵ (ویرایش جدید)' },
  };
}

export function updateTaskStatusSafely(
  task: WorkspaceTaskRecord,
  nextStatus: WorkspaceTaskStatus,
): { updated: boolean; messageFa: string; task: WorkspaceTaskRecord } {
  if (nextStatus === 'in_progress' && !task.assigneeId) {
    return { updated: false, messageFa: 'وظیفه بدون مسئول مشخص نمی‌تواند در وضعیت «در حال انجام» قرار گیرد.', task };
  }
  return { updated: true, messageFa: 'وضعیت وظیفه به‌روزرسانی شد.', task: { ...task, status: nextStatus } };
}

export function removeWorkspaceMemberWithAudit(
  ws: CollaborativeWorkspace,
  targetUserId: string,
): { allowed: boolean; messageFa: string; updatedWorkspace: CollaborativeWorkspace } {
  if (targetUserId === ws.ownerId) {
    return { allowed: false, messageFa: 'مالک فضای کاری پیش از خروج باید مالکیت را به عضو دیگری منتقل کند.', updatedWorkspace: ws };
  }
  const target = ws.members.find((m) => m.userId === targetUserId);
  if (!target) return { allowed: false, messageFa: 'عضو یافت نشد.', updatedWorkspace: ws };
  return {
    allowed: true,
    messageFa: `دسترسی ${target.displayNameFa} قطع شد و تاریخچه فعالیت‌های قبلی او بدون تغییر حفظ گردید.`,
    updatedWorkspace: {
      ...ws,
      members: ws.members.map((m) => (m.userId === targetUserId ? { ...m, status: 'removed' } : m)),
      tasks: ws.tasks.map((t) => (t.assigneeId === targetUserId && t.status !== 'done' ? { ...t, needsManagerReassignment: true } : t)),
      activities: [
        { id: `act-${Date.now()}`, actorNameFa: ws.ownerNameFa, actionType: 'member', summaryFa: `عضویت ${target.displayNameFa} لغو شد (سابقه تاریخی حفظ شد).`, timeLabelFa: '۱۴ آبان ۱۴۰۵', restrictedToManagers: true },
        ...ws.activities,
      ],
    },
  };
}

export function transferWorkspaceOwnership(
  ws: CollaborativeWorkspace,
  newOwnerId: string,
): { transferred: boolean; messageFa: string; updatedWorkspace: CollaborativeWorkspace } {
  const candidate = ws.members.find((m) => m.userId === newOwnerId && m.status === 'active');
  if (!candidate) return { transferred: false, messageFa: 'مالک جدید باید عضو فعال فضای کاری باشد.', updatedWorkspace: ws };
  return {
    transferred: true,
    messageFa: `مالکیت فضا با موفقیت به ${candidate.displayNameFa} منتقل شد.`,
    updatedWorkspace: {
      ...ws,
      ownerId: candidate.userId,
      ownerNameFa: candidate.displayNameFa,
      members: ws.members.map((m) =>
        m.userId === candidate.userId ? { ...m, role: 'owner' } : m.userId === ws.ownerId ? { ...m, role: 'admin' } : m,
      ),
      activities: [
        { id: `act-own-${Date.now()}`, actorNameFa: ws.ownerNameFa, actionType: 'ownership', summaryFa: `مالکیت فضای کاری به ${candidate.displayNameFa} منتقل شد.`, timeLabelFa: '۱۴ آبان ۱۴۰۵' },
        ...ws.activities,
      ],
    },
  };
}

export function searchWorkspaceContentSafely(
  ws: CollaborativeWorkspace,
  role: WorkspaceRole,
  query: string,
): SharedWorkspaceItem[] {
  const q = query.trim();
  return ws.sharedItems.filter((item) => {
    const policy = item.policyByRole[role] ?? item.defaultPolicy;
    if (!policy.canView) return false;
    return !q || item.titleFa.includes(q) || item.canonicalRefId.includes(q);
  });
}
