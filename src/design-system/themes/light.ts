/** @file src/design-system/themes/light.ts — Light Theme Token Map */
import { RADAR_BRAND_COLOR_TOKENS, RADAR_LIGHT_SURFACE_TEXT_TOKENS } from '../colorSystem';

export const LIGHT_THEME_TOKENS = {
  mode: 'light' as const,
  direction: 'rtl' as const,
  brandPrimary: RADAR_BRAND_COLOR_TOKENS['brand-600'],
  brandHover: RADAR_BRAND_COLOR_TOKENS['brand-700'],
  bgCanvas: RADAR_LIGHT_SURFACE_TEXT_TOKENS['bg-canvas'],
  bgSurface: RADAR_LIGHT_SURFACE_TEXT_TOKENS['bg-surface'],
  bgElevated: RADAR_LIGHT_SURFACE_TEXT_TOKENS['bg-elevated'],
  bgMuted: RADAR_LIGHT_SURFACE_TEXT_TOKENS['bg-muted'],
  textPrimary: RADAR_LIGHT_SURFACE_TEXT_TOKENS['text-primary'],
  textSecondary: RADAR_LIGHT_SURFACE_TEXT_TOKENS['text-secondary'],
  textMuted: RADAR_LIGHT_SURFACE_TEXT_TOKENS['text-muted'],
  borderSubtle: RADAR_LIGHT_SURFACE_TEXT_TOKENS['border-subtle'],
  borderStrong: RADAR_LIGHT_SURFACE_TEXT_TOKENS['border-strong'],
  focusRing: RADAR_LIGHT_SURFACE_TEXT_TOKENS.focus,
} as const;
