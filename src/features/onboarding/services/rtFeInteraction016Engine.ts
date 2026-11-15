/**
 * Stage 16 — Executable Interaction Patterns, Confirmation, Selection & Motion Governance Engine
 * Spec ID: RT-FE-INTERACTION-PATTERNS-016
 */

import { RT_INT_MOTION_TOKENS_5 } from './rtFeInteraction016Specs';

export * from './rtFeInteraction016Specs';

export type InteractionStatus = 'idle' | 'pending' | 'success' | 'error' | 'cancelled';

export interface ActionResult<T = unknown> {
  status: 'success' | 'partial' | 'error' | 'cancelled';
  data?: T;
  message?: string;
  errorCode?: string;
}

export interface FeedbackDefinition {
  type: 'toast' | 'inline' | 'banner' | 'dialog' | 'progress';
  severity: 'info' | 'success' | 'warning' | 'error';
  title?: string;
  message: string;
  dismissible?: boolean;
}

export interface SelectionState<T> {
  selectedIds: string[];
  mode: 'single' | 'multiple';
  activeId?: string;
  items: T[];
}

export interface InteractionTelemetryEvent {
  event: 'interaction_started' | 'interaction_completed' | 'interaction_failed' | 'action_cancelled' | 'selection_changed' | 'widget_reordered';
  interactionId: string;
  featureId?: string;
  status: 'started' | 'completed' | 'failed' | 'cancelled';
  durationMs?: number;
  extra?: Record<string, unknown>;
}

/** Guards state transitions & blocks double-submission while Loading or Disabled (§16.5.2 & §16.7.5). */
export function evaluateControlInteractionTrigger(input: {
  currentState: 'Idle' | 'Disabled' | 'Loading' | 'Pending' | 'Error';
  allowConcurrent?: boolean;
  isOffline?: boolean;
  requiresServer?: boolean;
}): {
  accepted: boolean;
  nextState: 'Idle' | 'Disabled' | 'Loading' | 'Pending' | 'Error';
  reasonFa: string;
} {
  if (input.currentState === 'Disabled') {
    return { accepted: false, nextState: 'Disabled', reasonFa: 'کنترل در وضعیت Disabled است و محرک کلیک رد شد.' };
  }
  if (input.currentState === 'Loading' && !input.allowConcurrent) {
    return { accepted: false, nextState: 'Loading', reasonFa: 'درخواست قبلی در حال اجراست؛ کلیک تکراری (Double Submission) مسدود شد (§۱۶.۷.۵).' };
  }
  if (input.isOffline && input.requiresServer) {
    return { accepted: false, nextState: 'Error', reasonFa: 'اتصال شبکه برقرار نیست؛ عملیات سرورمحور موفقیت کاذب نمایش نمی‌دهد (§۱۶.۲۴.۱).' };
  }
  return {
    accepted: true,
    nextState: input.requiresServer ? 'Loading' : 'Pending',
    reasonFa: input.requiresServer ? 'عملیات آغاز شد و کنترل تا پاسخ سرور در حالت Loading قفل شد.' : 'عملیات پس‌زمینه با وضعیت متمایز Pending ثبت شد.',
  };
}

/** Enforces C0..C4 Confirmation, Context-specific copy, honest Progress & Bulk partial reporting (§16.9.5, §16.10, §16.12.4). */
export function evaluateActionConfirmationAndFeedback(input: {
  riskLevel: 'C0' | 'C1' | 'C2' | 'C3' | 'C4';
  entityLabelFa: string;
  totalTargets: number;
  succeededTargets: number;
  failedTargets: number;
  hasReliableProgress: boolean;
}): {
  requiresConfirmation: boolean;
  requiresTwoStepConfirm: boolean;
  confirmPromptFa: string | null;
  actionResult: ActionResult<{ succeeded: number; failed: number }>;
  progressMode: 'determinate-percentage' | 'indeterminate-honest';
} {
  const requiresConfirmation = input.riskLevel === 'C2' || input.riskLevel === 'C3' || input.riskLevel === 'C4';
  const requiresTwoStepConfirm = input.riskLevel === 'C4';
  const confirmPromptFa = requiresConfirmation
    ? `آیا می‌خواهید عملیات روی ${input.totalTargets} مورد «${input.entityLabelFa}» را اجرا کنید؟`
    : null;

  let status: ActionResult['status'] = 'success';
  let message = `${input.succeededTargets} مورد «${input.entityLabelFa}» با موفقیت پردازش شد.`;
  if (input.failedTargets > 0 && input.succeededTargets > 0) {
    status = 'partial';
    message = `نتیجه جزئی (Partial): ${input.succeededTargets} مورد موفق و ${input.failedTargets} مورد ناموفق بود (§۱۶.۹.۵).`;
  } else if (input.failedTargets > 0 && input.succeededTargets === 0) {
    status = 'error';
    message = `عملیات روی ${input.failedTargets} مورد ناموفق بود؛ اطلاعات ذخیره نشدند.`;
  }

  return {
    requiresConfirmation,
    requiresTwoStepConfirm,
    confirmPromptFa,
    actionResult: { status, data: { succeeded: input.succeededTargets, failed: input.failedTargets }, message },
    progressMode: input.hasReliableProgress ? 'determinate-percentage' : 'indeterminate-honest',
  };
}

