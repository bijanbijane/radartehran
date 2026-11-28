/**
 * @file tests/react-component-interactions.test.ts
 * @description Unit & structural regression tests for React component interaction guards:
 * modal focus/Escape stacking, global search toggle vs outside-mousedown race,
 * non-map floating filter bar visibility, and keyboard arrow-key isolation.
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import {
  acquireDialogScrollLock,
  isTopmostModalDialogElement,
  shouldRestoreDialogFocus,
  isGlobalSearchTriggerTarget,
  resolveFloatingBarVisibility,
  isNeighborhoodSearchInputFocused,
} from '../src/utils/interactions/dialogStack';

const ROOT = process.cwd();

test('isTopmostModalDialogElement handles empty, sibling, nested, and non-modal containers', () => {
  const outerDialog = { id: 'outer' };
  const innerDialog = { id: 'inner' };

  assert.equal(isTopmostModalDialogElement(null, []), true);
  assert.equal(isTopmostModalDialogElement(null, [outerDialog]), false);

  const outerContainer = {
    closest: (selector: string) =>
      selector === '[role="dialog"][aria-modal="true"]' ? outerDialog : null,
  };
  const innerContainer = {
    closest: (selector: string) =>
      selector === '[role="dialog"][aria-modal="true"]' ? innerDialog : null,
  };
  const nonModalContainer = {
    closest: () => null,
  };

  assert.equal(isTopmostModalDialogElement(outerContainer, [outerDialog]), true);
  assert.equal(isTopmostModalDialogElement(outerContainer, [outerDialog, innerDialog]), false);
  assert.equal(isTopmostModalDialogElement(innerContainer, [outerDialog, innerDialog]), true);
  assert.equal(isTopmostModalDialogElement(nonModalContainer, [outerDialog]), false);
});


test('shouldRestoreDialogFocus preserves focus ownership across nested modal cleanup', () => {
  const trigger = { isConnected: true };
  const parentControl = { isConnected: true };
  const topmostDialog = {
    contains: (node: unknown) => node === parentControl,
  };

  // Closing a lower dialog must not restore its outside trigger over the child dialog.
  assert.equal(shouldRestoreDialogFocus(trigger, [topmostDialog]), false);
  // Closing the top dialog may restore focus to the control in the remaining parent.
  assert.equal(shouldRestoreDialogFocus(parentControl, [topmostDialog]), true);
  // With no remaining modal, restore the original trigger.
  assert.equal(shouldRestoreDialogFocus(trigger, []), true);
  // A removed trigger cannot receive focus.
  assert.equal(shouldRestoreDialogFocus({ isConnected: false }, []), false);
  assert.equal(shouldRestoreDialogFocus(null, []), false);
});

test('acquireDialogScrollLock keeps body locked until the final modal releases and is idempotent', () => {
  const body = { style: { overflow: 'auto' } };
  const releaseParent = acquireDialogScrollLock(body);

  assert.equal(body.style.overflow, 'hidden');
  const releaseChild = acquireDialogScrollLock(body);
  assert.equal(body.style.overflow, 'hidden');

  releaseParent();
  assert.equal(body.style.overflow, 'hidden');
  // StrictMode/repeated cleanup must not decrement the shared count twice.
  releaseParent();
  assert.equal(body.style.overflow, 'hidden');

  releaseChild();
  assert.equal(body.style.overflow, 'auto');
  releaseChild();
  assert.equal(body.style.overflow, 'auto');
});

test('isGlobalSearchTriggerTarget detects global header search trigger ancestors only', () => {
  const triggerBtn = { id: 'search-trigger' };
  const innerIcon = {
    closest: (selector: string) =>
      selector === '[data-global-search-trigger="true"]' ? triggerBtn : null,
  };
  const outsideNode = {
    closest: () => null,
  };

  assert.equal(isGlobalSearchTriggerTarget(innerIcon), true);
  assert.equal(isGlobalSearchTriggerTarget(outsideNode), false);
  assert.equal(isGlobalSearchTriggerTarget(null), false);
  assert.equal(isGlobalSearchTriggerTarget(undefined), false);
});

test('resolveFloatingBarVisibility keeps search/filter bar mounted on non-map views when filter is open', () => {
  assert.deepEqual(
    resolveFloatingBarVisibility({
      primaryView: 'map',
      showSearchDropdown: false,
      mobileFilterOpen: false,
      showToolsPopover: false,
    }),
    { showTopRow: true, showSearchAndFilterGroup: true, showToolsGroup: true },
  );

  assert.deepEqual(
    resolveFloatingBarVisibility({
      primaryView: 'properties',
      showSearchDropdown: false,
      mobileFilterOpen: true,
      showToolsPopover: false,
    }),
    { showTopRow: true, showSearchAndFilterGroup: true, showToolsGroup: false },
  );

  assert.deepEqual(
    resolveFloatingBarVisibility({
      primaryView: 'home',
      showSearchDropdown: true,
      mobileFilterOpen: false,
      showToolsPopover: false,
    }),
    { showTopRow: true, showSearchAndFilterGroup: true, showToolsGroup: false },
  );

  assert.deepEqual(
    resolveFloatingBarVisibility({
      primaryView: 'knowledge',
      showSearchDropdown: false,
      mobileFilterOpen: false,
      showToolsPopover: true,
    }),
    { showTopRow: true, showSearchAndFilterGroup: false, showToolsGroup: true },
  );

  assert.deepEqual(
    resolveFloatingBarVisibility({
      primaryView: 'properties',
      showSearchDropdown: false,
      mobileFilterOpen: false,
      showToolsPopover: false,
    }),
    { showTopRow: false, showSearchAndFilterGroup: false, showToolsGroup: false },
  );
});

test('isNeighborhoodSearchInputFocused matches only neighborhood search input', () => {
  assert.equal(
    isNeighborhoodSearchInputFocused({
      getAttribute: (name: string) => (name === 'aria-label' ? 'جست‌وجوی محله' : null),
    }),
    true,
  );
  assert.equal(
    isNeighborhoodSearchInputFocused({
      getAttribute: () => 'ایمیل کاربر',
    }),
    false,
  );
  assert.equal(isNeighborhoodSearchInputFocused(null), false);
  assert.equal(isNeighborhoodSearchInputFocused(undefined), false);
});

test('component interaction invariants remain wired in critical files', () => {
  const dialogStackSource = fs.readFileSync(path.join(ROOT, 'src/utils/interactions/dialogStack.ts'), 'utf8');
  assert.equal(/\bfrom\s+['"]react['"]/.test(dialogStackSource), false);

  const useDialogFocusSource = fs.readFileSync(path.join(ROOT, 'src/components/useDialogFocus.ts'), 'utf8');
  assert.match(useDialogFocusSource, /isTopmostModalDialogElement/);
  assert.match(useDialogFocusSource, /shouldRestoreDialogFocus\(prev, remainingDialogs\)/);
  assert.match(useDialogFocusSource, /e\.preventDefault\(\);\s*e\.stopPropagation\(\);/);
  assert.match(useDialogFocusSource, /if \(!escapeDisabledRef\.current && onCloseRef\.current\)/);
  const primitivesSource = fs.readFileSync(path.join(ROOT, 'src/components/ui/RadarPrimitives.tsx'), 'utf8');
  assert.match(primitivesSource, /isTopmostModalDialogElement\(panelRef\.current, openDialogs\)/);
  assert.match(primitivesSource, /shouldRestoreDialogFocus\(previouslyFocused, remainingDialogs\)/);
  assert.match(primitivesSource, /e\.preventDefault\(\);\s*e\.stopPropagation\(\);\s*onClose\(\);/);

  const secondaryModalsSource = fs.readFileSync(path.join(ROOT, 'src/components/SecondaryModals.tsx'), 'utf8');
  assert.match(secondaryModalsSource, /useDialogFocus\(showPulseModal,\s*\(\) => setShowPulseModal\(false\)\)/);
  assert.match(secondaryModalsSource, /useDialogFocus\(showSeoDrawer,\s*\(\) => setShowSeoDrawer\(false\)\)/);
  assert.match(secondaryModalsSource, /ref=\{pulseDialogRef\}/);
  assert.match(secondaryModalsSource, /ref=\{seoDialogRef\}/);
  assert.doesNotMatch(secondaryModalsSource, /useDialogFocus\(showPulseModal \|\| showSeoDrawer/);

  const buyerModalsSource = fs.readFileSync(path.join(ROOT, 'src/components/BuyerAlertPwaLegalModals.tsx'), 'utf8');
  assert.match(buyerModalsSource, /useDialogFocus\(showBuyerAlertModal,\s*\(\) => setShowBuyerAlertModal\(false\)\)/);
  assert.match(buyerModalsSource, /useDialogFocus\(showPwaModal,\s*\(\) => setShowPwaModal\(false\)\)/);
  assert.match(buyerModalsSource, /useDialogFocus\(showLegalModal,\s*\(\) => setShowLegalModal\(false\)\)/);
  assert.match(buyerModalsSource, /ref=\{buyerAlertDialogRef\}/);
  assert.match(buyerModalsSource, /ref=\{pwaDialogRef\}/);
  assert.match(buyerModalsSource, /ref=\{legalDialogRef\}/);
  assert.doesNotMatch(buyerModalsSource, /useDialogFocus\(showBuyerAlertModal \|\| showPwaModal/);

  const portfolioModalsSource = fs.readFileSync(path.join(ROOT, 'src/components/PortfolioModals.tsx'), 'utf8');
  assert.match(portfolioModalsSource, /useDialogFocus\(showVisitedModal,\s*\(\) => setShowVisitedModal\(false\)\)/);
  assert.match(portfolioModalsSource, /useDialogFocus\(showTradeUpModal,\s*\(\) => setShowTradeUpModal\(false\)\)/);
  assert.match(portfolioModalsSource, /ref=\{visitedDialogRef\}/);
  assert.match(portfolioModalsSource, /ref=\{tradeUpDialogRef\}/);
  assert.doesNotMatch(portfolioModalsSource, /useDialogFocus\(showVisitedModal \|\| showTradeUpModal/);

  const searchDropdownSource = fs.readFileSync(path.join(ROOT, 'src/components/SearchDropdownMenu.tsx'), 'utf8');
  assert.match(searchDropdownSource, /isNeighborhoodSearchInputFocused/);
  assert.match(searchDropdownSource, /\[role="dialog"\]\[aria-modal="true"\]/);

  const routerSource = fs.readFileSync(path.join(ROOT, 'src/components/views/ProductViewRouter.tsx'), 'utf8');
  assert.match(routerSource, /<FeatureErrorBoundary[\s\S]*<React\.Suspense/);
});


test('MobileMoreSheet uses shared modal stack, focus restoration, and body scroll-lock ownership', () => {
  const source = fs.readFileSync(path.join(ROOT, 'src/components/navigation/MobileMoreSheet.tsx'), 'utf8');
  assert.match(source, /acquireDialogScrollLock\(document\.body\)/);
  assert.match(source, /isTopmostModalDialogElement\(dialog, openDialogs\)/);
  assert.match(source, /shouldRestoreDialogFocus\(previouslyFocused, remainingDialogs\)/);
  assert.match(source, /event\.preventDefault\(\);\s*event\.stopPropagation\(\);\s*closeRef\.current\(\);/);
});


test('NeighborhoodPhotoGallery lightbox delegates focus and Escape lifecycle to useDialogFocus', () => {
  const source = fs.readFileSync(path.join(ROOT, 'src/components/NeighborhoodPhotoGallery.tsx'), 'utf8');
  assert.match(source, /useDialogFocus\(showLightbox,\s*\(\) => setShowLightbox\(false\)\)/);
  assert.match(source, /ref=\{lightboxRef\}/);
  assert.doesNotMatch(source, /onKeyDown=\{\(e\) => \{ if \(e\.key === 'Escape'\)/);
});


test('shared modal systems recompute and restore background accessibility isolation', () => {
  const stack = fs.readFileSync(path.join(ROOT, 'src/utils/interactions/dialogStack.ts'), 'utf8');
  const focusHook = fs.readFileSync(path.join(ROOT, 'src/components/useDialogFocus.ts'), 'utf8');
  const radarPrimitives = fs.readFileSync(path.join(ROOT, 'src/components/ui/RadarPrimitives.tsx'), 'utf8');
  const mobileMoreSheet = fs.readFileSync(path.join(ROOT, 'src/components/navigation/MobileMoreSheet.tsx'), 'utf8');

  assert.match(stack, /dialogIsolationSnapshots/);
  assert.match(stack, /setAttribute\('aria-hidden', 'true'\)/);
  assert.match(stack, /removeAttribute\('aria-hidden'\)/);
  for (const source of [focusHook, radarPrimitives, mobileMoreSheet]) {
    assert.match(source, /syncDialogBackgroundIsolation\(document\)/);
  }
});
