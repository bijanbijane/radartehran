/**
 * @file src/platform/accessibility/index.ts
 * @description Stage 16 (RT-FE-REBUILD-ACCESSIBILITY-REACHABILITY-016) — WCAG 2.2 AA Compliance,
 * Keyboard Reachability, Off-Screen Inert Isolation, 9 Reference Viewports & RTL Bidi Isolation.
 */

export const RT_FE_REBUILD_STAGE_16_SPEC_ID = 'RT-FE-REBUILD-ACCESSIBILITY-REACHABILITY-016' as const;

export const NINE_REFERENCE_VIEWPORTS = [
  { id: 'mobile-se', width: 320, height: 568, tier: 'mobile' },
  { id: 'mobile-android', width: 360, height: 800, tier: 'mobile' },
  { id: 'mobile-standard', width: 375, height: 812, tier: 'mobile' },
  { id: 'mobile-pro', width: 390, height: 844, tier: 'mobile' },
  { id: 'mobile-max', width: 430, height: 932, tier: 'mobile' },
  { id: 'tablet-portrait', width: 768, height: 1024, tier: 'tablet' },
  { id: 'tablet-landscape', width: 1024, height: 768, tier: 'tablet' },
  { id: 'desktop-laptop', width: 1280, height: 800, tier: 'desktop' },
  { id: 'desktop-wide', width: 1440, height: 900, tier: 'desktop' },
] as const;

export function validateTouchTargetDimensions(input: {
  widthPx: number;
  heightPx: number;
  isPrimaryMobileControl?: boolean;
}): {
  readonly passesWcagMinimum24: boolean;
  readonly passesMobileTouch44: boolean;
  readonly compliant: boolean;
} {
  const passesWcagMinimum24 = input.widthPx >= 24 && input.heightPx >= 24;
  const passesMobileTouch44 = input.widthPx >= 44 && input.heightPx >= 44;
  const compliant = input.isPrimaryMobileControl ? passesMobileTouch44 : passesWcagMinimum24;
  return { passesWcagMinimum24, passesMobileTouch44, compliant };
}

export function evaluateContrastRatioCompliance(input: {
  contrastRatio: number;
  isLargeText?: boolean;
  isGraphicalUiComponent?: boolean;
}): {
  readonly passesAA: boolean;
  readonly minimumRequiredRatio: number;
} {
  const minimumRequiredRatio = input.isGraphicalUiComponent || input.isLargeText ? 3.0 : 4.5;
  return {
    passesAA: input.contrastRatio >= minimumRequiredRatio,
    minimumRequiredRatio,
  };
}

export function resolveCollapsibleDrawerA11yProps(input: {
  isMobileViewport: boolean;
  mobileSheetOpen: boolean;
  desktopCollapsed: boolean;
}): {
  readonly isContentHiddenFromFocus: boolean;
  readonly inert: boolean | undefined;
  readonly ariaHidden: boolean | undefined;
} {
  const isContentHiddenFromFocus = input.isMobileViewport ? !input.mobileSheetOpen : input.desktopCollapsed;
  return {
    isContentHiddenFromFocus,
    inert: isContentHiddenFromFocus ? true : undefined,
    ariaHidden: isContentHiddenFromFocus ? true : undefined,
  };
}

export function formatBidiIsolatedLtrValue(rawValue: string): {
  readonly dir: 'ltr';
  readonly unicodeBidi: 'isolate';
  readonly text: string;
} {
  return {
    dir: 'ltr',
    unicodeBidi: 'isolate',
    text: String(rawValue ?? '').trim(),
  };
}
