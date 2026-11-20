/**
 * @file src/components/useAppPersistenceAndDerivedState.ts
 * @description Manages localStorage synchronization, admin storage hygiene, onboarding trigger,
 * and memoized derived neighborhood/bargain/trade-up evaluations for `src/App.tsx`.
 */

import { useEffect, useMemo } from 'react';
import {
  Neighborhood, EvaluatedNeighborhood, FeatureFlags, WorkHub, getBestHoodIndicator,
  getNeighborhoodLandmarks, generateLocalNeighborhoodAnalysis, getNeighborhoodMarketReport,
  LOCAL_STORAGE_KEY, ADMIN_PASS_STORAGE_KEY, BUYER_ALERTS_STORAGE_KEY, SPONSOR_CRM_STORAGE_KEY, toPersianNum,
} from '../data/neighborhoods';
import {
  getNeighborhoodDeepInsight, checkDirectMetroCommute, evaluateRentVsBuyInNeighborhood, evaluateTradeUpOptions,
} from '../data/neighborhoodInsights';
import {
  convertPricePerSqmToUnit, formatAreaUnitLabel, formatMillionTomanAsIntlCurrency,
} from '../utils/areaUnit';
import { useAreaUnit, useIntlCurrency, useRadarLocale } from './AreaUnitToggle';
import type { useAppUiState } from './useAppUiState';

export const FEATURE_FLAGS_STORAGE_KEY = 'tehran_radar_feature_flags_v1';

export interface UseAppPersistenceAndDerivedStateParams {
  ui: ReturnType<typeof useAppUiState>;
  neighborhoods: Neighborhood[];
  evaluatedNeighborhoods: EvaluatedNeighborhood[];
  nationwideEvaluatedNeighborhoods: EvaluatedNeighborhood[];
  favoriteHoodIds: number[];
  featureFlags: FeatureFlags;
  isVerifiedAdmin: boolean;
  mode: 'rent' | 'buy';
  targetSqm: number;
  rentAgeMultiplier: number;
  totalRahnEquivalent: number;
  maxAffordablePerSqm: number;
  selectedWorkHub: WorkHub;
  workHubId: string;
}

