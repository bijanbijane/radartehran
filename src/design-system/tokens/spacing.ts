/** @file src/design-system/tokens/spacing.ts — 4px Grid Spacing Tokens */
import { SPACING_SCALE, isSpacingValueOnGrid } from '../spacingGeometrySystem';

export const DESIGN_SPACING_BASE_UNIT_PX = 4;

export const DESIGN_SPACING_SCALE_PX = {
  space0: 0,
  space1: 4,
  space2: 8,
  space3: 12,
  space4: 16,
  space5: 20,
  space6: 24,
  space8: 32,
  space10: 40,
  space12: 48,
  space16: 64,
  space20: 80,
  '0': '0px',
  '1': '4px',
  '2': '8px',
  '3': '12px',
  '4': '16px',
  '5': '20px',
  '6': '24px',
  '8': '32px',
  '10': '40px',
  '12': '48px',
  '16': '64px',
  '20': '80px',
} as const;

export const SPACING_TOKENS = DESIGN_SPACING_SCALE_PX;
export const RADAR_SPACING_TOKENS = SPACING_SCALE;

export function isOnFourPxSpacingGrid(px: number): boolean {
  return (Number.isFinite(px) && px >= 0 && px % DESIGN_SPACING_BASE_UNIT_PX === 0) || isSpacingValueOnGrid(px);
}
