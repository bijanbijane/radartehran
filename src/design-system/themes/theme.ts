/** @file src/design-system/themes/theme.ts — Theme Resolver & DOM Synchronizer */
import { LIGHT_THEME_TOKENS } from './light';
import { DARK_THEME_TOKENS } from './dark';

export type RadarThemeMode = 'light' | 'dark';
export type ThemeMode = RadarThemeMode;
export type RadarThemeTokenSet = typeof LIGHT_THEME_TOKENS | typeof DARK_THEME_TOKENS;
export type ThemeDefinition = RadarThemeTokenSet;

export function resolveThemeTokens(mode: RadarThemeMode): RadarThemeTokenSet {
  return mode === 'dark' ? DARK_THEME_TOKENS : LIGHT_THEME_TOKENS;
}

export const getThemeTokens = resolveThemeTokens;

export function applyThemeModeToDocument(mode: RadarThemeMode): void {
  if (typeof document === 'undefined' || !document.documentElement) return;
  document.documentElement.setAttribute('data-apple-theme', mode);
  document.documentElement.setAttribute('data-radar-theme', mode);
  document.documentElement.classList.toggle('dark', mode === 'dark');
}
