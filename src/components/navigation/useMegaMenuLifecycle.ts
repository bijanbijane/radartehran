/**
 * @file src/components/navigation/useMegaMenuLifecycle.ts
 * @description Stages 202, 204 & 205: Centralized hover-close delay, race-safe timer controller,
 * unmount/context cleanup, and destination focus coordination for DesktopMegaMenu.
 */
import { useCallback, useEffect, useRef, useState } from 'react';
import type { CityId } from '../../types/models';
import type { PrimaryViewId, RadarLocale } from '../../utils/areaUnit';

export const MEGA_MENU_HOVER_CLOSE_DELAY_MS = 340;

export type MegaMenuCloseReason =
  | 'escape'
  | 'close-button'
  | 'outside-click'
  | 'destination'
  | 'nav-action'
  | 'hover-timeout'
  | 'trigger-toggle'
  | 'breakpoint';

export interface MegaMenuTimerControllerDeps {
  delayMs?: number;
  setTimeoutFn?: (cb: () => void, ms: number) => number;
  clearTimeoutFn?: (id: number) => void;
  onOpenChange: (open: boolean) => void;
}

export interface MegaMenuTimerController {
  hoverEnter: () => void;
  scheduleClose: () => void;
  cancelClose: () => void;
  toggleClick: () => void;
  closeNow: () => void;
  onContextChange: () => void;
  dispose: () => void;
  getState: () => { open: boolean; pinned: boolean; hasActiveTimer: boolean; epoch: number };
}

export function createMegaMenuTimerController(deps: MegaMenuTimerControllerDeps): MegaMenuTimerController {
  const delayMs = deps.delayMs ?? MEGA_MENU_HOVER_CLOSE_DELAY_MS;
  const setTimer = deps.setTimeoutFn ?? ((cb, ms) => window.setTimeout(cb, ms));
  const clearTimer = deps.clearTimeoutFn ?? ((id) => window.clearTimeout(id));

  let open = false;
  let pinned = false;
  let timerId: number | null = null;
  let epoch = 0;

  const setOpenState = (next: boolean) => {
    if (open !== next) {
      open = next;
      deps.onOpenChange(next);
    }
  };

  const cancelClose = () => {
    if (timerId !== null) {
      clearTimer(timerId);
      timerId = null;
    }
  };

  const hoverEnter = () => {
    epoch += 1;
    cancelClose();
    setOpenState(true);
  };

  const scheduleClose = () => {
    cancelClose();
    if (pinned || !open) return;
    const scheduledEpoch = epoch;
    timerId = setTimer(() => {
      timerId = null;
      if (!pinned && epoch === scheduledEpoch) {
        setOpenState(false);
      }
    }, delayMs);
  };

  const toggleClick = () => {
    epoch += 1;
    cancelClose();
    if (!open || !pinned) {
      pinned = true;
      setOpenState(true);
    } else {
      pinned = false;
      setOpenState(false);
    }
  };

  const closeNow = () => {
    epoch += 1;
    cancelClose();
    pinned = false;
    setOpenState(false);
  };

  const onContextChange = () => {
    epoch += 1;
    cancelClose();
  };

  const dispose = () => {
    epoch += 1;
    cancelClose();
    pinned = false;
  };

  return {
    hoverEnter,
    scheduleClose,
    cancelClose,
    toggleClick,
    closeNow,
    onContextChange,
    dispose,
    getState: () => ({ open, pinned, hasActiveTimer: timerId !== null, epoch }),
  };
}

export function focusMainDestinationAfterMegaMenuClose(): void {
  if (typeof document === 'undefined' || typeof requestAnimationFrame !== 'function') return;
  requestAnimationFrame(() => {
    const active = document.activeElement;
    if (active && active !== document.body && active !== document.documentElement && document.contains(active)) {
      return;
    }
    const target = document.getElementById('radar-main-content');
    if (target instanceof HTMLElement) {
      if (!target.hasAttribute('tabindex')) target.setAttribute('tabindex', '-1');
      target.focus({ preventScroll: true });
    }
  });
}

export function useMegaMenuLifecycle(params: {
  activeCity: CityId;
  radarLocale: RadarLocale;
  primaryView: PrimaryViewId;
}) {
  const [megaMenuOpen, setMegaMenuOpen] = useState(false);
  const controllerRef = useRef<MegaMenuTimerController | null>(null);

  if (!controllerRef.current) {
    controllerRef.current = createMegaMenuTimerController({
      onOpenChange: (next) => setMegaMenuOpen(next),
    });
  }

  const cancelCloseMega = useCallback(() => {
    controllerRef.current?.cancelClose();
  }, []);

  const scheduleCloseMega = useCallback(() => {
    controllerRef.current?.scheduleClose();
  }, []);

  const openFromHover = useCallback(() => {
    controllerRef.current?.hoverEnter();
  }, []);

  const toggleFromTriggerClick = useCallback(() => {
    controllerRef.current?.toggleClick();
  }, []);

  const closeMegaMenu = useCallback(() => {
    controllerRef.current?.closeNow();
  }, []);

  useEffect(() => {
    controllerRef.current?.onContextChange();
  }, [params.activeCity, params.radarLocale, params.primaryView]);

  useEffect(() => {
    return () => {
      controllerRef.current?.dispose();
    };
  }, []);

  useEffect(() => {
    if (!megaMenuOpen || typeof window === 'undefined' || typeof window.matchMedia !== 'function') return undefined;
    const mq = window.matchMedia('(min-width: 1024px)');
    const syncBreakpoint = () => {
      if (!mq.matches) controllerRef.current?.closeNow();
    };
    syncBreakpoint();
    mq.addEventListener('change', syncBreakpoint);
    return () => mq.removeEventListener('change', syncBreakpoint);
  }, [megaMenuOpen]);

  return {
    megaMenuOpen,
    cancelCloseMega,
    scheduleCloseMega,
    openFromHover,
    toggleFromTriggerClick,
    closeMegaMenu,
  };
}
