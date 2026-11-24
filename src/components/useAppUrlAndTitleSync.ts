import { useEffect, useRef } from 'react';
import type { EvaluatedNeighborhood, Neighborhood, CityId } from '../data/neighborhoods';
import { INITIAL_NEIGHBORHOODS } from '../data/neighborhoods';
import { MULTI_CITY_CONFIGS, getAllMultiCityNeighborhoods, resolveCityIdForNeighborhood } from '../data/multiCityData';
import { convertPricePerSqmToUnit, formatAreaUnitLabel, formatMillionTomanAsIntlCurrency, parseUrlIntlParams, setStoredAreaUnit, setStoredIntlCurrency, setStoredRadarLocale } from '../utils/areaUnit';
import { SHOW_INTL_UNIT_CURRENCY_CONTROLS, useAreaUnit, useIntlCurrency, useRadarLocale } from './AreaUnitToggle';
import { findHoodIdByAreaSlug, parseTehranPublicPath, seoForDatedCompare, seoForDatedHood } from '../data/neighborhoodListingSamples';
import { findProvinceForHood } from '../data/iranProvincesDirectory';
import { recordRecentNavigation } from '../navigation/journey/navigationJourneyMemory';
import { findUnifiedRouteByPath } from '../navigation/registry/unifiedNavigationRegistry';
import { buildCanonicalPathForDestination, buildSynchronizedNavigationUrl, normalizePathname, resolveRouteFromLocation, sanitizeNavigationHash } from '../navigation/url/navigationUrlContract';
import { beginPopStateRestoration, commitManagedHistoryTransition, endPopStateRestoration, isPopStateRestorationActive, mergePreservedQueryIntoUrl } from '../navigation/url/historySingleWriter';
import type { AdminSectionId, ModuleSubTabId, RouteDestinationId } from '../navigation/registry/route.types';
import { matchesPersianSearch } from '../utils/security';
import { updateSeoHeadMeta } from './navigation/urlSyncHelpers';
import { CANONICAL_BRAND_FA, formatBrandCityTitle, parseStrictCityId } from '../utils/geo/cityGeospatialResolver';
import { resolveRoutePageMeta } from '../navigation/url/routePageMeta';
import type { MapNavigationIntent } from './useLeafletRadarMap';

export interface UseAppUrlAndTitleSyncParams {
  activeCity: CityId; setActiveCity: (c: CityId) => void; selectedHood?: EvaluatedNeighborhood;
  selectedHoodId: number; setSelectedHoodId: (id: number) => void; showCompareModal: boolean; setShowCompareModal: (v: boolean) => void;
  compareId1: number; setCompareId1: (id: number) => void; compareId2: number; setCompareId2: (id: number) => void;
  compHood1?: EvaluatedNeighborhood; compHood2?: EvaluatedNeighborhood; mode: 'rent' | 'buy'; setMode: (m: 'rent' | 'buy') => void;
  deposit: number; setDeposit: (d: number) => void; monthlyRent: number; setMonthlyRent: (r: number) => void;
  buyTotalBudget: number; setBuyTotalBudget: (b: number) => void; targetSqm: number; setTargetSqm: (s: number) => void;
  workHubId?: string; setWorkHubId?: (id: string) => void; primaryView?: string; setPrimaryView?: (v: any) => void;
  activeSubTab?: ModuleSubTabId; setActiveSubTab?: (s: ModuleSubTabId | undefined) => void; setAdminSection?: (s: AdminSectionId) => void;
  mapInstanceRef: React.MutableRefObject<any>; hasUrlBudgetParams: boolean;
  useLoanBooster?: boolean; setUseLoanBooster?: (v: boolean) => void; deductTenantRahnInBuy?: boolean; setDeductTenantRahnInBuy?: (v: boolean) => void;
  buildingAgeSegment?: 'new' | 'mid' | 'older'; setBuildingAgeSegment?: (v: 'new' | 'mid' | 'older') => void;
  invalidCityParam?: string | null; setInvalidCityParam?: (v: string | null) => void;
  navigationIntentRef?: React.MutableRefObject<MapNavigationIntent>;
}

export function buildAllCityHoods(): { cityId: CityId; hood: Neighborhood }[] {
  return getAllMultiCityNeighborhoods().map((hood) => ({ cityId: resolveCityIdForNeighborhood(hood.id), hood }));
}


