/** @file src/design-system/designSystem.test.ts — Fast Node unit tests for RT-UI-VIS-001, RT-UI-COLOR-001, RT-UI-TYPE-001 & RT-UI-SPACING-001 */
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import {
  CONTROLLED_GEOMETRY_TOKENS,
  DENSITY_PROFILES,
  RADAR_VISUAL_DIRECTION,
  SURFACE_HIERARCHY,
  VISUAL_DIRECTION_ACCEPTANCE_CRITERIA,
  resolveDensityProfileForView,
} from './visualDirection';
import {
  BRAND_PALETTE,
  CARTOGRAPHIC_PALETTE,
  COLOR_CONTRAST_CHECKS,
  COLOR_SYSTEM_ACCEPTANCE_CRITERIA,
  DATA_VIZ_SERIES_PALETTE,
  NEUTRAL_PALETTE,
  PUBLIC_PAGE_COLOR_BALANCE_RATIO,
  SEMANTIC_PALETTE,
  computeHexContrastRatio,
} from './colorSystem';
import { DARK_THEME_TOKENS } from './themes/dark';
import { RADAR_PRIMITIVE_BUTTON_SIZE_MAP, RADAR_PRIMITIVE_BUTTON_VARIANT_MAP } from '../components/ui/RadarPrimitives';
import { resolveProductViewRouterShellClasses } from '../utils/productViewRouterShellClasses';
import {
  BODY_TYPE_SCALE_PX,
  EDITORIAL_READING_MEASURE,
  FONT_FAMILY_CANDIDATES,
  FONT_WEIGHT_SYSTEM,
  LINE_HEIGHT_TOKENS,
  MAP_TYPOGRAPHY_LEVELS_PX,
  MODULE_TYPOGRAPHY_MATRIX,
  TYPE_SCALE_HEADINGS,
  TYPOGRAPHY_ACCEPTANCE_CRITERIA,
  TYPOGRAPHY_ROLES,
  formatTechnicalBidiToken,
  formatUnifiedAreaFa,
  formatUnifiedPercentFa,
  formatUnifiedPriceTomanFa,
  toStandardPersianDigits,
} from './typographySystem';
import {
  BAR_HEIGHTS_PX,
  BASE_SPACING_UNIT_PX,
  BORDER_RADIUS_SCALE_PX,
  BORDER_SYSTEM_PX,
  BUTTON_DIMENSIONS_PX,
  CARD_PADDING_PX,
  CONSOLIDATED_GEOMETRY_DECISIONS,
  ELEVATION_LEVELS,
  GEOMETRY_PROHIBITIONS,
  ICON_DIMENSIONS_PX,
  INPUT_DIMENSIONS_PX,
  MAP_EXPLORER_GEOMETRY,
  RESPONSIVE_GEOMETRY_MATRIX,
  SEMANTIC_RADIUS_DEFAULTS_PX,
  SPACING_GEOMETRY_ACCEPTANCE_CRITERIA,
  SPACING_SCALE,
  TABLE_AND_OVERLAY_GEOMETRY,
  isSpacingValueOnGrid,
} from './spacingGeometrySystem';

test('RT-UI-VIS-001 enforces 4-layer surfaces, controlled geometry, 3 density profiles, and 15/15 acceptance checks', () => {
  assert.equal(RADAR_VISUAL_DIRECTION.length, 5);
  assert.deepEqual(SURFACE_HIERARCHY.map((s) => s.level), [0, 1, 2, 3]);
  assert.equal(CONTROLLED_GEOMETRY_TOKENS.forbidUniformPillButtons, true);
  assert.equal(CONTROLLED_GEOMETRY_TOKENS.cardRadiusPx, 12);
  assert.equal(DENSITY_PROFILES.length, 3);
  assert.equal(resolveDensityProfileForView('knowledge').id, 'low');
  assert.equal(resolveDensityProfileForView('home').id, 'medium');
  assert.equal(resolveDensityProfileForView('intelligence').id, 'high');
  assert.equal(resolveDensityProfileForView('admin').id, 'high');
  assert.equal(VISUAL_DIRECTION_ACCEPTANCE_CRITERIA.length, 15);
});

