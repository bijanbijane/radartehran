/** @file src/design-system/themes/dark.ts — Dark Theme Token Map */
import { BRAND_PALETTE, SEMANTIC_PALETTE } from '../colorSystem';

export const DARK_THEME_TOKENS = {
  mode: 'dark' as const,
  direction: 'rtl' as const,
  brandPrimary: '#2E8F83',
  brandHover: BRAND_PALETTE.brand600,
  bgCanvas: '#0A110F',
  bgSurface: '#111C19',
  bgElevated: '#172521',
  bgMuted: '#0D1614',
  textPrimary: '#F1F5F3',
  textSecondary: '#C5D0CA',
  textMuted: '#8A9891',
  borderSubtle: '#22312C',
  borderStrong: '#2E423B',
  focusRing: SEMANTIC_PALETTE.focusRing,
  background: {
    primary: '#0A110F',
    surface: '#111C19',
    elevated: '#172521',
  },
} as const;
