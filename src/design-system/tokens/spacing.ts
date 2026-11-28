/** @file src/design-system/tokens/spacing.ts — 4px Grid Spacing Tokens */
import { BASE_SPACING_UNIT_PX, SPACING_SCALE } from '../spacingGeometrySystem';

export const DESIGN_SPACING_BASE_UNIT_PX = BASE_SPACING_UNIT_PX;

/** CSS-compatible aliases are derived from SPACING_SCALE; the geometry system owns numeric values. */
export const DESIGN_SPACING_SCALE_PX = {
  space0: 0,
  ...SPACING_SCALE,
  '0': '0px',
  '1': `${SPACING_SCALE.space1}px`,
  '2': `${SPACING_SCALE.space2}px`,
  '3': `${SPACING_SCALE.space3}px`,
  '4': `${SPACING_SCALE.space4}px`,
  '5': `${SPACING_SCALE.space5}px`,
  '6': `${SPACING_SCALE.space6}px`,
  '8': `${SPACING_SCALE.space8}px`,
  '10': `${SPACING_SCALE.space10}px`,
  '12': `${SPACING_SCALE.space12}px`,
  '16': `${SPACING_SCALE.space16}px`,
  '20': `${SPACING_SCALE.space20}px`,
} as const;

export const SPACING_TOKENS = DESIGN_SPACING_SCALE_PX;
export const RADAR_SPACING_TOKENS = SPACING_SCALE;

export function isOnFourPxSpacingGrid(px: number): boolean {
  return Number.isFinite(px) && px >= 0 && px % DESIGN_SPACING_BASE_UNIT_PX === 0;
}
