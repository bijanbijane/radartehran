/** @file src/design-system/tokens/shadows.ts — Elevation & Shadow Tokens */
import { ELEVATION_LEVELS } from '../spacingGeometrySystem';

export const RADAR_SHADOW_TOKENS = ELEVATION_LEVELS;

export const DESIGN_SHADOW_TOKENS = {
  none: 'none',
  xs: '0 1px 2px rgba(18, 32, 28, 0.05)',
  sm: '0 2px 6px rgba(18, 32, 28, 0.06)',
  md: '0 8px 24px rgba(18, 32, 28, 0.08), 0 2px 6px rgba(18, 32, 28, 0.05)',
  lg: '0 14px 34px rgba(18, 32, 28, 0.12), 0 4px 10px rgba(18, 32, 28, 0.06)',
  xl: '0 20px 48px rgba(18, 32, 28, 0.16), 0 4px 12px rgba(18, 32, 28, 0.08)',
  catalog: RADAR_SHADOW_TOKENS,
} as const;

export const SHADOW_TOKENS = DESIGN_SHADOW_TOKENS;
