/**
 * @file src/shared/entity-detail-ui/DetailMetadata.tsx
 * @description Renders canonical entity provenance, timestamps, sample size, and field-level confidence (Stage 7).
 */

import React from 'react';
import {
  DATA_CONFIDENCE_LABELS_FA,
  formatDetailFieldValueFa,
  type EntityDetailField,
  type EntityDetailModel,
} from '../../platform/entity-detail';

export interface DetailMetadataProps {
  entity: EntityDetailModel;
  fieldKeys?: string[];
  fieldLabelsFa?: Record<string, string>;
}

const DEFAULT_FIELD_LABELS_FA: Record<string, string> = {
  priceTotal: 'قیمت کل',
  pricePerSqm: 'قیمت هر متر مربع',
  avgPriceSqm: 'میانگین قیمت هر متر مربع',
  areaSqm: 'مساحت (متر مربع)',
  buildYear: 'سال ساخت',
  roomsCount: 'تعداد اتاق',
  floorNumber: 'طبقه',
  floorsCount: 'تعداد طبقات ساختمان',
  unitsCount: 'تعداد کل واحدها',
  liquidityScore: 'امتیاز نقدشوندگی',
  investmentScore: 'امتیاز سرمایه‌گذاری',
  sampleSize: 'حجم نمونه مشاهده‌شده',
  districtNumber: 'منطقه شهرداری',
};

export const DetailMetadata: React.FC<DetailMetadataProps> = ({
  entity,
  fieldKeys,
  fieldLabelsFa = DEFAULT_FIELD_LABELS_FA,
}) => {
  const keys = fieldKeys ?? Object.keys(entity.fields);

  return (
    <div dir="rtl" className="space-y-3" data-testid="entity-detail-metadata">
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
        {keys.map((key) => {
          const field: EntityDetailField | undefined = entity.fields[key];
          if (!field) return null;
          const label = fieldLabelsFa[key] || key;
          const formatted = formatDetailFieldValueFa(field);

          return (
            <div
              key={key}
              data-testid={`detail-field-${key}`}
              className="rounded-lg border border-slate-800 bg-slate-900/70 p-3"
            >
              <div className="flex items-center justify-between gap-2 text-xs text-slate-400">
                <span>{label}</span>
                <span className="rounded bg-slate-800 px-1.5 py-0.5 text-[11px] text-slate-300">
                  {DATA_CONFIDENCE_LABELS_FA[field.confidence]}
                </span>
              </div>
              <div className="mt-1.5 text-sm font-semibold text-slate-100">{formatted}</div>
              {field.limitationNoteFa && (
                <div className="mt-1 text-[11px] text-amber-300">{field.limitationNoteFa}</div>
              )}
            </div>
          );
        })}
      </div>

      <div className="flex flex-wrap items-center gap-4 border-t border-slate-800/80 pt-2 text-xs text-slate-400">
        <span>شناسه یکتا: {entity.id}</span>
        {entity.timestamps.updatedAt && <span>آخرین بروزرسانی: {entity.timestamps.updatedAt}</span>}
        {entity.timestamps.lastVerifiedAt && <span>آخرین راستی‌آزمایی: {entity.timestamps.lastVerifiedAt}</span>}
      </div>
    </div>
  );
};
