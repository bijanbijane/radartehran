/** @file src/features/tools/components/UnifiedCompareWorkspace.tsx — Real Embedded Area & Property Comparison Workspace (/tools/compare-areas, /tools/compare-properties) */
import React, { useMemo, useState } from 'react';
import { GitCompare, Building2, Compass } from 'lucide-react';
import { toPersianNum, type EvaluatedNeighborhood } from '../../../data/neighborhoods';
import type { CityId } from '../../../data/multiCityData';
import { buildPropertyListingRecords } from '../../properties/services/propertyDataAdapter';
import { useRadarLocale } from '../../../components/AreaUnitToggle';

export interface UnifiedCompareWorkspaceProps {
  mode: 'areas' | 'properties';
  evaluatedNeighborhoods: EvaluatedNeighborhood[];
  selectedHood: EvaluatedNeighborhood;
  activeCity?: CityId;
  onSelectNeighborhood?: (hood: EvaluatedNeighborhood) => void;
}

interface RealUnitOption {
  id: string;
  title: string;
  hoodName: string;
  sqm: number;
  priceBillion: number;
  sqmPriceMillion: number;
  rooms: number;
  yearFa: string;
  parking: string;
  elevator: string;
}

export const UnifiedCompareWorkspace: React.FC<UnifiedCompareWorkspaceProps> = ({
  mode,
  evaluatedNeighborhoods,
  selectedHood,
  activeCity = 'tehran',
}) => {
  const [locale] = useRadarLocale();
  const isEn = locale === 'en';
  const hoods = evaluatedNeighborhoods.length > 0 ? evaluatedNeighborhoods : [selectedHood];
  const [idA, setIdA] = useState<number>(selectedHood.id);
  const [idB, setIdB] = useState<number>(() => hoods.find((h) => h.id !== selectedHood.id)?.id ?? selectedHood.id);

  const hoodA = useMemo(() => hoods.find((h) => h.id === idA) || selectedHood, [hoods, idA, selectedHood]);
  const hoodB = useMemo(() => hoods.find((h) => h.id === idB) || hoods[1] || selectedHood, [hoods, idB, selectedHood]);

  const realUnits = useMemo<RealUnitOption[]>(() => {
    const records = buildPropertyListingRecords(hoods, [], activeCity);
    const saleRecords = records.filter((r) => (r.listing.price.saleTotalMillion ?? 0) > 0 || (r.listing.price.pricePerSqmMillion ?? 0) > 0);
    const source = saleRecords.length >= 2 ? saleRecords : records;
    return source.slice(0, 24).map((r) => {
      const sqm = r.property.areaSqm || 85;
      const totalM = r.listing.price.saleTotalMillion ?? Math.round((r.listing.price.pricePerSqmMillion ?? r.listing.marketContext.hoodBaseBuyPerSqm) * sqm);
      const sqmM = r.listing.price.pricePerSqmMillion ?? Math.round(totalM / Math.max(1, sqm));
      return {
        id: r.listing.listingId,
        title: `${r.listing.title} (${r.property.hoodName})`,
        hoodName: r.property.hoodName,
        sqm,
        priceBillion: Number((totalM / 1000).toFixed(1)),
        sqmPriceMillion: sqmM,
        rooms: r.property.roomsCount ?? 2,
        yearFa: r.property.buildYearJalali ? toPersianNum(r.property.buildYearJalali) : 'نامشخص',
        parking: r.property.unitFeatures.parking === 'has' ? 'دارد' : r.property.unitFeatures.parking === 'lacks' ? 'ندارد' : 'نامشخص',
        elevator: r.property.unitFeatures.elevator === 'has' ? 'دارد' : r.property.unitFeatures.elevator === 'lacks' ? 'ندارد' : 'نامشخص',
      };
    });
  }, [hoods, activeCity]);

  const [unitAId, setUnitAId] = useState<string>('');
  const [unitBId, setUnitBId] = useState<string>('');
  const unitA = realUnits.find((u) => u.id === unitAId) || realUnits[0];
  const unitB = realUnits.find((u) => u.id === unitBId) || realUnits[1] || realUnits[0];

  const fmt = (n: number) => (isEn ? n.toLocaleString('en-US') : toPersianNum(n.toLocaleString('en-US')).replace(/\./g, '٫'));

  if (mode === 'properties' && unitA && unitB) {
    const rows = [
      { label: isEn ? 'Neighborhood' : 'محله', a: unitA.hoodName, b: unitB.hoodName },
      { label: isEn ? 'Total Price' : 'قیمت کل برآوردی', a: `${fmt(unitA.priceBillion)} میلیارد تومان`, b: `${fmt(unitB.priceBillion)} میلیارد تومان` },
      { label: isEn ? 'Price / m²' : 'قیمت هر متر مربع', a: `${fmt(unitA.sqmPriceMillion)} میلیون تومان`, b: `${fmt(unitB.sqmPriceMillion)} میلیون تومان` },
      { label: isEn ? 'Area' : 'متراژ', a: `${fmt(unitA.sqm)} متر`, b: `${fmt(unitB.sqm)} متر` },
      { label: isEn ? 'Bedrooms' : 'تعداد خواب', a: `${fmt(unitA.rooms)} خواب`, b: `${fmt(unitB.rooms)} خواب` },
      { label: isEn ? 'Build Year' : 'سال ساخت', a: unitA.yearFa, b: unitB.yearFa },
      { label: isEn ? 'Parking / Elevator' : 'پارکینگ / آسانسور', a: `پارکینگ: ${unitA.parking} · آسانسور: ${unitA.elevator}`, b: `پارکینگ: ${unitB.parking} · آسانسور: ${unitB.elevator}` },
    ];

    return (
      <section
        dir={isEn ? 'ltr' : 'rtl'}
        data-testid="tools-compare-properties-workspace"
        aria-label={isEn ? 'Property comparison matrix' : 'جدول مقایسه دو ملک'}
        className="rounded-[16px] border border-[var(--color-border-subtle)] bg-[var(--color-bg-surface)] p-5 space-y-4"
      >
        <div className="flex items-center gap-2">
          <Building2 className="w-5 h-5 text-[var(--color-brand-fg)]" aria-hidden="true" />
          <h2 className="text-base font-bold text-[var(--color-text-primary)]">
            {isEn ? 'Side-by-Side Property Comparison' : 'مقایسه کنار هم دو ملک'}
          </h2>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <label className="space-y-1 text-xs font-bold text-[var(--color-text-secondary)]">
            <span>{isEn ? 'Property A' : 'ملک اول'}</span>
            <select
              aria-label={isEn ? 'Select first property' : 'انتخاب ملک اول برای مقایسه'}
              value={unitA.id}
              onChange={(e) => setUnitAId(e.target.value)}
              className="w-full min-h-[44px] md:min-h-[38px] px-3 rounded-[8px] border border-[var(--color-border-strong)] bg-[var(--color-bg-canvas)] text-xs font-bold text-[var(--color-text-primary)]"
            >
              {realUnits.map((u) => (
                <option key={u.id} value={u.id}>{u.title}</option>
              ))}
            </select>
          </label>
          <label className="space-y-1 text-xs font-bold text-[var(--color-text-secondary)]">
            <span>{isEn ? 'Property B' : 'ملک دوم'}</span>
            <select
              aria-label={isEn ? 'Select second property' : 'انتخاب ملک دوم برای مقایسه'}
              value={unitB.id}
              onChange={(e) => setUnitBId(e.target.value)}
              className="w-full min-h-[44px] md:min-h-[38px] px-3 rounded-[8px] border border-[var(--color-border-strong)] bg-[var(--color-bg-canvas)] text-xs font-bold text-[var(--color-text-primary)]"
            >
              {realUnits.map((u) => (
                <option key={u.id} value={u.id}>{u.title}</option>
              ))}
            </select>
          </label>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full text-xs border-collapse">
            <thead>
              <tr className="border-b border-[var(--color-border-subtle)] text-[var(--color-text-muted)]">
                <th className="py-2.5 px-3 text-start font-bold">{isEn ? 'Metric' : 'شاخص'}</th>
                <th className="py-2.5 px-3 text-start font-bold text-[var(--color-text-primary)]">{unitA.title}</th>
                <th className="py-2.5 px-3 text-start font-bold text-[var(--color-text-primary)]">{unitB.title}</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-[var(--color-border-subtle)] tabular-nums">
              {rows.map((r) => (
                <tr key={r.label}>
                  <td className="py-2.5 px-3 font-semibold text-[var(--color-text-secondary)]">{r.label}</td>
                  <td className="py-2.5 px-3 font-bold text-[var(--color-text-primary)]">{r.a}</td>
                  <td className="py-2.5 px-3 font-bold text-[var(--color-text-primary)]">{r.b}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>
    );
  }

  const areaRows = [
    { label: isEn ? 'District / Zone' : 'منطقه / پهنه', a: hoodA.zone, b: hoodB.zone },
    { label: isEn ? 'Asking Median / m²' : 'نرخ اعلامی هر متر', a: `${fmt(hoodA.buyPerSqm)} میلیون`, b: `${fmt(hoodB.buyPerSqm)} میلیون` },
    { label: isEn ? 'Negotiation Scenario / m²' : 'سناریو مذاکره (۶٪ تعدیل)', a: `${fmt(Math.round(hoodA.buyPerSqm * 0.94))} میلیون`, b: `${fmt(Math.round(hoodB.buyPerSqm * 0.94))} میلیون` },
    { label: isEn ? '80m² Full Deposit (Rahn)' : 'رهن کامل ۸۰ متری', a: `${fmt(hoodA.rahn80m)} میلیون`, b: `${fmt(hoodB.rahn80m)} میلیون` },
    { label: isEn ? 'Overall Score' : 'امتیاز کل زیست‌پذیری', a: `${fmt(Number(hoodA.overallScore.toFixed(1)))} از ۱۰`, b: `${fmt(Number(hoodB.overallScore.toFixed(1)))} از ۱۰` },
    { label: isEn ? 'Metro & Transit' : 'دسترسی مترو', a: `${fmt(Number(hoodA.metro.toFixed(1)))} از ۱۰`, b: `${fmt(Number(hoodB.metro.toFixed(1)))} از ۱۰` },
    { label: isEn ? 'Air Quality' : 'کیفیت هوا', a: `${fmt(Number(hoodA.air.toFixed(1)))} از ۱۰`, b: `${fmt(Number(hoodB.air.toFixed(1)))} از ۱۰` },
    { label: isEn ? 'Traffic Calmness' : 'روانی ترافیک', a: `${fmt(Number((hoodA.trafficInfo?.trafficScore ?? hoodA.flatTerrain).toFixed(1)))} از ۱۰`, b: `${fmt(Number((hoodB.trafficInfo?.trafficScore ?? hoodB.flatTerrain).toFixed(1)))} از ۱۰` },
  ];

  const priceDeltaPct = hoodA.buyPerSqm > 0
    ? Math.round(((hoodB.buyPerSqm - hoodA.buyPerSqm) / hoodA.buyPerSqm) * 100)
    : 0;

  return (
    <section
      dir={isEn ? 'ltr' : 'rtl'}
      data-testid="tools-compare-areas-workspace"
      aria-label={isEn ? 'Neighborhood comparison matrix' : 'جدول مقایسه دو محله'}
      className="rounded-[16px] border border-[var(--color-border-subtle)] bg-[var(--color-bg-surface)] p-5 space-y-4"
    >
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="flex items-center gap-2">
          <GitCompare className="w-5 h-5 text-[var(--color-brand-fg)]" aria-hidden="true" />
          <h2 className="text-base font-bold text-[var(--color-text-primary)]">
            {isEn ? 'Side-by-Side Neighborhood Comparison' : 'مقایسه تحلیلی دو محله کنار هم'}
          </h2>
        </div>
        <span className="inline-flex items-center gap-1.5 text-xs font-bold text-[var(--color-brand-fg)] tabular-nums">
          <Compass className="w-4 h-4" aria-hidden="true" />
          <span>
            {isEn
              ? `Price gap: ${priceDeltaPct > 0 ? '+' : ''}${priceDeltaPct}%`
              : `اختلاف قیمت هر متر: ${priceDeltaPct > 0 ? '+' : ''}${toPersianNum(priceDeltaPct)}٪`}
          </span>
        </span>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
        <label className="space-y-1 text-xs font-bold text-[var(--color-text-secondary)]">
          <span>{isEn ? 'First Neighborhood' : 'محله اول'}</span>
          <select
            aria-label={isEn ? 'Select first neighborhood' : 'انتخاب محله اول برای مقایسه'}
            value={hoodA.id}
            onChange={(e) => setIdA(Number(e.target.value))}
            className="w-full min-h-[44px] md:min-h-[38px] px-3 rounded-[8px] border border-[var(--color-border-strong)] bg-[var(--color-bg-canvas)] text-xs font-bold text-[var(--color-text-primary)]"
          >
            {hoods.map((h) => (
              <option key={h.id} value={h.id}>{h.name} ({h.zone})</option>
            ))}
          </select>
        </label>
        <label className="space-y-1 text-xs font-bold text-[var(--color-text-secondary)]">
          <span>{isEn ? 'Second Neighborhood' : 'محله دوم'}</span>
          <select
            aria-label={isEn ? 'Select second neighborhood' : 'انتخاب محله دوم برای مقایسه'}
            value={hoodB.id}
            onChange={(e) => setIdB(Number(e.target.value))}
            className="w-full min-h-[44px] md:min-h-[38px] px-3 rounded-[8px] border border-[var(--color-border-strong)] bg-[var(--color-bg-canvas)] text-xs font-bold text-[var(--color-text-primary)]"
          >
            {hoods.map((h) => (
              <option key={h.id} value={h.id}>{h.name} ({h.zone})</option>
            ))}
          </select>
        </label>
      </div>

      <div className="overflow-x-auto">
        <table className="w-full text-xs border-collapse">
          <thead>
            <tr className="border-b border-[var(--color-border-subtle)] text-[var(--color-text-muted)]">
              <th className="py-2.5 px-3 text-start font-bold">{isEn ? 'Indicator' : 'شاخص مقایسه'}</th>
              <th className="py-2.5 px-3 text-start font-bold text-[var(--color-text-primary)]">{hoodA.name}</th>
              <th className="py-2.5 px-3 text-start font-bold text-[var(--color-text-primary)]">{hoodB.name}</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-[var(--color-border-subtle)] tabular-nums">
            {areaRows.map((r) => (
              <tr key={r.label}>
                <td className="py-2.5 px-3 font-semibold text-[var(--color-text-secondary)]">{r.label}</td>
                <td className="py-2.5 px-3 font-bold text-[var(--color-text-primary)]">{r.a}</td>
                <td className="py-2.5 px-3 font-bold text-[var(--color-text-primary)]">{r.b}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </section>
  );
};
