/** @file src/design-system/tokens/breakpoints.ts — Standard Responsive Breakpoints */
import { RESPONSIVE_GEOMETRY_MATRIX } from '../spacingGeometrySystem';

export const RADAR_RESPONSIVE_BREAKPOINTS = RESPONSIVE_GEOMETRY_MATRIX;

export const DESIGN_BREAKPOINTS_PX = {
  mobileSmall: 360,
  mobileStandard: 390,
  tablet: 768,
  laptop: 1024,
  desktop: 1280,
  wideDesktop: 1440,
  sm: 640,
  md: 768,
  lg: 1024,
  xl: 1280,
  '2xl': 1440,
} as const;

export const BREAKPOINT_TOKENS = DESIGN_BREAKPOINTS_PX;

export type DesignBreakpointName = keyof typeof DESIGN_BREAKPOINTS_PX;

export function resolveActiveBreakpoint(widthPx: number): DesignBreakpointName {
  if (widthPx >= DESIGN_BREAKPOINTS_PX.wideDesktop) return 'wideDesktop';
  if (widthPx >= DESIGN_BREAKPOINTS_PX.desktop) return 'desktop';
  if (widthPx >= DESIGN_BREAKPOINTS_PX.laptop) return 'laptop';
  if (widthPx >= DESIGN_BREAKPOINTS_PX.tablet) return 'tablet';
  if (widthPx >= DESIGN_BREAKPOINTS_PX.mobileStandard) return 'mobileStandard';
  return 'mobileSmall';
}
