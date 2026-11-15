/** @file src/features/onboarding/services/responsiveLayoutEngine.ts — Stage 33 (RT-UI-RESPONSIVE-001) Responsive & Adaptive Multi-Device Engine */
import type {
  AdminMobileSafetyPolicy,
  BottomSheetGeometryContract,
  BottomSheetSnapState,
  CrossDevicePreservedState,
  GisAccordionLayerGroup,
  MapActivePanelOwner,
  MobileInputKeyboardMapping,
  ResponsiveTableMode,
  ResponsiveViewportTier,
  ViewportBreakpointContract,
} from '../types/onboardingAndResponsive.types';

export const TEST_VIEWPORT_WIDTHS_PX: readonly number[] = [
  320, 375, 390, 412, 768, 1024, 1280, 1440, 1920,
] as const;

export const MIN_TOUCH_TARGET_PX = 44;
export const DESKTOP_SIDE_PANEL_WIDTH_PX = 352;
export const MOBILE_STICKY_MAX_VIEWPORT_RATIO = 0.15;

export const RESPONSIVE_VIEWPORT_TIERS: readonly ViewportBreakpointContract[] = [
  {
    tier: 'compact_mobile',
    minWidthPx: 320,
    maxWidthPx: 359,
    labelFa: 'موبایل کوچک (۳۲۰ تا ۳۵۹ پیکسل)',
    navigationPattern: 'bottom_nav_5_tabs',
    mapLayoutPattern: 'full_bleed_with_bottom_sheet',
    maxColumns: 1,
    minTouchTargetPx: 44,
  },
  {
    tier: 'standard_mobile',
    minWidthPx: 360,
    maxWidthPx: 767,
    labelFa: 'موبایل استاندارد (۳۶۰ تا ۷۶۷ پیکسل)',
    navigationPattern: 'bottom_nav_5_tabs',
    mapLayoutPattern: 'full_bleed_with_bottom_sheet',
    maxColumns: 1,
    minTouchTargetPx: 44,
  },
  {
    tier: 'tablet_portrait',
    minWidthPx: 768,
    maxWidthPx: 1023,
    labelFa: 'تبلت عمودی (۷۶۸ تا ۱۰۲۳ پیکسل)',
    navigationPattern: 'compact_header_with_drawer',
    mapLayoutPattern: 'full_width_with_overlay_drawer',
    maxColumns: 2,
    minTouchTargetPx: 44,
  },
  {
    tier: 'tablet_landscape',
    minWidthPx: 1024,
    maxWidthPx: 1279,
    labelFa: 'تبلت افقی و لپ‌تاپ کوچک (۱۰۲۴ تا ۱۲۷۹ پیکسل)',
    navigationPattern: 'desktop_header_bar',
    mapLayoutPattern: 'collapsible_side_panel_352px',
    maxColumns: 3,
    minTouchTargetPx: 40,
  },
  {
    tier: 'desktop_standard_or_wide',
    minWidthPx: 1280,
    maxWidthPx: null,
    labelFa: 'دسکتاپ استاندارد و عریض (۱۲۸۰ پیکسل به بالا)',
    navigationPattern: 'desktop_header_bar',
    mapLayoutPattern: 'collapsible_side_panel_352px',
    maxColumns: 4,
    minTouchTargetPx: 40,
  },
] as const;

export function classifyViewportTier(widthPx: number): ViewportBreakpointContract {
  const safeWidth = Math.max(320, Math.round(widthPx));
  for (const contract of RESPONSIVE_VIEWPORT_TIERS) {
    if (safeWidth >= contract.minWidthPx && (contract.maxWidthPx === null || safeWidth <= contract.maxWidthPx)) {
      return contract;
    }
  }
  return RESPONSIVE_VIEWPORT_TIERS[RESPONSIVE_VIEWPORT_TIERS.length - 1];
}

/** Section 6.2: Container-aware card layout (prevents wide horizontal card inside narrow 352px desktop side panel) */
export function resolveCardLayoutForContainerWidth(containerWidthPx: number): 'compact_vertical' | 'split_horizontal' {
  return containerWidthPx < 480 ? 'compact_vertical' : 'split_horizontal';
}

