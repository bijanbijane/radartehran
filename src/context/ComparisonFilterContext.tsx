import React, { createContext, useContext, useState, useMemo, useCallback } from 'react';
import { normalizeFinancialInput } from '../utils/persianFinancials';
import { formatAreaShort, formatMillionTomanAsIntlCurrency } from '../utils/areaUnit';
import { useAreaUnit, useIntlCurrency } from '../components/AreaUnitToggle';

export interface ReverseBudgetFilterState {
  totalBudgetMillion: number;
  maxDepositMillion: number;
  maxMonthlyRentMillion: number;
  desiredAreaSqm: number;
  maxBuildingAgeYears: number;
  comparedHoodIds: ReadonlyArray<string>;
  revisionKey: string;
  totalBudgetIntlText?: string;
  desiredAreaFormatted?: string;
}

interface ComparisonFilterContextValue extends ReverseBudgetFilterState {
  setBudgetFilter: (partial: Partial<Omit<ReverseBudgetFilterState, 'comparedHoodIds' | 'revisionKey'>>) => void;
  toggleComparedHood: (hoodId: string) => void;
  clearComparison: () => void;
}

const ComparisonFilterContext = createContext<ComparisonFilterContextValue | null>(null);

export const ComparisonFilterProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [totalBudgetMillion, setTotalBudgetMillion] = useState<number>(8500); // Default 8.5 Billion Toman
  const [maxDepositMillion, setMaxDepositMillion] = useState<number>(1200);
  const [maxMonthlyRentMillion, setMaxMonthlyRentMillion] = useState<number>(30);
  const [desiredAreaSqm, setDesiredAreaSqm] = useState<number>(95);
  const [maxBuildingAgeYears, setMaxBuildingAgeYears] = useState<number>(12);
  const [comparedHoodIds, setComparedHoodIds] = useState<ReadonlyArray<string>>([]);

  const setBudgetFilter = useCallback(
    (partial: Partial<Omit<ReverseBudgetFilterState, 'comparedHoodIds' | 'revisionKey'>>) => {
      if (partial.totalBudgetMillion !== undefined) {
        setTotalBudgetMillion(normalizeFinancialInput(partial.totalBudgetMillion));
      }
      if (partial.maxDepositMillion !== undefined) {
        setMaxDepositMillion(normalizeFinancialInput(partial.maxDepositMillion));
      }
      if (partial.maxMonthlyRentMillion !== undefined) {
        setMaxMonthlyRentMillion(normalizeFinancialInput(partial.maxMonthlyRentMillion));
      }
      if (partial.desiredAreaSqm !== undefined) {
        setDesiredAreaSqm(Math.max(35, Math.min(600, normalizeFinancialInput(partial.desiredAreaSqm))));
      }
      if (partial.maxBuildingAgeYears !== undefined) {
        setMaxBuildingAgeYears(Math.max(0, Math.min(40, normalizeFinancialInput(partial.maxBuildingAgeYears))));
      }
    },
    []
  );

  const toggleComparedHood = useCallback((hoodId: string) => {
    setComparedHoodIds((prev) => {
      if (prev.includes(hoodId)) return prev.filter((id) => id !== hoodId);
      if (prev.length >= 4) return [...prev.slice(1), hoodId];
      return [...prev, hoodId];
    });
  }, []);

  const clearComparison = useCallback(() => {
    setComparedHoodIds([]);
  }, []);

  const revisionKey = useMemo(
    () =>
      `${totalBudgetMillion}:${maxDepositMillion}:${maxMonthlyRentMillion}:${desiredAreaSqm}:${maxBuildingAgeYears}:${comparedHoodIds.join(',')}`,
    [
      totalBudgetMillion,
      maxDepositMillion,
      maxMonthlyRentMillion,
      desiredAreaSqm,
      maxBuildingAgeYears,
      comparedHoodIds,
    ]
  );

  const [areaUnit] = useAreaUnit();
  const [intlCurrency] = useIntlCurrency();

  const value = useMemo<ComparisonFilterContextValue>(
    () => ({
      totalBudgetMillion,
      maxDepositMillion,
      maxMonthlyRentMillion,
      desiredAreaSqm,
      maxBuildingAgeYears,
      comparedHoodIds,
      revisionKey,
      totalBudgetIntlText: formatMillionTomanAsIntlCurrency(totalBudgetMillion, intlCurrency),
      desiredAreaFormatted: formatAreaShort(desiredAreaSqm, areaUnit),
      setBudgetFilter,
      toggleComparedHood,
      clearComparison,
    }),
    [
      totalBudgetMillion,
      maxDepositMillion,
      maxMonthlyRentMillion,
      desiredAreaSqm,
      maxBuildingAgeYears,
      comparedHoodIds,
      revisionKey,
      areaUnit,
      intlCurrency,
      setBudgetFilter,
      toggleComparedHood,
      clearComparison,
    ]
  );

  return (
    <ComparisonFilterContext.Provider value={value}>{children}</ComparisonFilterContext.Provider>
  );
};

export function useComparisonFilter(): ComparisonFilterContextValue {
  const ctx = useContext(ComparisonFilterContext);
  if (!ctx) {
    throw new Error('useComparisonFilter must be used within a ComparisonFilterProvider');
  }
  return ctx;
}
