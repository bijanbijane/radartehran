/**
 * @file src/shared/entity-detail-ui/DetailSection.tsx
 * @description Renders an isolated Entity Detail section wrapped in SectionErrorBoundary with empty/limitation handling (Stage 7).
 */

import React from 'react';
import {
  SectionErrorBoundary,
  type DetailSectionDescriptor,
  type SectionVisibilityStatus,
} from '../../platform/entity-detail';

export interface DetailSectionProps {
  section: DetailSectionDescriptor;
  visibilityStatus: SectionVisibilityStatus;
  reasonFa?: string;
  onRetrySection?: (sectionId: string) => void;
  children: React.ReactNode;
}

export const DetailSection: React.FC<DetailSectionProps> = ({
  section,
  visibilityStatus,
  reasonFa,
  onRetrySection,
  children,
}) => {
  if (visibilityStatus === 'hidden') {
    return null;
  }

  return (
    <SectionErrorBoundary
      sectionId={section.id}
      sectionTitleFa={section.titleFa}
      onRetrySection={onRetrySection}
    >
      <section
        dir="rtl"
        id={`detail-section-${section.id}`}
        data-testid={`detail-section-${section.id}`}
        className="rounded-2xl border border-slate-800 bg-slate-900/75 p-5"
      >
        <div className="mb-4 flex items-center justify-between border-b border-slate-800/80 pb-3">
          <h2 className="text-base font-bold text-slate-100">{section.titleFa}</h2>
          <span className="text-xs text-slate-500">بخش #{section.order}</span>
        </div>

        {visibilityStatus === 'empty-banner' ? (
          <div
            data-testid={`detail-section-empty-${section.id}`}
            className="rounded-xl border border-slate-800 bg-slate-950/60 p-4 text-xs text-slate-400"
          >
            {reasonFa || 'برای این بخش هنوز داده تأییدشده‌ای ثبت نشده است (نامشخص).'}
          </div>
        ) : (
          children
        )}
      </section>
    </SectionErrorBoundary>
  );
};
