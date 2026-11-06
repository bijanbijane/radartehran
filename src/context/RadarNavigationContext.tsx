import React, { createContext, useContext, useState, useEffect, useCallback, useRef } from 'react';
import { formatMillionTomanAsIntlCurrency, getStoredIntlCurrency } from '../utils/areaUnit';

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
    return new URLSearchParams(window.location.search).get('mode') === 'RENT' ? 'RENT' : 'BUY';
  });

  const [activeTab, setActiveTabState] = useState<InspectorTabId>('OVERVIEW');
  const [activeModalId, setActiveModalId] = useState<string | null>(null);
  const [activeToast, setActiveToast] = useState<ToastMessage | null>(null);
  const toastTimerRef = useRef<number | null>(null);
  const hasExplicitNavChangeRef = useRef<boolean>(false);

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

  // Sync state to URL Search Params without triggering full page reload [RULE-16]
  useEffect(() => {
    if (typeof window === 'undefined' || !hasExplicitNavChangeRef.current) return;
    const params = new URLSearchParams(window.location.search);
    if (selectedHoodId) params.set('hood', selectedHoodId);
    else params.delete('hood');

    params.set('mode', marketMode);
    if (activeTab !== 'OVERVIEW') params.set('tab', activeTab);
    else params.delete('tab');

    const nextUrl = `${window.location.pathname}?${params.toString()}`;
    window.history.replaceState({ selectedHoodId, sheetDetent, activeModalId }, '', nextUrl);
  }, [selectedHoodId, marketMode, activeTab, sheetDetent, activeModalId]);

  // Intercept hardware Back button to close modal/drawer instead of exiting the PWA [RULE-16]
  useEffect(() => {
    if (typeof window === 'undefined') return;
    const handlePopState = () => {
      if (activeModalId !== null) {
        setActiveModalId(null);
        return;
      }
      if (sheetDetent !== 'CLOSED') {
        setSheetDetent('CLOSED');
        setSelectedHoodId(null);
      }
    };
    window.addEventListener('popstate', handlePopState);
    return () => window.removeEventListener('popstate', handlePopState);
  }, [activeModalId, sheetDetent]);

  const selectNeighborhood = useCallback(
    (hoodId: string | null, initialDetent: InspectorSheetDetent = 'HALF') => {
      hasExplicitNavChangeRef.current = true;
      setSelectedHoodId(hoodId);
      setSheetDetent(hoodId ? initialDetent : 'CLOSED');
      if (hoodId && typeof window !== 'undefined') {
        window.history.pushState({ hoodId }, '');
      }
    },
    []
  );

  const openModal = useCallback((modalId: string) => {
    hasExplicitNavChangeRef.current = true;
    setActiveModalId(modalId);
    if (typeof window !== 'undefined') {
      window.history.pushState({ modalId }, '');
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

  return (
    <RadarNavigationContext.Provider
      value={{
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
      }}
    >
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
