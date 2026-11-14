/** @file src/features/admin/services/adminGovernanceService.ts — RBAC Matrix, Audit Log, Two-Step Dangerous Ops & Moderation Actions */
import { sanitizeInput } from '../../../utils/security';
import {
  loadListingReports,
  loadMyListings,
  saveMyListings,
} from '../../properties/services/listingService';
import type { ListingStatus, PropertyListingRecord } from '../../properties/types/listing.types';
import {
  loadProviderSubmissions,
  loadServiceComplaints,
} from '../../services/services/serviceWorkflowService';
import type { ServiceComplaintRecord } from '../../services/types/service.types';
import type {
  AdminAuditLogEntry,
  AdminGovernancePermission,
  AdminGovernanceRole,
  AdminQueueCounts,
  AdminRoleDefinition,
  SensitiveOperationSpec,
} from '../types/admin.types';

const ADMIN_AUDIT_LOG_KEY = 'radar_admin_governance_audit_v1';
const ADMIN_ROLE_PREVIEW_KEY = 'radar_admin_role_preview_v1';
const SERVICE_DISPUTES_KEY = 'radar_service_disputes_v1';
const SECRET_FIELD_NAMES = new Set(['token', 'password', 'secret', 'apiKey', 'phone', 'email']);

export const ADMIN_ROLE_DEFINITIONS: readonly AdminRoleDefinition[] = [
  {
    role: 'super_admin',
    labelFa: 'مدیر ارشد حاکمیت (Super Admin)',
    scopeSummaryFa: 'دسترسی کامل به ممیزی، انتشار داده، پرچم قابلیت‌ها و عملیات حساس دومرحله‌ای',
    canMutateData: true,
    permissions: [
      'admin:view_overview',
      'admin:moderate_content',
      'admin:verify_providers',
      'admin:resolve_disputes',
      'admin:edit_market_data',
      'admin:manage_flags',
      'admin:run_dangerous_ops',
      'admin:view_audit_security',
    ],
  },
  {
    role: 'content_moderator',
    labelFa: 'ناظر محتوا و آگهی‌ها',
    scopeSummaryFa: 'بررسی آگهی‌های ثبت‌شده، گزارش‌های تخطی و اصلاح/رد با ثبت دلیل',
    canMutateData: true,
    permissions: ['admin:view_overview', 'admin:moderate_content'],
  },
  {
    role: 'service_verifier',
    labelFa: 'ممیز متخصصان و شکایات',
    scopeSummaryFa: 'احراز مدارک ۴-مسیره ارائه‌دهندگان خدمات و رسیدگی به شکایات خصوصی',
    canMutateData: true,
    permissions: ['admin:view_overview', 'admin:verify_providers', 'admin:resolve_disputes'],
  },
  {
    role: 'data_analyst',
    labelFa: 'تحلیلگر داده و مدل (فقط مشاهده و نرخ مرجع)',
    scopeSummaryFa: 'بررسی رجیستری مدل ارزش‌گذاری و نرخ‌های مرجع بدون دسترسی به عملیات مخرب',
    canMutateData: true,
    permissions: ['admin:view_overview', 'admin:edit_market_data'],
  },
  {
    role: 'security_auditor',
    labelFa: 'ممیز امنیت و لاگ (Read-Only)',
    scopeSummaryFa: 'مشاهده وضعیت کلی، ممیزی لاگ‌های حاکمیتی و کنترل دسترسی‌ها بدون حق تغییر داده',
    canMutateData: false,
    permissions: ['admin:view_overview', 'admin:view_audit_security'],
  },
];

export const SENSITIVE_OPERATIONS_CATALOG: readonly SensitiveOperationSpec[] = [
  {
    opId: 'purge_resolved_reports',
    titleFa: 'بایگانی گزارش‌های بررسی‌شده آگهی‌ها',
    impactFa: 'گزارش‌های قدیمی آگهی پس از ثبت در لاگ حاکمیتی از صف فعال پاک می‌شوند.',
    confirmationPhrase: 'CONFIRM',
    requiredSection: 'operations',
  },
  {
    opId: 'reset_local_diagnostics',
    titleFa: 'پاکسازی صف لاگ‌های دیباگ کلاینت',
    impactFa: 'رویدادهای موقت عیب‌یابی مرورگر پاک شده و ثبت ممیزی انجام می‌شود.',
    confirmationPhrase: 'CONFIRM',
    requiredSection: 'security',
  },
];

