import React, { useEffect, useMemo, useRef, useState } from 'react';
import type { AuthUserSnapshot } from '../platform/auth';
import { getAuthClient } from '../platform/auth';
import {
  BargainListing,
  BUYER_ALERTS_STORAGE_KEY,
  BuyerAlertLeadItem,
  DEFAULT_FEATURE_FLAGS,
  INITIAL_NEIGHBORHOODS,
  Neighborhood,
  NeighborhoodSponsor,
  ResidentVoteDoc,
  SPONSOR_CRM_STORAGE_KEY,
  SponsorCrmRequestItem,
} from '../data/neighborhoods';
import { getAllMultiCityNeighborhoods, MULTI_CITY_CONFIGS } from '../data/multiCityData';
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
import { sortBargainListingsByCreatedAt } from '../utils/listingTimestampAndMediaQuality';
import { useAreaUnit, useIntlCurrency, useRadarLocale } from './AreaUnitToggle';
import { activeCloudOverrideHoodIds } from './useMarketPulseSync';

type MarketStatePayload = {
  status?: string;
  isAdmin?: boolean;
  bargains?: Array<Record<string, unknown>>;
  sponsors?: Array<Record<string, unknown>>;
  votes?: Array<Record<string, unknown>>;
  overrides?: Array<Record<string, unknown>>;
  buyerAlerts?: Array<Record<string, unknown>>;
  featureFlags?: Record<string, unknown> | null;
  monetization?: Record<string, unknown> | null;
  preferences?: Record<string, unknown> | null;
  favoriteHoodIds?: number[];
};

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
  setNeighborhoods: React.Dispatch<React.SetStateAction<Neighborhood[]>>;
  setCloudVotes: React.Dispatch<React.SetStateAction<ResidentVoteDoc[]>>;
  setSponsorRequests: React.Dispatch<React.SetStateAction<SponsorCrmRequestItem[]>>;
  setBuyerLeads: React.Dispatch<React.SetStateAction<BuyerAlertLeadItem[]>>;
  setHasDelegatedAdminDoc: React.Dispatch<React.SetStateAction<boolean>>;
}

function asText(value: unknown, max = 160): string {
  return typeof value === 'string' ? value.slice(0, max) : '';
}

function asNumber(value: unknown, min: number, max: number, fallback: number): number {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? Math.min(max, Math.max(min, parsed)) : fallback;
}

function mapSponsorRecord(row: Record<string, unknown>): SponsorCrmRequestItem | null {
  const hoodId = Number(row.hoodId);
  if (!Number.isInteger(hoodId) || hoodId < 1 || typeof row.agencyName !== 'string') return null;
  return {
    id: asText(row.id, 100),
    hoodId,
    hoodName: asText(row.hoodName, 80),
    agencyName: asText(row.agencyName, 120),
    phone: asText(row.phone, 30),
    specialty: asText(row.specialty, 140),
    experienceYears: asNumber(row.experienceYears, 0, 80, 0),
    monthlyTariffMillion: asNumber(row.monthlyTariffMillion, 0, 1000, 0),
    planMonths: Number(row.planMonths) === 3 ? 3 : 1,
    totalPayableMillion: asNumber(row.totalPayableMillion, 0, 5000, 0),
    trackingCode: asText(row.trackingCode, 80),
    expiresAtIso: asText(row.expiresAtIso, 60),
    status: row.status === 'approved' ? 'approved' : 'pending',
    createdAtFa: asText(row.createdAtFa, 60) || 'ثبت ابری',
  };
}

function mapBuyerLead(row: Record<string, unknown>): BuyerAlertLeadItem | null {
  const hoodId = Number(row.hoodId);
  if (!Number.isInteger(hoodId) || hoodId < 1 || typeof row.fullName !== 'string') return null;
  return {
    id: asText(row.id, 100),
    hoodId,
    hoodName: asText(row.hoodName, 80),
    fullName: asText(row.fullName, 100),
    phone: asText(row.phone, 30),
    dealType: row.dealType === 'اجاره' ? 'اجاره' : 'خرید',
    maxBudgetText: asText(row.maxBudgetText, 120),
    createdAtFa: asText(row.createdAtFa, 60) || 'ثبت ابری',
    createdAtIso: asText(row.createdAtIso, 40),
    expiresAtIso: asText(row.expiresAtIso, 40),
    consentVersion: asText(row.consentVersion, 80),
    submittedByUid: asText(row.submittedByUid, 100),
  };
}