export function applyUrlParamsFromLocation(
  pathname: string,
  search: string,
  flyMap: boolean,
  p: UseAppUrlAndTitleSyncParams,
  allCityHoods: { cityId: CityId; hood: Neighborhood }[] = buildAllCityHoods(),
): { compareAccepted: boolean; compareRejectedCrossCity: boolean } {
  const {
    setActiveCity, setSelectedHoodId, setShowCompareModal, setCompareId1, setCompareId2,
    setMode, setDeposit, setMonthlyRent, setBuyTotalBudget, setTargetSqm, setWorkHubId,
    setPrimaryView, setActiveSubTab, setAdminSection, mapInstanceRef,
    setUseLoanBooster, setDeductTenantRahnInBuy, setBuildingAgeSegment,
  } = p;

  const publicPath = parseTehranPublicPath(pathname);
  const navLoc = resolveRouteFromLocation(pathname, search);

  if (publicPath?.kind === 'hood') {
    setActiveCity('tehran'); setSelectedHoodId(publicPath.hoodId);
    if (setPrimaryView) setPrimaryView(navLoc.viewId || 'home');
    if (setActiveSubTab && navLoc.subTab) setActiveSubTab(navLoc.subTab);
  } else if (publicPath?.kind === 'compare') {
    const leftCity = resolveCityIdForNeighborhood(publicPath.leftId);
    const rightCity = resolveCityIdForNeighborhood(publicPath.rightId);
    if (leftCity === 'tehran' && rightCity === 'tehran' && publicPath.leftId !== publicPath.rightId) {
      setActiveCity('tehran'); setCompareId1(publicPath.leftId); setCompareId2(publicPath.rightId);
      setSelectedHoodId(publicPath.leftId); setShowCompareModal(true);
    } else {
      setShowCompareModal(false);
    }
    if (setPrimaryView) setPrimaryView('home');
  } else {
    if (navLoc.areaSlug) {
      const slugNorm = navLoc.areaSlug.replace(/-/g, ' ').trim();
      const mappedId = findHoodIdByAreaSlug(navLoc.areaSlug);
      const matchedHood = allCityHoods.find(
        (e) =>
          (mappedId !== null && e.hood.id === mappedId) ||
          String(e.hood.id) === slugNorm ||
          matchesPersianSearch(e.hood.name, slugNorm),
      );
      if (matchedHood) { setActiveCity(matchedHood.cityId); setSelectedHoodId(matchedHood.hood.id); }
    }
    if (setPrimaryView && (normalizePathname(pathname) !== '/' || search.includes('view=') || flyMap)) setPrimaryView(navLoc.viewId);
    if (setActiveSubTab) setActiveSubTab(navLoc.subTab);
    if (navLoc.viewId === 'admin' && setAdminSection && navLoc.subTab) setAdminSection(navLoc.subTab as AdminSectionId);
  }
  if (!search) {
    p.setInvalidCityParam?.(null);
    if (flyMap && publicPath?.kind !== 'compare') setShowCompareModal(false);
    if (flyMap && !publicPath && !navLoc.areaSlug) {
      setActiveCity('tehran');
      const tehranCfg = MULTI_CITY_CONFIGS.tehran;
      if (mapInstanceRef.current && tehranCfg) mapInstanceRef.current.flyTo(tehranCfg.center, tehranCfg.defaultZoom, { duration: 0.6 });
    }
    return { compareAccepted: false, compareRejectedCrossCity: false };
  }

  if (SHOW_INTL_UNIT_CURRENCY_CONTROLS) {
    const intlParams = parseUrlIntlParams(search);
    if (intlParams.lang) setStoredRadarLocale(intlParams.lang);
    if (intlParams.currency) setStoredIntlCurrency(intlParams.currency);
    if (intlParams.unit) setStoredAreaUnit(intlParams.unit);
  }

  const params = new URLSearchParams(search);
  const rawCity = params.get('city')?.trim().toLowerCase();
  const validCityParam = rawCity ? (parseStrictCityId(rawCity) ?? undefined) : undefined;
  if (rawCity && !validCityParam) {
    p.setInvalidCityParam?.(rawCity.slice(0, 64));
    return { compareAccepted: false, compareRejectedCrossCity: false };
  }
  p.setInvalidCityParam?.(null);
  const compareParam = params.get('compare');
  const hoodParam = params.get('hood');

  if (validCityParam) {
    setActiveCity(validCityParam);
    const cityCfg = MULTI_CITY_CONFIGS[validCityParam];
    const list = validCityParam === 'tehran' ? INITIAL_NEIGHBORHOODS : cityCfg?.neighborhoods || INITIAL_NEIGHBORHOODS;
    if (list.length > 0 && !hoodParam && !compareParam) {
      setSelectedHoodId(list[0].id); setCompareId1(list[0].id);
      if (list.length > 1) setCompareId2(list[1].id);
      if (flyMap && mapInstanceRef.current && cityCfg) mapInstanceRef.current.flyTo(cityCfg.center, cityCfg.defaultZoom, { duration: 0.6 });
    }
  } else if (flyMap && !hoodParam && !compareParam && !publicPath && !navLoc.areaSlug) {
    setActiveCity('tehran');
    const tehranCfg = MULTI_CITY_CONFIGS.tehran;
    if (mapInstanceRef.current && tehranCfg) mapInstanceRef.current.flyTo(tehranCfg.center, tehranCfg.defaultZoom, { duration: 0.6 });
  }

  let compareAccepted = false;
  let compareRejectedCrossCity = false;

  if (compareParam && /[-,]/.test(compareParam)) {
    const [id1, id2] = compareParam.split(/[-,]/).map((pt) => Number(pt.trim()));
    const valid1 = allCityHoods.find((item) => item.hood.id === id1);
    const valid2 = allCityHoods.find((item) => item.hood.id === id2);
    const sameCity = Boolean(
      valid1 &&
      valid2 &&
      valid1.hood.id !== valid2.hood.id &&
      valid1.cityId === valid2.cityId &&
      (!validCityParam || valid1.cityId === validCityParam),
    );
    if (sameCity && valid1 && valid2) {
      setActiveCity(valid1.cityId); setCompareId1(valid1.hood.id); setCompareId2(valid2.hood.id);
      setSelectedHoodId(valid1.hood.id); setShowCompareModal(true);
      if (flyMap && mapInstanceRef.current) mapInstanceRef.current.flyTo([valid1.hood.lat, valid1.hood.lng], 13, { duration: 0.6 });
      compareAccepted = true;
    } else {
      compareRejectedCrossCity = true;
      setShowCompareModal(false);
      const fallbackCity = validCityParam || valid1?.cityId || p.activeCity || 'tehran';
      setActiveCity(fallbackCity);
      const cityCfg = MULTI_CITY_CONFIGS[fallbackCity];
      const list = fallbackCity === 'tehran' ? INITIAL_NEIGHBORHOODS : cityCfg?.neighborhoods || INITIAL_NEIGHBORHOODS;
      if (list.length >= 2) {
        setSelectedHoodId(list[0].id);
        setCompareId1(list[0].id);
        setCompareId2(list[1].id);
      }
    }
  } else if (flyMap && publicPath?.kind !== 'compare') {
    setShowCompareModal(false);
  }

  if (hoodParam && !compareAccepted) {
    const targetEntry = allCityHoods.find((item) => item.hood.id === Number(hoodParam.trim()));
    if (targetEntry && (!validCityParam || targetEntry.cityId === validCityParam)) {
      setActiveCity(targetEntry.cityId); setSelectedHoodId(targetEntry.hood.id);
      if (flyMap && mapInstanceRef.current) mapInstanceRef.current.flyTo([targetEntry.hood.lat, targetEntry.hood.lng], 13, { duration: 0.6 });
    }
  }

  const modeParam = params.get('mode');
  if (modeParam === 'rent' || modeParam === 'buy') setMode(modeParam);
  const depRaw = params.get('dep');
  const depParam = depRaw !== null ? Number(depRaw) : NaN;
  if (!Number.isNaN(depParam) && depParam >= 0 && depParam <= 100000) setDeposit(depParam);
  const rentRaw = params.get('rent');
  const rentParam = rentRaw !== null ? Number(rentRaw) : NaN;
  if (!Number.isNaN(rentParam) && rentParam >= 0 && rentParam <= 5000) setMonthlyRent(rentParam);
  const buyRaw = params.get('buy');
  const buyParam = buyRaw !== null ? Number(buyRaw) : NaN;
  if (!Number.isNaN(buyParam) && buyParam >= 100 && buyParam <= 1000000) setBuyTotalBudget(buyParam);
  const sqmRaw = params.get('sqm');
  const sqmParam = sqmRaw !== null ? Number(sqmRaw) : NaN;
  if (!Number.isNaN(sqmParam) && sqmParam >= 30 && sqmParam <= 500) setTargetSqm(sqmParam);
  const hubParam = params.get('hub')?.trim();
  if (hubParam && /^[a-zA-Z0-9_-]{1,40}$/.test(hubParam) && setWorkHubId) setWorkHubId(hubParam);
  const loanParam = params.get('loan');
  if ((loanParam === '1' || loanParam === '0') && setUseLoanBooster) setUseLoanBooster(loanParam === '1');
  const rahnDeductParam = params.get('rahnDeduct');
  if ((rahnDeductParam === '1' || rahnDeductParam === '0') && setDeductTenantRahnInBuy) setDeductTenantRahnInBuy(rahnDeductParam === '1');
  const ageParam = params.get('age');
  if ((ageParam === 'new' || ageParam === 'mid' || ageParam === 'older') && setBuildingAgeSegment) setBuildingAgeSegment(ageParam);

  return { compareAccepted, compareRejectedCrossCity };
}

