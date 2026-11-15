/** @file src/features/onboarding/types/onboardingAndResponsive.types.ts — Canonical TypeScript contracts for Stage 32 (RT-UI-ONBOARDING-001) & Stage 33 (RT-UI-RESPONSIVE-001) */

export type UserOnboardingSegment =
  | 'first_time_guest'
  | 'returning_guest'
  | 'registered_user'
  | 'power_expert_user'
  | 'returning_user_new_feature';

export type OnboardingGuideType =
  | 'welcome'
  | 'coachmark'
  | 'tooltip'
  | 'inline'
  | 'empty_state'
  | 'interactive'
  | 'contextual_banner';

export type GuideRepeatPolicy = 'once' | 'on_request' | 'version_change';
export type GuidePublicationLifecycle = 'Draft' | 'Review' | 'Published' | 'Deprecated' | 'Archived';
export type UserGuideProgressStatus = 'not_started' | 'in_progress' | 'completed' | 'skipped' | 'dismissed';

export interface OnboardingGuideDefinition {
  guideId: string;
  version: string;
  featureArea: string;
  guideType: OnboardingGuideType;
  titleFa: string;
  summaryFa: string;
  targetAudience: readonly UserOnboardingSegment[];
  triggerCondition: string;
  repeatPolicy: GuideRepeatPolicy;
  lifecycleStatus: GuidePublicationLifecycle;
  blocksPrimaryInteraction: false;
}

export interface GettingStartedChecklistItem {
  id: string;
  titleFa: string;
  descriptionFa: string;
  actionRoute: string;
  completed: boolean;
}

export interface PendingAuthContinuation {
  actionType: 'save_property' | 'save_neighborhood' | 'save_search' | 'create_alert' | 'submit_listing';
  returnRoute: string;
  payload: Record<string, string>;
  createdAtIso: string;
}

export type ResponsiveViewportTier =
  | 'compact_mobile'
  | 'standard_mobile'
  | 'tablet_portrait'
  | 'tablet_landscape'
  | 'desktop_standard_or_wide';

export type BottomSheetSnapState = 'collapsed' | 'half' | 'expanded';
export type MapActivePanelOwner = 'results' | 'details' | 'layers' | 'filters' | 'help';
export type ResponsiveTableMode =
  | 'horizontal_scroll_with_sticky_first_column'
  | 'row_to_summary_card'
  | 'selectable_column_comparison';

export interface ViewportBreakpointContract {
  tier: ResponsiveViewportTier;
  minWidthPx: number;
  maxWidthPx: number | null;
  labelFa: string;
  navigationPattern: 'bottom_nav_5_tabs' | 'compact_header_with_drawer' | 'desktop_header_bar';
  mapLayoutPattern: 'full_bleed_with_bottom_sheet' | 'full_width_with_overlay_drawer' | 'collapsible_side_panel_352px';
  maxColumns: 1 | 2 | 3 | 4;
  minTouchTargetPx: 40 | 44;
}

export interface BottomSheetGeometryContract {
  snap: BottomSheetSnapState;
  minHeightPx: number;
  maxHeightPx: number;
  viewportHeightRatioMin: number;
  viewportHeightRatioMax: number;
  innerScrollLocked: boolean;
  mapTouchPansMap: boolean;
  dragHandleResizesSheet: true;
}

export interface GisAccordionLayerGroup {
  groupId: string;
  titleFa: string;
  layerIds: readonly string[];
  defaultExpandedOnMobile: boolean;
}

export interface MobileInputKeyboardMapping {
  fieldType: 'mobile_phone' | 'price_or_area' | 'email' | 'global_search' | 'persian_description';
  inputType: 'tel' | 'text' | 'email' | 'search';
  inputMode: 'tel' | 'numeric' | 'email' | 'search' | 'text';
  dir: 'ltr' | 'rtl';
  labelFa: string;
}

export interface AdminMobileSafetyPolicy {
  operationId: string;
  titleFa: string;
  allowedOnMobile: boolean;
  requiresConfirmationModal: true;
  desktopRecommendedReasonFa: string;
}

export interface CrossDevicePreservedState {
  searchQuery: string;
  appliedFilters: Record<string, string | number | boolean>;
  selectedNeighborhoodId: string;
  mapCenter: [number, number];
  mapZoom: number;
  activePanelOwner: MapActivePanelOwner;
  formDraftValues: Record<string, string>;
}
