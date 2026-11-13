import test from 'node:test';
import assert from 'node:assert/strict';
import {
  resolveSheetSnapHeightPx,
  computeNextSnapStateFromGesture,
  cycleNextSnapState,
  DEFAULT_BOTTOM_SHEET_CONFIG,
  type BottomSheetSnapConfig,
} from '../src/utils/productViewRouterShellClasses';

test('resolveSheetSnapHeightPx calculates deterministic pixel heights across viewports', () => {
  const cfg390: BottomSheetSnapConfig = {
    ...DEFAULT_BOTTOM_SHEET_CONFIG,
    viewportHeight: 844,
  };

  assert.equal(resolveSheetSnapHeightPx('collapsed', cfg390), 78);
  // peek = 844 * 0.40 = 338px
  assert.equal(resolveSheetSnapHeightPx('peek', cfg390), 338);
  // expanded = 844 * 0.86 = 726px
  assert.equal(resolveSheetSnapHeightPx('expanded', cfg390), 726);

  // Small viewport: 320x568
  const cfg320: BottomSheetSnapConfig = {
    ...DEFAULT_BOTTOM_SHEET_CONFIG,
    viewportHeight: 568,
  };
  assert.equal(resolveSheetSnapHeightPx('collapsed', cfg320), 78);
  assert.equal(resolveSheetSnapHeightPx('peek', cfg320), 227); // 568 * 0.40 = 227.2 -> 227
  assert.equal(resolveSheetSnapHeightPx('expanded', cfg320), 488); // 568 * 0.86 = 488.48 -> 488
});

test('computeNextSnapStateFromGesture handles upward and downward dragging', () => {
  // Upward drag from collapsed
  assert.equal(
    computeNextSnapStateFromGesture({
      currentState: 'collapsed',
      deltaY: -60,
      velocityY: -0.2,
    }),
    'peek'
  );

  // Upward drag from peek
  assert.equal(
    computeNextSnapStateFromGesture({
      currentState: 'peek',
      deltaY: -55,
      velocityY: -0.1,
    }),
    'expanded'
  );

  // Downward drag from expanded
  assert.equal(
    computeNextSnapStateFromGesture({
      currentState: 'expanded',
      deltaY: 70,
      velocityY: 0.1,
    }),
    'peek'
  );

  // Downward drag from peek
  assert.equal(
    computeNextSnapStateFromGesture({
      currentState: 'peek',
      deltaY: 50,
      velocityY: 0.2,
    }),
    'collapsed'
  );

  // Sub-threshold drag should keep state
  assert.equal(
    computeNextSnapStateFromGesture({
      currentState: 'peek',
      deltaY: 15,
      velocityY: 0.05,
    }),
    'peek'
  );
});

test('cycleNextSnapState transitions sequentially for accessible tap buttons', () => {
  assert.equal(cycleNextSnapState('collapsed'), 'peek');
  assert.equal(cycleNextSnapState('peek'), 'expanded');
  assert.equal(cycleNextSnapState('expanded'), 'collapsed');
});
