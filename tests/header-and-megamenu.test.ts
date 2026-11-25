/** @file tests/header-and-megamenu.test.ts — Stage 208 Header, Account Action, Hover Lifecycle, Positioning, Accessibility & CSS Contracts */
import test from 'node:test';
import assert from 'node:assert/strict';
import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import {
  createMegaMenuTimerController,
  MEGA_MENU_HOVER_CLOSE_DELAY_MS,
} from '../src/components/navigation/useMegaMenuLifecycle';
import { ProductGlobalHeader } from '../src/components/navigation/ProductGlobalHeader';
import { DesktopMegaMenu } from '../src/components/navigation/DesktopMegaMenu';
import {
  HeaderNotificationBell,
  normalizeUnreadNotificationCount,
} from '../src/features/communications/components/HeaderNotificationBell';

function setupMemoryWindow() {
  const store = new Map<string, string>();
  (globalThis as Record<string, unknown>).window = {
    localStorage: {
      getItem: (k: string) => store.get(k) ?? null,
      setItem: (k: string, v: string) => { store.set(k, v); },
      removeItem: (k: string) => { store.delete(k); },
    },
    dispatchEvent: () => true,
  };
  return { store };
}

test('Stages 202 & 204: MegaMenu timer controller guarantees single active timer, cancel on re-enter, stale epoch protection, pinned click stability, and unmount dispose', () => {
  assert.ok(
    MEGA_MENU_HOVER_CLOSE_DELAY_MS >= 250 && MEGA_MENU_HOVER_CLOSE_DELAY_MS <= 350,
    `Central hover-close delay should sit within 250-350ms, got ${MEGA_MENU_HOVER_CLOSE_DELAY_MS}`,
  );

  let nextId = 1;
  const activeTimers = new Map<number, () => void>();
  const clearedIds: number[] = [];
  const openEvents: boolean[] = [];

  const ctrl = createMegaMenuTimerController({
    onOpenChange: (open) => openEvents.push(open),
    setTimeoutFn: (cb) => {
      const id = nextId++;
      activeTimers.set(id, () => {
        activeTimers.delete(id);
        cb();
      });
      return id;
    },
    clearTimeoutFn: (id) => {
      clearedIds.push(id);
      activeTimers.delete(id);
    },
  });

  // 1. Hover enter trigger -> open, unpinned, no close timer
  ctrl.hoverEnter();
  assert.equal(ctrl.getState().open, true);
  assert.equal(ctrl.getState().pinned, false);
  assert.equal(activeTimers.size, 0);

  // 2. Mouse leaves trigger -> schedules 1 timer
  ctrl.scheduleClose();
  assert.equal(activeTimers.size, 1);
  assert.equal(ctrl.getState().hasActiveTimer, true);

  // 3. Re-entering panel or scheduling again never leaves duplicate timers
  const staleCallback = Array.from(activeTimers.values())[0];
  ctrl.hoverEnter();
  assert.equal(activeTimers.size, 0);
  assert.equal(clearedIds.length, 1);

  // Even if an old/expired callback fires out of order, epoch guard prevents closing newer state
  staleCallback();
  assert.equal(ctrl.getState().open, true);

  // 4. Multiple sequential scheduleClose calls keep strictly 1 active timer
  ctrl.scheduleClose();
  ctrl.scheduleClose();
  assert.equal(activeTimers.size, 1);

  // 5. Letting valid timer expire clears handle and closes menu
  const validCb = Array.from(activeTimers.values())[0];
  validCb();
  assert.equal(ctrl.getState().open, false);
  assert.equal(ctrl.getState().hasActiveTimer, false);

  // 6. Click pins menu open; scheduleClose must NOT schedule closure while pinned
  ctrl.toggleClick();
  assert.equal(ctrl.getState().open, true);
  assert.equal(ctrl.getState().pinned, true);
  ctrl.scheduleClose();
  assert.equal(activeTimers.size, 0);

  // 7. Second click unpins and closes
  ctrl.toggleClick();
  assert.equal(ctrl.getState().open, false);
  assert.equal(ctrl.getState().pinned, false);

  // 8. Context change cancels active close timer; dispose cancels timer on unmount
  ctrl.hoverEnter();
  ctrl.scheduleClose();
  assert.equal(activeTimers.size, 1);
  ctrl.onContextChange();
  assert.equal(activeTimers.size, 0);
  ctrl.scheduleClose();
  assert.equal(activeTimers.size, 1);
  ctrl.dispose();
  assert.equal(activeTimers.size, 0);
  assert.equal(ctrl.getState().hasActiveTimer, false);
});

