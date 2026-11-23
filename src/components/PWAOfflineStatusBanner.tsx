/**
 * @file src/components/PWAOfflineStatusBanner.tsx
 * @description نشانگر وضعیت کاوش آفلاین محله‌ها و دکمه نصب درون‌برنامه‌ای وب‌اپلیکیشن (PWA).
 */

import React, { useEffect, useState } from 'react';
import { CheckCircle2, CloudOff, Download, RefreshCw, WifiOff, X } from 'lucide-react';
import { toPersianNum } from '../data/neighborhoods';
import {
  AreaUnit,
  convertPricePerSqmToUnit,
  formatAreaShort,
  formatAreaUnitLabel,
  formatMillionTomanAsIntlCurrency,
  IntlCurrencyCode,
} from '../utils/areaUnit';
import {
  getFirestoreOrthogonalStatus,
  getFirestoreStatusMicrocopyFa,
  subscribeFirestoreStatus,
  type FirestoreOrthogonalStatus,
} from '../utils/firestoreConnectionState';
import { useAreaUnit, useIntlCurrency, useRadarLocale } from './AreaUnitToggle';

export interface PWAOfflineStatusBannerProps {
  neighborhoodCount: number;
  deferredPwaPrompt: any;
  onTriggerPwaInstall: () => void;
  areaUnit?: AreaUnit;
  intlCurrency?: IntlCurrencyCode;
}

