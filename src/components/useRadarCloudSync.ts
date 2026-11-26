import { useEffect, useMemo, useRef, useState } from 'react';
import type { AuthUserSnapshot } from '../platform/auth';
import { getAuthClient } from '../platform/auth';
import {
  BargainListing,
  BuyerAlertLeadItem,
  DEFAULT_FEATURE_FLAGS,
  INITIAL_NEIGHBORHOODS,
  Neighborhood,
  NeighborhoodSponsor,
  ResidentVoteDoc,
  SponsorCrmRequestItem,
} from '../data/neighborhoods';
import { getAllMultiCityNeighborhoods, MULTI_CITY_CONFIGS } from '../data/multiCityData';
import { formatAreaUnitLabel, convertPricePerSqmToUnit, formatMillionTomanAsIntlCurrency } from '../utils/areaUnit';
import { FeatureFlags, safeJsonParse } from '../utils/security';
import { sortBargainListingsByCreatedAt } from '../utils/listingTimestampAndMediaQuality';
import { useAreaUnit, useIntlCurrency, useRadarLocale } from './AreaUnitToggle';
import { activeCloudOverrideHoodIds } from './useMarketPulseSync';

type MarketStatePayload = {
  status?: string;
  cityId?: string;
  authenticated?: boolean;
  isAdmin?: boolean;
  bargains?: unknown[];
  sponsors?: unknown[];
  votes?: unknown[];
  overrides?: unknown[];
  buyerAlerts?: unknown[];
  featureFlags?: Record<string, unknown> | null;
  monetization?: Record<string, unknown> | null;
  preferences?: Record<string, unknown> | null;
  favoriteHoodIds?: unknown[];
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

function asRecord(value: unknown): Record<string, unknown> | null {
  return value !== null && typeof value === 'object' && !Array.isArray(value)
    ? value as Record<string, unknown>
    : null;
}

function finiteNumber(value: unknown, fallback = 0): number {
  const parsed = typeof value === 'number' ? value : Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
}

function normalizeFeatureFlags(raw: Record<string, unknown> | null | undefined): FeatureFlags {
  const next: Record<string, unknown> = { ...DEFAULT_FEATURE_FLAGS };
  if (raw) {
    for (const [key, value] of Object.entries(raw)) {
      if (key in DEFAULT_FEATURE_FLAGS && typeof value === 'boolean') next[key] = value;
    }
  }
  return next as unknown as FeatureFlags;
}

function normalizeBargain(value: unknown): BargainListing | null {
  const row = asRecord(value);
  if (!row || typeof row.id !== 'string' || !row.id || !Number.isInteger(Number(row.hoodId))) return null;
  if (row.status !== 'pending' && row.status !== 'approved' && row.status !== 'rejected') return null;
  const status = row.status;
  return {
    id: row.id,
    title: typeof row.title === 'string' ? row.title.slice(0, 120) : '',
    type: row.type === 'اجاره' ? 'اجاره' : 'خرید',
    sqm: finiteNumber(row.sqm),
    priceText: typeof row.priceText === 'string' ? row.priceText.slice(0, 120) : '',
    discountPercent: finiteNumber(row.discountPercent),
    buyerProfitText: typeof row.buyerProfitText === 'string' ? row.buyerProfitText.slice(0, 240) : '',
    street: typeof row.street === 'string' ? row.street.slice(0, 160) : '',
    status,
    createdAtIso: typeof row.createdAtIso === 'string' ? row.createdAtIso : undefined,
    updatedAtIso: typeof row.updatedAtIso === 'string' ? row.updatedAtIso : undefined,
    ownerUserId: typeof row.ownerUserId === 'string' ? row.ownerUserId : undefined,
  };
}

function normalizeVote(value: unknown, hoodNames: Map<number, string>): ResidentVoteDoc | null {
  const row = asRecord(value);
  const hoodId = finiteNumber(row?.hoodId, -1);
  if (!row || typeof row.id !== 'string' || !Number.isInteger(hoodId) || hoodId < 1 || hoodId > 9999) return null;
  const score = (candidate: unknown) => {
    const n = finiteNumber(candidate, 7);
    return n >= 1 && n <= 10 ? n : 7;
  };
  return {
    id: row.id,
    hoodId,
    hoodName: typeof row.hoodName === 'string' && row.hoodName ? row.hoodName.slice(0, 60) : hoodNames.get(hoodId) || '',
    userId: typeof row.userId === 'string' ? row.userId : '',
    userDisplayName: typeof row.userDisplayName === 'string' ? row.userDisplayName.slice(0, 60) : 'ساکن محله',
    air: score(row.air),
    powerWater: score(row.powerWater),
    internet: score(row.internet),
    metro: score(row.metro),
    security: score(row.security),
    flatTerrain: score(row.flatTerrain),
    comment: typeof row.comment === 'string' ? row.comment.slice(0, 500) : '',
    locationVerified: Boolean(row.locationVerified),
  };
}

function normalizeSponsorRequest(value: unknown): SponsorCrmRequestItem | null {
  const row = asRecord(value);
  const hoodId = finiteNumber(row?.hoodId, -1);
  if (!row || typeof row.id !== 'string' || !Number.isInteger(hoodId) || hoodId < 1) return null;
  return {
    id: row.id,
    hoodId,
    hoodName: typeof row.hoodName === 'string' ? row.hoodName.slice(0, 80) : '',
    agencyName: typeof row.agencyName === 'string' ? row.agencyName.slice(0, 100) : '',
    phone: typeof row.phone === 'string' ? row.phone.slice(0, 32) : '',
    specialty: typeof row.specialty === 'string' ? row.specialty.slice(0, 100) : '',
    experienceYears: finiteNumber(row.experienceYears),
    monthlyTariffMillion: finiteNumber(row.monthlyTariffMillion),
    planMonths: Number(row.planMonths) === 3 ? 3 : 1,
    totalPayableMillion: finiteNumber(row.totalPayableMillion),
    trackingCode: typeof row.trackingCode === 'string' ? row.trackingCode.slice(0, 40) : undefined,
    expiresAtIso: typeof row.expiresAtIso === 'string' ? row.expiresAtIso : undefined,
    status: row.status === 'approved' ? 'approved' : 'pending',
    createdAtFa: typeof row.createdAtFa === 'string' ? row.createdAtFa : 'ثبت ابری',
  };
}

function normalizeBuyerAlert(value: unknown): BuyerAlertLeadItem | null {
  const row = asRecord(value);
  const hoodId = finiteNumber(row?.hoodId, -1);
  if (!row || typeof row.id !== 'string' || !Number.isInteger(hoodId) || hoodId < 1) return null;
  return {
    id: row.id,
    hoodId,
    hoodName: typeof row.hoodName === 'string' ? row.hoodName.slice(0, 80) : '',
    fullName: typeof row.fullName === 'string' ? row.fullName.slice(0, 100) : '',
    phone: typeof row.phone === 'string' ? row.phone.slice(0, 32) : '',
    dealType: row.dealType === 'اجاره' ? 'اجاره' : 'خرید',
    maxBudgetText: typeof row.maxBudgetText === 'string' ? row.maxBudgetText.slice(0, 100) : '',
    createdAtFa: typeof row.createdAtFa === 'string' ? row.createdAtFa : 'ثبت ابری',
    createdAtIso: typeof row.createdAtIso === 'string' ? row.createdAtIso : undefined,
    expiresAtIso: typeof row.expiresAtIso === 'string' ? row.expiresAtIso : undefined,
    consentVersion: typeof row.consentVersion === 'string' ? row.consentVersion : undefined,
    submittedByUid: typeof row.submittedByUid === 'string' ? row.submittedByUid : undefined,
  };
}

function normalizeSponsor(value: unknown): NeighborhoodSponsor | null {
  const row = asRecord(value);
  if (!row) return null;
  const name = typeof row.name === 'string' ? row.name : typeof row.agencyName === 'string' ? row.agencyName : '';
  if (!name) return null;
  return {
    name: name.slice(0, 100),
    phone: typeof row.phone === 'string' ? row.phone.slice(0, 32) : '',
    specialty: typeof row.specialty === 'string' ? row.specialty.slice(0, 100) : '',
    experienceYears: finiteNumber(row.experienceYears),
    expiresAtIso: typeof row.expiresAtIso === 'string' ? row.expiresAtIso : undefined,
    planType: row.planType === 'paid_3m' || Number(row.planMonths) === 3 ? 'paid_3m' : row.planType === 'paid_1m' || Number(row.planMonths) === 1 ? 'paid_1m' : 'free',
  };
}

export function useRadarCloudSync(params: UseRadarCloudSyncParams) {
  const {
    activeCity = 'tehran', hasUrlBudgetParams, setMode, setDeposit, setMonthlyRent,
    setBuyTotalBudget, setTargetSqm, setWorkHubId, setFavoriteHoodIds, setFeatureFlags,
    setNeighborhoods, setCloudVotes, setSponsorRequests, setBuyerLeads, setHasDelegatedAdminDoc,
  } = params;
  const [areaUnit] = useAreaUnit();
  const [intlCurrency] = useIntlCurrency();
  const [locale] = useRadarLocale();
  const [currentUser, setCurrentUser] = useState<AuthUserSnapshot | null>(null);
  const [authReady, setAuthReady] = useState(false);
  const [connectionStatus, setConnectionStatus] = useState<'LIVE_SYNC' | 'CACHED_OFFLINE' | 'RECONNECTING'>('RECONNECTING');
  const [cloudBargainsByHood, setCloudBargainsByHood] = useState<Record<number, BargainListing[]>>({});
  const [cloudSponsorsByHood, setCloudSponsorsByHood] = useState<Record<number, NeighborhoodSponsor>>({});
  const [reconnectGeneration, setReconnectGeneration] = useState(0);
  const mountedRef = useRef(true);
  const lastUidRef = useRef<string | null>(null);
  const lastCityRef = useRef(activeCity);

  useEffect(() => {
    mountedRef.current = true;
    const client = getAuthClient();
    const unsubscribe = client.subscribe((status, user) => {
      if (!mountedRef.current) return;
      if (status === 'READY' || status === 'UNAUTHENTICATED') {
        const nextUid = user?.uid ?? null;
        if (lastUidRef.current !== nextUid) {
          lastUidRef.current = nextUid;
          setCloudVotes([]);
          setSponsorRequests([]);
          setBuyerLeads([]);
          setFavoriteHoodIds([]);
          setHasDelegatedAdminDoc(false);
        }
        setCurrentUser(user);
        setAuthReady(true);
      }
    });
    void client.refreshSession().catch(() => {
      if (mountedRef.current) setAuthReady(true);
    });
    return () => {
      mountedRef.current = false;
      unsubscribe();
    };
  }, [setBuyerLeads, setCloudVotes, setFavoriteHoodIds, setHasDelegatedAdminDoc, setSponsorRequests]);

  useEffect(() => {
    if (!authReady) return;
    if (lastCityRef.current !== activeCity) {
      lastCityRef.current = activeCity;
      setFavoriteHoodIds([]);
    }
    const controller = new AbortController();
    let cancelled = false;
    const loadMarketState = async () => {
      setConnectionStatus('RECONNECTING');
      try {
        const url = new URL('/api/v1/market/state', window.location.origin);
        url.searchParams.set('cityId', activeCity);
        const cityHoods = activeCity === 'tehran'
          ? INITIAL_NEIGHBORHOODS
          : MULTI_CITY_CONFIGS[activeCity as keyof typeof MULTI_CITY_CONFIGS]?.neighborhoods || [];
        if (cityHoods.length) url.searchParams.set('hoodIds', cityHoods.map((hood) => hood.id).join(','));
        const response = await fetch(url.toString(), {
          method: 'GET',
          credentials: 'same-origin',
          cache: 'no-store',
          headers: { Accept: 'application/json' },
          signal: controller.signal,
        });
        const payload = await response.json().catch(() => null) as MarketStatePayload | null;
        if (!response.ok || !payload || payload.status !== 'ok') throw new Error('MARKET_STATE_UNAVAILABLE');
        if (cancelled || !mountedRef.current) return;

        const isAdmin = payload.isAdmin === true;
        setHasDelegatedAdminDoc(isAdmin);
        const seedHoods = [...INITIAL_NEIGHBORHOODS, ...getAllMultiCityNeighborhoods()];
        const hoodNames = new Map(seedHoods.map((hood) => [hood.id, hood.name]));
        const groupedBargains: Record<number, BargainListing[]> = {};
        for (const rawBargain of Array.isArray(payload.bargains) ? payload.bargains : []) {
          const row = asRecord(rawBargain);
          const bargain = normalizeBargain(rawBargain);
          const hoodId = finiteNumber(row?.hoodId, -1);
          if (!bargain || !Number.isInteger(hoodId) || hoodId < 1) continue;
          (groupedBargains[hoodId] ||= []).push(bargain);
        }
        for (const [hoodId, list] of Object.entries(groupedBargains)) groupedBargains[Number(hoodId)] = sortBargainListingsByCreatedAt(list);
        setCloudBargainsByHood(groupedBargains);

        const sponsors = (Array.isArray(payload.sponsors) ? payload.sponsors : [])
          .map(normalizeSponsorRequest).filter((item): item is SponsorCrmRequestItem => Boolean(item));
        const sponsorMap: Record<number, NeighborhoodSponsor> = {};
        for (const sponsor of sponsors) {
          if (sponsor.status !== 'approved') continue;
          sponsorMap[sponsor.hoodId] = {
            name: sponsor.agencyName,
            phone: sponsor.phone,
            specialty: sponsor.specialty,
            experienceYears: sponsor.experienceYears,
            expiresAtIso: sponsor.expiresAtIso,
            planType: sponsor.planMonths === 3 ? 'paid_3m' : 'paid_1m',
          };
        }
        const overrides = Array.isArray(payload.overrides) ? payload.overrides : [];
        activeCloudOverrideHoodIds.clear();
        const overridesByHood = new Map<number, Record<string, unknown>>();
        for (const raw of overrides) {
          const row = asRecord(raw);
          const hoodId = finiteNumber(row?.hoodId, -1);
          if (!row || !Number.isInteger(hoodId) || hoodId < 1) continue;
          overridesByHood.set(hoodId, row);
          if (row.buyPerSqm !== undefined || row.rahn80m !== undefined) activeCloudOverrideHoodIds.add(hoodId);
          if (row.sponsor === null) delete sponsorMap[hoodId];
          else {
            const overrideSponsor = normalizeSponsor(row.sponsor);
            if (overrideSponsor) sponsorMap[hoodId] = { ...sponsorMap[hoodId], ...overrideSponsor };
          }
        }
        setCloudSponsorsByHood(sponsorMap);
        setNeighborhoods((previous) => previous.map((hood) => {
          const override = overridesByHood.get(hood.id);
          if (!override) return hood;
          const buyPerSqm = finiteNumber(override.buyPerSqm, NaN);
          const rahn80m = finiteNumber(override.rahn80m, NaN);
          const sponsor = override.sponsor === null ? undefined : normalizeSponsor(override.sponsor) || hood.sponsor;
          return {
            ...hood,
            buyPerSqm: Number.isFinite(buyPerSqm) && buyPerSqm >= 10 && buyPerSqm <= 5000 ? buyPerSqm : hood.buyPerSqm,
            rahn80m: Number.isFinite(rahn80m) && rahn80m >= 50 && rahn80m <= 100000 ? rahn80m : hood.rahn80m,
            sponsor,
          };
        }));

        const votes = (Array.isArray(payload.votes) ? payload.votes : [])
          .map((item) => normalizeVote(item, hoodNames)).filter((item): item is ResidentVoteDoc => Boolean(item));
        setCloudVotes(votes);
        setSponsorRequests(isAdmin ? sponsors : []);
        const buyerAlerts = (Array.isArray(payload.buyerAlerts) ? payload.buyerAlerts : [])
          .map(normalizeBuyerAlert).filter((item): item is BuyerAlertLeadItem => Boolean(item));
        setBuyerLeads(isAdmin ? buyerAlerts : []);

        setFeatureFlags(normalizeFeatureFlags(payload.featureFlags));
        const discount = finiteNumber(payload.monetization?.campaignDiscountPercent, NaN);
        if (Number.isFinite(discount) && discount >= 0 && discount <= 100) {
          const clamped = Math.round(discount);
          try {
            localStorage.setItem('tehran_radar_campaign_discount_v1', String(clamped));
            window.dispatchEvent(new CustomEvent('radar:monetization-discount', { detail: clamped }));
          } catch { /* optional browser cache */ }
        }

        const preferences = asRecord(payload.preferences);
        if (preferences && !hasUrlBudgetParams) {
          if (preferences.mode === 'rent' || preferences.mode === 'buy') setMode(preferences.mode);
          const deposit = finiteNumber(preferences.deposit, NaN);
          const monthlyRent = finiteNumber(preferences.monthlyRent, NaN);
          const buyTotalBudget = finiteNumber(preferences.buyTotalBudget, NaN);
          const targetSqm = finiteNumber(preferences.targetSqm, NaN);
          if (Number.isFinite(deposit) && deposit >= 0 && deposit <= 100000) setDeposit(deposit);
          if (Number.isFinite(monthlyRent) && monthlyRent >= 0 && monthlyRent <= 1000) setMonthlyRent(monthlyRent);
          if (Number.isFinite(buyTotalBudget) && buyTotalBudget >= 500 && buyTotalBudget <= 1000000) setBuyTotalBudget(buyTotalBudget);
          if (Number.isFinite(targetSqm) && targetSqm >= 20 && targetSqm <= 1000) setTargetSqm(targetSqm);
          if (typeof preferences.workHubId === 'string' && preferences.workHubId.length <= 40) setWorkHubId(preferences.workHubId);
        }
        if (Array.isArray(payload.favoriteHoodIds) && currentUser) {
          const ids = payload.favoriteHoodIds.map((id) => finiteNumber(id, -1)).filter((id) => Number.isInteger(id) && id >= 1 && id <= 9999).slice(0, 100);
          setFavoriteHoodIds(ids);
        }
        setConnectionStatus('LIVE_SYNC');
      } catch (error) {
        if (!cancelled && !controller.signal.aborted && mountedRef.current) setConnectionStatus('CACHED_OFFLINE');
      }
    };
    void loadMarketState();
    const interval = window.setInterval(() => { if (navigator.onLine !== false) void loadMarketState(); }, 60_000);
    const reconnect = () => { setReconnectGeneration((value) => value + 1); };
    window.addEventListener('online', reconnect);
    window.addEventListener('focus', reconnect);
    return () => {
      cancelled = true;
      controller.abort();
      window.clearInterval(interval);
      window.removeEventListener('online', reconnect);
      window.removeEventListener('focus', reconnect);
    };
  }, [activeCity, authReady, currentUser, hasUrlBudgetParams, reconnectGeneration, setBuyerLeads, setCloudVotes, setDeposit, setFavoriteHoodIds, setFeatureFlags, setHasDelegatedAdminDoc, setMonthlyRent, setMode, setNeighborhoods, setSponsorRequests, setTargetSqm, setWorkHubId]);

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