export function useAppPersistenceAndDerivedState({
  ui, neighborhoods, evaluatedNeighborhoods, nationwideEvaluatedNeighborhoods,
  favoriteHoodIds, featureFlags, isVerifiedAdmin, mode, targetSqm,
  rentAgeMultiplier, totalRahnEquivalent, maxAffordablePerSqm, selectedWorkHub, workHubId,
}: UseAppPersistenceAndDerivedStateParams) {
  const selectedHood = useMemo(
    () =>
      evaluatedNeighborhoods.find((n) => n.id === ui.selectedHoodId) ||
      nationwideEvaluatedNeighborhoods.find((n) => n.id === ui.selectedHoodId) ||
      evaluatedNeighborhoods[0],
    [evaluatedNeighborhoods, nationwideEvaluatedNeighborhoods, ui.selectedHoodId]
  );

  const compHood1 = useMemo(
    () =>
      evaluatedNeighborhoods.find((n) => n.id === ui.compareId1) ||
      nationwideEvaluatedNeighborhoods.find((n) => n.id === ui.compareId1) ||
      evaluatedNeighborhoods[0],
    [evaluatedNeighborhoods, nationwideEvaluatedNeighborhoods, ui.compareId1]
  );

  const compHood2 = useMemo(
    () =>
      evaluatedNeighborhoods.find((n) => n.id === ui.compareId2) ||
      nationwideEvaluatedNeighborhoods.find((n) => n.id === ui.compareId2) ||
      evaluatedNeighborhoods[1] ||
      evaluatedNeighborhoods[0],
    [evaluatedNeighborhoods, nationwideEvaluatedNeighborhoods, ui.compareId2]
  );

  const hoodLandmarks = useMemo(
    () => (selectedHood ? getNeighborhoodLandmarks(selectedHood) : []),
    [selectedHood?.id]
  );

  useEffect(() => {
    try { localStorage.setItem('tehran_radar_favorites_v1', JSON.stringify(favoriteHoodIds)); } catch { /* ignore */ }
  }, [favoriteHoodIds]);

  useEffect(() => {
    const timer = setTimeout(() => {
      try { localStorage.setItem(LOCAL_STORAGE_KEY, JSON.stringify(neighborhoods)); } catch { /* ignore */ }
    }, 500);
    return () => clearTimeout(timer);
  }, [neighborhoods]);

  useEffect(() => {
    try { localStorage.setItem(FEATURE_FLAGS_STORAGE_KEY, JSON.stringify(featureFlags)); } catch { /* ignore */ }
  }, [featureFlags]);

  useEffect(() => {
    if (!isVerifiedAdmin) {
      try {
        localStorage.removeItem(BUYER_ALERTS_STORAGE_KEY);
        localStorage.removeItem(SPONSOR_CRM_STORAGE_KEY);
        localStorage.removeItem(ADMIN_PASS_STORAGE_KEY);
      } catch { /* ignore */ }
      return;
    }
    if (!ui.savedAdminPassword) ui.setAdminUnlocked(true);
    try { localStorage.setItem(SPONSOR_CRM_STORAGE_KEY, JSON.stringify(ui.sponsorRequests)); } catch { /* ignore */ }
  }, [ui.sponsorRequests, isVerifiedAdmin]);

  useEffect(() => {
    try {
      const seen = localStorage.getItem('tehran_radar_onboarded_v1');
      if (!seen && window.location.search.includes('onboarding=1')) ui.setShowOnboardingModal(true);
    } catch { /* ignore */ }
  }, []);

  useEffect(() => {
    if (!selectedHood) return;
    ui.setHoodCustomDeposit(
      Math.round(selectedHood.rahn80m * (Math.max(25, targetSqm || 75) / 80) * rentAgeMultiplier * 0.5)
    );
  }, [selectedHood?.id, selectedHood?.rahn80m, targetSqm, rentAgeMultiplier]);

  useEffect(() => {
    const currentEditHood = neighborhoods.find((n) => n.id === ui.adminEditHoodId) || selectedHood;
    if (!currentEditHood) return;
    ui.setAdminEditBuySqm(currentEditHood.buyPerSqm);
    ui.setAdminEditRahn80m(currentEditHood.rahn80m);
  }, [ui.adminEditHoodId, selectedHood?.id, neighborhoods]);

  const targetBargainHood = useMemo(
    () => evaluatedNeighborhoods.find((n) => n.id === ui.bargainHoodId) || evaluatedNeighborhoods[0],
    [evaluatedNeighborhoods, ui.bargainHoodId]
  );

  const [areaUnit] = useAreaUnit();
  const [intlCurrency] = useIntlCurrency();
  const [locale] = useRadarLocale();
  const liveBargainCheck = useMemo(() => {
    const unitShortLabel = formatAreaUnitLabel(areaUnit);
    if (!targetBargainHood) {
      return {
        avgBenchmark: 0, maxAllowedFor10Percent: 0, discountPercent: 0, isEligible: false,
        buyerProfitMillion: 0, unitShortLabel, avgBenchmarkUnitPrice: 0, buyerProfitIntlText: null,
      };
    }
    const avgBenchmark =
      ui.bargainType === 'خرید'
        ? (targetBargainHood.baseBuyPerSqm ?? targetBargainHood.buyPerSqm)
        : Math.round(targetBargainHood.rahn80m * (ui.bargainSqm / 80));
    const maxAllowedFor10Percent = Math.floor(avgBenchmark * 0.9);
    const discountPercent =
      avgBenchmark > 0 ? Math.round(((avgBenchmark - ui.bargainProposedPrice) / avgBenchmark) * 100) : 0;
    const isEligible = ui.bargainProposedPrice > 0 && discountPercent >= 10 && discountPercent <= 60;
    const buyerProfitMillion =
      ui.bargainType === 'خرید'
        ? Math.max(0, Math.round((avgBenchmark - ui.bargainProposedPrice) * ui.bargainSqm))
        : Math.max(0, Math.round(avgBenchmark - ui.bargainProposedPrice));
    const avgBenchmarkUnitPrice =
      ui.bargainType === 'خرید' ? convertPricePerSqmToUnit(avgBenchmark, areaUnit) : avgBenchmark;
    const buyerProfitIntlText =
      intlCurrency !== 'IRT' ? formatMillionTomanAsIntlCurrency(buyerProfitMillion, intlCurrency, locale) : null;
    return {
      avgBenchmark, maxAllowedFor10Percent, discountPercent, isEligible, buyerProfitMillion,
      unitShortLabel, avgBenchmarkUnitPrice, buyerProfitIntlText,
    };
  }, [targetBargainHood, ui.bargainType, ui.bargainSqm, ui.bargainProposedPrice, areaUnit, intlCurrency, locale]);

  useEffect(() => {
    const h = evaluatedNeighborhoods.find((n) => n.id === ui.bargainHoodId) || evaluatedNeighborhoods[0];
    if (!h) return;
    ui.setBargainProposedPrice(
      ui.bargainType === 'خرید'
        ? Math.round((h.baseBuyPerSqm ?? h.buyPerSqm) * 0.85)
        : Math.round(h.rahn80m * (ui.bargainSqm / 80) * 0.85)
    );
  }, [ui.bargainHoodId, ui.bargainType, ui.bargainSqm, evaluatedNeighborhoods]);

  const totalLiveBargainsCount = useMemo(
    () => evaluatedNeighborhoods.reduce((acc, n) => acc + (n.bargains?.length || 0), 0),
    [evaluatedNeighborhoods]
  );

  const calculatedHoodMonthlyRent = useMemo(() => {
    if (!selectedHood) return 0;
    const safeSqm = Math.max(25, targetSqm || 75);
    const scaledRahn = Math.round(selectedHood.rahn80m * (safeSqm / 80) * rentAgeMultiplier);
    return Math.max(0, Math.round(((scaledRahn - ui.hoodCustomDeposit) * 3) / 100));
  }, [selectedHood, ui.hoodCustomDeposit, targetSqm, rentAgeMultiplier]);

  useEffect(() => {
    ui.setAlertDealType(mode === 'rent' ? 'اجاره' : 'خرید');
    const estBuyBillion = Math.round(((maxAffordablePerSqm * Math.max(25, targetSqm || 80)) / 1000) * 10) / 10;
    ui.setAlertMaxBudget(
      mode === 'rent'
        ? `${toPersianNum(totalRahnEquivalent)} میلیون تومان رهن کامل (${toPersianNum(targetSqm)} متر)`
        : `${toPersianNum(estBuyBillion)} میلیارد تومان (واحد ${toPersianNum(targetSqm)} متری)`
    );
  }, [mode, targetSqm, totalRahnEquivalent, maxAffordablePerSqm]);

  const localAnalysis = useMemo(() => {
    if (!selectedHood) {
      return {
        annualYieldPercent: 0,
        prRatio: 0,
        budgetVerdict: '',
        commuteVerdict: '',
        negotiationTip: '',
      };
    }
    const effectiveUserBuyPerSqm =
      selectedHood.diffPercent <= 0
        ? Math.max(maxAffordablePerSqm, Math.round(selectedHood.buyPerSqm * (1 - selectedHood.diffPercent / 100)))
        : selectedHood.status === 'yellow'
          ? Math.max(maxAffordablePerSqm, Math.round(selectedHood.buyPerSqm * 0.9))
          : maxAffordablePerSqm;
    return generateLocalNeighborhoodAnalysis(
      selectedHood,
      mode,
      mode === 'rent' ? totalRahnEquivalent : effectiveUserBuyPerSqm,
      targetSqm,
      selectedHood.distKm,
      selectedWorkHub.name
    );
  }, [selectedHood, mode, totalRahnEquivalent, maxAffordablePerSqm, targetSqm, selectedWorkHub]);

  const marketReport = useMemo(() => getNeighborhoodMarketReport(selectedHood), [selectedHood]);
  const bestIndicator = useMemo(() => getBestHoodIndicator(selectedHood), [selectedHood]);
  const deepInsight = useMemo(() => getNeighborhoodDeepInsight(selectedHood), [selectedHood]);
  const directMetroCommuteInfo = useMemo(
    () => checkDirectMetroCommute(selectedHood, workHubId),
    [selectedHood, workHubId]
  );
  const rentVsBuyVerdict = useMemo(() => evaluateRentVsBuyInNeighborhood(selectedHood), [selectedHood]);

  const tradeUpCurrentHood = useMemo(
    () => evaluatedNeighborhoods.find((n) => n.id === ui.tradeUpCurrentHoodId) || selectedHood,
    [evaluatedNeighborhoods, ui.tradeUpCurrentHoodId, selectedHood]
  );

  const tradeUpResults = useMemo(
    () =>
      evaluateTradeUpOptions({
        currentHood: tradeUpCurrentHood,
        currentSqm: ui.tradeUpCurrentSqm,
        currentAgeYears: ui.tradeUpCurrentAge,
        extraCashMillion: ui.tradeUpExtraCash,
        useLoanBooster: ui.tradeUpUseLoan,
        useTenantRahnDeduction: ui.tradeUpUseRahn,
        targetNewSqm: ui.tradeUpTargetSqm,
        targetAgeSegment: ui.tradeUpTargetAgeSegment,
        allNeighborhoods: evaluatedNeighborhoods,
      }),
    [
      tradeUpCurrentHood,
      ui.tradeUpCurrentSqm,
      ui.tradeUpCurrentAge,
      ui.tradeUpExtraCash,
      ui.tradeUpUseLoan,
      ui.tradeUpUseRahn,
      ui.tradeUpTargetSqm,
      ui.tradeUpTargetAgeSegment,
      evaluatedNeighborhoods,
    ]
  );

  return {
    selectedHood,
    compHood1,
    compHood2,
    hoodLandmarks,
    targetBargainHood,
    liveBargainCheck,
    totalLiveBargainsCount,
    calculatedHoodMonthlyRent,
    localAnalysis,
    marketReport,
    bestIndicator,
    deepInsight,
    directMetroCommuteInfo,
    rentVsBuyVerdict,
    tradeUpResults,
  };
}