function readJson<T>(key: string, fallback: T): T {
  if (typeof window === 'undefined') return fallback;
  try {
    const raw = window.localStorage.getItem(key);
    return raw ? (JSON.parse(raw) as T) : fallback;
  } catch {
    return fallback;
  }
}

function writeJson<T>(key: string, value: T): void {
  if (typeof window === 'undefined') return;
  try {
    window.localStorage.setItem(key, JSON.stringify(value));
  } catch { /* ignore quota failures */ }
}

export function canAdminPerformAction(
  role: AdminGovernanceRole,
  permission: AdminGovernancePermission,
): boolean {
  const def = ADMIN_ROLE_DEFINITIONS.find((r) => r.role === role);
  return Boolean(def?.permissions.includes(permission));
}

export function assertAdminGovernancePermission(params: {
  isVerifiedAdmin: boolean;
  role: AdminGovernanceRole;
  permission: AdminGovernancePermission;
}): { allowed: boolean; errorFa?: string } {
  if (!params.isVerifiedAdmin) {
    return { allowed: false, errorFa: 'دسترسی غیرمجاز: نشست مدیر تاییدشده (Firebase Admin Auth) برقرار نیست.' };
  }
  if (!canAdminPerformAction(params.role, params.permission)) {
    return {
      allowed: false,
      errorFa: `نقش «${params.role}» مجوز اجرای عملیات «${params.permission}» را ندارد (اصل حداقل دسترسی).`,
    };
  }
  return { allowed: true };
}

export function loadActiveGovernanceRole(): AdminGovernanceRole {
  return readJson<AdminGovernanceRole>(ADMIN_ROLE_PREVIEW_KEY, 'super_admin');
}

export function saveActiveGovernanceRole(role: AdminGovernanceRole): AdminGovernanceRole {
  writeJson(ADMIN_ROLE_PREVIEW_KEY, role);
  return role;
}

export function loadAdminAuditLogs(): AdminAuditLogEntry[] {
  return readJson<AdminAuditLogEntry[]>(ADMIN_AUDIT_LOG_KEY, []);
}

