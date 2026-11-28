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
export function shouldRestoreDialogFocus<T extends { isConnected?: boolean }>(
  previousFocus: T | null | undefined,
  openDialogs: readonly { contains?(node: T): boolean }[],
): boolean {
  if (!previousFocus || previousFocus.isConnected === false) return false;
  if (openDialogs.length === 0) return true;
  const topmostDialog = openDialogs[openDialogs.length - 1];
  return typeof topmostDialog.contains === 'function' && topmostDialog.contains(previousFocus);
}


/**
 * Shared reference-counted body scroll lock for every modal implementation.
 * All dialog systems must acquire/release through this coordinator so one
 * surface cannot unlock page scrolling while another modal remains open.
 */
export interface DialogScrollLockTarget {
  style: { overflow: string };
}

let activeDialogScrollLocks = 0;
let lockedScrollTarget: DialogScrollLockTarget | null = null;
let previousScrollOverflow: string | null = null;

export function acquireDialogScrollLock(
  target: DialogScrollLockTarget | null | undefined,
): () => void {
  if (!target) return () => undefined;

  if (activeDialogScrollLocks === 0) {
    lockedScrollTarget = target;
    previousScrollOverflow = target.style.overflow;
    target.style.overflow = 'hidden';
  }

  activeDialogScrollLocks += 1;
  let released = false;

  return () => {
    if (released) return;
    released = true;
    activeDialogScrollLocks = Math.max(0, activeDialogScrollLocks - 1);
    if (activeDialogScrollLocks === 0 && lockedScrollTarget) {
      lockedScrollTarget.style.overflow = previousScrollOverflow ?? '';
      lockedScrollTarget = null;
      previousScrollOverflow = null;
    }
  };
}