test('RT-UI-COLOR-001 enforces 4-layer semantic colors, cartographic separation, WCAG AA contrast >= 4.5:1, and 20/20 criteria', () => {
  assert.equal(BRAND_PALETTE.brand600, '#176B63');
  assert.equal(BRAND_PALETTE.brand700, '#14534E');
  assert.equal(BRAND_PALETTE.brand800, '#0F3F3B');
  assert.equal(NEUTRAL_PALETTE.canvas, '#F6F8F6');
  assert.equal(NEUTRAL_PALETTE.textPrimary, '#182522');
  assert.equal(SEMANTIC_PALETTE.focusRing, '#2864DC');
  assert.equal(
    PUBLIC_PAGE_COLOR_BALANCE_RATIO.neutralPct +
      PUBLIC_PAGE_COLOR_BALANCE_RATIO.brandAndAccentPct +
      PUBLIC_PAGE_COLOR_BALANCE_RATIO.semanticAndDataPct,
    100
  );

  assert.equal(CARTOGRAPHIC_PALETTE.priceIntensitySequential.length, 5);
  assert.equal((CARTOGRAPHIC_PALETTE.priceIntensitySequential as readonly string[]).includes(BRAND_PALETTE.brand600), false);
  assert.equal(DATA_VIZ_SERIES_PALETTE.length, 6);

  for (const pair of COLOR_CONTRAST_CHECKS) {
    const ratio = computeHexContrastRatio(pair.fg, pair.bg);
    assert.ok(ratio >= pair.minRatio, `Contrast failure for ${pair.id}: got ${ratio}:1 < ${pair.minRatio}:1`);
  }
  assert.ok(computeHexContrastRatio(BRAND_PALETTE.brandFgDark, DARK_THEME_TOKENS.bgSurface) >= 4.5);
  assert.equal(COLOR_SYSTEM_ACCEPTANCE_CRITERIA.length, 20);
});

test('RT-UI-TYPE-001 enforces Vazirmatn UI baseline, 4-weight system, scales, bidi formatters, and 20/20 criteria', () => {
  assert.equal(TYPOGRAPHY_ROLES.length, 3);
  assert.equal(FONT_FAMILY_CANDIDATES.baseline.id, 'vazirmatn-ui');
  assert.equal(FONT_FAMILY_CANDIDATES.comparison.id, 'estedad');
  assert.equal(FONT_FAMILY_CANDIDATES.singlePrimaryFamilyPolicy, true);

  assert.deepEqual(
    [FONT_WEIGHT_SYSTEM.regular, FONT_WEIGHT_SYSTEM.medium, FONT_WEIGHT_SYSTEM.semibold, FONT_WEIGHT_SYSTEM.bold],
    [400, 500, 600, 700]
  );
  assert.equal(TYPE_SCALE_HEADINGS.display.desktopPx, 40);
  assert.equal(TYPE_SCALE_HEADINGS.h1.desktopPx, 30);
  assert.equal(TYPE_SCALE_HEADINGS.h1.mobilePx, 24);
  assert.equal(BODY_TYPE_SCALE_PX.bodyM, 16);
  assert.equal(BODY_TYPE_SCALE_PX.criticalInfoMinimumPx, 13);
  assert.equal(LINE_HEIGHT_TOKENS.body, 1.8);
  assert.ok(EDITORIAL_READING_MEASURE.recommendedPx >= 650 && EDITORIAL_READING_MEASURE.recommendedPx <= 760);

  assert.ok(MAP_TYPOGRAPHY_LEVELS_PX.neighborhoodName.min >= 12);
  assert.equal(MODULE_TYPOGRAPHY_MATRIX.admin.headingPx[0], 20);

  assert.equal(toStandardPersianDigits('RT-1405/08/23'), 'RT-۱۴۰۵/۰۸/۲۳');
  assert.equal(formatUnifiedPriceTomanFa(125000000, 'per_sqm'), '۱۲۵٬۰۰۰٬۰۰۰\u00A0تومان به ازای هر مترمربع');
  assert.equal(formatUnifiedAreaFa(95), '۹۵\u00A0مترمربع');
  assert.equal(formatUnifiedPercentFa(12.5), '۱۲٫۵٪');
  assert.deepEqual(formatTechnicalBidiToken('RT-48291'), { text: 'RT-48291', dir: 'ltr', isolate: true });
  assert.equal(TYPOGRAPHY_ACCEPTANCE_CRITERIA.length, 20);
});

