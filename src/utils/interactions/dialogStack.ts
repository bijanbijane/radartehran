/** @file src/utils/dialogStack.ts — Pure interaction guards for modal focus/Escape stacking and floating bar toggles */

export interface ClosestQueryable {
  closest?(selector: string): unknown;
}

export interface AttributeReadable {
  getAttribute?(name: string): string | null;
}

/**
 * Determines whether a dialog container belongs to the topmost open modal
 * (`[role="dialog"][aria-modal="true"]`) in DOM order, preventing stacked dialogs
 * from simultaneously handling `Escape` or stealing `Tab` focus.
 */
export function isTopmostModalDialogElement(
  container: ClosestQueryable | null | undefined,
  openDialogs: readonly unknown[],
): boolean {
  if (openDialogs.length === 0) return true;
  if (!container || typeof container.closest !== 'function') return false;
  const dialogRoot = container.closest('[role="dialog"][aria-modal="true"]');
  if (!dialogRoot) return false;
  return openDialogs[openDialogs.length - 1] === dialogRoot;
}

/**
 * Returns true when an outside click originated from the global header search toggle button,
 * so the floating bar mousedown listener does not collapse the dropdown right before React
 * toggles it (which would immediately reopen it).
 */
export function isGlobalSearchTriggerTarget(target: ClosestQueryable | null | undefined): boolean {
  if (!target || typeof target.closest !== 'function') return false;
  return Boolean(target.closest('[data-global-search-trigger="true"]'));
}

/**
 * Computes visibility of the floating search/filter/tools strip across map and non-map views.
 */
export function resolveFloatingBarVisibility(params: {
  primaryView: string;
  showSearchDropdown: boolean;
  mobileFilterOpen: boolean;
  showToolsPopover: boolean;
}): { showTopRow: boolean; showSearchAndFilterGroup: boolean; showToolsGroup: boolean } {
  const showSearchAndFilterGroup =
    params.primaryView === 'map' || params.showSearchDropdown || params.mobileFilterOpen;
  const showToolsGroup = params.primaryView === 'map' || params.showToolsPopover;
  return {
    showTopRow: showSearchAndFilterGroup || showToolsGroup,
    showSearchAndFilterGroup,
    showToolsGroup,
  };
}

/**
 * Guards ArrowUp/ArrowDown/Enter search navigation to run only while the neighborhood
 * search input itself holds focus.
 */
export function isNeighborhoodSearchInputFocused(
  activeElement: AttributeReadable | null | undefined,
): boolean {
  return activeElement?.getAttribute?.('aria-label') === 'جست‌وجوی محله';
}


/**
 * Allows a closing dialog to restore focus only when its saved target belongs
 * to the currently topmost remaining modal. This prevents a lower dialog's
 * cleanup from stealing focus from a still-open child/sibling modal.
 */
export function shouldRestoreDialogFocus(
  previousFocus: { isConnected?: boolean } | null | undefined,
  openDialogs: readonly { contains?(node: unknown): boolean }[],
): boolean {
  if (!previousFocus || previousFocus.isConnected === false) return false;
  if (openDialogs.length === 0) return true;
  const topmostDialog = openDialogs[openDialogs.length - 1];
  return typeof topmostDialog.contains === 'function' && topmostDialog.contains(previousFocus);
}
