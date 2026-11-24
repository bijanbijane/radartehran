import test from 'node:test';
import assert from 'node:assert/strict';
import {
  createInitialMapPanelState,
  reduceMapPanelState,
  resolveInitialSidebarOpen,
} from './mapSheetCoordinator';

test('resolveInitialSidebarOpen closes sidebar by default on mobile and tablet (<1024px)', () => {
  assert.equal(resolveInitialSidebarOpen(390, null), false);
  assert.equal(resolveInitialSidebarOpen(390, '1'), false);
  assert.equal(resolveInitialSidebarOpen(768, null), false);
  assert.equal(resolveInitialSidebarOpen(1023, '1'), false);
  assert.equal(resolveInitialSidebarOpen(Number.NaN, '1'), false);
});

test('resolveInitialSidebarOpen defaults open on desktop (>=1024px) unless explicitly collapsed', () => {
  assert.equal(resolveInitialSidebarOpen(1024, null), true);
  assert.equal(resolveInitialSidebarOpen(1440, '1'), true);
  assert.equal(resolveInitialSidebarOpen(1440, '0'), false);
});

test('mobile single-sheet mutual exclusion ensures only one sheet is open at a time', () => {
  let state = createInitialMapPanelState(390, null);
  assert.equal(state.mobileActiveSheet, 'none');

  state = reduceMapPanelState(state, { type: 'OPEN_LIST', isDesktop: false });
  assert.equal(state.mobileActiveSheet, 'list');

  state = reduceMapPanelState(state, { type: 'OPEN_INSPECTOR', isDesktop: false });
  assert.equal(state.mobileActiveSheet, 'inspector');

  state = reduceMapPanelState(state, { type: 'OPEN_FILTER', isDesktop: false });
  assert.equal(state.mobileActiveSheet, 'filter');

  // Toggling the same sheet closes it
  state = reduceMapPanelState(state, { type: 'OPEN_FILTER', isDesktop: false });
  assert.equal(state.mobileActiveSheet, 'none');

  // Selecting a hood from map closes any mobile drawer cleanly
  state = reduceMapPanelState(state, { type: 'OPEN_TOOLS', isDesktop: false });
  state = reduceMapPanelState(state, { type: 'SELECT_HOOD_FROM_MAP', isDesktop: false });
  assert.equal(state.mobileActiveSheet, 'none');
});

test('desktop unified right-panel toggles cleanly between list, inspector, and collapsed', () => {
  let state = createInitialMapPanelState(1440, null);
  assert.equal(state.desktopPanelMode, 'list');

  state = reduceMapPanelState(state, { type: 'SELECT_HOOD_FROM_MAP', isDesktop: true });
  assert.equal(state.desktopPanelMode, 'inspector');

  state = reduceMapPanelState(state, { type: 'OPEN_LIST', isDesktop: true });
  assert.equal(state.desktopPanelMode, 'list');

  state = reduceMapPanelState(state, { type: 'COLLAPSE_PANEL', isDesktop: true });
  assert.equal(state.desktopPanelMode, 'collapsed');
});