test('RT-UI-SPACING-001 enforces 4px spacing grid, 12px/8px radii, component heights, map explorer proportions, and 23/23 criteria', () => {
  assert.equal(BASE_SPACING_UNIT_PX, 4);
  for (const val of Object.values(SPACING_SCALE)) {
    assert.equal(val % 4, 0);
    assert.equal(isSpacingValueOnGrid(val), true);
  }
  assert.equal(isSpacingValueOnGrid(13), false);

  assert.equal(SEMANTIC_RADIUS_DEFAULTS_PX.card, 12);
  assert.equal(SEMANTIC_RADIUS_DEFAULTS_PX.input, 8);
  assert.equal(SEMANTIC_RADIUS_DEFAULTS_PX.button, 8);
  assert.equal(SEMANTIC_RADIUS_DEFAULTS_PX.dialog, 16);
  assert.equal(SEMANTIC_RADIUS_DEFAULTS_PX.bottomSheetTop, 20);
  assert.equal(BORDER_RADIUS_SCALE_PX.pill, 999);

  assert.equal(BORDER_SYSTEM_PX.border1Subtle, 1);
  assert.equal(ELEVATION_LEVELS.length, 4);
  assert.equal(BUTTON_DIMENSIONS_PX.md, 40);
  assert.equal(BUTTON_DIMENSIONS_PX.touchTargetMin, 44);
  assert.equal(INPUT_DIMENSIONS_PX.standard, 44);
  assert.equal(ICON_DIMENSIONS_PX.md, 20);
  assert.equal(BAR_HEIGHTS_PX.headerPublic, 68);
  assert.equal(BAR_HEIGHTS_PX.headerCompact, 56);
  assert.equal(BAR_HEIGHTS_PX.mobileBottomNav, 64);
  assert.equal(CARD_PADDING_PX.standard, 16);

  assert.equal(MAP_EXPLORER_GEOMETRY.toolbarWidthPx, 48);
  assert.equal(MAP_EXPLORER_GEOMETRY.panelWidthStandardPx, 352);
  assert.equal(MAP_EXPLORER_GEOMETRY.panelWidthCompactPx, 312);
  assert.equal(MAP_EXPLORER_GEOMETRY.bottomSheet.topRadiusPx, 20);
  assert.equal(MAP_EXPLORER_GEOMETRY.bottomSheet.collapsedMinHeightPx, 72);
  assert.deepEqual(TABLE_AND_OVERLAY_GEOMETRY.dialogWidthsPx.medium, [520, 640]);
  assert.equal(RESPONSIVE_GEOMETRY_MATRIX.mobile.pagePaddingXPx, 16);
  assert.equal(CONSOLIDATED_GEOMETRY_DECISIONS.mapPanelWidthPx, 352);

  assert.equal(GEOMETRY_PROHIBITIONS.length, 20);
  assert.equal(SPACING_GEOMETRY_ACCEPTANCE_CRITERIA.length, 23);
});

