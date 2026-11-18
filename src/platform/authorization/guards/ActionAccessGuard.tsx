/**
 * @file src/platform/authorization/guards/ActionAccessGuard.tsx
 * @description 4-State Action Access Guard (Visible, Disabled, Hidden, Restricted) for UI controls.
 */

import React from 'react';
import type { AccessContext, ResourceTargetContext } from '../core/AccessContext';
import type { AccessDecision, ActionUiVisibilityState } from '../core/AccessDecision';
import type { CanonicalPermissionCode } from '../core/Permission';
import { evaluateAccessPolicy } from '../core/AccessPolicy';
import { useAccessController } from '../context/AccessContextProvider';

export interface ResolveActionUiStateOptions {
  permission: CanonicalPermissionCode | string;
  context: AccessContext;
  resource?: ResourceTargetContext;
  deniedMode?: Exclude<ActionUiVisibilityState, 'Visible'>;
  confirmedByUser?: boolean;
}

export function resolveActionAccessUi(options: ResolveActionUiStateOptions): AccessDecision {
  return evaluateAccessPolicy({
    permission: options.permission,
    context: options.context,
    resource: options.resource,
    confirmedByUser: options.confirmedByUser,
    defaultDeniedUiState: options.deniedMode ?? 'Hidden',
  });
}

export interface ActionAccessGuardProps {
  permission: CanonicalPermissionCode | string;
  resource?: ResourceTargetContext;
  deniedMode?: Exclude<ActionUiVisibilityState, 'Visible'>;
  onRestrictedPrompt?: (decision: AccessDecision) => void;
  children: React.ReactNode;
}

export const ActionAccessGuard: React.FC<ActionAccessGuardProps> = ({
  permission,
  resource,
  deniedMode = 'Hidden',
  onRestrictedPrompt,
  children,
}) => {
  const { context } = useAccessController();
  const decision = resolveActionAccessUi({
    permission,
    context,
    resource,
    deniedMode,
  });

  if (decision.uiState === 'Visible' && decision.allowed) {
    return <>{children}</>;
  }

  if (decision.uiState === 'Hidden') {
    return null;
  }

  if (decision.uiState === 'Disabled') {
    return (
      <div
        aria-disabled="true"
        title={decision.userMessageFa}
        className="inline-flex cursor-not-allowed items-center gap-1.5 opacity-55 select-none"
      >
        <div className="pointer-events-none">{children}</div>
      </div>
    );
  }

  // Restricted state: renders an informative prompt button explaining how to unlock/verify
  return (
    <button
      type="button"
      onClick={() => onRestrictedPrompt?.(decision)}
      aria-label={decision.userMessageFa}
      title={decision.userMessageFa}
      className="inline-flex min-h-[44px] items-center gap-1.5 rounded-lg border border-amber-500/40 bg-amber-500/10 px-3 py-1.5 text-xs font-medium text-amber-800 transition-colors hover:bg-amber-500/20 dark:text-amber-200"
    >
      <span>{decision.ctaLabelFa || 'نیازمند سطح دسترسی بالاتر'}</span>
    </button>
  );
};
