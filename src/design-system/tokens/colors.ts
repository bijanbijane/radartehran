/** @file src/design-system/tokens/colors.ts — Canonical Design System Color Tokens */
import {
  BRAND_PALETTE,
  NEUTRAL_PALETTE,
  SEMANTIC_PALETTE,
  CARTOGRAPHIC_PALETTE,
  DATA_VIZ_SERIES_PALETTE,
} from '../colorSystem';

export const RADAR_BRAND_COLOR_TOKENS = BRAND_PALETTE;
export const RADAR_LIGHT_SURFACE_TEXT_TOKENS = NEUTRAL_PALETTE;
export const RADAR_DARK_SURFACE_TEXT_TOKENS = {
  canvas: '#0A110F',
  surface: '#111C19',
  'bg-canvas': '#0A110F',
  'bg-surface': '#111C19',
} as const;
export const RADAR_SEMANTIC_STATUS_PALETTE = SEMANTIC_PALETTE;
export const RADAR_MAP_GEO_TOKENS = CARTOGRAPHIC_PALETTE;
export const RADAR_CHART_8_SERIES_PALETTE = DATA_VIZ_SERIES_PALETTE;

export const DESIGN_COLOR_TOKENS = {
  brand: {
    ...BRAND_PALETTE,
    primary: BRAND_PALETTE.brand800,
    emerald600: BRAND_PALETTE.brand800,
    emerald500: BRAND_PALETTE.brand600,
  },
  light: NEUTRAL_PALETTE,
  dark: {
    canvas: '#0A110F',
    surface: '#111C19',
    surfaceSubtle: '#172521',
    surfaceSunken: '#0D1614',
    surfaceSelected: '#16302B',
    surfaceDisabled: '#1E2A27',
    textPrimary: '#F1F5F3',
    textSecondary: '#C5D0CA',
    textMuted: '#8A9891',
    textSubdued: '#64716B',
    borderSubtle: '#22312C',
    borderStrong: '#2E423B',
    borderControl: '#485E56',
    borderControlMuted: '#394B45',
  },
  status: SEMANTIC_PALETTE,
  geo: CARTOGRAPHIC_PALETTE,
  chartSeries: DATA_VIZ_SERIES_PALETTE,
} as const;

export const COLOR_TOKENS = DESIGN_COLOR_TOKENS;

export type DesignColorTokenNamespace = keyof typeof DESIGN_COLOR_TOKENS;