import {
  BUTTON_INTERACTIVE_STATES,
  BUTTON_SIZE_SPECS,
  BUTTON_VARIANTS,
  CARD_FAMILIES,
  COMPONENT_ACCEPTANCE_CRITERIA,
  COMPONENT_ARCHITECTURE_LAYERS,
  COMPONENT_CATALOG,
  DATA_CREDIBILITY_SPECS,
  DESIGN_SYSTEM_FIVE_LAYERS,
  DOMAIN_COMPONENTS_RTD,
  GLOBAL_SEARCH_BOX_SPEC,
  INPUT_STATES,
  INPUT_TYPES,
  MANDATORY_COMPONENT_SPEC_FIELDS,
  MAP_COMPONENT_INVENTORY,
  PAGE_BUTTON_ALLOCATION,
  STAGE_12_DS_PHASES,
  normalizeNumericFieldDigits,
} from './componentSystem';

test('RT-UI-COMP-001 & RT-UI-DS-IMPLEMENTATION-001 enforce 5-layer DS, 6 button variants, 10 input types, 7 card families, RTD01..RTD10, DS-01..DS-09, and 22/22 criteria', () => {
  assert.equal(COMPONENT_ARCHITECTURE_LAYERS.length, 4);
  assert.equal(DESIGN_SYSTEM_FIVE_LAYERS.length, 5);
  assert.equal(STAGE_12_DS_PHASES.length, 9);
  assert.equal(MANDATORY_COMPONENT_SPEC_FIELDS.length, 13);
  assert.equal(COMPONENT_CATALOG.length, 11);

  assert.equal(BUTTON_VARIANTS.length, 6);
  assert.equal(BUTTON_INTERACTIVE_STATES.length, 6);
  assert.equal(BUTTON_SIZE_SPECS.md.heightPx, 40);
  assert.equal(BUTTON_SIZE_SPECS.lg.heightPx, 48);
  assert.equal(PAGE_BUTTON_ALLOCATION.valuation.primary, 'محاسبه');

  assert.equal(INPUT_TYPES.length, 10);
  assert.equal(INPUT_STATES.length, 8);
  assert.equal(GLOBAL_SEARCH_BOX_SPEC.heightPx, 44);
  assert.equal(normalizeNumericFieldDigits('۱۲٬۵۰۰'), '12500');

  assert.equal(CARD_FAMILIES.length, 7);
  assert.equal(MAP_COMPONENT_INVENTORY.length, 15);
  assert.deepEqual(Object.keys(DATA_CREDIBILITY_SPECS), ['verified', 'estimated', 'incomplete', 'stale']);
  assert.equal(DOMAIN_COMPONENTS_RTD.length, 10);
  assert.equal(COMPONENT_ACCEPTANCE_CRITERIA.length, 22);
});



test('RT-UI-COLOR-002 keeps dark CSS theme values synchronized with canonical TypeScript theme tokens', () => {
  const darkCss = readFileSync(new URL('../styles/layers/themes.css', import.meta.url), 'utf8');
  const cssTokenMap: Record<string, string> = {
    '--color-bg-canvas': DARK_THEME_TOKENS.bgCanvas,
    '--color-bg-surface': DARK_THEME_TOKENS.bgSurface,
    '--color-bg-elevated': DARK_THEME_TOKENS.bgElevated,
    '--color-bg-muted': DARK_THEME_TOKENS.bgMuted,
    '--color-text-primary': DARK_THEME_TOKENS.textPrimary,
    '--color-text-secondary': DARK_THEME_TOKENS.textSecondary,
    '--color-text-muted': DARK_THEME_TOKENS.textMuted,
    '--color-border-subtle': DARK_THEME_TOKENS.borderSubtle,
    '--color-border-strong': DARK_THEME_TOKENS.borderStrong,
    '--color-focus': DARK_THEME_TOKENS.focusRing,
    '--color-brand-primary': DARK_THEME_TOKENS.brandPrimary,
    '--color-brand-hover': DARK_THEME_TOKENS.brandHover,
  };

  for (const [cssName, expectedValue] of Object.entries(cssTokenMap)) {
    assert.ok(
      darkCss.includes(`${cssName}: ${expectedValue};`),
      `Dark CSS token ${cssName} must match TypeScript theme value ${expectedValue}`,
    );
  }
});


