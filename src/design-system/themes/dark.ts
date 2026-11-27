/** @file src/design-system/themes/dark.ts — Dark Theme Token Map */
import { BRAND_PALETTE, RADAR_DARK_SURFACE_TEXT_TOKENS, SEMANTIC_PALETTE } from '../colorSystem';

export const DARK_THEME_TOKENS = {
  mode: 'dark' as const,
  direction: 'rtl' as const,
  brandPrimary: BRAND_PALETTE.brand500,
  brandHover: BRAND_PALETTE.brand600,
  bgCanvas: RADAR_DARK_SURFACE_TEXT_TOKENS.canvas,
  bgSurface: RADAR_DARK_SURFACE_TEXT_TOKENS.surface,
  bgElevated: RADAR_DARK_SURFACE_TEXT_TOKENS.surfaceSubtle,
  bgMuted: RADAR_DARK_SURFACE_TEXT_TOKENS.surfaceSunken,
  textPrimary: RADAR_DARK_SURFACE_TEXT_TOKENS.textPrimary,
  textSecondary: RADAR_DARK_SURFACE_TEXT_TOKENS.textSecondary,
  textMuted: RADAR_DARK_SURFACE_TEXT_TOKENS.textMuted,
  borderSubtle: RADAR_DARK_SURFACE_TEXT_TOKENS.borderSubtle,
  borderStrong: RADAR_DARK_SURFACE_TEXT_TOKENS.borderStrong,
  focusRing: SEMANTIC_PALETTE.focusRing,
  background: {
    primary: RADAR_DARK_SURFACE_TEXT_TOKENS.canvas,
    surface: RADAR_DARK_SURFACE_TEXT_TOKENS.surface,
    elevated: RADAR_DARK_SURFACE_TEXT_TOKENS.surfaceSubtle,
  },
} as const;
