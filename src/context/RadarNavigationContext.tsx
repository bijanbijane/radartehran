import React, { createContext, useContext, useState, useEffect, useCallback, useMemo, useRef } from 'react';
import { formatMillionTomanAsIntlCurrency, getStoredIntlCurrency } from '../utils/areaUnit';
import {
  buildOverlayPreservingUrl,
  commitManagedHistoryTransition,
  isPopStateRestorationActive,
  readCurrentFullUrl,
} from '../navigation/url/historySingleWriter';

export function formatNavigationCurrencyHint(millionToman: number): string {
  return formatMillionTomanAsIntlCurrency(millionToman, getStoredIntlCurrency());
}

export type InspectorSheetDetent = 'CLOSED' | 'PEEK' | 'HALF' | 'FULL';
export type MarketMode = 'BUY' | 'RENT';
export type InspectorTabId = 'OVERVIEW' | 'HEDONIC' | 'TRENDS' | 'REVIEWS';

export interface ToastMessage {
  id: string;
  text: string;
  severity: 'info' | 'warning' | 'error' | 'success';
  retryAction?: () => void;
}

interface RadarNavigationState {
  selectedHoodId: string | null;
  sheetDetent: InspectorSheetDetent;
  marketMode: MarketMode;
  activeTab: InspectorTabId;
  activeModalId: string | null;
  activeToast: ToastMessage | null;
  isFocusTrapEnabled: boolean;
  selectNeighborhood: (hoodId: string | null, initialDetent?: InspectorSheetDetent) => void;
  setSheetDetent: (detent: InspectorSheetDetent) => void;
  setMarketMode: (mode: MarketMode) => void;
  setActiveTab: (tab: InspectorTabId) => void;
  openModal: (modalId: string) => void;
  closeModal: () => void;
  pushToast: (text: string, severity?: ToastMessage['severity'], retryAction?: () => void) => void;
  dismissToast: () => void;
}

const RadarNavigationContext = createContext<RadarNavigationState | null>(null);

