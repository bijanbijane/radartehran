/**
 * @file src/shared/entity-detail-ui/DetailHeader.tsx
 * @description Canonical Header for Property, Listing, Building, and Neighborhood detail pages with breadcrumbs, return link, and action bar (Stage 7).
 */

import React from 'react';
import type { BreadcrumbTrailItem, EntityDetailModel, EntityType } from '../../platform/entity-detail';
import { DetailStatus } from './DetailStatus';

const ENTITY_TYPE_LABELS_FA: Record<EntityType, string> = {
  property: 'پرونده تخصصی ملک',
  listing: 'جزئیات آگهی ملکی',
  building: 'شناسنامه ساختمان',
  neighborhood: 'پروفایل تحلیلی محله',
};

export interface DetailHeaderProps {
  entity: EntityDetailModel;
  breadcrumbs: BreadcrumbTrailItem[];
  returnPath?: string;
  onReturn?: (path: string) => void;
  onFavorite?: (entity: EntityDetailModel) => void;
  onCompare?: (entity: EntityDetailModel) => void;
  onShare?: (entity: EntityDetailModel) => void;
  onEdit?: (entity: EntityDetailModel) => void;
}

export const DetailHeader: React.FC<DetailHeaderProps> = ({
  entity,
  breadcrumbs,
  returnPath = '/search',
  onReturn,
  onFavorite,
  onCompare,
  onShare,
  onEdit,
}) => {
  return (
    <header
      dir="rtl"
      data-testid="entity-detail-header"
      className="rounded-2xl border border-slate-800 bg-slate-900/90 p-5 shadow-lg"
    >
      <div className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-800/80 pb-3">
        <nav aria-label="مسیر سلسله‌مراتبی موجودیت" className="flex flex-wrap items-center gap-1.5 text-xs text-slate-400">
          {breadcrumbs.map((crumb, idx) => (
            <React.Fragment key={crumb.id}>
              {idx > 0 && <span className="text-slate-600">/</span>}
              <span className={idx === breadcrumbs.length - 1 ? 'font-semibold text-slate-200' : 'text-slate-400'}>
                {crumb.labelFa}
              </span>
            </React.Fragment>
          ))}
        </nav>

        <button
          type="button"
          data-testid="entity-detail-return-btn"
          onClick={() => onReturn?.(returnPath)}
          className="rounded-lg border border-slate-700 bg-slate-800 px-3 py-1.5 text-xs font-medium text-slate-200 hover:bg-slate-700"
        >
          بازگشت به نتایج جست‌وجو
        </button>
      </div>

      <div className="mt-4 flex flex-col justify-between gap-4 md:flex-row md:items-start">
        <div className="space-y-2">
          <div className="text-xs font-medium text-sky-400">
            {ENTITY_TYPE_LABELS_FA[entity.entityType]}
            {entity.neighborhoodNameFa ? ` • ${entity.neighborhoodNameFa}` : ''}
          </div>
          <h1 className="text-xl font-bold text-slate-100">{entity.title}</h1>
          <DetailStatus pageStatus={entity.pageStatus} />
        </div>

        <div className="flex flex-wrap items-center gap-2" data-testid="entity-detail-actions">
          {entity.capabilities.canFavorite && (
            <button
              type="button"
              data-testid="detail-action-favorite"
              onClick={() => onFavorite?.(entity)}
              className="rounded-lg border border-slate-700 bg-slate-800/90 px-3 py-1.5 text-xs font-medium text-slate-200 hover:bg-slate-700"
            >
              ذخیره در علاقه‌مندی‌ها
            </button>
          )}
          {entity.capabilities.canCompare && (
            <button
              type="button"
              data-testid="detail-action-compare"
              onClick={() => onCompare?.(entity)}
              className="rounded-lg border border-slate-700 bg-slate-800/90 px-3 py-1.5 text-xs font-medium text-slate-200 hover:bg-slate-700"
            >
              افزودن به مقایسه
            </button>
          )}
          {entity.capabilities.canShare && (
            <button
              type="button"
              data-testid="detail-action-share"
              onClick={() => onShare?.(entity)}
              className="rounded-lg border border-slate-700 bg-slate-800/90 px-3 py-1.5 text-xs font-medium text-slate-200 hover:bg-slate-700"
            >
              اشتراک‌گذاری پیوند
            </button>
          )}
          {entity.capabilities.canEdit && (
            <button
              type="button"
              data-testid="detail-action-edit"
              onClick={() => onEdit?.(entity)}
              className="rounded-lg border border-emerald-500/40 bg-emerald-600/20 px-3 py-1.5 text-xs font-semibold text-emerald-200 hover:bg-emerald-600/30"
            >
              ویرایش اطلاعات
            </button>
          )}
        </div>
      </div>
    </header>
  );
};