export function PWAOfflineStatusBanner({
  neighborhoodCount,
  deferredPwaPrompt,
  onTriggerPwaInstall,
  areaUnit: propAreaUnit,
  intlCurrency: propIntlCurrency,
}: PWAOfflineStatusBannerProps): React.ReactElement | null {
  const [hookAreaUnit] = useAreaUnit();
  const [hookIntlCurrency] = useIntlCurrency();
  const [locale] = useRadarLocale();
  const areaUnit = propAreaUnit ?? hookAreaUnit;
  const intlCurrency = propIntlCurrency ?? hookIntlCurrency;
  const [isOnline, setIsOnline] = useState<boolean>(() =>
    typeof navigator !== 'undefined' ? navigator.onLine : true
  );
  const [swReady, setSwReady] = useState<boolean>(() =>
    typeof navigator !== 'undefined' && 'serviceWorker' in navigator
      ? Boolean(navigator.serviceWorker.controller)
      : false
  );
  const [showReconnectedToast, setShowReconnectedToast] = useState<boolean>(false);
  const [dismissedInstallPill, setDismissedInstallPill] = useState<boolean>(false);
  const [isStandalone, setIsStandalone] = useState<boolean>(false);
  const [firestoreStatus, setFirestoreStatus] = useState<FirestoreOrthogonalStatus>(() =>
    getFirestoreOrthogonalStatus()
  );

  useEffect(() => {
    const unsubFirestore = subscribeFirestoreStatus((nextStatus) => {
      setFirestoreStatus(nextStatus);
    });
    return () => unsubFirestore();
  }, []);

  useEffect(() => {
    if (typeof window === 'undefined') return undefined;

    let isMounted = true;
    let reconnectTimer: number | null = null;
    const clearReconnectTimer = () => {
      if (reconnectTimer !== null) {
        window.clearTimeout(reconnectTimer);
        reconnectTimer = null;
      }
    };

    setIsStandalone(window.matchMedia('(display-mode: standalone)').matches);

    const handleOnline = () => {
      setIsOnline(true);
      setShowReconnectedToast(true);
      clearReconnectTimer();
      reconnectTimer = window.setTimeout(() => {
        reconnectTimer = null;
        if (isMounted) setShowReconnectedToast(false);
      }, 3800);
    };
    const handleOffline = () => {
      clearReconnectTimer();
      setIsOnline(false);
      setShowReconnectedToast(false);
    };
    const handleSwReady = () => {
      if (isMounted) setSwReady(true);
    };

    window.addEventListener('online', handleOnline);
    window.addEventListener('offline', handleOffline);
    window.addEventListener('radar-sw-ready', handleSwReady);

    if ('serviceWorker' in navigator) {
      navigator.serviceWorker.ready
        .then(() => { if (isMounted) setSwReady(true); })
        .catch(() => {});
    }

    return () => {
      isMounted = false;
      clearReconnectTimer();
      window.removeEventListener('online', handleOnline);
      window.removeEventListener('offline', handleOffline);
      window.removeEventListener('radar-sw-ready', handleSwReady);
    };
  }, []);

  const microcopy = getFirestoreStatusMicrocopyFa(firestoreStatus);
  const sampleUnitBuy = convertPricePerSqmToUnit(120, areaUnit);
  const sample80mTotalMillions = 120 * 80;
  const sampleMonthlyRentMillions = 45;
  const refAreaText = formatAreaShort(80, areaUnit);
  const refCurrencyText =
    intlCurrency !== 'IRT' ? ` · ${formatMillionTomanAsIntlCurrency(sample80mTotalMillions, intlCurrency, locale)}` : '';

  if (!isOnline || firestoreStatus.backendConnectivity === 'offline') {
    return (
      <div
        role="status"
        aria-live="polite"
        className="fixed bottom-20 lg:bottom-5 left-4 z-40 max-w-sm apple-vibrancy-bar bg-amber-950/90 text-amber-50 border border-amber-500/40 rounded-2xl px-3.5 py-2.5 shadow-lg flex items-start gap-2.5 text-xs pointer-events-auto"
      >
        <span className="w-7 h-7 rounded-xl bg-amber-500/20 text-amber-300 flex items-center justify-center shrink-0 mt-0.5">
          {!isOnline ? <WifiOff className="w-4 h-4 stroke-[2]" /> : <CloudOff className="w-4 h-4 stroke-[2]" />}
        </span>
        <div className="min-w-0 leading-relaxed">
          <div className="font-extrabold text-amber-200 flex items-center gap-1.5 flex-wrap">
            <span>{!isOnline ? 'حالت کاوش آفلاین فعال است' : microcopy.connectivityLabelFa}</span>
            <span className="px-1.5 py-0.5 rounded-md bg-amber-500/25 text-amber-100 text-[10px] font-bold">
              {microcopy.dataOriginLabelFa}
            </span>
            {swReady && (
              <span className="px-1.5 py-0.5 rounded-md bg-emerald-500/25 text-emerald-200 text-[10px] font-bold">
                کش فعال
              </span>
            )}
          </div>
          <p className="text-[11px] text-amber-100/90 mt-0.5 tabular-nums">
            {firestoreStatus.writeSync === 'pending_writes'
              ? `${microcopy.writeSyncLabelFa} — بررسی ${toPersianNum(neighborhoodCount)} محله (${formatAreaUnitLabel(areaUnit)}: ${toPersianNum(sampleUnitBuy)} م · ${refAreaText}: ${toPersianNum(sample80mTotalMillions)} م${refCurrencyText} · اجاره: ${toPersianNum(sampleMonthlyRentMillions)} م) در دسترس است.`
              : `بررسی ${toPersianNum(neighborhoodCount)} محله (${formatAreaUnitLabel(areaUnit)}: ${toPersianNum(sampleUnitBuy)} م · ${refAreaText}: ${toPersianNum(sample80mTotalMillions)} م${refCurrencyText} · اجاره: ${toPersianNum(sampleMonthlyRentMillions)} م)، فیلتر بودجه، وام مسکن و نمودارهای ۶ ماهه بدون نیاز به اینترنت در دسترس است.`}
          </p>
        </div>
      </div>
    );
  }

  if (firestoreStatus.writeSync === 'pending_writes') {
    return (
      <div
        role="status"
        aria-live="polite"
        className="fixed bottom-20 lg:bottom-5 left-4 z-40 apple-vibrancy-bar bg-slate-900/90 text-slate-50 border border-slate-700 rounded-xl px-3.5 py-2 shadow-md flex items-center gap-2 text-xs pointer-events-auto"
      >
        <RefreshCw className="w-3.5 h-3.5 text-amber-400 animate-spin shrink-0" />
        <span className="font-bold">{microcopy.writeSyncLabelFa}</span>
      </div>
    );
  }

  if (showReconnectedToast) {
    return (
      <div
        role="status"
        aria-live="polite"
        className="fixed bottom-20 lg:bottom-5 left-4 z-40 apple-vibrancy-bar bg-emerald-950/90 text-emerald-50 border border-emerald-500/40 rounded-xl px-3.5 py-2 shadow-md flex items-center gap-2 text-xs pointer-events-auto"
      >
        <CheckCircle2 className="w-4 h-4 text-emerald-400 shrink-0" />
        <span className="font-bold">اتصال اینترنت برقرار شد — همگام‌سازی زنده فعال است.</span>
      </div>
    );
  }

  if (deferredPwaPrompt && !isStandalone && !dismissedInstallPill) {
    return (
      <div className="fixed bottom-20 lg:bottom-5 left-4 z-30 apple-vibrancy-bar dark:bg-slate-900/90 rounded-xl px-3 py-2 shadow-md border border-emerald-500/30 dark:border-emerald-700/50 flex items-center gap-2 text-xs pointer-events-auto">
        <button
          type="button"
          onClick={onTriggerPwaInstall}
          aria-label="نصب وب‌اپ رادار برای کاوش آفلاین"
          className="flex items-center gap-1.5 font-extrabold text-emerald-800 dark:text-emerald-300 hover:text-[var(--color-brand-600)] dark:hover:text-emerald-200 cursor-pointer"
        >
          <Download className="w-3.5 h-3.5 stroke-[2] text-[var(--color-brand-600)] dark:text-emerald-400" />
          <span>نصب وب‌اپ رادار (کاوش آفلاین)</span>
        </button>
        <button
          type="button"
          aria-label="بستن پیشنهاد نصب"
          onClick={() => setDismissedInstallPill(true)}
          className="p-0.5 rounded-md text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 cursor-pointer"
        >
          <X className="w-3.5 h-3.5" />
        </button>
      </div>
    );
  }

  return null;
}

