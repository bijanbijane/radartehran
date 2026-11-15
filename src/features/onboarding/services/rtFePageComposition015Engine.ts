/**
 * Stage 15 — Executable Page Composition, Layout Governance & Responsive Policy Engine
 * Spec ID: RT-FE-PAGE-COMPOSITION-015
 */

import {
  RT_PAGE_LAYOUT_CATALOG_10,
  type LayoutDefinition,
  type LayoutId,
  type RegionId,
} from './rtFePageComposition015Specs';

export * from './rtFePageComposition015Specs';

export interface PanelDefinition {
  id: string;
  title: string;
  defaultState: 'open' | 'closed' | 'collapsed';
  resizable: boolean;
  collapsible: boolean;
  pinnable: boolean;
  minWidth: number;
  maxWidth: number;
  defaultWidth: number;
}

export interface WidgetDefinition {
  id: string;
  title: string;
  minHeight?: number;
  preferredSize?: 'small' | 'medium' | 'large';
  resizable: boolean;
  removable: boolean;
  responsive: {
    mobile: 'stack' | 'hide' | 'compact';
    tablet: 'stack' | 'compact' | 'full';
  };
}

export interface LayoutPersistencePayload {
  layoutId: LayoutId;
  contractVersion: number;
  inspectorWidthPx: number;
  asideCollapsed: boolean;
}

export interface LayoutTelemetryEvent {
  event: 'layout_rendered' | 'panel_toggled' | 'panel_resized' | 'widget_failed' | 'fullscreen_changed';
  layoutId: LayoutId;
  regionId?: RegionId;
  deviceClass: 'desktop' | 'tablet' | 'mobile';
  extra?: Record<string, unknown>;
}

export const RT_PAGE_INSPECTOR_PANEL_DEF: PanelDefinition = {
  id: 'inspector-panel',
  title: 'پنل بررسی موجودیت (Inspector)',
  defaultState: 'open',
  resizable: true,
  collapsible: true,
  pinnable: true,
  minWidth: 260,
  maxWidth: 440,
  defaultWidth: 320,
};

/** Validates Layout Registry uniqueness & versioning (§15.7.4). */
export function validateLayoutRegistryUniqueness(layouts: readonly LayoutDefinition[]): { valid: boolean; duplicateIds: LayoutId[] } {
  const seen = new Set<LayoutId>();
  const duplicateIds: LayoutId[] = [];
  for (const layout of layouts) {
    if (seen.has(layout.id) || layout.version < 1) duplicateIds.push(layout.id);
    seen.add(layout.id);
  }
  return { valid: duplicateIds.length === 0, duplicateIds };
}

/** Validates PageComposition regions against the static Type-safe LayoutDefinition (§15.7.4 & §15.30.3). */
export function validatePageCompositionRegions(
  layoutId: LayoutId,
  requestedRegions: readonly RegionId[],
): { valid: boolean; unsupportedRegions: RegionId[]; missingMain: boolean; reasonFa: string } {
  const def = RT_PAGE_LAYOUT_CATALOG_10.find((l) => l.id === layoutId);
  if (!def) {
    return { valid: false, unsupportedRegions: [...requestedRegions], missingMain: true, reasonFa: 'شناسه Layout در کاتالوگ رسمی ثبت نشده است.' };
  }
  const unsupportedRegions = requestedRegions.filter((r) => !def.regions.includes(r));
  const missingMain = !requestedRegions.includes('main');
  if (missingMain) {
    return { valid: false, unsupportedRegions, missingMain: true, reasonFa: 'ناحیه الزامی main باید در ترکیب صفحه حضور داشته باشد (§۱۵.۹.۱).' };
  }
  if (unsupportedRegions.length > 0) {
    return {
      valid: false,
      unsupportedRegions,
      missingMain: false,
      reasonFa: `ناحیه پشتیبانی‌نشده در ${def.code} (${def.titleFa}): ${unsupportedRegions.join(', ')}`,
    };
  }
  return { valid: true, unsupportedRegions: [], missingMain: false, reasonFa: `ترکیب نواحی با ${def.code} (${def.titleFa} v${def.version}) کاملاً سازگار است.` };
}

