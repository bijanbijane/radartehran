/**
 * @file src/platform/authorization/guards/DataAccessGuard.tsx
 * @description Guards sensitive data fields (owner phone, exact coordinates, private documents) from unauthorized DOM rendering.
 */

import React from 'react';
import type { AccessContext, ResourceTargetContext } from '../core/AccessContext';
import type { CanonicalPermissionCode } from '../core/Permission';
import { evaluateAccessPolicy } from '../core/AccessPolicy';
import { useAccessController } from '../context/AccessContextProvider';

export function canRenderProtectedField(
  permission: CanonicalPermissionCode | string,
  context: AccessContext,
  resource?: ResourceTargetContext
): boolean {
  return evaluateAccessPolicy({
    permission,
    context,
    resource,
    defaultDeniedUiState: 'Hidden',
  }).allowed;
}

export function redactSensitiveRecord<T extends Record<string, unknown>>(
  record: T,
  sensitiveKeys: readonly (keyof T)[],
  permission: CanonicalPermissionCode | string,
  context: AccessContext,
  resource?: ResourceTargetContext
): T {
  const allowed = canRenderProtectedField(permission, context, resource);
  if (allowed) return { ...record };
  const clone = { ...record };
  for (const key of sensitiveKeys) {
    delete clone[key];
  }
  return clone;
}

export interface DataAccessGuardProps {
  permission: CanonicalPermissionCode | string;
  resource?: ResourceTargetContext;
  redactedPlaceholderFa?: string;
  children: React.ReactNode;
}

export const DataAccessGuard: React.FC<DataAccessGuardProps> = ({
  permission,
  resource,
  redactedPlaceholderFa = 'اطلاعات محرمانه (نیازمند مجوز دسترسی)',
  children,
}) => {
  const { context } = useAccessController();
  const allowed = canRenderProtectedField(permission, context, resource);

  if (!allowed) {
    return (
      <span
        dir="rtl"
        className="inline-block text-xs text-slate-500 dark:text-[var(--color-text-muted)]"
        aria-label={redactedPlaceholderFa}
      >
        {redactedPlaceholderFa}
      </span>
    );
  }

  return <>{children}</>;
};
