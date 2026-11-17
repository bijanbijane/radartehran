/** @file src/design-system/themes/dark.ts — Dark Theme Token Map */
import { RADAR_BRAND_COLOR_TOKENS, RADAR_DARK_SURFACE_TEXT_TOKENS } from '../colorSystem';

export const DARK_THEME_TOKENS = {
  mode: 'dark' as const,
  direction: 'rtl' as const,
  brandPrimary: '#2E8F83',
  brandHover: RADAR_BRAND_COLOR_TOKENS['brand-500'],
  bgCanvas: RADAR_DARK_SURFACE_TEXT_TOKENS['bg-canvas'],
  bgSurface: RADAR_DARK_SURFACE_TEXT_TOKENS['bg-surface'],
  bgElevated: RADAR_DARK_SURFACE_TEXT_TOKENS['bg-elevated'],
  bgMuted: RADAR_DARK_SURFACE_TEXT_TOKENS['bg-muted'],
  textPrimary: RADAR_DARK_SURFACE_TEXT_TOKENS['text-primary'],
  textSecondary: RADAR_DARK_SURFACE_TEXT_TOKENS['text-secondary'],
  textMuted: RADAR_DARK_SURFACE_TEXT_TOKENS['text-muted'],
  borderSubtle: RADAR_DARK_SURFACE_TEXT_TOKENS['border-subtle'],
  borderStrong: RADAR_DARK_SURFACE_TEXT_TOKENS['border-strong'],
  focusRing: RADAR_DARK_SURFACE_TEXT_TOKENS.focus,
} as const;
