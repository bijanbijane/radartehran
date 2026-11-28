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


type DialogIsolationSnapshot = {
  ariaHidden: string | null;
  ariaModal: string | null;
};

const dialogIsolationSnapshots = new Map<Element, DialogIsolationSnapshot>();

/**
 * Recomputes assistive-technology isolation from the active modal's DOM path.
 * Only siblings outside the topmost dialog path are hidden, so a dialog rendered
 * inside the app tree or a body portal is never hidden by its own isolation pass.
 * Original attributes are restored before each recomputation and on final close.
 */
export function syncDialogBackgroundIsolation(targetDocument?: Document | null): void {
  const doc = targetDocument ?? (typeof document !== 'undefined' ? document : null);

  for (const [element, snapshot] of dialogIsolationSnapshots) {
    if (snapshot.ariaHidden === null) element.removeAttribute('aria-hidden');
    else element.setAttribute('aria-hidden', snapshot.ariaHidden);
    if (snapshot.ariaModal === null) element.removeAttribute('aria-modal');
    else element.setAttribute('aria-modal', snapshot.ariaModal);
  }
  dialogIsolationSnapshots.clear();

  if (!doc?.body) return;

  const dialogs = Array.from(
    doc.querySelectorAll<HTMLElement>('[role="dialog"][aria-modal="true"]'),
  ).filter((dialog) => dialog.isConnected);
  const topmostDialog = dialogs[dialogs.length - 1];
  if (!topmostDialog) return;

  const remember = (element: Element) => {
    if (dialogIsolationSnapshots.has(element)) return;
    dialogIsolationSnapshots.set(element, {
      ariaHidden: element.getAttribute('aria-hidden'),
      ariaModal: element.getAttribute('aria-modal'),
    });
  };

  for (const dialog of dialogs) {
    if (dialog === topmostDialog) continue;
    remember(dialog);
    dialog.setAttribute('aria-modal', 'false');
  }

  let current: Element = topmostDialog;
  while (current.parentElement) {
    const parent = current.parentElement;
    for (const sibling of Array.from(parent.children)) {
      if (sibling === current) continue;
      if (parent === doc.body && /^(SCRIPT|STYLE|LINK|META)$/i.test(sibling.tagName)) continue;
      remember(sibling);
      sibling.setAttribute('aria-hidden', 'true');
    }
    if (parent === doc.body) break;
    current = parent;
  }
}
