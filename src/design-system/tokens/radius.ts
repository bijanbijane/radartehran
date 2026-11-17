/** @file src/design-system/tokens/radius.ts — Border Radius Tokens */
import { BORDER_RADIUS_SCALE_PX } from '../spacingGeometrySystem';

export const DESIGN_RADIUS_SCALE_PX = {
  none: 0,
  xs: 6,
  sm: 8,
  md: 12,
  lg: 16,
  xl: 20,
  pill: 9999,
} as const;

export const RADIUS_TOKENS = DESIGN_RADIUS_SCALE_PX;
export const RADAR_RADIUS_TOKENS = BORDER_RADIUS_SCALE_PX;
