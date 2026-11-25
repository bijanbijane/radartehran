/**
 * @file src/features/access-control/components/PermissionManagementPanel.tsx
 * @description 12-Part Permission Management UI Panel for Stage 25 (RT-FE-USER-ACCESS-CONTROL-025).
 */

import React, { useMemo, useState } from 'react';
import {
  ALL_CANONICAL_ROLES,
  RESOURCE_GROUP_REGISTRY,
  ROLE_DEFINITIONS,
  type AccessContext,
  type CanonicalBaseRole,
  type PermissionResourceGroup,
} from '../../../platform/authorization';
import {
  applyWorkspaceMemberRoleChange,
  buildPermissionManagementSummary,
  filterPermissionCatalog,
} from '../services/permissionManagementService';
import type { WorkspaceMemberAccessProfile } from '../types/accessControl.types';

export interface PermissionManagementPanelProps {
  context: AccessContext;
  initialMembers?: WorkspaceMemberAccessProfile[];
}

export const PermissionManagementPanel: React.FC<PermissionManagementPanelProps> = ({
  context,
  initialMembers = [],
}) => {
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedResource, setSelectedResource] = useState<PermissionResourceGroup | 'all'>('all');
  const [selectedRole, setSelectedRole] = useState<CanonicalBaseRole | 'all'>('all');
  const [onlySensitive, setOnlySensitive] = useState(false);
  const [members, setMembers] = useState<WorkspaceMemberAccessProfile[]>(initialMembers);
  const [statusBannerFa, setStatusBannerFa] = useState<string | null>(null);

  const summary = useMemo(() => buildPermissionManagementSummary(context), [context]);

  const filteredPermissions = useMemo(
    () =>
      filterPermissionCatalog({
        searchQuery,
        selectedResource,
        selectedRole,
        onlySensitive,
      }),
    [searchQuery, selectedResource, selectedRole, onlySensitive]
  );

  const handleRoleChange = (targetUserId: string, nextRole: CanonicalBaseRole) => {
    const res = applyWorkspaceMemberRoleChange({
      actorContext: context,
      members,
      targetUserId,
      nextRole,
      confirmedByUser: true,
    });
    setMembers(res.updatedMembers);
    setStatusBannerFa(res.messageFa);
  };

  return (
    <section
      dir="rtl"
      aria-label="مدیریت مجوزها و کنترل دسترسی فضای کاری"
      className="space-y-6 rounded-2xl border border-slate-200 bg-white p-6 text-right text-slate-900 dark:border-[var(--color-border-subtle)] dark:bg-[var(--color-bg-surface)] dark:text-[var(--color-text-primary)]"
    >
      {/* Part 1 & 2: Active Role, Workspace & Security Summary */}
      <header className="flex flex-wrap items-center justify-between gap-4 border-b border-slate-200 pb-4 dark:border-[var(--color-border-subtle)]">
        <div>
          <h2 className="text-lg font-bold">مدیریت سطح دسترسی و مجوزهای عملیاتی</h2>
          <p className="mt-1 text-xs text-slate-500 dark:text-[var(--color-text-muted)]">
            نقش فعال: {summary.activeRoleTitleFa} · فضای کاری: {context.activeWorkspaceId || 'شخصی'} · نسخه مجوز:{' '}
            <span className="font-mono tabular-nums">v{context.permissionVersion}</span>
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-4 text-xs text-slate-600 dark:text-[var(--color-text-secondary)]">
          <span>گروه‌های منبع: <strong className="font-mono tabular-nums">{summary.totalResourceGroups}</strong></span>
          <span aria-hidden="true">·</span>
          <span>کل مجوزها: <strong className="font-mono tabular-nums">{summary.totalPermissions}</strong></span>
          <span aria-hidden="true">·</span>
          <span>مجوزهای فعال نقش: <strong className="font-mono tabular-nums">{summary.effectivePermissionCount}</strong></span>
        </div>
      </header>

      {/* Part 3: Impersonation & Step-Up Warning Banner */}
      {context.isImpersonating && (
        <div
          role="status"
          className="rounded-xl border border-amber-500/40 bg-amber-500/10 p-3 text-xs text-amber-800 dark:text-amber-200"
        >
          حالت مشاهده پشتیبانی (Impersonation) فعال است؛ تمامی عملیات تغییردهنده و حساس غیرفعال شده‌اند.
        </div>
      )}

      {statusBannerFa && (
        <div
          role="status"
          aria-live="polite"
          className="rounded-xl border border-slate-200 bg-slate-50 p-3 text-xs dark:border-[var(--color-border-subtle)] dark:bg-[var(--color-bg-muted)]"
        >
          {statusBannerFa}
        </div>
      )}

      {/* Part 4, 5, 6: Filter Bar by Query, Resource Group & Role */}
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-4">
        <input
          type="search"
          value={searchQuery}
          onChange={(e) => setSearchQuery(e.target.value)}
          placeholder="جست‌وجوی کد یا عنوان مجوز..."
          aria-label="جست‌وجوی کد یا عنوان مجوز"
          className="min-h-[44px] rounded-xl border border-slate-300 bg-transparent px-3 py-2 text-xs dark:border-[var(--color-border-strong)]"
        />
        <select
          value={selectedResource}
          onChange={(e) => setSelectedResource(e.target.value as PermissionResourceGroup | 'all')}
          aria-label="فیلتر بر اساس گروه منبع"
          className="min-h-[44px] rounded-xl border border-slate-300 bg-transparent px-3 py-2 text-xs dark:border-[var(--color-border-strong)]"
        >
          <option value="all">همه ۱۲ گروه منبع</option>
          {RESOURCE_GROUP_REGISTRY.map((g) => (
            <option key={g.id} value={g.resource}>
              {g.titleFa} ({g.resource})
            </option>
          ))}
        </select>
        <select
          value={selectedRole}
          onChange={(e) => setSelectedRole(e.target.value as CanonicalBaseRole | 'all')}
          aria-label="فیلتر بر اساس نقش پایه"
          className="min-h-[44px] rounded-xl border border-slate-300 bg-transparent px-3 py-2 text-xs dark:border-[var(--color-border-strong)]"
        >
          <option value="all">همه ۱۲ نقش سامانه</option>
          {ALL_CANONICAL_ROLES.map((r) => (
            <option key={r} value={r}>
              {ROLE_DEFINITIONS[r].titleFa}
            </option>
          ))}
        </select>
        <label className="flex min-h-[44px] cursor-pointer items-center gap-2 rounded-xl border border-slate-300 px-3 py-2 text-xs dark:border-[var(--color-border-strong)]">
          <input
            type="checkbox"
            checked={onlySensitive}
            onChange={(e) => setOnlySensitive(e.target.checked)}
            aria-label="فقط عملیات حساس"
          />
          <span>فقط عملیات حساس (نیازمند تأیید)</span>
        </label>
      </div>

      {/* Part 7..9: Workspace Members & Last-Active-Manager Protected Role Assignment */}
      {members.length > 0 && (
        <div className="space-y-2">
          <h3 className="text-sm font-semibold">اعضای فضای کاری و تخصیص نقش</h3>
          <div className="overflow-x-auto rounded-xl border border-slate-200 dark:border-[var(--color-border-subtle)]">
            <table className="w-full text-right text-xs">
              <thead className="border-b border-slate-200 bg-slate-50 dark:border-[var(--color-border-subtle)] dark:bg-[var(--color-bg-muted)]">
                <tr>
                  <th className="px-3 py-2.5">نام عضو</th>
                  <th className="px-3 py-2.5">نقش فعلی</th>
                  <th className="px-3 py-2.5">وضعیت</th>
                  <th className="px-3 py-2.5">تغییر نقش</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-200 dark:divide-[var(--color-border-subtle)]">
                {members.map((m) => (
                  <tr key={m.userId}>
                    <td className="px-3 py-2 font-medium">{m.displayNameFa}</td>
                    <td className="px-3 py-2">{ROLE_DEFINITIONS[m.role]?.titleFa || m.role}</td>
                    <td className="px-3 py-2 font-mono tabular-nums">{m.status}</td>
                    <td className="px-3 py-2">
                      <select
                        value={m.role}
                        aria-label={`تغییر نقش ${m.displayNameFa}`}
                        onChange={(e) => handleRoleChange(m.userId, e.target.value as CanonicalBaseRole)}
                        className="min-h-[36px] rounded-lg border border-slate-300 bg-transparent px-2 py-1 text-xs dark:border-[var(--color-border-strong)]"
                      >
                        {ALL_CANONICAL_ROLES.map((r) => (
                          <option key={r} value={r}>
                            {ROLE_DEFINITIONS[r].titleFa}
                          </option>
                        ))}
                      </select>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Part 10..12: Permission Catalog Table with Scope, Sensitivity & Step-Up Markers */}
      <div className="overflow-x-auto rounded-xl border border-slate-200 dark:border-[var(--color-border-subtle)]">
        <table className="w-full text-right text-xs">
          <thead className="border-b border-slate-200 bg-slate-50 dark:border-[var(--color-border-subtle)] dark:bg-[var(--color-bg-muted)]">
            <tr>
              <th className="px-3 py-2.5">شناسه مجوز</th>
              <th className="px-3 py-2.5">عنوان فارسی</th>
              <th className="px-3 py-2.5">محدوده (Scope)</th>
              <th className="px-3 py-2.5">الزام امنیتی</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-200 dark:divide-[var(--color-border-subtle)]">
            {filteredPermissions.map((perm) => (
              <tr key={perm.code}>
                <td className="px-3 py-2 font-mono tabular-nums">{perm.code}</td>
                <td className="px-3 py-2">{perm.titleFa}</td>
                <td className="px-3 py-2 font-mono">{perm.scope}</td>
                <td className="px-3 py-2 text-slate-500 dark:text-[var(--color-text-muted)]">
                  {perm.requiresStepUp
                    ? 'تأیید هویت مجدد (Step-Up)'
                    : perm.requiresConfirmation
                      ? 'تأیید صریح کاربر'
                      : 'استاندارد'}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </section>
  );
};
