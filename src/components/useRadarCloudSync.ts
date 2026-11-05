import React, { useEffect, useRef, useState } from 'react'; import { onAuthStateChanged, type User as FirebaseUser } from 'firebase/auth'; import { collection, doc, getDoc, limit, onSnapshot, orderBy, query, where } from 'firebase/firestore'; import { auth, db, handleFirestoreError, OperationType, updateFirestoreSnapshotMetadata } from '../firebase'; import { BargainListing, BUYER_ALERTS_STORAGE_KEY, BuyerAlertLeadItem, INITIAL_NEIGHBORHOODS, isAuthorizedAdminUser, Neighborhood, NeighborhoodSponsor, ResidentVoteDoc, SPONSOR_CRM_STORAGE_KEY, SponsorCrmRequestItem } from '../data/neighborhoods'; import { CLOUD_COLLECTION_LISTENER_LIMIT, isPubliclyVisibleBargainStatus, sponsorFromNeighborhoodOverride } from '../utils/publicSponsorSync'; import { getAllMultiCityNeighborhoods } from '../data/multiCityData'; import { convertPricePerSqmToUnit, formatAreaUnitLabel, formatMillionTomanAsIntlCurrency } from '../utils/areaUnit'; import { activateCloudListener, cloudSyncConnectionStatus, createCloudSyncListenerHealth, deactivateCloudListener, noteCloudListenerError, noteCloudListenerSnapshot, noteExplicitCloudReconnect, type CloudSyncListenerId } from '../utils/firestoreConnectionState'; import { FeatureFlags, safeJsonParse } from '../utils/security'; import { normalizeListingTimestampIso, sortBargainListingsByCreatedAt } from '../utils/listingTimestampAndMediaQuality'; import { useAreaUnit, useIntlCurrency, useRadarLocale } from './AreaUnitToggle';
export interface UseRadarCloudSyncParams { activeCity?: string; hasUrlBudgetParams?: boolean; setMode: React.Dispatch<React.SetStateAction<'rent' | 'buy'>>; setDeposit: React.Dispatch<React.SetStateAction<number>>; setMonthlyRent: React.Dispatch<React.SetStateAction<number>>; setBuyTotalBudget: React.Dispatch<React.SetStateAction<number>>; setTargetSqm: React.Dispatch<React.SetStateAction<number>>; setWorkHubId: React.Dispatch<React.SetStateAction<string>>; setFavoriteHoodIds: React.Dispatch<React.SetStateAction<number[]>>; setFeatureFlags: React.Dispatch<React.SetStateAction<FeatureFlags>>; setNeighborhoods: React.Dispatch<React.SetStateAction<Neighborhood[]>>; setCloudVotes: React.Dispatch<React.SetStateAction<ResidentVoteDoc[]>>; setSponsorRequests: React.Dispatch<React.SetStateAction<SponsorCrmRequestItem[]>>; setBuyerLeads: React.Dispatch<React.SetStateAction<BuyerAlertLeadItem[]>>; setHasDelegatedAdminDoc: React.Dispatch<React.SetStateAction<boolean>>; }
export function useRadarCloudSync(params: UseRadarCloudSyncParams) { const { activeCity = 'tehran', hasUrlBudgetParams, setMode, setDeposit, setMonthlyRent, setBuyTotalBudget, setTargetSqm, setWorkHubId, setFavoriteHoodIds, setFeatureFlags, setNeighborhoods, setCloudVotes, setSponsorRequests, setBuyerLeads, setHasDelegatedAdminDoc, } = params; const [areaUnit] = useAreaUnit(); const [intlCurrency] = useIntlCurrency(); const [locale] = useRadarLocale(); const [currentUser, setCurrentUser] = useState<FirebaseUser | null>(null); const [authReady, setAuthReady] = useState<boolean>(false); const [isDelegatedAdmin, setIsDelegatedAdmin] = useState<boolean>(false); const listenerHealthRef = useRef(createCloudSyncListenerHealth()); const [listenerHealth, setListenerHealth] = useState(listenerHealthRef.current); const [reconnectGeneration, setReconnectGeneration] = useState(0); const publishListenerHealth = (next: ReturnType<typeof noteCloudListenerSnapshot>) => { const prev = listenerHealthRef.current; listenerHealthRef.current = next; if (prev.active.join('|') !== next.active.join('|') || prev.failed.join('|') !== next.failed.join('|') || prev.succeeded.join('|') !== next.succeeded.join('|')) setListenerHealth(next); }; const markCloudListenerActive = (id: CloudSyncListenerId) => publishListenerHealth(activateCloudListener(listenerHealthRef.current, id)); const markCloudListenerInactive = (id: CloudSyncListenerId) => publishListenerHealth(deactivateCloudListener(listenerHealthRef.current, id)); const markCloudListenerSnapshot = (id: CloudSyncListenerId) => publishListenerHealth(noteCloudListenerSnapshot(listenerHealthRef.current, id)); const markCloudListenerError = (id: CloudSyncListenerId) => publishListenerHealth(noteCloudListenerError(listenerHealthRef.current, id)); const [cloudBargainsByHood, setCloudBargainsByHood] = useState<Record<number, BargainListing[]>>({}); const [cloudSponsorsByHood, setCloudSponsorsByHood] = useState<Record<number, NeighborhoodSponsor>>({}); const previousUidRef = useRef<string | null>(null); const isMountedRef = useRef<boolean>(true); const activeCityRef = useRef<string>(activeCity); activeCityRef.current = activeCity; useEffect(() => { isMountedRef.current = true; const unsubAuth = onAuthStateChanged(auth, async (user) => {
      if (!isMountedRef.current) return; const nextUid = user?.uid ?? null; const switchedAccount = previousUidRef.current !== null && previousUidRef.current !== nextUid; previousUidRef.current = nextUid; setCurrentUser(user); setAuthReady(true); if (!user || switchedAccount) { setIsDelegatedAdmin(false); setHasDelegatedAdminDoc(false); setCloudVotes([]); setBuyerLeads([]); setSponsorRequests([]); setCloudSponsorsByHood({}); try { localStorage.removeItem(BUYER_ALERTS_STORAGE_KEY); localStorage.removeItem(SPONSOR_CRM_STORAGE_KEY); } catch { /* ignore */ }
        if (!user) return; } if (user.emailVerified) { try { const adminSnap = await getDoc(doc(db, 'admins', user.uid)); updateFirestoreSnapshotMetadata(adminSnap.metadata); const delegated = adminSnap.exists() && isAuthorizedAdminUser(user, adminSnap.data() as any); if (isMountedRef.current) { setIsDelegatedAdmin(delegated); setHasDelegatedAdminDoc(delegated); } } catch { if (isMountedRef.current) { setIsDelegatedAdmin(false); setHasDelegatedAdminDoc(false); } } } else { setIsDelegatedAdmin(false); setHasDelegatedAdminDoc(false); }
      const prefPath = `userPreferences/${user.uid}`;
      try { const snap = await getDoc(doc(db, 'userPreferences', user.uid)); updateFirestoreSnapshotMetadata(snap.metadata); if (!isMountedRef.current || !snap.exists()) return; const data = snap.data(); if (!hasUrlBudgetParams) { if (data.mode === 'rent' || data.mode === 'buy') setMode(data.mode); if (typeof data.deposit === 'number' && data.deposit >= 0 && data.deposit <= 100000) setDeposit(data.deposit); if (typeof data.monthlyRent === 'number' && data.monthlyRent >= 0 && data.monthlyRent <= 1000) setMonthlyRent(data.monthlyRent); if (typeof data.buyTotalBudget === 'number' && data.buyTotalBudget >= 500 && data.buyTotalBudget <= 1000000) setBuyTotalBudget(data.buyTotalBudget); if (typeof data.targetSqm === 'number' && data.targetSqm >= 20 && data.targetSqm <= 1000) setTargetSqm(data.targetSqm); if (typeof data.workHubId === 'string' && data.workHubId.length >= 1 && data.workHubId.length <= 40) setWorkHubId(data.workHubId); }
        if (Array.isArray(data.favoriteHoodIds)) { const cleanFavs = data.favoriteHoodIds.filter((id: unknown): id is number => typeof id === 'number' && Number.isInteger(id) && id >= 1 && id <= 999).slice(0, 50); setFavoriteHoodIds((prevGuest) => Array.from(new Set([...prevGuest, ...cleanFavs])).slice(0, 50)); }
      } catch (err) { try { handleFirestoreError(err, OperationType.GET, prefPath); } catch { /* Non-fatal fallback */ }
      } }); markCloudListenerActive('featureFlags'); const unsubFlags = onSnapshot( doc(db, 'appConfig', 'featureFlags'), { includeMetadataChanges: true }, (snap) => { if (!isMountedRef.current || !activeCityRef.current) return; updateFirestoreSnapshotMetadata(snap.metadata); markCloudListenerSnapshot('featureFlags'); if (!snap.exists()) return;
        const d = snap.data(); setFeatureFlags({ enableCommissionCalc: Boolean(d.enableCommissionCalc ?? true), enableMultiCity: Boolean(d.enableMultiCity ?? true),
          enableSponsorBilling: Boolean(d.enableSponsorBilling ?? false), enableAiContractCheck: Boolean(d.enableAiContractCheck ?? true), enableTelegramFeed: Boolean(d.enableTelegramFeed ?? true), enableAiValuation: Boolean(d.enableAiValuation ?? true),
          enableFakeAdDetector: Boolean(d.enableFakeAdDetector ?? true), enableMortgageSimulator: Boolean(d.enableMortgageSimulator ?? true), enableTenantRights: Boolean(d.enableTenantRights ?? true), enableMunicipalityCalc: Boolean(d.enableMunicipalityCalc ?? true),
          enablePropertySwap: Boolean(d.enablePropertySwap ?? true), enableVisitChecklist: Boolean(d.enableVisitChecklist ?? true),
          enableSchoolRadar: Boolean(d.enableSchoolRadar ?? true), enableRealtorStudio: Boolean(d.enableRealtorStudio ?? true),
          enableRenovationCalc: Boolean(d.enableRenovationCalc ?? true), enableInvestmentSim: Boolean(d.enableInvestmentSim ?? true),
          enableSafetyRadar: Boolean(d.enableSafetyRadar ?? true), enableCommercialRadar: Boolean(d.enableCommercialRadar ?? true),
          enableSuburbRadar: Boolean(d.enableSuburbRadar ?? true), enablePreSaleRadar: Boolean(d.enablePreSaleRadar ?? true),
          enableMovingPlanner: Boolean(d.enableMovingPlanner ?? true), enableFractionalInvest: Boolean(d.enableFractionalInvest ?? true),
          enableTrafficZoneCalc: Boolean(d.enableTrafficZoneCalc ?? true), enableSeoContentGen: Boolean(d.enableSeoContentGen ?? true),
        });
      }, () => { markCloudListenerError('featureFlags'); }
    );
    return () => { isMountedRef.current = false; unsubAuth(); unsubFlags(); };
  }, [hasUrlBudgetParams, reconnectGeneration]);
  useEffect(() => {
    if (!authReady || !currentUser || !currentUser.emailVerified) { setCloudVotes([]); markCloudListenerInactive('votes'); return; } markCloudListenerActive('votes');
    const isVerifiedAdmin = isAuthorizedAdminUser(currentUser, isDelegatedAdmin);
    const votesQuery = isVerifiedAdmin
      ? query(collection(db, 'votes'), where('hoodId', '>=', 1), where('hoodId', '<=', 999), orderBy('hoodId'), limit(CLOUD_COLLECTION_LISTENER_LIMIT))
      : query(collection(db, 'votes'), where('userId', '==', currentUser.uid), where('hoodId', '>=', 1), where('hoodId', '<=', 999), orderBy('hoodId'), limit(CLOUD_COLLECTION_LISTENER_LIMIT));
    const unsubVotes = onSnapshot(
      votesQuery,
      { includeMetadataChanges: true },
      (snapshot) => {
        updateFirestoreSnapshotMetadata(snapshot.metadata); markCloudListenerSnapshot('votes');
        const docs: ResidentVoteDoc[] = [];
        snapshot.forEach((docSnap) => {
          const d = docSnap.data();
          const hoodId = Number(d.hoodId);
          if (Number.isNaN(hoodId) || hoodId < 1) return;
          const validScore = (v: unknown) => typeof v === 'number' && !Number.isNaN(v) && v >= 1 && v <= 10 ? v : 7;
          docs.push({
            id: docSnap.id, hoodId,
            hoodName: typeof d.hoodName === 'string' ? d.hoodName.slice(0, 60) : '',
            userId: typeof d.userId === 'string' ? d.userId : 'anon',
            userDisplayName: typeof d.userDisplayName === 'string' ? d.userDisplayName.slice(0, 60) : 'ساکن محله',
            air: validScore(d.air), powerWater: validScore(d.powerWater), internet: validScore(d.internet),
            metro: validScore(d.metro), security: validScore(d.security), flatTerrain: validScore(d.flatTerrain),
            comment: typeof d.comment === 'string' ? d.comment.slice(0, 500) : '',
            locationVerified: Boolean(d.locationVerified),
          });
        });
        setCloudVotes((prev) => (prev.length === 0 && docs.length === 0 ? prev : docs));
      },
      (err) => {
        markCloudListenerError('votes'); setCloudVotes([]);
        try { handleFirestoreError(err, OperationType.LIST, 'votes'); } catch { /* Graceful fallback */ }
      }
    );
    return () => unsubVotes();
  }, [authReady, currentUser, reconnectGeneration, setCloudVotes]);
  useEffect(() => {
    if (!authReady) { markCloudListenerInactive('bargains'); return; }
    markCloudListenerActive('bargains');
    const bargainsQuery = query(collection(db, 'bargains'), where('hoodId', '>=', 1), where('hoodId', '<=', 999), orderBy('hoodId'), limit(CLOUD_COLLECTION_LISTENER_LIMIT));
    const unsubBargains = onSnapshot(
      bargainsQuery,
      { includeMetadataChanges: true },
      (snapshot) => {
        updateFirestoreSnapshotMetadata(snapshot.metadata); markCloudListenerSnapshot('bargains');
        const grouped: Record<number, BargainListing[]> = {};
        snapshot.docs.forEach((docSnap) => {
          const d = docSnap.data();
          if (!isPubliclyVisibleBargainStatus(d.status)) return;
          const hoodId = Number(d.hoodId);
          if (Number.isNaN(hoodId) || hoodId < 1 || hoodId > 999 || typeof d.title !== 'string' || typeof d.priceText !== 'string' || typeof d.street !== 'string') return;
          const imageUrls = Array.isArray(d.imageUrls) ? d.imageUrls.filter((u: unknown): u is string => typeof u === 'string' && u.length <= 600).slice(0, 6) : undefined;
          const objectStorageKeys = Array.isArray(d.objectStorageKeys) ? d.objectStorageKeys.filter((k: unknown): k is string => typeof k === 'string' && k.length <= 240).slice(0, 6) : undefined;
          const objectStorageObjectIds = Array.isArray(d.objectStorageObjectIds) ? d.objectStorageObjectIds.filter((id: unknown): id is string => typeof id === 'string' && id.length <= 64).slice(0, 6) : undefined;
          const createdAtIso = normalizeListingTimestampIso(d.createdAt ?? d.createdAtIso);
          if (!grouped[hoodId]) grouped[hoodId] = [];
          grouped[hoodId].push({
            id: `cloud-${docSnap.id}`, title: d.title.slice(0, 160), type: d.type === 'اجاره' ? 'اجاره' : 'خرید',
            sqm: Math.min(1000, Math.max(20, Number(d.sqm) || 75)), priceText: d.priceText.slice(0, 160),
            discountPercent: Math.min(60, Math.max(10, Number(d.discountPercent) || 12)),
            buyerProfitText: typeof d.buyerProfitText === 'string' ? d.buyerProfitText.slice(0, 160) : '',
            street: d.street.slice(0, 120),
            ...(typeof d.imageUrl === 'string' ? { imageUrl: d.imageUrl.slice(0, 600) } : {}),
            ...(imageUrls && imageUrls.length > 0 ? { imageUrls } : {}),
            ...(typeof d.videoUrl === 'string' ? { videoUrl: d.videoUrl.slice(0, 600) } : {}),
            ...(typeof d.objectStorageBucket === 'string' ? { objectStorageBucket: d.objectStorageBucket.slice(0, 80) } : {}),
            ...(objectStorageKeys && objectStorageKeys.length > 0 ? { objectStorageKeys } : {}),
            ...(objectStorageObjectIds && objectStorageObjectIds.length > 0 ? { objectStorageObjectIds } : {}),
            ...(createdAtIso ? { createdAtIso } : {}),
          });
        });
        for (const hId of Object.keys(grouped)) {
          const numId = Number(hId);
          grouped[numId] = sortBargainListingsByCreatedAt(grouped[numId]);
        }
        setCloudBargainsByHood((prev) => (Object.keys(prev).length === 0 && Object.keys(grouped).length === 0 ? prev : grouped));
      },
      (err) => {
        markCloudListenerError('bargains');
        if (currentUser) {
          try { handleFirestoreError(err, OperationType.LIST, 'bargains'); } catch { /* Graceful fallback */ }
        }
      }
    );
    return () => unsubBargains();
  }, [authReady, currentUser, reconnectGeneration]);
  useEffect(() => {
    if (!authReady) { markCloudListenerInactive('sponsors'); markCloudListenerInactive('buyerAlerts'); return; }
    let isCancelled = false;
    let unsubSponsors: (() => void) | null = null;
    let unsubAlerts: (() => void) | null = null;
    const verifyAndSubscribeAdminCollections = async () => {
      if (!currentUser || !currentUser.emailVerified) {
        setBuyerLeads([]); setSponsorRequests([]); markCloudListenerInactive('sponsors'); markCloudListenerInactive('buyerAlerts'); return;
      }
      let isVerifiedAdmin = isAuthorizedAdminUser(currentUser, false);
      if (!isVerifiedAdmin) {
        try {
          const adminDoc = await getDoc(doc(db, 'admins', currentUser.uid));
          if (adminDoc.exists() && isAuthorizedAdminUser(currentUser, adminDoc.data() as any)) isVerifiedAdmin = true;
        } catch { isVerifiedAdmin = false; }
      }
      if (isCancelled) return;
      if (!isVerifiedAdmin) {
        setBuyerLeads([]); setSponsorRequests([]); markCloudListenerInactive('sponsors'); markCloudListenerInactive('buyerAlerts');
        try { localStorage.removeItem(BUYER_ALERTS_STORAGE_KEY); localStorage.removeItem(SPONSOR_CRM_STORAGE_KEY); } catch { /* ignore */ }
        return;
      }
      markCloudListenerActive('sponsors'); markCloudListenerActive('buyerAlerts');
      const sponsorsQuery = query(collection(db, 'sponsorRequests'), where('hoodId', '>=', 1), where('hoodId', '<=', 999), limit(150));
      unsubSponsors = onSnapshot(
        sponsorsQuery,
        (snapshot) => {
          markCloudListenerSnapshot('sponsors');
          const reqs: SponsorCrmRequestItem[] = [];
          const activeSponsors: Record<number, NeighborhoodSponsor> = {};
          snapshot.forEach((docSnap) => {
            const d = docSnap.data();
            const hoodId = Number(d.hoodId);
            if (Number.isNaN(hoodId) || typeof d.agencyName !== 'string' || typeof d.phone !== 'string') return;
            const status = d.status === 'approved' ? 'approved' : 'pending';
            const planMonths = d.planMonths === 3 ? 3 : 1;
            const item: SponsorCrmRequestItem = {
              id: `cloud-${docSnap.id}`,
              hoodId,
              hoodName: typeof d.hoodName === 'string' ? d.hoodName.slice(0, 80) : '',
              agencyName: d.agencyName.slice(0, 120),
              phone: d.phone.slice(0, 30),
              specialty: typeof d.specialty === 'string' ? d.specialty.slice(0, 140) : '',
              experienceYears: Math.min(60, Math.max(1, Number(d.experienceYears) || 10)),
              monthlyTariffMillion: Math.min(200, Math.max(1, Number(d.monthlyTariffMillion) || 5)),
              planMonths,
              totalPayableMillion: Number(d.totalPayableMillion) || Number(d.monthlyTariffMillion) || 5,
              trackingCode: typeof d.trackingCode === 'string' ? d.trackingCode.slice(0, 80) : '',
              expiresAtIso: typeof d.expiresAtIso === 'string' ? d.expiresAtIso : '',
              status,
              createdAtFa: typeof d.createdAtFa === 'string' ? d.createdAtFa : 'ثبت ابری',
            };
            reqs.push(item);
            const notExpired = !item.expiresAtIso || Date.parse(item.expiresAtIso) > Date.now();
            if (status === 'approved' && notExpired) {
              activeSponsors[hoodId] = {
                name: item.agencyName,
                phone: item.phone,
                specialty: item.specialty,
                experienceYears: item.experienceYears,
                expiresAtIso: item.expiresAtIso,
                planType: planMonths === 3 ? 'paid_3m' : 'paid_1m',
              };
            }
          });
          if (reqs.length > 0) setSponsorRequests(reqs);
          setCloudSponsorsByHood(activeSponsors);
        },
        (err) => {
          setSponsorRequests([]); markCloudListenerError('sponsors');
          setCloudSponsorsByHood({});
          if (unsubSponsors) { unsubSponsors(); unsubSponsors = null; }
          try { handleFirestoreError(err, OperationType.LIST, 'sponsorRequests'); } catch { /* Non-fatal */ }
        }
      );
      const alertsQuery = query(
        collection(db, 'buyerAlerts'),
        where('hoodId', '>=', 1),
        where('hoodId', '<=', 999),
        limit(150)
      );
      unsubAlerts = onSnapshot(
        alertsQuery,
        (snapshot) => {
          markCloudListenerSnapshot('buyerAlerts');
          const leads: BuyerAlertLeadItem[] = [];
          snapshot.forEach((docSnap) => {
            const d = docSnap.data();
            const hoodId = Number(d.hoodId);
            if (Number.isNaN(hoodId) || typeof d.fullName !== 'string' || typeof d.phone !== 'string') return;
            leads.push({
              id: `cloud-${docSnap.id}`,
              hoodId,
              hoodName: typeof d.hoodName === 'string' ? d.hoodName.slice(0, 80) : '',
              fullName: d.fullName.slice(0, 100),
              phone: d.phone.slice(0, 30),
              dealType: d.dealType === 'اجاره' ? 'اجاره' : 'خرید',
              maxBudgetText: typeof d.maxBudgetText === 'string' ? d.maxBudgetText.slice(0, 120) : '',
              createdAtFa: typeof d.createdAtFa === 'string' ? d.createdAtFa : 'ثبت ابری',
            });
          });
          if (leads.length > 0) setBuyerLeads(leads);
        },
        (err) => {
          setBuyerLeads([]); markCloudListenerError('buyerAlerts');
          if (unsubAlerts) { unsubAlerts(); unsubAlerts = null; }
          try { handleFirestoreError(err, OperationType.LIST, 'buyerAlerts'); } catch { /* Non-fatal */ }
        }
      );
    };
    void verifyAndSubscribeAdminCollections();
    return () => {
      isCancelled = true;
      if (unsubSponsors) unsubSponsors();
      if (unsubAlerts) unsubAlerts();
    };
  }, [authReady, currentUser, reconnectGeneration]);
  useEffect(() => {
    if (!authReady) { markCloudListenerInactive('overrides'); return; }
    markCloudListenerActive('overrides');
    const unsubOverrides = onSnapshot(
      query(collection(db, 'neighborhoodOverrides'), where('hoodId', '>=', 1), where('hoodId', '<=', 999), orderBy('hoodId'), limit(CLOUD_COLLECTION_LISTENER_LIMIT)),
      (snapshot) => {
        markCloudListenerSnapshot('overrides');
        if (!isAuthorizedAdminUser(currentUser, isDelegatedAdmin)) {
          const pub: Record<number, NeighborhoodSponsor> = {};
          snapshot.forEach((docSnap) => {
            const data = docSnap.data() as Record<string, unknown>;
            const hoodId = Number(data.hoodId ?? docSnap.id);
            const sponsor = sponsorFromNeighborhoodOverride(data);
            if (Number.isInteger(hoodId) && hoodId >= 1 && hoodId <= 999 && sponsor) pub[hoodId] = sponsor;
          });
          setCloudSponsorsByHood(pub);
        }
        const removedIds = new Set<number>();
        snapshot.docChanges().forEach((change) => {
          if (change.type === 'removed') {
            const idNum = Number(change.doc.data()?.hoodId ?? change.doc.id);
            if (Number.isInteger(idNum)) removedIds.add(idNum);
          }
        });
        const overridesMap: Record<number, { buyPerSqm?: number; rahn80m?: number; pros?: string; cons?: string; sponsor?: any }> = {};
        snapshot.forEach((docSnap) => {
          const d = docSnap.data();
          const hoodId = Number(d.hoodId ?? docSnap.id);
          if (Number.isNaN(hoodId) || hoodId < 1 || hoodId > 999) return;
          overridesMap[hoodId] = {
            buyPerSqm: typeof d.buyPerSqm === 'number' && d.buyPerSqm >= 10 && d.buyPerSqm <= 5000 ? d.buyPerSqm : undefined,
            rahn80m: typeof d.rahn80m === 'number' && d.rahn80m >= 50 && d.rahn80m <= 100000 ? d.rahn80m : undefined,
            pros: typeof d.pros === 'string' ? d.pros.slice(0, 400) : undefined,
            cons: typeof d.cons === 'string' ? d.cons.slice(0, 400) : undefined,
            sponsor: d.sponsor === null ? null : d.sponsor && typeof d.sponsor === 'object' ? d.sponsor : undefined,
          };
        });
        if (Object.keys(overridesMap).length === 0 && removedIds.size === 0) return;
        const allCitySeeds = [...INITIAL_NEIGHBORHOODS, ...getAllMultiCityNeighborhoods()];
        setNeighborhoods((prev) => {
          const next = prev.map((n) => {
            if (removedIds.has(n.id) && !overridesMap[n.id]) {
              const seed = allCitySeeds.find((s) => s.id === n.id);
              return seed ? { ...seed } : n;
            }
            const ov = overridesMap[n.id];
            if (!ov) return n;
            return {
              ...n, buyPerSqm: ov.buyPerSqm ?? n.buyPerSqm, rahn80m: ov.rahn80m ?? n.rahn80m,
              pros: ov.pros ?? n.pros, cons: ov.cons ?? n.cons,
              sponsor: ov.sponsor === null ? undefined : ov.sponsor ? { ...n.sponsor, ...ov.sponsor } : n.sponsor,
            };
          }); for (const [idStr, ov] of Object.entries(overridesMap)) {
            const numId = Number(idStr); if (!next.some((n) => n.id === numId)) { const seed = allCitySeeds.find((s) => s.id === numId); if (seed) { next.push({ ...seed, buyPerSqm: ov.buyPerSqm ?? seed.buyPerSqm, rahn80m: ov.rahn80m ?? seed.rahn80m, pros: ov.pros ?? seed.pros, cons: ov.cons ?? seed.cons, sponsor: ov.sponsor === null ? undefined : ov.sponsor ? { ...seed.sponsor, ...ov.sponsor } : seed.sponsor, }); } } } return next; }); },
      () => { markCloudListenerError('overrides'); }
    ); return () => unsubOverrides(); }, [authReady, currentUser, isDelegatedAdmin, reconnectGeneration, setNeighborhoods]);
  useEffect(() => {
    if (typeof window === 'undefined') return;
    const reconnect = () => { publishListenerHealth(noteExplicitCloudReconnect(listenerHealthRef.current)); setReconnectGeneration((generation) => generation + 1); };
    window.addEventListener('online', reconnect);
    return () => window.removeEventListener('online', reconnect);
  }, []);
  const connectionStatus: 'LIVE_SYNC' | 'CACHED_OFFLINE' | 'RECONNECTING' =
    cloudSyncConnectionStatus({ authReady, navigatorOnLine: typeof navigator === 'undefined' || navigator.onLine !== false, health: listenerHealth });
  const cloudSyncUnitContext = { areaUnit, unitLabel: formatAreaUnitLabel(areaUnit), intlCurrency, sampleUnitPrice: convertPricePerSqmToUnit(100, areaUnit), sampleIntlText: formatMillionTomanAsIntlCurrency(100, intlCurrency, locale) };
  return { currentUser, authReady, connectionStatus, cloudBargainsByHood, setCloudBargainsByHood, cloudSponsorsByHood, cloudSyncUnitContext, safeJsonParse };
}
export { useMarketSync, useSponsorSync, useUserCacheSync, pruneLocalCache, type ConnectionStatusState } from './useMarketPulseSync';