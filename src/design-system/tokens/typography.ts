/** @file src/design-system/tokens/typography.ts — Persian/RTL & Tabular Numeral Typography Tokens */
export const RADAR_FONT_STACKS = {
  sans: "'Vazirmatn', system-ui, -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif",
  mono: "'JetBrains Mono', ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace",
} as const;

export const RADAR_TYPOGRAPHY_TOKENS = {
  xs: { fontSize: '0.75rem', lineHeight: '1.125rem' },
  sm: { fontSize: '0.875rem', lineHeight: '1.375rem' },
  base: { fontSize: '1rem', lineHeight: '1.625rem' },
  lg: { fontSize: '1.125rem', lineHeight: '1.75rem' },
  xl: { fontSize: '1.25rem', lineHeight: '1.875rem' },
  '2xl': { fontSize: '1.5rem', lineHeight: '2.125rem' },
} as const;

export const RADAR_NUMBER_FORMAT_CONTRACT = {
  locale: 'fa-IR',
  fontVariantNumeric: 'tabular-nums',
} as const;

export const DESIGN_TYPOGRAPHY_SCALE = {
  fontSans: RADAR_FONT_STACKS.sans,
  fontMono: RADAR_FONT_STACKS.mono,
  fontFamily: RADAR_FONT_STACKS,
  scale: RADAR_TYPOGRAPHY_TOKENS,
  numerals: RADAR_NUMBER_FORMAT_CONTRACT,
} as const;

export const TYPOGRAPHY_TOKENS = DESIGN_TYPOGRAPHY_SCALE;