export const RadarNavigationProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [selectedHoodId, setSelectedHoodId] = useState<string | null>(() => {
    if (typeof window === 'undefined') return null;
    return new URLSearchParams(window.location.search).get('hood');
  });

  const [sheetDetent, setSheetDetent] = useState<InspectorSheetDetent>(() =>
    selectedHoodId ? 'HALF' : 'CLOSED'
  );

  const [marketMode, setMarketModeState] = useState<MarketMode>(() => {
    if (typeof window === 'undefined') return 'BUY';
    return new URLSearchParams(window.location.search).get('mode')?.toUpperCase() === 'RENT' ? 'RENT' : 'BUY';
  });

  const [activeTab, setActiveTabState] = useState<InspectorTabId>(() => {
    if (typeof window === 'undefined') return 'OVERVIEW';
    const raw = new URLSearchParams(window.location.search).get('inspectorTab')?.toUpperCase();
    return raw === 'HEDONIC' || raw === 'TRENDS' || raw === 'REVIEWS' ? raw : 'OVERVIEW';
  });
  const [activeModalId, setActiveModalId] = useState<string | null>(null);
  const [activeToast, setActiveToast] = useState<ToastMessage | null>(null);
  const toastTimerRef = useRef<number | null>(null);
  const hasExplicitNavChangeRef = useRef<boolean>(false);
  const isPopStateSyncRef = useRef<boolean>(false);

  const setMarketMode = useCallback((mode: MarketMode) => {
    hasExplicitNavChangeRef.current = true;
    setMarketModeState(mode);
  }, []);

  const setActiveTab = useCallback((tab: InspectorTabId) => {
    hasExplicitNavChangeRef.current = true;
    setActiveTabState(tab);
  }, []);

  // [RULE-15] Focus trapping is disabled in PEEK/HALF modes so the map stays interactive
  const isFocusTrapEnabled = activeModalId !== null || sheetDetent === 'FULL';

  const activeModalIdRef = useRef(activeModalId);
  activeModalIdRef.current = activeModalId;
  const sheetDetentRef = useRef(sheetDetent);
  sheetDetentRef.current = sheetDetent;

  // Overlay-only URL sync: NEVER mutates pathname, core query params (city/hood/mode/tab), or hash [RT-FE-BUGFIX-008]
  useEffect(() => {
    if (typeof window === 'undefined' || !hasExplicitNavChangeRef.current) return;
    if (isPopStateSyncRef.current || isPopStateRestorationActive()) {
      isPopStateSyncRef.current = false;
      return;
    }
    const nextUrl = buildOverlayPreservingUrl(window.location, activeTab);
    commitManagedHistoryTransition({
      domain: 'overlay',
      mode: 'replace',
      targetUrl: nextUrl,
      state: { __radarOverlay: activeModalId !== null, selectedHoodId, sheetDetent, activeModalId, activeTab },
    });
  }, [activeTab]);

  // Restore overlay/inspector state on popstate WITHOUT triggering any history writeback [RT-FE-BUGFIX-008]
  useEffect(() => {
    if (typeof window === 'undefined') return;
    const handlePopState = () => {
      isPopStateSyncRef.current = true;
      queueMicrotask(() => {
        isPopStateSyncRef.current = false;
      });
      const rawInspectorTab = new URLSearchParams(window.location.search).get('inspectorTab')?.toUpperCase();
      const restoredTab: InspectorTabId =
        rawInspectorTab === 'HEDONIC' || rawInspectorTab === 'TRENDS' || rawInspectorTab === 'REVIEWS'
          ? rawInspectorTab
          : 'OVERVIEW';
      setActiveTabState(restoredTab);

      if (activeModalIdRef.current !== null) {
        setActiveModalId(null);
        return;
      }
      if (sheetDetentRef.current !== 'CLOSED') {
        setSheetDetent('CLOSED');
        setSelectedHoodId(null);
      }
    };
    window.addEventListener('popstate', handlePopState);
    return () => window.removeEventListener('popstate', handlePopState);
  }, []);

  useEffect(() => () => {
    if (toastTimerRef.current !== null) {
      window.clearTimeout(toastTimerRef.current);
      toastTimerRef.current = null;
    }
  }, []);

  const selectNeighborhood = useCallback(
    (hoodId: string | null, initialDetent: InspectorSheetDetent = 'HALF') => {
      hasExplicitNavChangeRef.current = true;
      setSelectedHoodId(hoodId);
      setSheetDetent(hoodId ? initialDetent : 'CLOSED');
    },
    []
  );

  const openModal = useCallback((modalId: string) => {
    hasExplicitNavChangeRef.current = true;
    const alreadyOpen = activeModalIdRef.current === modalId;
    setActiveModalId(modalId);
    if (!alreadyOpen && typeof window !== 'undefined') {
      commitManagedHistoryTransition({
        domain: 'overlay',
        mode: 'push_overlay_state',
        targetUrl: readCurrentFullUrl(window.location),
        state: { __radarOverlay: true, modalId },
      });
    }
  }, []);

  const closeModal = useCallback(() => {
    setActiveModalId(null);
  }, []);

  // [RULE-17] Single-Channel Deduplicated Toast Queue
  const pushToast = useCallback(
    (
      text: string,
      severity: ToastMessage['severity'] = 'info',
      retryAction?: () => void
    ) => {
      if (toastTimerRef.current) {
        window.clearTimeout(toastTimerRef.current);
      }
      setActiveToast({
        id: `${Date.now()}`,
        text,
        severity,
        retryAction,
      });
      toastTimerRef.current = window.setTimeout(() => {
        setActiveToast(null);
      }, 5000);
    },
    []
  );

  const dismissToast = useCallback(() => {
    if (toastTimerRef.current) window.clearTimeout(toastTimerRef.current);
    setActiveToast(null);
  }, []);

  const contextValue = useMemo<RadarNavigationState>(
    () => ({
      selectedHoodId,
      sheetDetent,
      marketMode,
      activeTab,
      activeModalId,
      activeToast,
      isFocusTrapEnabled,
      selectNeighborhood,
      setSheetDetent,
      setMarketMode,
      setActiveTab,
      openModal,
      closeModal,
      pushToast,
      dismissToast,
    }),
    [
      selectedHoodId,
      sheetDetent,
      marketMode,
      activeTab,
      activeModalId,
      activeToast,
      isFocusTrapEnabled,
      selectNeighborhood,
      setMarketMode,
      setActiveTab,
      openModal,
      closeModal,
      pushToast,
      dismissToast,
    ],
  );

  return (
    <RadarNavigationContext.Provider value={contextValue}>
      {children}
    </RadarNavigationContext.Provider>
  );
};

export function useRadarNavigation(): RadarNavigationState {
  const ctx = useContext(RadarNavigationContext);
  if (!ctx) {
    throw new Error('useRadarNavigation must be used within a RadarNavigationProvider');
  }
  return ctx;
}