test('Stage 208: unread notification count validation handles zero, positive, negative, and NaN cleanly', () => {
  setupMemoryWindow();
  assert.equal(normalizeUnreadNotificationCount(0), 0);
  assert.equal(normalizeUnreadNotificationCount(-4), 0);
  assert.equal(normalizeUnreadNotificationCount(Number.NaN), 0);
  assert.equal(normalizeUnreadNotificationCount(Number.POSITIVE_INFINITY), 0);
  assert.equal(normalizeUnreadNotificationCount(3.8), 3);

  const zeroHtml = renderToStaticMarkup(
    React.createElement(HeaderNotificationBell, {
      isEn: false,
      unreadNotificationsCount: 0,
      onNavigateView: () => {},
    }),
  );
  assert.equal(zeroHtml.includes('header-notification-badge'), false);

  const negativeHtml = renderToStaticMarkup(
    React.createElement(HeaderNotificationBell, {
      isEn: false,
      unreadNotificationsCount: -2,
      onNavigateView: () => {},
    }),
  );
  assert.equal(negativeHtml.includes('header-notification-badge'), false);

  const positiveHtml = renderToStaticMarkup(
    React.createElement(HeaderNotificationBell, {
      isEn: false,
      unreadNotificationsCount: 4,
      onNavigateView: () => {},
    }),
  );
  assert.equal(positiveHtml.includes('header-notification-badge'), true);
  assert.match(positiveHtml, /۴/);
});

test('Stages 201, 203, 206 & 207: ProductGlobalHeader & DesktopMegaMenu render clean account control, top-full positioning, aria-current, Beta SR text, and zero invalid classes in FA & EN', () => {
  const { store } = setupMemoryWindow();

  store.set('radar_locale_v1', 'fa');
  const headerFaHtml = renderToStaticMarkup(
    React.createElement(ProductGlobalHeader, {
      primaryView: 'services',
      activeSubTab: 'agencies',
      onSelectPrimaryView: () => {},
      activeCity: 'tehran',
      onSwitchCity: () => {},
      appleTheme: 'light',
      onToggleAppleTheme: () => {},
      unreadNotificationsCount: 2,
    }),
  );
  assert.equal(headerFaHtml.includes('role="menu"'), false, 'No invisible role="menu" placeholder allowed');
  assert.match(headerFaHtml, /data-testid="global-nav-userspace"/);
  assert.match(headerFaHtml, /aria-expanded="false"/);
  assert.match(headerFaHtml, /aria-controls="desktop-mega-menu-panel-/);
  assert.match(headerFaHtml, /header-notification-badge/);

  const panelFaHtml = renderToStaticMarkup(
    React.createElement(DesktopMegaMenu, {
      open: true,
      onClose: () => {},
      panelId: 'desktop-mega-menu-panel-test',
      locale: 'fa',
      activeView: 'services',
      activeSubTab: 'agencies',
      onSelectDestination: () => {},
      onTriggerAction: () => {},
    }),
  );
  assert.match(panelFaHtml, /id="desktop-mega-menu-panel-test"/);
  assert.match(panelFaHtml, /dir="rtl"/);
  assert.match(panelFaHtml, /top-full/);
  assert.equal(panelFaHtml.includes('top-[66px]'), false);
  assert.equal(panelFaHtml.includes('py-0.2'), false);
  assert.match(panelFaHtml, /aria-current="page"/);
  assert.match(panelFaHtml, /نسخه آزمایشی/);
  assert.match(panelFaHtml, /<p[^>]*role="presentation"[^>]*>خدمات تخصصی<\/p>/);
  assert.equal(panelFaHtml.includes('<h3'), false, 'Mega-menu inside <header> must not render <h3> headings');

  const panelEnHtml = renderToStaticMarkup(
    React.createElement(DesktopMegaMenu, {
      open: true,
      onClose: () => {},
      panelId: 'desktop-mega-menu-panel-test-en',
      locale: 'en',
      activeView: 'knowledge',
      activeSubTab: 'reports',
      onSelectDestination: () => {},
      onTriggerAction: () => {},
    }),
  );
  assert.match(panelEnHtml, /dir="ltr"/);
  assert.match(panelEnHtml, /Beta feature/);
  assert.match(panelEnHtml, /aria-current="page"/);
  assert.match(panelEnHtml, /Specialized Services/);
});
