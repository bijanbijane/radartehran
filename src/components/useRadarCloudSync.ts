/** @file useRadarCloudSync.ts — Auth + API-backed cloud sync (RT-DATA-001: no client Firestore) */
import React, { useEffect, useMemo, useRef, useState } from 'react';
import { onAuthStateChanged, type User as FirebaseUser } from 'firebase/auth';
import { auth } from '../firebase';
import {
  BargainListing,
  BUYER_ALERTS_STORAGE_KEY,
  BuyerAlertLeadItem,
  isAuthorizedAdminUser,
  NeighborhoodSponsor,
  ResidentVoteDoc,
  SPONSOR_CRM_STORAGE_KEY,
  SponsorCrmRequestItem,
} from '../data/neighborhoods';
import {
  checkDelegatedAdminRole,
  fetchUserPreferences,
  subscribeToBargains,
  subscribeToBuyerAlerts,
  subscribeToFeatureFlags,
  subscribeToMonetizationDiscount,
  subscribeToNeighborhoodOverrides,
  subscribeToResidentVotes,
  subscribeToSponsorRequests,
  type NeighborhoodOverrideDto,
} from '../data/neighborhoodRemoteRepository';
import { mergeNeighborhoodOverridesIntoList } from '../data/firestoreNeighborhoodMappers';
import { getAllMultiCityNeighborhoods } from '../data/multiCityData';
import { attachIrniCanonicalIdentities, fetchIrniLegacyAliases, type IrniLegacyAliasSnapshot } from '../data/irniGeographyClient';
import { convertPricePerSqmToUnit, formatAreaUnitLabel, formatMillionTomanAsIntlCurrency } from '../utils/areaUnit';
import {
  activateCloudListener,
  cloudSyncConnectionStatus,
  createCloudSyncListenerHealth,
  deactivateCloudListener,
  noteCloudListenerError,
  noteCloudListenerSnapshot,
  noteExplicitCloudReconnect,
  type CloudSyncListenerId,
} from '../utils/firestoreConnectionState';
import { FeatureFlags, safeJsonParse } from '../utils/security';
import { useAreaUnit, useIntlCurrency, useRadarLocale } from './AreaUnitToggle';

export interface UseRadarCloudSyncParams {
  activeCity?: string;
  hasUrlBudgetParams?: boolean;
  setMode: React.Dispatch<React.SetStateAction<'rent' | 'buy'>>;
  setDeposit: React.Dispatch<React.SetStateAction<number>>;
  setMonthlyRent: React.Dispatch<React.SetStateAction<number>>;
  setBuyTotalBudget: React.Dispatch<React.SetStateAction<number>>;
  setTargetSqm: React.Dispatch<React.SetStateAction<number>>;
  setWorkHubId: React.Dispatch<React.SetStateAction<string>>;
  setFavoriteHoodIds: React.Dispatch<React.SetStateAction<number[]>>;
  setFeatureFlags: React.Dispatch<React.SetStateAction<FeatureFlags>>;
  setNeighborhoods: React.Dispatch<React.SetStateAction<import('../data/neighborhoods').Neighborhood[]>>;
  setCloudVotes: React.Dispatch<React.SetStateAction<ResidentVoteDoc[]>>;
  setSponsorRequests: React.Dispatch<React.SetStateAction<SponsorCrmRequestItem[]>>;
  setBuyerLeads: React.Dispatch<React.SetStateAction<BuyerAlertLeadItem[]>>;
  setHasDelegatedAdminDoc: React.Dispatch<React.SetStateAction<boolean>>;
}