function mapVote(row: Record<string, unknown>): ResidentVoteDoc | null {
  const hoodId = Number(row.hoodId);
  if (!Number.isInteger(hoodId) || hoodId < 1) return null;
  return {
    id: asText(row.id, 100),
    hoodId,
    hoodName: asText(row.hoodName, 80),
    userId: asText(row.userId, 100),
    userDisplayName: asText(row.userDisplayName, 100) || 'ساکن محله',
    air: asNumber(row.air, 0, 10, 7),
    powerWater: asNumber(row.powerWater, 0, 10, 7),
    internet: asNumber(row.internet, 0, 10, 7),
    metro: asNumber(row.metro, 0, 10, 7),
    security: asNumber(row.security, 0, 10, 7),
    flatTerrain: asNumber(row.flatTerrain, 0, 10, 7),
    comment: asText(row.comment, 500),
    locationVerified: false,
  };
}

export function useRadarCloudSync(params: UseRadarCloudSyncParams) {
  const {
    activeCity = 'tehran',
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
  const [currentUser, setCurrentUser] = useState<AuthUserSnapshot | null>(null);
  const [authReady, setAuthReady] = useState(false);
  const [isDelegatedAdmin, setIsDelegatedAdmin] = useState(false);
  const listenerHealthRef = useRef(createCloudSyncListenerHealth());
  const [listenerHealth, setListenerHealth] = useState(listenerHealthRef.current);
  const [reconnectGeneration, setReconnectGeneration] = useState(0);
  const [cloudBargainsByHood, setCloudBargainsByHood] = useState<Record<number, BargainListing[]>>({});
  const [cloudSponsorsByHood, setCloudSponsorsByHood] = useState<Record<number, NeighborhoodSponsor>>({});
  const reqSponsorsByHoodRef = useRef<Record<number, NeighborhoodSponsor>>({});
  const ovSponsorsByHoodRef = useRef<Record<number, NeighborhoodSponsor>>({});
  const releasedOverrideIdsRef = useRef<Set<number>>(new Set());
  const previousUidRef = useRef<string | null>(null);
  const isMountedRef = useRef(true);

  const publishListenerHealth = (next: ReturnType<typeof noteCloudListenerSnapshot>) => {
    const previous = listenerHealthRef.current;
    listenerHealthRef.current = next;
    if (
      previous.active.join('|') !== next.active.join('|') ||
      previous.failed.join('|') !== next.failed.join('|') ||
      previous.succeeded.join('|') !== next.succeeded.join('|')
    ) setListenerHealth(next);
  };
  const markCloudListenerActive = (id: CloudSyncListenerId) =>
    publishListenerHealth(activateCloudListener(listenerHealthRef.current, id));
  const markCloudListenerInactive = (id: CloudSyncListenerId) =>
    publishListenerHealth(deactivateCloudListener(listenerHealthRef.current, id));
  const markCloudListenerSnapshot = (id: CloudSyncListenerId) =>
    publishListenerHealth(noteCloudListenerSnapshot(listenerHealthRef.current, id));
  const markCloudListenerError = (id: CloudSyncListenerId) =>
    publishListenerHealth(noteCloudListenerError(listenerHealthRef.current, id));

  const syncMergedCloudSponsors = () => {
    const merged: Record<number, NeighborhoodSponsor> = { ...reqSponsorsByHoodRef.current };
    for (const id of releasedOverrideIdsRef.current) delete merged[id];
    Object.assign(merged, ovSponsorsByHoodRef.current);
    setCloudSponsorsByHood(merged);
  };

  useEffect(() => {
    isMountedRef.current = true;
    const authClient = getAuthClient();
    const handleAuthChange = (user: AuthUserSnapshot | null) => {
      if (!isMountedRef.current) return;
      const previousUid = previousUidRef.current;
      const nextUid = user?.uid ?? null;
      const switchedAccount = previousUid !== null && previousUid !== nextUid;
      previousUidRef.current = nextUid;
      setCurrentUser(user);
      setAuthReady(true);
      const admin = Boolean(user?.customClaims?.isAdmin);
      setIsDelegatedAdmin(admin);
      setHasDelegatedAdminDoc(admin);
      if (!user || switchedAccount) {
        setCloudVotes([]);
        setBuyerLeads([]);
        setSponsorRequests([]);
        reqSponsorsByHoodRef.current = {};
        try {
          localStorage.removeItem(BUYER_ALERTS_STORAGE_KEY);
          localStorage.removeItem(SPONSOR_CRM_STORAGE_KEY);
        } catch { /* ignore */ }
        syncMergedCloudSponsors();
      }
    };
    const unsubscribe = authClient.subscribe((status, user) => {
      if (status === 'READY' || status === 'UNAUTHENTICATED') handleAuthChange(user);
    });
    void authClient.refreshSession().catch(() => {
      if (isMountedRef.current) setAuthReady(true);
    });
    return () => {
      isMountedRef.current = false;
      unsubscribe();
    };
  }, [setHasDelegatedAdminDoc, setBuyerLeads, setSponsorRequests, setCloudVotes]);

  useEffect(() => {
    if (!authReady) return;
    const cityHoods = activeCity === 'tehran'
      ? INITIAL_NEIGHBORHOODS
      : MULTI_CITY_CONFIGS[activeCity as keyof typeof MULTI_CITY_CONFIGS]?.neighborhoods || INITIAL_NEIGHBORHOODS;
    const hoodIds = cityHoods.map((hood) => hood.id).filter((id) => Number.isInteger(id) && id > 0).slice(0, 100);
    const query = new URLSearchParams({ cityId: activeCity, hoodIds: hoodIds.join(',') });
    let cancelled = false;
    let activeController: AbortController | null = null;
    const listenerIds: CloudSyncListenerId[] = ['featureFlags', 'votes', 'bargains', 'sponsors', 'buyerAlerts', 'overrides'];
    listenerIds.forEach(markCloudListenerActive);

    const loadState = async () => {
      activeController?.abort();
      const controller = new AbortController();
      activeController = controller;
      try {
        const response = await fetch(`/api/v1/market/state?${query.toString()}`, {
          method: 'GET',
          credentials: 'same-origin',
          cache: 'no-store',
          headers: { Accept: 'application/json' },
          signal: controller.signal,
        });
        const payload = await response.json().catch(() => null) as MarketStatePayload | null;
        if (!response.ok || !payload || payload.status !== 'ok') {
          throw new Error(typeof payload === 'object' && payload && 'code' in payload ? String(payload.code) : `MARKET_STATE_HTTP_${response.status}`);
        }
        if (cancelled || !isMountedRef.current) return;

        const admin = Boolean(payload.isAdmin || currentUser?.customClaims?.isAdmin);
        setIsDelegatedAdmin(admin);
        setHasDelegatedAdminDoc(admin);

        const rawFlags = payload.featureFlags || {};
        const validFlags = Object.fromEntries(
          Object.entries(rawFlags).filter(([key, value]) => key in DEFAULT_FEATURE_FLAGS && typeof value === 'boolean'),
        );
        setFeatureFlags({ ...DEFAULT_FEATURE_FLAGS, ...validFlags } as FeatureFlags);

        const discount = Number(payload.monetization?.campaignDiscountPercent);
        if (Number.isFinite(discount) && discount >= 0 && discount <= 100) {
          const clamped = Math.round(discount);
          try {
            localStorage.setItem('tehran_radar_campaign_discount_v1', String(clamped));
            window.dispatchEvent(new CustomEvent('radar:monetization-discount', { detail: clamped }));
          } catch { /* ignore */ }
        }

        if (currentUser && payload.preferences && !hasUrlBudgetParams) {
          const prefs = payload.preferences;
          if (prefs.mode === 'rent' || prefs.mode === 'buy') setMode(prefs.mode);
          setDeposit(asNumber(prefs.deposit, 0, 100000, 0));
          setMonthlyRent(asNumber(prefs.monthlyRent, 0, 1000, 0));
          setBuyTotalBudget(asNumber(prefs.buyTotalBudget, 500, 1000000, 6500));
          setTargetSqm(asNumber(prefs.targetSqm, 20, 1000, 80));
          setWorkHubId(asText(prefs.workHubId, 40) || 'none');
        }
        if (currentUser && Array.isArray(payload.favoriteHoodIds)) {
          const favorites = payload.favoriteHoodIds.filter((id): id is number => Number.isInteger(id) && id >= 1 && id <= 999).slice(0, 50);
          setFavoriteHoodIds((previous) => Array.from(new Set([...previous, ...favorites])).slice(0, 50));
        }

        const bargainMap: Record<number, BargainListing[]> = {};
        for (const row of payload.bargains || []) {
          const hoodId = Number(row.hoodId);
          if (!Number.isInteger(hoodId) || hoodId < 1 || hoodId > 9999 || typeof row.title !== 'string' || typeof row.priceText !== 'string') continue;
          if (row.status !== 'approved' && !(admin && row.status === 'pending')) continue;
          const listing: BargainListing = {
            id: asText(row.id, 100),
            title: asText(row.title, 160),
            type: row.type === 'اجاره' ? 'اجاره' : 'خرید',
            sqm: asNumber(row.sqm, 25, 1000, 75),
            priceText: asText(row.priceText, 160),
            discountPercent: asNumber(row.discountPercent, 10, 60, 10),
            buyerProfitText: asText(row.buyerProfitText, 160),
            street: asText(row.street, 120),
            status: row.status === 'rejected' ? 'rejected' : row.status === 'pending' ? 'pending' : 'approved',
            createdAtIso: asText(row.createdAtIso, 40),
            updatedAtIso: asText(row.updatedAtIso, 40),
            ownerUserId: asText(row.ownerUserId, 100),
          };
          if (!bargainMap[hoodId]) bargainMap[hoodId] = [];
          bargainMap[hoodId].push(listing);
        }
        for (const rows of Object.values(bargainMap)) rows.splice(0, rows.length, ...sortBargainListingsByCreatedAt(rows));
        setCloudBargainsByHood(bargainMap);

        const sponsorRequests = (payload.sponsors || []).map(mapSponsorRecord).filter((item): item is SponsorCrmRequestItem => Boolean(item));
        const activeSponsors: Record<number, NeighborhoodSponsor> = {};
        for (const item of sponsorRequests) {
          const notExpired = !item.expiresAtIso || Date.parse(item.expiresAtIso) > Date.now();
          if (item.status === 'approved' && notExpired) {
            activeSponsors[item.hoodId] = {
              name: item.agencyName,
              phone: item.phone,
              specialty: item.specialty,
              experienceYears: item.experienceYears,
              expiresAtIso: item.expiresAtIso,
              planType: item.planMonths === 3 ? 'paid_3m' : 'paid_1m',
            };
          }
        }
        reqSponsorsByHoodRef.current = activeSponsors;
        setSponsorRequests(admin ? sponsorRequests : []);
        const buyerLeads = admin ? (payload.buyerAlerts || []).map(mapBuyerLead).filter((item): item is BuyerAlertLeadItem => Boolean(item)) : [];
        setBuyerLeads(buyerLeads);
        syncMergedCloudSponsors();

        const votes = (payload.votes || []).map(mapVote).filter((item): item is ResidentVoteDoc => Boolean(item));
        setCloudVotes(votes);

        const overridesMap: Record<number, Record<string, unknown>> = {};
        const nextOverrideIds = new Set<number>();
        const nextOverrideSponsors: Record<number, NeighborhoodSponsor> = {};
        const nextReleasedIds = new Set<number>();
        for (const row of payload.overrides || []) {
          const hoodId = Number(row.hoodId);
          if (!Number.isInteger(hoodId) || hoodId < 1 || hoodId > 9999) continue;
          const buyPerSqm = typeof row.buyPerSqm === 'number' && row.buyPerSqm >= 10 && row.buyPerSqm <= 5000 ? row.buyPerSqm : undefined;
          const rahn80m = typeof row.rahn80m === 'number' && row.rahn80m >= 50 && row.rahn80m <= 100000 ? row.rahn80m : undefined;
          if (buyPerSqm !== undefined || rahn80m !== undefined) nextOverrideIds.add(hoodId);
          const sponsor = row.sponsor && typeof row.sponsor === 'object' ? row.sponsor as Record<string, unknown> : null;
          if (sponsor) {
            nextOverrideSponsors[hoodId] = {
              name: asText(sponsor.name || sponsor.agencyName, 120),
              phone: asText(sponsor.phone, 30),
              specialty: asText(sponsor.specialty, 120),
              experienceYears: asNumber(sponsor.experienceYears, 0, 80, 0),
              expiresAtIso: asText(sponsor.expiresAtIso, 60),
              planType: sponsor.planType === 'paid_3m' ? 'paid_3m' : sponsor.planType === 'paid_1m' ? 'paid_1m' : 'free',
            };
          } else if (row.sponsor === null) {
            nextReleasedIds.add(hoodId);
          }
          overridesMap[hoodId] = {
            buyPerSqm,
            rahn80m,
            pros: asText(row.pros, 400),
            cons: asText(row.cons, 400),
            sponsor: row.sponsor === null ? null : nextOverrideSponsors[hoodId],
          };
        }
        for (const oldId of activeCloudOverrideHoodIds) {
          if (!nextOverrideIds.has(oldId)) activeCloudOverrideHoodIds.delete(oldId);
        }
        for (const id of nextOverrideIds) activeCloudOverrideHoodIds.add(id);
        ovSponsorsByHoodRef.current = nextOverrideSponsors;
        releasedOverrideIdsRef.current = nextReleasedIds;
        const allCitySeeds = [...INITIAL_NEIGHBORHOODS, ...getAllMultiCityNeighborhoods()];
        if (Object.keys(overridesMap).length > 0) {
          setNeighborhoods((previous) => {
            const next = previous.map((neighborhood) => {
              const override = overridesMap[neighborhood.id];
              if (!override) return neighborhood;
              return {
                ...neighborhood,
                buyPerSqm: (override.buyPerSqm as number | undefined) ?? neighborhood.buyPerSqm,
                rahn80m: (override.rahn80m as number | undefined) ?? neighborhood.rahn80m,
                pros: (override.pros as string | undefined) ?? neighborhood.pros,
                cons: (override.cons as string | undefined) ?? neighborhood.cons,
                sponsor: override.sponsor === null ? undefined : (override.sponsor as NeighborhoodSponsor | undefined) ?? neighborhood.sponsor,
              };
            });
            for (const [idText, override] of Object.entries(overridesMap)) {
              const id = Number(idText);
              if (next.some((neighborhood) => neighborhood.id === id)) continue;
              const seed = allCitySeeds.find((neighborhood) => neighborhood.id === id);
              if (seed) next.push({
                ...seed,
                buyPerSqm: (override.buyPerSqm as number | undefined) ?? seed.buyPerSqm,
                rahn80m: (override.rahn80m as number | undefined) ?? seed.rahn80m,
                pros: (override.pros as string | undefined) ?? seed.pros,
                cons: (override.cons as string | undefined) ?? seed.cons,
                sponsor: override.sponsor === null ? undefined : (override.sponsor as NeighborhoodSponsor | undefined) ?? seed.sponsor,
              });
            }
            return next;
          });
        }

        listenerIds.forEach(markCloudListenerSnapshot);
      } catch (error) {
        if (cancelled || (error instanceof Error && error.name === 'AbortError')) return;
        listenerIds.forEach(markCloudListenerError);
        setCloudVotes([]);
        setBuyerLeads([]);
        setSponsorRequests([]);
        setCloudBargainsByHood({});
        reqSponsorsByHoodRef.current = {};
        ovSponsorsByHoodRef.current = {};
        releasedOverrideIdsRef.current = new Set();
        syncMergedCloudSponsors();
      }
    };

    void loadState();
    const poll = window.setInterval(() => {
      if (typeof navigator === 'undefined' || navigator.onLine !== false) void loadState();
    }, 30_000);
    return () => {
      cancelled = true;
      activeController?.abort();
      window.clearInterval(poll);
      listenerIds.forEach(markCloudListenerInactive);
    };
  }, [
    activeCity,
    authReady,
    currentUser?.uid,
    hasUrlBudgetParams,
    reconnectGeneration,
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
  ]);

  useEffect(() => {
    if (typeof window === 'undefined') return;
    const reconnect = () => {
      publishListenerHealth(noteExplicitCloudReconnect(listenerHealthRef.current));
      setReconnectGeneration((generation) => generation + 1);
    };
    window.addEventListener('online', reconnect);
    return () => window.removeEventListener('online', reconnect);
  }, []);

  const connectionStatus: 'LIVE_SYNC' | 'CACHED_OFFLINE' | 'RECONNECTING' =
    cloudSyncConnectionStatus({
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

  return {
    currentUser,
    authReady,
    connectionStatus,
    cloudBargainsByHood,
    setCloudBargainsByHood,
    cloudSponsorsByHood,
    cloudSyncUnitContext,
    safeJsonParse,
  };
}

export { useMarketSync, useSponsorSync, useUserCacheSync, pruneLocalCache, type ConnectionStatusState } from './useMarketPulseSync';
