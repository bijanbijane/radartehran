import { useEffect } from 'react';
import type { EvaluatedNeighborhood, Neighborhood, CityId } from '../data/neighborhoods';
import { INITIAL_NEIGHBORHOODS } from '../data/neighborhoods';
import { MULTI_CITY_CONFIGS, getAllMultiCityNeighborhoods, resolveCityIdForNeighborhood } from '../data/multiCityData';
import {
  convertPricePerSqmToUnit,
  formatAreaUnitLabel,
  formatMillionTomanAsIntlCurrency,
  parseUrlIntlParams,
  setStoredAreaUnit,
  setStoredIntlCurrency,
  setStoredRadarLocale,
} from '../utils/areaUnit';
import { useAreaUnit, useIntlCurrency, useRadarLocale } from './AreaUnitToggle';
import { parseTehranPublicPath, seoForDatedCompare, seoForDatedHood } from '../data/neighborhoodListingSamples';
import { findProvinceForHood } from '../data/iranProvincesDirectory';

export interface UseAppUrlAndTitleSyncParams {
  activeCity: CityId;
  setActiveCity: (c: CityId) => void;
  selectedHood?: EvaluatedNeighborhood;
  selectedHoodId: number;
  setSelectedHoodId: (id: number) => void;
  showCompareModal: boolean;
  setShowCompareModal: (v: boolean) => void;
  compareId1: number;
  setCompareId1: (id: number) => void;
  compareId2: number;
  setCompareId2: (id: number) => void;
  compHood1?: EvaluatedNeighborhood;
  compHood2?: EvaluatedNeighborhood;
  mode: 'rent' | 'buy';
  setMode: (m: 'rent' | 'buy') => void;
  deposit: number;
  setDeposit: (d: number) => void;
  monthlyRent: number;
  setMonthlyRent: (r: number) => void;
  buyTotalBudget: number;
  setBuyTotalBudget: (b: number) => void;
  targetSqm: number;
  setTargetSqm: (s: number) => void;
  workHubId?: string;
  setWorkHubId?: (id: string) => void;
  primaryView?: string;
  setPrimaryView?: (v: any) => void;
  mapInstanceRef: React.MutableRefObject<any>;
  hasUrlBudgetParams: boolean;
  useLoanBooster?: boolean;
  setUseLoanBooster?: (v: boolean) => void;
  deductTenantRahnInBuy?: boolean;
  setDeductTenantRahnInBuy?: (v: boolean) => void;
  buildingAgeSegment?: 'new' | 'mid' | 'older';
  setBuildingAgeSegment?: (v: 'new' | 'mid' | 'older') => void;
}

function buildAllCityHoods(): { cityId: CityId; hood: Neighborhood }[] {
  return getAllMultiCityNeighborhoods().map((hood) => ({
    cityId: resolveCityIdForNeighborhood(hood.id),
    hood,
  }));
}

