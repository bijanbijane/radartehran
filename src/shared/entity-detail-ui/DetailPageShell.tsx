/**
 * @file src/shared/entity-detail-ui/DetailPageShell.tsx
 * @description Unified layout shell for Property, Listing, Building, and Neighborhood detail pages (Stage 7).
 */

import React from 'react';
import {
  resolveVisibleEntitySections,
  type BreadcrumbTrailItem,
  type DetailSectionId,
  type EntityDetailModel,
} from '../../platform/entity-detail';
import { DetailHeader } from './DetailHeader';
import { DetailMetadata } from './DetailMetadata';
import { DetailSection } from './DetailSection';

export interface DetailPageShellProps {
  entity: EntityDetailModel;
  breadcrumbs: BreadcrumbTrailItem[];
  returnPath?: string;
  activeSectionId?: DetailSectionId;
  onSelectSection?: (sectionId: DetailSectionId) => void;
  onReturn?: (path: string) => void;
  onFavorite?: (entity: EntityDetailModel) => void;
  onCompare?: (entity: EntityDetailModel) => void;
  onShare?: (entity: EntityDetailModel) => void;
  onEdit?: (entity: EntityDetailModel) => void;
  renderCustomSection?: (sectionId: DetailSectionId, entity: EntityDetailModel) => React.ReactNode;
}

export const DetailPageShell: React.FC<DetailPageShellProps> = ({
  entity,
  breadcrumbs,
  returnPath,
  activeSectionId = 'overview',
  onSelectSection,
  onReturn,
  onFavorite,
  onCompare,
  onShare,
  onEdit,
  renderCustomSection,
}) => {
  const visibilityMap = resolveVisibleEntitySections(entity);
  const visibleEntries = Object.values(visibilityMap).filter((v) => v.status !== 'hidden');

  return (
    <div dir="rtl" data-testid="entity-detail-page-shell" className="space-y-5">
      <DetailHeader
        entity={entity}
        breadcrumbs={breadcrumbs}
        returnPath={returnPath}
        onReturn={onReturn}
        onFavorite={onFavorite}
        onCompare={onCompare}
        onShare={onShare}
        onEdit={onEdit}
      />

      <nav
        aria-label="بخش‌های صفحه جزئیات"
        className="flex flex-wrap items-center gap-2 rounded-xl border border-slate-800 bg-slate-900/70 p-2"
      >
        {visibleEntries.map(({ section }) => {
          const isActive = activeSectionId === section.id;
          return (
            <button
              key={section.id}
              type="button"
              data-testid={`detail-tab-${section.id}`}
              onClick={() => onSelectSection?.(section.id)}
              className={`rounded-lg px-3 py-1.5 text-xs font-medium transition-colors ${
                isActive
                  ? 'bg-sky-600 text-white'
                  : 'text-slate-300 hover:bg-slate-800 hover:text-white'
              }`}
            >
              {section.titleFa}
            </button>
          );
        })}
      </nav>

      <div className="space-y-4">
        {visibleEntries.map(({ section, status, reasonFa }) => (
          <DetailSection
            key={section.id}
            section={section}
            visibilityStatus={status}
            reasonFa={reasonFa}
          >
            {renderCustomSection ? (
              renderCustomSection(section.id, entity)
            ) : (
              <DetailMetadata
                entity={entity}
                fieldKeys={
                  section.requiredFields.length > 0 ? section.requiredFields : undefined
                }
              />
            )}
          </DetailSection>
        ))}
      </div>
    </div>
  );
};