test('RT-UI-COMP-002 keeps the legacy button API as a compatibility adapter over the canonical button variants and sizes', () => {
  assert.deepEqual(RADAR_PRIMITIVE_BUTTON_VARIANT_MAP, {
    primary: 'primary',
    secondary: 'secondary',
    outline: 'outline',
    ghost: 'tertiary',
    danger: 'destructive',
  });
  assert.deepEqual(RADAR_PRIMITIVE_BUTTON_SIZE_MAP, {
    sm: 'sm',
    md: 'md',
    lg: 'lg',
  });
});




test('RT-UI-COLOR-006 keeps shared brand accents on canonical dark theme tokens', () => {
  const primitives = readFileSync(new URL('../components/ui/RadarPrimitives.tsx', import.meta.url), 'utf8');
  const casperModal = readFileSync(new URL('../components/CasperDecisionSuiteModal.tsx', import.meta.url), 'utf8');
  const mapResults = readFileSync(new URL('../components/map/MapExplorerResultsSidebar.tsx', import.meta.url), 'utf8');

  for (const source of [primitives, casperModal, mapResults]) {
    assert.ok(!source.includes('#173530'));
    assert.ok(!source.includes('#86d8cb'));
    assert.ok(!source.includes('#244f48'));
  }
  assert.ok(primitives.includes('dark:bg-[var(--color-brand-soft)]'));
  assert.ok(primitives.includes('dark:text-[var(--color-brand-fg)]'));
  assert.ok(primitives.includes('dark:border-[var(--color-brand-soft-border)]'));
  assert.ok(casperModal.includes('dark:text-[var(--color-brand-fg)]'));
  assert.ok(mapResults.includes('dark:bg-[var(--color-brand-soft)]'));
});

test('RT-UI-COLOR-005 keeps map fallback surfaces on canonical dark theme tokens', () => {
  const indexCss = readFileSync(new URL('../index.css', import.meta.url), 'utf8');
  const workspace = readFileSync(new URL('../components/RadarWorkspaceShell.tsx', import.meta.url), 'utf8');

  assert.ok(indexCss.includes('background-color: var(--color-bg-canvas);'));
  assert.ok(workspace.includes('dark:bg-[var(--color-bg-canvas)]'));
  assert.ok(!indexCss.includes('background-color: #0d1513;'));
  assert.ok(!workspace.includes('dark:bg-[#0D1513]'));
});

test('RT-UI-COLOR-004 keeps admin shell and workspace surfaces on canonical dark theme tokens', () => {
  const router = readFileSync(new URL('../components/views/ProductViewRouter.tsx', import.meta.url), 'utf8');
  const admin = readFileSync(new URL('../components/views/ProductAdminMonitoringView.tsx', import.meta.url), 'utf8');

  assert.ok(router.includes('dark:bg-[var(--color-bg-canvas)]'));
  assert.ok(admin.includes('dark:bg-[var(--color-bg-canvas)]'));
  assert.ok(admin.includes('dark:bg-[var(--color-bg-surface)]'));
  assert.ok(!router.includes('#0D1513'));
  assert.ok(!admin.includes('#0D1513'));
  assert.ok(!admin.includes('#131E1B'));
});

test('RT-UI-COLOR-003 keeps product view shell backgrounds on canonical theme tokens', () => {
  const standard = resolveProductViewRouterShellClasses(false, false);
  const split = resolveProductViewRouterShellClasses(true, true);
  const homeFirst = resolveProductViewRouterShellClasses(true, false);

  assert.equal(standard.shellBg, 'bg-[var(--color-bg-canvas)] dark:bg-[var(--color-bg-canvas)]');
  assert.ok(split.splitShell.includes('max-lg:bg-[var(--color-bg-canvas)]'));
  assert.ok(split.splitShell.includes('lg:bg-[var(--color-bg-canvas)]/95'));
  assert.ok(homeFirst.shellBg.includes('dark:bg-[var(--color-bg-canvas)]/95'));
  assert.ok(![standard.shellBg, split.splitShell, homeFirst.shellBg].some((value) => value.includes('#0D1513')));
});