export function appendAdminAuditLog(
  entry: Omit<AdminAuditLogEntry, 'id' | 'timestampIso'>,
): AdminAuditLogEntry[] {
  // Scrub secret/PII substrings BEFORE sanitizeInput strips '=' or punctuation
  let rawReason = String(entry.reasonFa || '');
  SECRET_FIELD_NAMES.forEach((k) => {
    const re = new RegExp(`${k}\\s*[:=]\\s*\\S+`, 'gi');
    rawReason = rawReason.replace(re, `${k}:[REDACTED]`);
  });
  rawReason = rawReason
    .replace(/\b09\d{9}\b/g, '[PHONE_REDACTED]')
    .replace(/[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/gi, '[EMAIL_REDACTED]');
  const safeReason = sanitizeInput(rawReason, 240);

  const record: AdminAuditLogEntry = {
    ...entry,
    reasonFa: safeReason || 'اقدام مدیریتی ثبت‌شده',
    targetId: sanitizeInput(entry.targetId, 80),
    id: `aud-${Date.now()}-${Math.random().toString(36).slice(2, 5)}`,
    timestampIso: new Date().toISOString(),
  };
  const next = [record, ...loadAdminAuditLogs()].slice(0, 120);
  writeJson(ADMIN_AUDIT_LOG_KEY, next);
  return next;
}

export function validateSensitiveActionConfirmation(params: {
  isVerifiedAdmin: boolean;
  role: AdminGovernanceRole;
  reasonFa: string;
  typedConfirm: string;
  expectedPhrase: string;
}): { ok: boolean; errorFa?: string } {
  const perm = assertAdminGovernancePermission({
    isVerifiedAdmin: params.isVerifiedAdmin,
    role: params.role,
    permission: 'admin:run_dangerous_ops',
  });
  if (!perm.allowed) return { ok: false, errorFa: perm.errorFa };

  if (params.reasonFa.trim().length < 8) {
    return { ok: false, errorFa: 'ثبت دلیل اجرایی (حداقل ۸ کاراکتر) برای ممیزی الزامی است.' };
  }
  if (params.typedConfirm.trim() !== params.expectedPhrase) {
    return { ok: false, errorFa: `عبارت تأیید «${params.expectedPhrase}» به‌درستی وارد نشده است.` };
  }
  return { ok: true };
}

export function computeAdminQueueCounts(params: {
  sponsorRequestsCount: number;
  liveBargainsCount: number;
}): AdminQueueCounts {
  const myListings = loadMyListings();
  const reports = loadListingReports();
  const providers = loadProviderSubmissions();
  const complaints = loadServiceComplaints();

  return {
    pendingUserListings: myListings.filter((l) => l.listing.status === 'pending_review').length,
    listingReports: reports.length,
    pendingProviders: providers.filter((p) => p.moderationStatus === 'pending').length,
    openComplaints: complaints.filter((c) => c.status === 'submitted' || c.status === 'under_review').length,
    pendingSponsorRequests: params.sponsorRequestsCount,
    liveBargainsCount: params.liveBargainsCount,
  };
}

export function moderateUserPropertyListing(params: {
  listingId: string;
  nextStatus: Extract<ListingStatus, 'published' | 'suspended' | 'rejected'>;
  moderatorNoteFa: string;
  role: AdminGovernanceRole;
  isVerifiedAdmin: boolean;
}): { ok: boolean; listings: PropertyListingRecord[]; errorFa?: string } {
  const perm = assertAdminGovernancePermission({
    isVerifiedAdmin: params.isVerifiedAdmin,
    role: params.role,
    permission: 'admin:moderate_content',
  });
  const current = loadMyListings();
  if (!perm.allowed) return { ok: false, listings: current, errorFa: perm.errorFa };
  if (params.moderatorNoteFa.trim().length < 6) {
    return { ok: false, listings: current, errorFa: 'وارد کردن دلیل بررسی (حداقل ۶ کاراکتر) الزامی است.' };
  }

  const next = current.map((rec) =>
    rec.listing.listingId === params.listingId
      ? { ...rec, listing: { ...rec.listing, status: params.nextStatus, updatedAtIso: new Date().toISOString() } }
      : rec,
  );
  saveMyListings(next);
  appendAdminAuditLog({
    actorRole: params.role,
    actorLabelFa: ADMIN_ROLE_DEFINITIONS.find((r) => r.role === params.role)?.labelFa || params.role,
    actionCode: `LISTING_MOD_${params.nextStatus.toUpperCase()}`,
    targetType: 'listing',
    targetId: params.listingId,
    reasonFa: params.moderatorNoteFa,
    severity: params.nextStatus === 'rejected' || params.nextStatus === 'suspended' ? 'warning' : 'info',
  });
  return { ok: true, listings: next };
}

export function resolveServiceComplaint(params: {
  complaintId: string;
  nextStatus: Extract<ServiceComplaintRecord['status'], 'under_review' | 'resolved'>;
  resolutionNoteFa: string;
  role: AdminGovernanceRole;
  isVerifiedAdmin: boolean;
}): { ok: boolean; complaints: ServiceComplaintRecord[]; errorFa?: string } {
  const perm = assertAdminGovernancePermission({
    isVerifiedAdmin: params.isVerifiedAdmin,
    role: params.role,
    permission: 'admin:resolve_disputes',
  });
  const current = loadServiceComplaints();
  if (!perm.allowed) return { ok: false, complaints: current, errorFa: perm.errorFa };
  if (params.resolutionNoteFa.trim().length < 6) {
    return { ok: false, complaints: current, errorFa: 'ثبت گزارش رسیدگی (حداقل ۶ کاراکتر) الزامی است.' };
  }

  const next = current.map((c) =>
    c.complaintId === params.complaintId ? { ...c, status: params.nextStatus } : c,
  );
  writeJson(SERVICE_DISPUTES_KEY, next);
  appendAdminAuditLog({
    actorRole: params.role,
    actorLabelFa: ADMIN_ROLE_DEFINITIONS.find((r) => r.role === params.role)?.labelFa || params.role,
    actionCode: `COMPLAINT_${params.nextStatus.toUpperCase()}`,
    targetType: 'complaint',
    targetId: params.complaintId,
    reasonFa: params.resolutionNoteFa,
    severity: params.nextStatus === 'resolved' ? 'info' : 'warning',
  });
  return { ok: true, complaints: next };
}
