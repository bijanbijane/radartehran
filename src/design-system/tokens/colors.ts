/** @file src/design-system/tokens/colors.ts — Canonical Design System Color Tokens */
import {
  RADAR_BRAND_COLOR_TOKENS,
  RADAR_LIGHT_SURFACE_TEXT_TOKENS,
  RADAR_DARK_SURFACE_TEXT_TOKENS,
  RADAR_SEMANTIC_STATUS_PALETTE,
  RADAR_MAP_GEO_TOKENS,
  RADAR_CHART_8_SERIES_PALETTE,
} from '../colorSystem';

export const DESIGN_COLOR_TOKENS = {
  brand: {
    ...RADAR_BRAND_COLOR_TOKENS,
    primary: RADAR_BRAND_COLOR_TOKENS.emerald600,
  },
  light: RADAR_LIGHT_SURFACE_TEXT_TOKENS,
  dark: RADAR_DARK_SURFACE_TEXT_TOKENS,
  status: RADAR_SEMANTIC_STATUS_PALETTE,
  geo: RADAR_MAP_GEO_TOKENS,
  chartSeries: RADAR_CHART_8_SERIES_PALETTE,
} as const;

export const COLOR_TOKENS = DESIGN_COLOR_TOKENS;

export type DesignColorTokenNamespace = keyof typeof DESIGN_COLOR_TOKENS;