test('RT-UI-COLOR-007 keeps dark map attribution on canonical surface and text tokens', () => {
  const indexCss = readFileSync(new URL('../index.css', import.meta.url), 'utf8');
  const darkAttribution = indexCss.split('[data-apple-theme=\'dark\'] body .leaflet-control-attribution')[1]?.split('}')[0] ?? '';

  assert.ok(darkAttribution.includes('var(--color-bg-surface)'));
  assert.ok(darkAttribution.includes('var(--color-text-muted)'));
  assert.ok(!darkAttribution.includes('#8ca19a'));
  assert.ok(!darkAttribution.includes('rgba(19, 31, 28'));
});

test('RT-UI-COLOR-008 keeps active navigation and floating tools accent text on canonical dark brand foreground', () => {
  const bottomNav = readFileSync(new URL('../components/navigation/radarBottomNavParts.tsx', import.meta.url), 'utf8');
  const floatingTopBar = readFileSync(new URL('../components/FloatingTopBar.tsx', import.meta.url), 'utf8');

  assert.ok(bottomNav.includes('dark:text-[var(--color-brand-fg)]'));
  assert.ok(floatingTopBar.includes('dark:text-[var(--color-brand-fg)]'));
  assert.ok(!bottomNav.includes('#86d8cb'));
  assert.ok(!floatingTopBar.includes('#86d8cb'));
});