/** Evaluates Multi-Selection Toolbar visibility, Comparison gating & 3-state Hierarchical selection (§16.8.3–§16.8.6). */
export function evaluateSelectionAndToolbar(input: {
  selectedIds: readonly string[];
  totalAvailableChildren: number;
}): {
  selectedCount: number;
  showSelectionToolbar: boolean;
  canCompareProperties: boolean;
  parentCheckState: 'checked' | 'unchecked' | 'indeterminate';
} {
  const selectedCount = input.selectedIds.length;
  const parentCheckState =
    selectedCount === 0
      ? 'unchecked'
      : selectedCount >= input.totalAvailableChildren && input.totalAvailableChildren > 0
        ? 'checked'
        : 'indeterminate';
  return {
    selectedCount,
    showSelectionToolbar: selectedCount > 0,
    canCompareProperties: selectedCount >= 2,
    parentCheckState,
  };
}

/** Prevents duplicate keyboard shortcuts in central Shortcut Registry (§16.23.3). */
export function registerShortcutSafely(
  existingKeys: readonly string[],
  candidateKey: string,
): { registered: boolean; nextKeys: string[]; reasonFa: string } {
  const normalized = candidateKey.trim().toLowerCase();
  if (existingKeys.map((k) => k.toLowerCase()).includes(normalized)) {
    return { registered: false, nextKeys: [...existingKeys], reasonFa: `میان‌بر تکراری «${candidateKey}» در Shortcut Registry رد شد (§۱۶.۲۳.۳).` };
  }
  return { registered: true, nextKeys: [...existingKeys, candidateKey], reasonFa: `میان‌بر «${candidateKey}» با موفقیت ثبت شد.` };
}

/** Resolves animation timing respecting prefers-reduced-motion (§16.21.3 & §16.22.4). */
export function resolveMotionTiming(
  category: 'control' | 'state' | 'panel' | 'drawer' | 'modal',
  reducedMotion: boolean,
): { durationMs: number; reducedApplied: boolean; noteFa: string } {
  if (reducedMotion) {
    return { durationMs: 0, reducedApplied: true, noteFa: 'حالت Reduced Motion فعال است؛ انیمیشن‌های جابه‌جایی حذف و به تغییر وضعیت فوری تبدیل شدند.' };
  }
  const token = RT_INT_MOTION_TOKENS_5.find((t) => t.category === category) ?? RT_INT_MOTION_TOKENS_5[0];
  return { durationMs: token.defaultMs, reducedApplied: false, noteFa: `زمان‌بندی استاندارد ${token.defaultMs}ms (بازه ${token.minMs}..${token.maxMs}ms)` };
}

/** Strips private inputs, passwords, keystrokes & mouse tracks from InteractionTelemetryEvent (§16.33). */
export function sanitizeInteractionTelemetryEvent(raw: InteractionTelemetryEvent): {
  safeEvent: Record<string, unknown>;
  strippedFields: string[];
} {
  const forbidden = ['formText', 'privateMessage', 'password', 'paymentData', 'mouseTrack', 'keystrokes', 'exactGps'];
  const strippedFields = Object.keys(raw.extra ?? {}).filter((k) => forbidden.includes(k));
  return {
    safeEvent: {
      event: raw.event,
      interactionId: raw.interactionId,
      featureId: raw.featureId,
      status: raw.status,
      durationMs: raw.durationMs,
      timestamp: new Date().toISOString(),
    },
    strippedFields,
  };
}