/** Section 9 & 9.2: Mobile 3-state Bottom Sheet geometry + gesture conflict isolation + virtual keyboard adaptation */
export function resolveBottomSheetGeometry(
  snap: BottomSheetSnapState,
  viewportHeightPx: number,
  virtualKeyboardHeightPx = 0,
): BottomSheetGeometryContract {
  const safeHeight = Math.max(480, viewportHeightPx);
  const effectiveSnap: BottomSheetSnapState =
    virtualKeyboardHeightPx > 120 && snap !== 'expanded' ? 'expanded' : snap;

  if (effectiveSnap === 'collapsed') {
    return {
      snap: 'collapsed',
      minHeightPx: 72,
      maxHeightPx: 120,
      viewportHeightRatioMin: Number((72 / safeHeight).toFixed(2)),
      viewportHeightRatioMax: Number((120 / safeHeight).toFixed(2)),
      innerScrollLocked: true,
      mapTouchPansMap: true,
      dragHandleResizesSheet: true,
    };
  }
  if (effectiveSnap === 'half') {
    return {
      snap: 'half',
      minHeightPx: Math.round(safeHeight * 0.4),
      maxHeightPx: Math.round(safeHeight * 0.55),
      viewportHeightRatioMin: 0.4,
      viewportHeightRatioMax: 0.55,
      innerScrollLocked: false,
      mapTouchPansMap: true,
      dragHandleResizesSheet: true,
    };
  }
  const availableHeight = Math.max(320, safeHeight - Math.max(0, virtualKeyboardHeightPx));
  return {
    snap: 'expanded',
    minHeightPx: Math.round(availableHeight * 0.8),
    maxHeightPx: Math.round(availableHeight * 0.9),
    viewportHeightRatioMin: 0.8,
    viewportHeightRatioMax: 0.9,
    innerScrollLocked: false,
    mapTouchPansMap: false,
    dragHandleResizesSheet: true,
  };
}

/** Section 7.1: Single Active Panel Ownership (prevents overlapping simultaneous panels on map) */
export function arbitrateMapActivePanelOwner(
  tier: ResponsiveViewportTier,
  currentOwner: MapActivePanelOwner,
  requestedOwner: MapActivePanelOwner,
): {
  activeOwner: MapActivePanelOwner;
  presentationMode: 'desktop_side_panel_352px' | 'tablet_overlay_drawer' | 'mobile_bottom_sheet';
  concurrentFloatingPanelsCount: number;
} {
  const nextOwner = currentOwner === requestedOwner ? 'results' : requestedOwner;
  const presentationMode =
    tier === 'compact_mobile' || tier === 'standard_mobile'
      ? 'mobile_bottom_sheet'
      : tier === 'tablet_portrait'
        ? 'tablet_overlay_drawer'
        : 'desktop_side_panel_352px';
  return {
    activeOwner: nextOwner,
    presentationMode,
    concurrentFloatingPanelsCount: 1,
  };
}

/** Section 11: 7-Group Accordion GIS Layer Panel for Mobile & Desktop */
export const GIS_ACCORDION_LAYER_GROUPS: readonly GisAccordionLayerGroup[] = [
  { groupId: 'base_map', titleFa: 'نقشه پایه', layerIds: ['vector_day', 'vector_dark', 'satellite_hybrid'], defaultExpandedOnMobile: true },
  { groupId: 'urban_boundaries', titleFa: 'مرزهای شهری', layerIds: ['district_22_borders', 'neighborhood_polygons'], defaultExpandedOnMobile: false },
  { groupId: 'properties', titleFa: 'املاک', layerIds: ['verified_listings', 'urgent_liquid_deals'], defaultExpandedOnMobile: true },
  { groupId: 'market', titleFa: 'بازار', layerIds: ['sqm_price_heatmap', 'rent_yield_choropleth'], defaultExpandedOnMobile: false },
  { groupId: 'urban_amenities', titleFa: 'امکانات شهری', layerIds: ['metro_brt_stations', 'parks_healthcare_schools'], defaultExpandedOnMobile: false },
  { groupId: 'urban_fabric', titleFa: 'کالبد شهری', layerIds: ['worn_out_texture', 'fault_lines_risk'], defaultExpandedOnMobile: false },
  { groupId: 'environment_research', titleFa: 'محیط و پژوهش', layerIds: ['air_quality_index', 'construction_permits_density'], defaultExpandedOnMobile: false },
] as const;

/** Section 16: Responsive Table Adaptation Strategy */
export function resolveResponsiveTableMode(
  widthPx: number,
  columnCount: number,
  purpose: 'summary_list' | 'neighborhood_comparison' | 'specialized_audit_matrix',
): ResponsiveTableMode {
  if (widthPx >= 1024) return 'horizontal_scroll_with_sticky_first_column';
  if (purpose === 'summary_list' && columnCount <= 5) return 'row_to_summary_card';
  if (purpose === 'neighborhood_comparison') return 'selectable_column_comparison';
  return 'horizontal_scroll_with_sticky_first_column';
}