export function useRadarCloudSync(params: UseRadarCloudSyncParams) {
  const {
    hasUrlBudgetParams,
    setMode,
    setDeposit,
    setMonthlyRent,
    setBuyTotalBudget,
    setTargetSqm,
    setWorkHubId,
    setFavoriteHoodIds,
    setFeatureFlags,
    setNeighborhoods,
    setCloudVotes,
    setSponsorRequests,
    setBuyerLeads,
    setHasDelegatedAdminDoc,
  } = params;
  const [areaUnit] = useAreaUnit();
  const [intlCurrency] = useIntlCurrency();
  const [locale] = useRadarLocale();
  const [currentUser, setCurrentUser] = useState<FirebaseUser | null>(null);
  const [authReady, setAuthReady] = useState(false);
  const [isDelegatedAdmin, setIsDelegatedAdmin] = useState(false);
  const listenerHealthRef = useRef(createCloudSyncListenerHealth());
  const [listenerHealth, setListenerHealth] = useState(listenerHealthRef.current);
  const [reconnectGeneration, setReconnectGeneration] = useState(0);
  const [irniAliasRefreshGeneration, setIrniAliasRefreshGeneration] = useState(0);
  const [irniLegacyAliasSnapshot, setIrniLegacyAliasSnapshot] = useState<IrniLegacyAliasSnapshot | null>(null);
  const [irniAliasApiUnavailable, setIrniAliasApiUnavailable] = useState(false);
  const [cloudBargainsByHood, setCloudBargainsByHood] = useState<Record<number, BargainListing[]>>({});
  const [cloudSponsorsByHood, setCloudSponsorsByHood] = useState<Record<number, NeighborhoodSponsor>>({});
  const publish = (next: ReturnType<typeof noteCloudListenerSnapshot>) => {
    const prev = listenerHealthRef.current;
    listenerHealthRef.current = next;
    if (prev.active.join('|') !== next.active.join('|') || prev.failed.join('|') !== next.failed.join('|')) setListenerHealth(next);
  };
  const markActive = (id: CloudSyncListenerId) => publish(activateCloudListener(listenerHealthRef.current, id));
  const markInactive = (id: CloudSyncListenerId) => publish(deactivateCloudListener(listenerHealthRef.current, id));
  const markSnap = (id: CloudSyncListenerId) => publish(noteCloudListenerSnapshot(listenerHealthRef.current, id));
  const markErr = (id: CloudSyncListenerId) => publish(noteCloudListenerError(listenerHealthRef.current, id));

  useEffect(() => {
    const unsubAuth = onAuthStateChanged(auth, async (user) => {
      setCurrentUser(user);
      setAuthReady(true);
      if (!user) {
        setIsDelegatedAdmin(false);
        setHasDelegatedAdminDoc(false);
        return;
      }
      const delegated = user.emailVerified ? await checkDelegatedAdminRole(user) : false;
      setIsDelegatedAdmin(delegated);
      setHasDelegatedAdminDoc(delegated);
      if (user.emailVerified && !hasUrlBudgetParams) {
        const prefs = await fetchUserPreferences(user.uid);
        if (prefs) {
          if (prefs.mode) setMode(prefs.mode);
          if (prefs.deposit !== undefined) setDeposit(prefs.deposit);
          if (prefs.monthlyRent !== undefined) setMonthlyRent(prefs.monthlyRent);
          if (prefs.buyTotalBudget !== undefined) setBuyTotalBudget(prefs.buyTotalBudget);
          if (prefs.targetSqm !== undefined) setTargetSqm(prefs.targetSqm);
          if (prefs.workHubId) setWorkHubId(prefs.workHubId);
          if (prefs.favoriteHoodIds?.length) setFavoriteHoodIds((prev) => Array.from(new Set([...prev, ...prefs.favoriteHoodIds!])).slice(0, 50));
        }
      }
    });
    markActive('featureFlags');
    const unsubFlags = subscribeToFeatureFlags((flags) => {
      markSnap('featureFlags');
      setFeatureFlags(flags);
    });
    const unsubMoney = subscribeToMonetizationDiscount((disc) => {
      try {
        localStorage.setItem('tehran_radar_campaign_discount_v1', String(disc));
        window.dispatchEvent(new CustomEvent('radar:monetization-discount', { detail: disc }));
      } catch {
        /* ignore */
      }
    });
    return () => {
      unsubAuth();
      unsubFlags();
      unsubMoney();
      markInactive('featureFlags');
    };
  }, [hasUrlBudgetParams, reconnectGeneration, setBuyTotalBudget, setDeposit, setFavoriteHoodIds, setFeatureFlags, setMode, setMonthlyRent, setTargetSqm, setWorkHubId, setHasDelegatedAdminDoc]);

  useEffect(() => {
    if (!authReady || !currentUser?.emailVerified) {
      setCloudVotes([]);
      markInactive('votes');
      return;
    }
    markActive('votes');
    const unsub = subscribeToResidentVotes(
      { uid: currentUser.uid, isVerifiedAdmin: isAuthorizedAdminUser(currentUser, isDelegatedAdmin) },
      (votes) => {
        markSnap('votes');
        setCloudVotes(votes);
      },
      () => markErr('votes'),
    );
    return () => {
      unsub();
      markInactive('votes');
    };
  }, [authReady, currentUser, isDelegatedAdmin, reconnectGeneration, setCloudVotes]);

  useEffect(() => {
    if (!authReady) return;
    markActive('bargains');
    const unsub = subscribeToBargains((grouped) => {
      markSnap('bargains');
      setCloudBargainsByHood(grouped);
    }, () => markErr('bargains'));
    return () => {
      unsub();
      markInactive('bargains');
    };
  }, [authReady, reconnectGeneration]);

  useEffect(() => {
    if (!authReady || !currentUser?.emailVerified || !isAuthorizedAdminUser(currentUser, isDelegatedAdmin)) {
      setBuyerLeads([]);
      setSponsorRequests([]);
      try {
        localStorage.removeItem(BUYER_ALERTS_STORAGE_KEY);
        localStorage.removeItem(SPONSOR_CRM_STORAGE_KEY);
      } catch {
        /* ignore */
      }
      markInactive('sponsors');
      markInactive('buyerAlerts');
      return;
    }
    markActive('sponsors');
    markActive('buyerAlerts');
    const unsubSp = subscribeToSponsorRequests(
      ({ requests, activeSponsorsByHood }) => {
        markSnap('sponsors');
        setSponsorRequests(requests);
        setCloudSponsorsByHood(activeSponsorsByHood);
      },
      () => markErr('sponsors'),
    );
    const unsubAl = subscribeToBuyerAlerts(
      (leads) => {
        markSnap('buyerAlerts');
        setBuyerLeads(leads);
      },
      () => markErr('buyerAlerts'),
    );
    return () => {
      unsubSp();
      unsubAl();
    };
  }, [authReady, currentUser, isDelegatedAdmin, reconnectGeneration, setBuyerLeads, setSponsorRequests]);

  useEffect(() => {
    if (!authReady) return;
    markActive('overrides');
    const unsub = subscribeToNeighborhoodOverrides((overridesMap: Record<number, NeighborhoodOverrideDto>) => {
      markSnap('overrides');
      if (Object.keys(overridesMap).length === 0) return;
      const seeds = getAllMultiCityNeighborhoods();
      setNeighborhoods((prev) => mergeNeighborhoodOverridesIntoList(prev, overridesMap, seeds));
    });
    return () => {
      unsub();
      markInactive('overrides');
    };
  }, [authReady, reconnectGeneration, setNeighborhoods]);

  useEffect(() => {
    const controller = new AbortController();
    let active = true;
    fetchIrniLegacyAliases(controller.signal)
      .then((snapshot) => {
        if (!active) return;
        setIrniLegacyAliasSnapshot(snapshot);
        setIrniAliasApiUnavailable(false);
      })
      .catch(() => {
        if (!active) return;
        setIrniLegacyAliasSnapshot(null);
        setIrniAliasApiUnavailable(true);
      });
    return () => {
      active = false;
      controller.abort();
    };
  }, [reconnectGeneration, irniAliasRefreshGeneration]);

  useEffect(() => {
    if (irniLegacyAliasSnapshot) {
      setNeighborhoods((previous) => attachIrniCanonicalIdentities(
        previous,
        irniLegacyAliasSnapshot.items,
        irniLegacyAliasSnapshot.registryRevision,
        true,
      ));
    } else if (irniAliasApiUnavailable) {
      setNeighborhoods((previous) => attachIrniCanonicalIdentities(previous, [], null, false));
    }
  }, [irniLegacyAliasSnapshot, irniAliasApiUnavailable, params.activeCity, setNeighborhoods]);

  useEffect(() => {
    if (typeof window === 'undefined') return;
    const refreshAliases = () => {
      if (document.visibilityState === 'visible') setIrniAliasRefreshGeneration((value) => value + 1);
    };
    window.addEventListener('focus', refreshAliases);
    document.addEventListener('visibilitychange', refreshAliases);
    return () => {
      window.removeEventListener('focus', refreshAliases);
      document.removeEventListener('visibilitychange', refreshAliases);
    };
  }, []);

  useEffect(() => {
    if (typeof window === 'undefined') return;
    const reconnect = () => {
      publish(noteExplicitCloudReconnect(listenerHealthRef.current));
      setReconnectGeneration((g) => g + 1);
    };
    window.addEventListener('online', reconnect);
    return () => window.removeEventListener('online', reconnect);
  }, []);

  const connectionStatus: 'LIVE_SYNC' | 'CACHED_OFFLINE' | 'RECONNECTING' = cloudSyncConnectionStatus({
    authReady,
    navigatorOnLine: typeof navigator === 'undefined' || navigator.onLine !== false,
    health: listenerHealth,
  });
  const cloudSyncUnitContext = useMemo(
    () => ({
      areaUnit,
      unitLabel: formatAreaUnitLabel(areaUnit),
      intlCurrency,
      sampleUnitPrice: convertPricePerSqmToUnit(100, areaUnit),
      sampleIntlText: formatMillionTomanAsIntlCurrency(100, intlCurrency, locale),
    }),
    [areaUnit, intlCurrency, locale],
  );
  return { currentUser, authReady, connectionStatus, cloudBargainsByHood, setCloudBargainsByHood, cloudSponsorsByHood, cloudSyncUnitContext, safeJsonParse };
}

export { useMarketSync, useSponsorSync, useUserCacheSync, pruneLocalCache, type ConnectionStatusState } from './useMarketPulseSync';