test('RT-UI-COLOR-012 keeps semantic alert class maps on canonical light/dark tokens', () => {
  const classMaps = readFileSync(new URL('./classMaps.ts', import.meta.url), 'utf8');
  const lightTokens = readFileSync(new URL('../styles/layers/tokens.css', import.meta.url), 'utf8');
  const darkCss = readFileSync(new URL('../styles/layers/themes.css', import.meta.url), 'utf8');

  for (const tone of ['success', 'warning', 'danger', 'info']) {
    assert.ok(classMaps.includes(`bg-[var(--color-${tone}-bg)]`));
    assert.ok(classMaps.includes(`text-[var(--color-${tone})]`));
    assert.ok(classMaps.includes(`border-[var(--color-${tone}-border)]`));
    assert.ok(lightTokens.includes(`--color-${tone}-border:`));
    assert.ok(darkCss.includes(`--color-${tone}-border:`));
  }
  assert.doesNotMatch(classMaps, /#[0-9A-Fa-f]{3,8}|dark:bg-(emerald|amber|rose|sky)-|dark:text-(emerald|amber|rose|sky)-/);
});

test('RT-UI-COLOR-011 keeps data credibility badges and metric cards on semantic theme tokens', () => {
  const badges = readFileSync(new URL('../components/common/RadarDataBadges.tsx', import.meta.url), 'utf8');
  const lightTokens = readFileSync(new URL('../styles/layers/tokens.css', import.meta.url), 'utf8');
  const darkCss = readFileSync(new URL('../styles/layers/themes.css', import.meta.url), 'utf8');
  const credibilityStyles = badges.split('export const DataCredibilityBadge')[0];

  assert.ok(credibilityStyles.includes('bg-[var(--color-success-bg)]'));
  assert.ok(credibilityStyles.includes('text-[var(--color-success)]'));
  assert.ok(credibilityStyles.includes('bg-[var(--color-info-bg)]'));
  assert.ok(credibilityStyles.includes('text-[var(--color-info)]'));
  assert.ok(credibilityStyles.includes('bg-[var(--color-warning-bg)]'));
  assert.ok(credibilityStyles.includes('text-[var(--color-warning)]'));
  assert.doesNotMatch(credibilityStyles, /#[0-9A-Fa-f]{3,8}|dark:bg-(emerald|sky|amber)-|dark:text-(emerald|sky|amber)-/);
  for (const token of ['--color-success-bg', '--color-success', '--color-info-bg', '--color-info', '--color-warning-bg', '--color-warning']) {
    assert.ok(lightTokens.includes(token));
    assert.ok(darkCss.includes(token));
  }

  assert.ok(badges.includes('bg-[var(--color-bg-surface)]'));
  assert.doesNotMatch(badges, /bg-white dark:bg-\[var\(--color-bg-surface\)\]/);
  assert.ok(badges.includes('data-value text-[var(--color-text-primary)]'));
  assert.doesNotMatch(badges, /data-value text-\[var\(--color-text-primary\)\] dark:text-white/);
});

test('RT-UI-COLOR-010 keeps status and map placeholder surfaces on canonical semantic tokens', () => {
  const admin = readFileSync(new URL('../components/views/ProductAdminMonitoringView.tsx', import.meta.url), 'utf8');
  const workspace = readFileSync(new URL('../components/RadarWorkspaceShell.tsx', import.meta.url), 'utf8');
  const lightTokens = readFileSync(new URL('../styles/layers/tokens.css', import.meta.url), 'utf8');
  const darkCss = readFileSync(new URL('../styles/layers/themes.css', import.meta.url), 'utf8');

  assert.ok(admin.includes('bg-[var(--color-success-bg)]'));
  assert.ok(admin.includes('text-[var(--color-success)]'));
  assert.ok(!admin.includes('#EAF5EE'));
  assert.ok(!admin.includes('#176B4C'));
  assert.ok(lightTokens.includes(`--color-success: ${SEMANTIC_PALETTE.success.fg};`));
  assert.ok(lightTokens.includes(`--color-success-bg: ${SEMANTIC_PALETTE.success.bg};`));
  assert.ok(darkCss.includes('--color-success: #4ADE80;'));
  assert.ok(darkCss.includes('--color-success-bg: rgba(16, 185, 129, 0.16);'));

  assert.ok(workspace.includes('bg-[var(--color-bg-sunken)]'));
  assert.ok(workspace.includes('dark:bg-[var(--color-bg-canvas)]'));
  assert.ok(!workspace.includes('bg-[#E9EFEC]'));
  assert.ok(lightTokens.includes(`--color-bg-sunken: ${NEUTRAL_PALETTE.surfaceSunken};`));
  assert.ok(darkCss.includes(`--color-bg-sunken: ${DARK_THEME_TOKENS.bgMuted};`));
});

test('RT-UI-COLOR-009 enforces WCAG AA contrast for dark-theme text and visible focus indicators', () => {
  const textTokens = [
    ['primary', DARK_THEME_TOKENS.textPrimary],
    ['secondary', DARK_THEME_TOKENS.textSecondary],
    ['muted', DARK_THEME_TOKENS.textMuted],
  ] as const;
  const surfaces = [
    ['canvas', DARK_THEME_TOKENS.bgCanvas],
    ['surface', DARK_THEME_TOKENS.bgSurface],
    ['elevated', DARK_THEME_TOKENS.bgElevated],
  ] as const;

  for (const [textRole, foreground] of textTokens) {
    for (const [surfaceRole, background] of surfaces) {
      const ratio = computeHexContrastRatio(foreground, background);
      assert.ok(
        ratio >= 4.5,
        `Dark theme ${textRole} text on ${surfaceRole} surface has ${ratio}:1 contrast; expected >= 4.5:1`
      );
    }
  }

  for (const [surfaceRole, background] of surfaces) {
    const ratio = computeHexContrastRatio(DARK_THEME_TOKENS.focusRing, background);
    assert.ok(
      ratio >= 3,
      `Dark theme focus indicator on ${surfaceRole} surface has ${ratio}:1 contrast; expected >= 3:1`
    );
  }
});