export function useAppUrlAndTitleSync(p: UseAppUrlAndTitleSyncParams) {
  const {
    activeCity, selectedHood, showCompareModal,
    compHood1, compHood2, mode, deposit, monthlyRent, buyTotalBudget,
    targetSqm, workHubId, primaryView, activeSubTab,
    hasUrlBudgetParams, useLoanBooster, deductTenantRahnInBuy, buildingAgeSegment,
  } = p;
  const [areaUnit] = useAreaUnit();
  const [intlCurrency] = useIntlCurrency();
  const [locale] = useRadarLocale();

  const paramsRef = useRef(p);
  paramsRef.current = p;
  const lastTrackedRouteKeyRef = useRef('');
  const isPopStateSyncRef = useRef(false);

  useEffect(() => {
    if (!SHOW_INTL_UNIT_CURRENCY_CONTROLS) {
      setStoredRadarLocale('fa');
      setStoredIntlCurrency('IRT');
      setStoredAreaUnit('sqm');
    }
    const allCityHoods = buildAllCityHoods();
    const applyUrlParams = (flyMap: boolean) => {
      applyUrlParamsFromLocation(window.location.pathname, window.location.search, flyMap, paramsRef.current, allCityHoods);
    };

    applyUrlParams(false);
    const handlePopState = () => {
      const epoch = beginPopStateRestoration();
      isPopStateSyncRef.current = true;
      if (paramsRef.current.navigationIntentRef) paramsRef.current.navigationIntentRef.current = 'history_restore';
      applyUrlParams(true);
      queueMicrotask(() => {
        endPopStateRestoration(epoch);
      });
    };
    window.addEventListener('popstate', handlePopState);
    return () => window.removeEventListener('popstate', handlePopState);
  }, []);

  useEffect(() => {
    try {
      const docEl = document.documentElement;
      if (docEl) { docEl.lang = locale === 'en' ? 'en' : 'fa'; docEl.dir = locale === 'en' ? 'ltr' : 'rtl'; }
      if (p.invalidCityParam) {
        updateSeoHeadMeta(
          `شهر پشتیبانی‌نشده | ${CANONICAL_BRAND_FA}`,
          `شهر درخواستی «${p.invalidCityParam}» در سامانه ${CANONICAL_BRAND_FA} پشتیبانی نمی‌شود.`,
          window.location.pathname || '/',
          { '@context': 'https://schema.org', '@type': 'WebPage', name: 'Unsupported City' },
        );
        return;
      }
      const activeProvinceFa = findProvinceForHood(showCompareModal ? (compHood1?.id ?? -1) : (selectedHood?.id ?? -1))?.capitalFa;
      const cityNameFa = activeProvinceFa || MULTI_CITY_CONFIGS[activeCity]?.nameFa || 'تهران';
      const brandWithCity = formatBrandCityTitle(cityNameFa, locale === 'en' ? 'en' : 'fa');
      const cityPrefix = activeCity !== 'tehran' ? `city=${activeCity}&` : '';
      const keepBudget = hasUrlBudgetParams || window.location.search.includes('dep=') || window.location.search.includes('buy=');
      const hubPart = workHubId && workHubId !== 'none' ? `&hub=${encodeURIComponent(workHubId)}` : '';
      const intlSuffix = '';
      const viewSuffix = primaryView && primaryView !== 'map' ? `&view=${primaryView}` : '';
      const leveragePart = `${useLoanBooster ? '&loan=1' : ''}${deductTenantRahnInBuy ? '&rahnDeduct=1' : ''}${buildingAgeSegment && buildingAgeSegment !== 'new' ? `&age=${buildingAgeSegment}` : ''}`;
      const baseBudgetSuffix = (keepBudget ? `&mode=${mode}&dep=${deposit}&rent=${monthlyRent}&buy=${buyTotalBudget}&sqm=${targetSqm}${hubPart}${leveragePart}` : `${hubPart}${leveragePart}`) + intlSuffix;
      const budgetSuffix = baseBudgetSuffix + viewSuffix;

      const isManualPan = paramsRef.current.navigationIntentRef?.current === 'manual_map_pan';
      const baseRouteKey = `${primaryView || 'map'}:${activeSubTab || ''}`;
      const routeKey = `${baseRouteKey}${showCompareModal ? ':compare' : ''}`;
      const fromPopState = isPopStateSyncRef.current || isPopStateRestorationActive();
      isPopStateSyncRef.current = false;
      const prevRouteKey = lastTrackedRouteKeyRef.current;
      const prevWasCompare = prevRouteKey.endsWith(':compare');
      const prevBaseRouteKey = prevWasCompare ? prevRouteKey.slice(0, -':compare'.length) : prevRouteKey;
      const leavingCompareSameRoute = prevWasCompare && !showCompareModal && prevBaseRouteKey === baseRouteKey;
      const isRouteChange = !fromPopState && !isManualPan && prevRouteKey !== '' && prevRouteKey !== routeKey && !leavingCompareSameRoute;
      lastTrackedRouteKeyRef.current = routeKey;

      const currentPath = normalizePathname(window.location.pathname);
      const currentSearch = window.location.search;
      const currentHash = sanitizeNavigationHash(window.location.hash);

      const commitHistoryUrl = (nextUrl: string, forceReplace = false) => {
        if (fromPopState) return;
        const shouldPush = isRouteChange && !forceReplace;
        const pathChanged = normalizePathname(nextUrl) !== currentPath;
        commitManagedHistoryTransition({
          domain: shouldPush || pathChanged ? 'page_route' : 'core_query',
          mode: shouldPush ? 'push' : 'replace',
          targetUrl: nextUrl,
          isPopStateRestore: fromPopState,
        });
        if (shouldPush || pathChanged) {
          const pathOnly = normalizePathname(nextUrl.split('?')[0] || '/');
          const routeMeta = findUnifiedRouteByPath(pathOnly);
          if (routeMeta) recordRecentNavigation(pathOnly, routeMeta.titleFa);
        }
      };

      const isSameCityCompare = Boolean(
        showCompareModal &&
        compHood1 &&
        compHood2 &&
        compHood1.id !== compHood2.id &&
        resolveCityIdForNeighborhood(compHood1.id) === resolveCityIdForNeighborhood(compHood2.id) &&
        resolveCityIdForNeighborhood(compHood1.id) === activeCity,
      );

      if (isSameCityCompare && compHood1 && compHood2) {
        const datedCompare = activeCity === 'tehran' ? seoForDatedCompare(compHood1.id, compHood2.id) : null;
        const unitP1 = convertPricePerSqmToUnit(compHood1.buyPerSqm, areaUnit);
        const intlTag = intlCurrency !== 'IRT' ? ` (${formatMillionTomanAsIntlCurrency(unitP1, intlCurrency, locale)} / ${formatAreaUnitLabel(areaUnit)})` : '';
        const title = datedCompare?.title ?? `مقایسه محله ${compHood1.name} و ${compHood2.name}${intlTag} | قیمت مسکن و کیفیت زندگی | ${brandWithCity}`;
        const desc = datedCompare?.description ?? `مقایسه تحلیلی محله ${compHood1.name} (متری ${compHood1.buyPerSqm} م، رهن ${compHood1.rahn80m} م) با محله ${compHood2.name} (متری ${compHood2.buyPerSqm} م، رهن ${compHood2.rahn80m} م) در ${brandWithCity}.`;
        const canonicalQuery = datedCompare?.path ?? `?${cityPrefix}compare=${compHood1.id}-${compHood2.id}`;
        updateSeoHeadMeta(title, desc, canonicalQuery, {
          '@context': 'https://schema.org', '@type': 'ItemList', name: title, description: desc,
          itemListElement: [
            { '@type': 'Place', position: 1, name: compHood1.name, geo: { '@type': 'GeoCoordinates', latitude: compHood1.lat, longitude: compHood1.lng } },
            { '@type': 'Place', position: 2, name: compHood2.name, geo: { '@type': 'GeoCoordinates', latitude: compHood2.lat, longitude: compHood2.lng } },
          ],
        });
        const extra = budgetSuffix.replace(/^&/, '');
        const baseCompareUrl = datedCompare ? `${datedCompare.path}${extra ? `?${extra}` : ''}` : `/${canonicalQuery}${budgetSuffix}`;
        const mergedCompareUrl = mergePreservedQueryIntoUrl(baseCompareUrl, currentSearch, !isRouteChange);
        commitHistoryUrl(!isRouteChange && currentHash ? `${mergedCompareUrl}${currentHash}` : mergedCompareUrl);
      } else if (selectedHood) {
        const datedHood = activeCity === 'tehran' ? seoForDatedHood(selectedHood.id) : null;
        const unitBuy = convertPricePerSqmToUnit(selectedHood.buyPerSqm, areaUnit);
        const intlTag = intlCurrency !== 'IRT' ? ` (${formatMillionTomanAsIntlCurrency(unitBuy, intlCurrency, locale)} / ${formatAreaUnitLabel(areaUnit)})` : '';
        const title = datedHood?.title ?? `قیمت مسکن، اجاره و کارنامه محله ${selectedHood.name}${intlTag} | ${brandWithCity}`;
        const desc = datedHood?.description ?? `برآورد قیمت خرید آپارتمان در محله ${selectedHood.name} (${selectedHood.zone}): متری ${selectedHood.buyPerSqm} میلیون تومان | رهن کامل ۸۰ متری: ${selectedHood.rahn80m} میلیون تومان | ترافیک، هوا و مترو.`;
        const viewId = (primaryView || 'home') as RouteDestinationId;
        const routeMeta = resolveRoutePageMeta({
          viewId,
          subTab: activeSubTab,
          cityNameFa,
          brandFa: CANONICAL_BRAND_FA,
          selectedHoodName: viewId === 'map' ? selectedHood.name : undefined,
        });

        if (viewId === 'not_found') {
          updateSeoHeadMeta(routeMeta.title, routeMeta.description, window.location.pathname || '/404', { '@context': 'https://schema.org', '@type': 'WebPage', name: '404' });
          return;
        }
        if (viewId === 'admin') {
          const adminPath = buildCanonicalPathForDestination('admin', activeSubTab);
          updateSeoHeadMeta(routeMeta.title, routeMeta.description, adminPath, { '@context': 'https://schema.org', '@type': 'WebApplication', name: 'Admin Shell' });
          commitHistoryUrl(adminPath);
          return;
        }
        if (viewId !== 'map' && viewId !== 'home') {
          const preserveDynamicPath =
            (viewId === 'contributions' && activeSubTab === 'members' && currentPath.startsWith('/community/members/') && currentPath.length > '/community/members/'.length) ||
            (viewId === 'properties' && currentPath.startsWith('/properties/') && !['/properties/buy', '/properties/rent', '/properties/commercial', '/properties/office'].includes(currentPath)) ||
            (viewId === 'knowledge' && currentPath.startsWith('/knowledge/articles/') && currentPath.length > '/knowledge/articles/'.length) ||
            (viewId === 'services' && currentPath.startsWith('/services/providers/') && currentPath.length > '/services/providers/'.length) ||
            (viewId === 'discover' && ((currentPath.startsWith('/areas/') && currentPath !== '/areas/registry') || currentPath.startsWith('/neighborhoods/')));
          const canonicalPath = preserveDynamicPath
            ? currentPath
            : buildCanonicalPathForDestination(viewId, activeSubTab);
          const isNeighborhoodScoped =
            (viewId === 'discover' && canonicalPath !== '/areas/registry' && activeSubTab !== 'registry') ||
            viewId === 'intelligence' ||
            viewId === 'properties' ||
            (viewId === 'tools' && activeSubTab !== 'calculators' && activeSubTab !== 'compare_props');
          const nextUrl = buildSynchronizedNavigationUrl({
            canonicalPath,
            currentSearch,
            currentHash,
            isRouteChange: isRouteChange && !preserveDynamicPath,
            activeCity,
            selectedHoodId: isNeighborhoodScoped ? selectedHood.id : undefined,
            omitHoodParam: !isNeighborhoodScoped,
            keepBudget,
            budget: { mode, deposit, monthlyRent, buyTotalBudget, targetSqm },
          });
          updateSeoHeadMeta(routeMeta.title, routeMeta.description, canonicalPath, { '@context': 'https://schema.org', '@type': 'WebPage', name: routeMeta.title, description: routeMeta.description });
          commitHistoryUrl(nextUrl, preserveDynamicPath);
          return;
        }

        const isExplicitLegacyTehranPath = currentPath.startsWith('/tehran/');
        if (isExplicitLegacyTehranPath && datedHood) {
          updateSeoHeadMeta(title, desc, datedHood.path, {
            '@context': 'https://schema.org', '@type': 'Place', name: `محله ${selectedHood.name} (${selectedHood.zone})`,
            description: desc, url: `https://radartehran.ir${datedHood.path}`,
            geo: { '@type': 'GeoCoordinates', latitude: selectedHood.lat, longitude: selectedHood.lng },
          });
          const datedExtra = (viewId === 'home' ? baseBudgetSuffix : budgetSuffix).replace(/^&/, '');
          const baseHoodUrl = `${datedHood.path}${datedExtra ? `?${datedExtra}` : ''}`;
          const mergedHoodUrl = mergePreservedQueryIntoUrl(baseHoodUrl, currentSearch, !isRouteChange);
          commitHistoryUrl(!isRouteChange && currentHash ? `${mergedHoodUrl}${currentHash}` : mergedHoodUrl);
          return;
        }

        const canonicalPath = viewId === 'home' ? '/' : '/map';
        updateSeoHeadMeta(routeMeta.title, routeMeta.description, canonicalPath, {
          '@context': 'https://schema.org',
          '@type': viewId === 'home' ? 'WebSite' : 'WebApplication',
          name: routeMeta.title,
          description: routeMeta.description,
          url: `https://radartehran.ir${canonicalPath}`,
        });
        const cleanQueryParts: string[] = [];
        if (activeCity !== 'tehran') cleanQueryParts.push(`city=${activeCity}`);
        if (viewId === 'map') cleanQueryParts.push(`hood=${selectedHood.id}`);
        if (keepBudget) cleanQueryParts.push(`mode=${mode}&dep=${deposit}&rent=${monthlyRent}&buy=${buyTotalBudget}&sqm=${targetSqm}`);
        const baseCleanUrl = `${canonicalPath}${cleanQueryParts.length ? `?${cleanQueryParts.join('&')}` : ''}`;
        const mergedCleanUrl = mergePreservedQueryIntoUrl(baseCleanUrl, currentSearch, !isRouteChange);
        commitHistoryUrl(!isRouteChange && currentHash ? `${mergedCleanUrl}${currentHash}` : mergedCleanUrl);
      }
    } catch { /* Ignore History API errors in restricted iframe contexts */ }
  }, [selectedHood, showCompareModal, compHood1, compHood2, activeCity, p.invalidCityParam, hasUrlBudgetParams, mode, deposit, monthlyRent, buyTotalBudget, targetSqm, workHubId, primaryView, activeSubTab, areaUnit, intlCurrency, locale, useLoanBooster, deductTenantRahnInBuy, buildingAgeSegment]);
}