/** Resolves panel presentation & clamped width across Desktop / Tablet / Mobile + Keyboard Resize (§15.11.3, §15.11.6, §15.24). */
export function resolveResponsivePanelBehavior(input: {
  panel: PanelDefinition;
  viewportWidthPx: number;
  requestedWidthPx: number;
  isOpen: boolean;
}): {
  deviceClass: 'desktop' | 'tablet' | 'mobile';
  presentation: 'docked-column' | 'overlay-drawer' | 'bottom-sheet' | 'collapsed-freed';
  effectiveWidthPx: number;
  triggersMapInvalidateSize: boolean;
  noteFa: string;
} {
  const clampedWidth = Math.min(input.panel.maxWidth, Math.max(input.panel.minWidth, input.requestedWidthPx));
  if (input.viewportWidthPx < 768) {
    return {
      deviceClass: 'mobile',
      presentation: input.isOpen ? 'bottom-sheet' : 'collapsed-freed',
      effectiveWidthPx: input.viewportWidthPx,
      triggersMapInvalidateSize: false,
      noteFa: 'در موبایل (<768px) ستون باریک ممنوع است و پنل به Bottom Sheet / Drawer تبدیل می‌شود.',
    };
  }
  if (input.viewportWidthPx < 1024) {
    return {
      deviceClass: 'tablet',
      presentation: input.isOpen ? 'overlay-drawer' : 'collapsed-freed',
      effectiveWidthPx: clampedWidth,
      triggersMapInvalidateSize: false,
      noteFa: 'در تبلت (<1024px) برای حفظ فضای نمودار و نقشه، پنل در Drawer باز می‌شود.',
    };
  }
  return {
    deviceClass: 'desktop',
    presentation: input.isOpen ? 'docked-column' : 'collapsed-freed',
    effectiveWidthPx: input.isOpen ? clampedWidth : 0,
    triggersMapInvalidateSize: true,
    noteFa: input.isOpen
      ? `ستون کناری به عرض ${clampedWidth}px قفل شد و invalidateSize نقشه فراخوانی می‌شود.`
      : 'در حالت بسته، فضای ستون کاملاً آزاد و به Main Region واگذار شد.',
  };
}

/** Guards against stacked independent Modals & illegal Drawer-over-Modal (§15.22.3 & §15.22.4). */
export function evaluateOverlayStacking(
  overlays: readonly ('drawer' | 'modal' | 'popover' | 'toast')[],
): { allowed: boolean; status: 'VALID' | 'BLOCKED_MODAL_STACKING' | 'BLOCKED_DRAWER_OVER_MODAL'; reasonFa: string } {
  const modalCount = overlays.filter((o) => o === 'modal').length;
  if (modalCount > 1) {
    return { allowed: false, status: 'BLOCKED_MODAL_STACKING', reasonFa: 'بازکردن هم‌زمان چند Modal مستقل روی هم ممنوع است (§۱۵.۲۲.۴).' };
  }
  const modalIdx = overlays.indexOf('modal');
  const drawerIdx = overlays.lastIndexOf('drawer');
  if (modalIdx !== -1 && drawerIdx > modalIdx) {
    return { allowed: false, status: 'BLOCKED_DRAWER_OVER_MODAL', reasonFa: 'قرارگیری Drawer روی Modal فعال بدون سناریوی مصوب مجاز نیست.' };
  }
  return { allowed: true, status: 'VALID', reasonFa: 'ترتیب لایه‌بندی Overlayها با سلسله‌مراتب Z-index هم‌خوان است.' };
}

/** Validates persisted layout preferences against current contract version & safe width bounds (§15.23.5). */
export function validateLayoutPersistencePayload(
  saved: Partial<LayoutPersistencePayload> | null,
  expectedVersion: number,
): { status: 'RESTORED' | 'RESET_TO_DEFAULT'; effectivePayload: LayoutPersistencePayload; reasonFa: string } {
  const fallback: LayoutPersistencePayload = { layoutId: 'map-centric', contractVersion: expectedVersion, inspectorWidthPx: 320, asideCollapsed: false };
  if (!saved || saved.contractVersion !== expectedVersion) {
    return { status: 'RESET_TO_DEFAULT', effectivePayload: fallback, reasonFa: 'نسخه تنظیمات ذخیره‌شده منقضی یا نامعتبر بود؛ بدون خطا به پیش‌فرض بازنشانی شد.' };
  }
  const widthOk = typeof saved.inspectorWidthPx === 'number' && saved.inspectorWidthPx >= 260 && saved.inspectorWidthPx <= 440;
  if (!widthOk || !saved.layoutId) {
    return { status: 'RESET_TO_DEFAULT', effectivePayload: fallback, reasonFa: 'ابعاد پنل نامعتبر بود و به مقدار ایمن ۳۲۰ پیکسل بازیابی شد.' };
  }
  return {
    status: 'RESTORED',
    effectivePayload: {
      layoutId: saved.layoutId,
      contractVersion: expectedVersion,
      inspectorWidthPx: saved.inspectorWidthPx,
      asideCollapsed: Boolean(saved.asideCollapsed),
    },
    reasonFa: `تنظیمات نسخه v${expectedVersion} با عرض پنل ${saved.inspectorWidthPx}px بازیابی شد.`,
  };
}

/** Strips private widget values, keystrokes & mouse tracks from LayoutTelemetryEvent (§15.36). */
export function sanitizeLayoutTelemetryEvent(raw: LayoutTelemetryEvent): {
  safeEvent: Record<string, unknown>;
  strippedFields: string[];
} {
  const forbidden = ['formValues', 'privateWidgetData', 'exactGps', 'mouseTrack', 'keystrokes', 'userId'];
  const strippedFields = Object.keys(raw.extra ?? {}).filter((k) => forbidden.includes(k));
  return {
    safeEvent: {
      event: raw.event,
      layoutId: raw.layoutId,
      regionId: raw.regionId,
      deviceClass: raw.deviceClass,
      timestamp: new Date().toISOString(),
    },
    strippedFields,
  };
}
