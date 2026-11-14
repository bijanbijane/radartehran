/** @file src/features/admin/types/admin.types.ts — Stage 23 Admin Governance, RBAC & Operations Types */
import type { AdminSectionId } from '../../../navigation/registry/route.types';

export type AdminGovernanceRole =
  | 'super_admin'
  | 'content_moderator'
  | 'service_verifier'
  | 'data_analyst'
  | 'security_auditor';

export type AdminGovernancePermission =
  | 'admin:view_overview'
  | 'admin:moderate_content'
  | 'admin:verify_providers'
  | 'admin:resolve_disputes'
  | 'admin:edit_market_data'
  | 'admin:manage_flags'
  | 'admin:run_dangerous_ops'
  | 'admin:view_audit_security';

export interface AdminAuditLogEntry {
  id: string;
  actorRole: AdminGovernanceRole;
  actorLabelFa: string;
  actionCode: string;
  targetType: 'listing' | 'provider' | 'complaint' | 'market_data' | 'feature_flag' | 'security_op';
  targetId: string;
  reasonFa: string;
  severity: 'info' | 'warning' | 'critical';
  timestampIso: string;
}

export interface AdminQueueCounts {
  pendingUserListings: number;
  listingReports: number;
  pendingProviders: number;
  openComplaints: number;
  pendingSponsorRequests: number;
  liveBargainsCount: number;
}

export interface AdminRoleDefinition {
  role: AdminGovernanceRole;
  labelFa: string;
  scopeSummaryFa: string;
  permissions: readonly AdminGovernancePermission[];
  canMutateData: boolean;
}

export interface SensitiveOperationSpec {
  opId: 'purge_resolved_reports' | 'lock_provider_suspensions' | 'reset_local_diagnostics';
  titleFa: string;
  impactFa: string;
  confirmationPhrase: 'CONFIRM';
  requiredSection: AdminSectionId;
}