/** Section 25.1: Mobile Virtual Keyboard & InputMode Contract */
export const MOBILE_INPUT_KEYBOARD_MAPPINGS: readonly MobileInputKeyboardMapping[] = [
  { fieldType: 'mobile_phone', inputType: 'tel', inputMode: 'tel', dir: 'ltr', labelFa: 'شماره موبایل' },
  { fieldType: 'price_or_area', inputType: 'text', inputMode: 'numeric', dir: 'ltr', labelFa: 'قیمت یا متراژ' },
  { fieldType: 'email', inputType: 'email', inputMode: 'email', dir: 'ltr', labelFa: 'پست الکترونیک' },
  { fieldType: 'global_search', inputType: 'search', inputMode: 'search', dir: 'rtl', labelFa: 'جست‌وجوی محله یا ملک' },
  { fieldType: 'persian_description', inputType: 'text', inputMode: 'text', dir: 'rtl', labelFa: 'توضیحات متنی فارسی' },
] as const;

export function resolveMobileInputKeyboardMode(
  fieldType: MobileInputKeyboardMapping['fieldType'],
): MobileInputKeyboardMapping {
  return MOBILE_INPUT_KEYBOARD_MAPPINGS.find((m) => m.fieldType === fieldType) ?? MOBILE_INPUT_KEYBOARD_MAPPINGS[4];
}

/** Section 21: Admin Mobile Safety Gate (restricts complex bulk/schema edits on small screens without bypassing confirmation) */
export const ADMIN_MOBILE_SAFETY_POLICIES: readonly AdminMobileSafetyPolicy[] = [
  {
    operationId: 'listing_moderation_single',
    titleFa: 'بررسی و تایید/رد تکی آگهی',
    allowedOnMobile: true,
    requiresConfirmationModal: true,
    desktopRecommendedReasonFa: 'قابل انجام در موبایل با حفظ مرحله تایید و ثبت دلیل.',
  },
  {
    operationId: 'gis_layer_schema_publish',
    titleFa: 'انتشار نسخه جدید لایه مکانی و تغییر ساختار جدول مرجع',
    allowedOnMobile: false,
    requiresConfirmationModal: true,
    desktopRecommendedReasonFa: 'این عملیات نیازمند بررسی هم‌زمان جدول ستون‌ها و پیش‌نمایش نقشه در نمایشگر دسکتاپ (حداقل ۱۰۲۴ پیکسل) است.',
  },
] as const;

export function evaluateAdminMobileOperationSafety(
  operationId: string,
  viewportWidthPx: number,
): { allowed: boolean; requiresConfirmationModal: true; messageFa: string } {
  const policy = ADMIN_MOBILE_SAFETY_POLICIES.find((p) => p.operationId === operationId);
  const isSmallScreen = viewportWidthPx < 1024;
  if (policy && !policy.allowedOnMobile && isSmallScreen) {
    return {
      allowed: false,
      requiresConfirmationModal: true,
      messageFa: policy.desktopRecommendedReasonFa,
    };
  }
  return {
    allowed: true,
    requiresConfirmationModal: true,
    messageFa: policy?.desktopRecommendedReasonFa ?? 'عملیات با رعایت تایید امنیتی مجاز است.',
  };
}

/** Section 27: Cross-Layout State Continuity Engine (resizing or rotating never resets user context) */
export class CrossDeviceStateContinuityEngine {
  private snapshot: CrossDevicePreservedState;

  constructor(initial: CrossDevicePreservedState) {
    this.snapshot = { ...initial, appliedFilters: { ...initial.appliedFilters }, formDraftValues: { ...initial.formDraftValues } };
  }

  public updateState(partial: Partial<CrossDevicePreservedState>): CrossDevicePreservedState {
    this.snapshot = {
      ...this.snapshot,
      ...partial,
      appliedFilters: partial.appliedFilters ? { ...partial.appliedFilters } : this.snapshot.appliedFilters,
      formDraftValues: partial.formDraftValues ? { ...partial.formDraftValues } : this.snapshot.formDraftValues,
    };
    return this.getSnapshot();
  }

  public resizeOrRotateViewport(newWidthPx: number, newHeightPx: number): {
    tierContract: ViewportBreakpointContract;
    preservedState: CrossDevicePreservedState;
    stateLost: false;
  } {
    const tierContract = classifyViewportTier(newWidthPx);
    void newHeightPx;
    return {
      tierContract,
      preservedState: this.getSnapshot(),
      stateLost: false,
    };
  }

  public getSnapshot(): CrossDevicePreservedState {
    return {
      ...this.snapshot,
      appliedFilters: { ...this.snapshot.appliedFilters },
      formDraftValues: { ...this.snapshot.formDraftValues },
    };
  }
}