export function useAppUrlAndTitleSync(p: UseAppUrlAndTitleSyncParams) {
  const {
    activeCity, setActiveCity, selectedHood, setSelectedHoodId,
    showCompareModal, setShowCompareModal, setCompareId1, setCompareId2,
    compHood1, compHood2, mode, setMode, deposit, setDeposit,
    monthlyRent, setMonthlyRent, buyTotalBudget, setBuyTotalBudget,
    targetSqm, setTargetSqm, workHubId, setWorkHubId, primaryView, setPrimaryView, mapInstanceRef, hasUrlBudgetParams,
    useLoanBooster, setUseLoanBooster, deductTenantRahnInBuy, setDeductTenantRahnInBuy, buildingAgeSegment, setBuildingAgeSegment,
  } = p;
  const [areaUnit] = useAreaUnit();
  const [intlCurrency] = useIntlCurrency();
  const [locale] = useRadarLocale();

  useEffect(() => {
    const allCityHoods = buildAllCityHoods();

    const applyUrlParams = (flyMap: boolean) => {
      const search = window.location.search;
      const publicPath = parseTehranPublicPath(window.location.pathname);
      if (!search && !publicPath) {
        if (flyMap && setPrimaryView) setPrimaryView('map');
        return;
      }
      if (publicPath?.kind === 'hood') {
        setActiveCity('tehran');
        setSelectedHoodId(publicPath.hoodId);
        if (setPrimaryView) setPrimaryView('home');
      } else if (publicPath?.kind === 'compare') {
        setActiveCity('tehran');
        setCompareId1(publicPath.leftId);
        setCompareId2(publicPath.rightId);
        setSelectedHoodId(publicPath.leftId);
        setShowCompareModal(true);
        if (setPrimaryView) setPrimaryView('home');
      }
      if (!search) return;

      const intlParams = parseUrlIntlParams(search);
      if (intlParams.lang) setStoredRadarLocale(intlParams.lang);
      if (intlParams.currency) setStoredIntlCurrency(intlParams.currency);
      if (intlParams.unit) setStoredAreaUnit(intlParams.unit);

      const params = new URLSearchParams(search);
      const viewParam = params.get('view')?.trim();
      if (setPrimaryView) {
        if (viewParam && ['map', 'discover', 'intelligence', 'tools', 'home', 'userspace'].includes(viewParam)) {
          setPrimaryView(viewParam);
        } else if (flyMap) {
          setPrimaryView('map');
        }
      }
      const cityParam = params.get('city')?.trim().toLowerCase() as CityId | undefined;
      const compareParam = params.get('compare');
      const hoodParam = params.get('hood');

      if (cityParam && ['tehran', 'karaj', 'mashhad', 'isfahan', 'shiraz'].includes(cityParam)) {
        setActiveCity(cityParam);
        const cityCfg = MULTI_CITY_CONFIGS[cityParam];
        const list = cityParam === 'tehran' ? INITIAL_NEIGHBORHOODS : cityCfg?.neighborhoods || INITIAL_NEIGHBORHOODS;
        if (list.length > 0 && !hoodParam && !compareParam) {
          setSelectedHoodId(list[0].id);
          setCompareId1(list[0].id);
          if (list.length > 1) setCompareId2(list[1].id);
          if (flyMap && mapInstanceRef.current && cityCfg) {
            mapInstanceRef.current.flyTo(cityCfg.center, cityCfg.defaultZoom, { duration: 0.6 });
          }
        }
      }

      if (compareParam && /[-,]/.test(compareParam)) {
        const [id1, id2] = compareParam.split(/[-,]/).map((pt) => Number(pt.trim()));
        const valid1 = allCityHoods.find((item) => item.hood.id === id1);
        const valid2 = allCityHoods.find((item) => item.hood.id === id2);
        if (valid1 && valid2) {
          setActiveCity(valid1.cityId);
          setCompareId1(valid1.hood.id);
          setCompareId2(valid2.hood.id);
          setSelectedHoodId(valid1.hood.id);
          setShowCompareModal(true);
          if (flyMap && mapInstanceRef.current) {
            mapInstanceRef.current.flyTo([valid1.hood.lat, valid1.hood.lng], 13, { duration: 0.6 });
          }
          return;
        }
      }

      if (hoodParam) {
        const targetEntry = allCityHoods.find((item) => item.hood.id === Number(hoodParam.trim()));
        if (targetEntry) {
          setActiveCity(targetEntry.cityId);
          setSelectedHoodId(targetEntry.hood.id);
          if (flyMap && mapInstanceRef.current) {
            mapInstanceRef.current.flyTo([targetEntry.hood.lat, targetEntry.hood.lng], 13, { duration: 0.6 });
          }
        }
      }

      const modeParam = params.get('mode');
      if (modeParam === 'rent' || modeParam === 'buy') setMode(modeParam);
      const depParam = Number(params.get('dep'));
      if (!Number.isNaN(depParam) && depParam >= 50 && depParam <= 15000) setDeposit(depParam);
      const rentParam = Number(params.get('rent'));
      if (!Number.isNaN(rentParam) && rentParam >= 0 && rentParam <= 300) setMonthlyRent(rentParam);
      const buyParam = Number(params.get('buy'));
      if (!Number.isNaN(buyParam) && buyParam >= 500 && buyParam <= 100000) setBuyTotalBudget(buyParam);
      const sqmParam = Number(params.get('sqm'));
      if (!Number.isNaN(sqmParam) && sqmParam >= 30 && sqmParam <= 500) setTargetSqm(sqmParam);
      const hubParam = params.get('hub')?.trim();
      if (hubParam && /^[a-zA-Z0-9_-]{1,40}$/.test(hubParam) && setWorkHubId) setWorkHubId(hubParam);
      const loanParam = params.get('loan');
      if ((loanParam === '1' || loanParam === '0') && setUseLoanBooster) setUseLoanBooster(loanParam === '1');
      const rahnDeductParam = params.get('rahnDeduct');
      if ((rahnDeductParam === '1' || rahnDeductParam === '0') && setDeductTenantRahnInBuy) setDeductTenantRahnInBuy(rahnDeductParam === '1');
      const ageParam = params.get('age');
      if ((ageParam === 'new' || ageParam === 'mid' || ageParam === 'older') && setBuildingAgeSegment) setBuildingAgeSegment(ageParam);
    };

    applyUrlParams(false);
    const handlePopState = () => applyUrlParams(true);
    window.addEventListener('popstate', handlePopState);
    return () => window.removeEventListener('popstate', handlePopState);
  }, []);

  useEffect(() => {
    try {
      const docEl = document.documentElement;
      if (docEl) {
        docEl.lang = locale;
        docEl.dir = locale === 'en' || locale === 'tr' ? 'ltr' : 'rtl';
      }
      const activeProvinceFa = findProvinceForHood(showCompareModal ? (compHood1?.id ?? -1) : (selectedHood?.id ?? -1))?.capitalFa;
      const cityNameFa = activeProvinceFa || MULTI_CITY_CONFIGS[activeCity]?.nameFa || 'تهران';
      const cityPrefix = activeCity !== 'tehran' ? `city=${activeCity}&` : '';
      const keepBudget = hasUrlBudgetParams || window.location.search.includes('dep=') || window.location.search.includes('buy=');
      const hubPart = workHubId && workHubId !== 'none' ? `&hub=${encodeURIComponent(workHubId)}` : '';
      const intlSuffix = `${locale !== 'fa' ? `&lang=${locale}` : ''}${intlCurrency !== 'IRT' ? `&currency=${intlCurrency}` : ''}${areaUnit !== 'sqm' ? `&unit=${areaUnit}` : ''}`;
      const viewSuffix = primaryView && primaryView !== 'map' ? `&view=${primaryView}` : '';
      const leveragePart = `${useLoanBooster ? '&loan=1' : ''}${deductTenantRahnInBuy ? '&rahnDeduct=1' : ''}${buildingAgeSegment && buildingAgeSegment !== 'new' ? `&age=${buildingAgeSegment}` : ''}`;
      const budgetSuffix = (keepBudget ? `&mode=${mode}&dep=${deposit}&rent=${monthlyRent}&buy=${buyTotalBudget}&sqm=${targetSqm}${hubPart}${leveragePart}` : `${hubPart}${leveragePart}`) + intlSuffix + viewSuffix;
      const setMetaContent = (selector: string, content: string) => {
        const el = document.querySelector<HTMLMetaElement>(selector);
        if (el) el.setAttribute('content', content);
      };
      const updateSeoHead = (title: string, desc: string, canonicalQuery: string, jsonLdObj: Record<string, unknown>) => {
        document.title = title;
        const canonicalHref = canonicalQuery.startsWith('/') ? `https://radartehran.ir${canonicalQuery}` : `https://radartehran.ir/${canonicalQuery}`;
        const canonicalEl = document.getElementById('canonical-url-tag') as HTMLLinkElement | null;
        if (canonicalEl) canonicalEl.href = canonicalHref;
        setMetaContent('meta[name="description"]', desc);
        setMetaContent('meta[property="og:title"]', title);
        setMetaContent('meta[property="og:description"]', desc);
        setMetaContent('meta[property="og:url"]', canonicalHref);
        setMetaContent('meta[name="twitter:title"]', title);
        setMetaContent('meta[name="twitter:description"]', desc);
        const ldEl = document.getElementById('seo-jsonld-schema');
        if (ldEl) ldEl.textContent = JSON.stringify(jsonLdObj);
      };
      if (showCompareModal && compHood1 && compHood2) {
        const datedCompare = activeCity === 'tehran' ? seoForDatedCompare(compHood1.id, compHood2.id) : null;
        const unitP1 = convertPricePerSqmToUnit(compHood1.buyPerSqm, areaUnit);
        const intlTag = intlCurrency !== 'IRT' ? ` (${formatMillionTomanAsIntlCurrency(unitP1, intlCurrency, locale)} / ${formatAreaUnitLabel(areaUnit)})` : '';
        const title = datedCompare?.title ?? `مقایسه محله ${compHood1.name} و ${compHood2.name}${intlTag} | قیمت مسکن و کیفیت زندگی | رادار ${cityNameFa}`;
        const desc = datedCompare?.description ?? `مقایسه تحلیلی محله ${compHood1.name} (متری ${compHood1.buyPerSqm} م، رهن ${compHood1.rahn80m} م) با محله ${compHood2.name} (متری ${compHood2.buyPerSqm} م، رهن ${compHood2.rahn80m} م) در رادار ${cityNameFa}.`;
        const canonicalQuery = datedCompare?.path ?? `?${cityPrefix}compare=${compHood1.id}-${compHood2.id}`;
        updateSeoHead(title, desc, canonicalQuery, {
          '@context': 'https://schema.org', '@type': 'ItemList', name: title, description: desc,
          itemListElement: [
            { '@type': 'Place', position: 1, name: compHood1.name, geo: { '@type': 'GeoCoordinates', latitude: compHood1.lat, longitude: compHood1.lng } },
            { '@type': 'Place', position: 2, name: compHood2.name, geo: { '@type': 'GeoCoordinates', latitude: compHood2.lat, longitude: compHood2.lng } },
          ],
        });
        const extra = budgetSuffix.replace(/^&/, '');
        const nextUrl = datedCompare ? `${datedCompare.path}${extra ? `?${extra}` : ''}` : `/${canonicalQuery}${budgetSuffix}`;
        if (`${window.location.pathname}${window.location.search}` !== nextUrl && typeof window.history?.replaceState === 'function') {
          window.history.replaceState(null, '', nextUrl);
        }
      } else if (selectedHood) {
        const datedHood = activeCity === 'tehran' ? seoForDatedHood(selectedHood.id) : null;
        const unitBuy = convertPricePerSqmToUnit(selectedHood.buyPerSqm, areaUnit);
        const intlTag = intlCurrency !== 'IRT' ? ` (${formatMillionTomanAsIntlCurrency(unitBuy, intlCurrency, locale)} / ${formatAreaUnitLabel(areaUnit)})` : '';
        const title = datedHood?.title ?? `قیمت مسکن، اجاره و کارنامه محله ${selectedHood.name}${intlTag} | رادار ${cityNameFa}`;
        const desc = datedHood?.description ?? `برآورد قیمت خرید آپارتمان در محله ${selectedHood.name} (${selectedHood.zone}): متری ${selectedHood.buyPerSqm} میلیون تومان | رهن کامل ۸۰ متری: ${selectedHood.rahn80m} میلیون تومان | ترافیک، هوا و مترو.`;
        const canonicalQuery = datedHood?.path ?? `?${cityPrefix}hood=${selectedHood.id}`;
        updateSeoHead(title, desc, canonicalQuery, {
          '@context': 'https://schema.org', '@type': 'Place', name: `محله ${selectedHood.name} (${selectedHood.zone})`,
          description: desc, url: canonicalQuery.startsWith('/') ? `https://radartehran.ir${canonicalQuery}` : `https://radartehran.ir/${canonicalQuery}`,
          geo: { '@type': 'GeoCoordinates', latitude: selectedHood.lat, longitude: selectedHood.lng },
        });
        const extra = budgetSuffix.replace(/^&/, '');
        const nextUrl = datedHood ? `${datedHood.path}${extra ? `?${extra}` : ''}` : `/${canonicalQuery}${budgetSuffix}`;
        if (`${window.location.pathname}${window.location.search}` !== nextUrl && typeof window.history?.replaceState === 'function') {
          window.history.replaceState(null, '', nextUrl);
        }
      }
    } catch {
      // Ignore History API errors in restricted iframe contexts
    }
  }, [selectedHood, showCompareModal, compHood1, compHood2, activeCity, hasUrlBudgetParams, mode, deposit, monthlyRent, buyTotalBudget, targetSqm, workHubId, primaryView, areaUnit, intlCurrency, locale, useLoanBooster, deductTenantRahnInBuy, buildingAgeSegment]);
}
