import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
  RT_FE_PAGE_COMPOSITION_015_SPEC_ID,
  RT_FE_STAGE16_BRIDGE_SPEC_ID,
  RT_PAGE_HIERARCHY_6,
  RT_PAGE_LAYOUT_CATALOG_10,
  RT_PAGE_CONTENT_REGIONS_7,
  RT_PAGE_PANEL_TYPES_7,
  RT_PAGE_OVERLAY_ZINDEX_7,
  RT_PAGE_ERROR_BOUNDARY_5,
  RT_PAGE_EXECUTION_PHASES_10,
  RT_PAGE_DELIVERABLES_33,
  RT_PAGE_INSPECTOR_PANEL_DEF,
  validateLayoutRegistryUniqueness,
  validatePageCompositionRegions,
  resolveResponsivePanelBehavior,
  evaluateOverlayStacking,
  validateLayoutPersistencePayload,
  sanitizeLayoutTelemetryEvent,
} from '../services/rtFePageComposition015Engine';

describe('Tehran Radar Comprehensive Frontend Roadmap — Stage 15 (RT-FE-PAGE-COMPOSITION-015)', () => {
  it('verifies 6 hierarchy levels, 10 Layout catalog items, 7 regions, 7 panel types, 7 z-index layers, 5 error boundaries, 10 phases, 33 deliverables, and Stage 16 bridge', () => {
    assert.equal(RT_FE_PAGE_COMPOSITION_015_SPEC_ID, 'RT-FE-PAGE-COMPOSITION-015');
    assert.equal(RT_FE_STAGE16_BRIDGE_SPEC_ID, 'RT-FE-INTERACTION-PATTERNS-016');
    assert.equal(RT_PAGE_HIERARCHY_6.length, 6);
    assert.equal(RT_PAGE_LAYOUT_CATALOG_10.length, 10);
    assert.equal(RT_PAGE_CONTENT_REGIONS_7.length, 7);
    assert.equal(RT_PAGE_PANEL_TYPES_7.length, 7);
    assert.equal(RT_PAGE_OVERLAY_ZINDEX_7.length, 7);
    assert.equal(RT_PAGE_ERROR_BOUNDARY_5.length, 5);
    assert.equal(RT_PAGE_EXECUTION_PHASES_10.length, 10);
    assert.equal(RT_PAGE_DELIVERABLES_33.length, 33);
    assert.equal(RT_PAGE_DELIVERABLES_33[0]?.id, 'RT-FE-PAGE-OUT-001');
    assert.equal(RT_PAGE_DELIVERABLES_33[32]?.id, 'RT-FE-PAGE-OUT-033');
    assert.equal(validateLayoutRegistryUniqueness(RT_PAGE_LAYOUT_CATALOG_10).valid, true);
  });

  it('rejects unsupported regions explicitly, enforces required main region, and blocks duplicate Layout IDs', () => {
    const dupCheck = validateLayoutRegistryUniqueness([...RT_PAGE_LAYOUT_CATALOG_10, RT_PAGE_LAYOUT_CATALOG_10[0]]);
    assert.equal(dupCheck.valid, false);
    assert.deepEqual(dupCheck.duplicateIds, ['public']);

    assert.equal(validatePageCompositionRegions('map-centric', ['main', 'aside', 'inspector', 'utility']).valid, true);
    const badRegion = validatePageCompositionRegions('workflow', ['main', 'inspector']);
    assert.equal(badRegion.valid, false);
    assert.deepEqual(badRegion.unsupportedRegions, ['inspector']);

    const missingMain = validatePageCompositionRegions('detail', ['aside', 'inspector']);
    assert.equal(missingMain.valid, false);
    assert.equal(missingMain.missingMain, true);
  });

  it('enforces responsive panel presentation, clamped widths, overlay stacking guards, stale persistence recovery, and PII-free telemetry', () => {
    const mobile = resolveResponsivePanelBehavior({
      panel: RT_PAGE_INSPECTOR_PANEL_DEF,
      viewportWidthPx: 390,
      requestedWidthPx: 320,
      isOpen: true,
    });
    assert.equal(mobile.deviceClass, 'mobile');
    assert.equal(mobile.presentation, 'bottom-sheet');

    const desktopClosed = resolveResponsivePanelBehavior({
      panel: RT_PAGE_INSPECTOR_PANEL_DEF,
      viewportWidthPx: 1440,
      requestedWidthPx: 600,
      isOpen: false,
    });
    assert.equal(desktopClosed.presentation, 'collapsed-freed');
    assert.equal(desktopClosed.effectiveWidthPx, 0);

    const desktopClamped = resolveResponsivePanelBehavior({
      panel: RT_PAGE_INSPECTOR_PANEL_DEF,
      viewportWidthPx: 1440,
      requestedWidthPx: 600,
      isOpen: true,
    });
    assert.equal(desktopClamped.effectiveWidthPx, 440);
    assert.equal(desktopClamped.triggersMapInvalidateSize, true);

    assert.equal(evaluateOverlayStacking(['drawer', 'modal', 'toast']).allowed, true);
    assert.equal(evaluateOverlayStacking(['modal', 'modal']).status, 'BLOCKED_MODAL_STACKING');
    assert.equal(evaluateOverlayStacking(['modal', 'drawer']).status, 'BLOCKED_DRAWER_OVER_MODAL');

    const stale = validateLayoutPersistencePayload({ layoutId: 'detail', contractVersion: 1, inspectorWidthPx: 340 }, 3);
    assert.equal(stale.status, 'RESET_TO_DEFAULT');
    assert.equal(stale.effectivePayload.contractVersion, 3);

    const ok = validateLayoutPersistencePayload({ layoutId: 'detail', contractVersion: 3, inspectorWidthPx: 360, asideCollapsed: true }, 3);
    assert.equal(ok.status, 'RESTORED');
    assert.equal(ok.effectivePayload.inspectorWidthPx, 360);

    const telemetry = sanitizeLayoutTelemetryEvent({
      event: 'panel_resized',
      layoutId: 'map-centric',
      regionId: 'inspector',
      deviceClass: 'desktop',
      extra: { formValues: { phone: '0912' }, mouseTrack: [1, 2], userId: 'u-1' },
    });
    assert.deepEqual(telemetry.strippedFields.sort(), ['formValues', 'mouseTrack', 'userId']);
    assert.equal('formValues' in telemetry.safeEvent, false);
  });
});
