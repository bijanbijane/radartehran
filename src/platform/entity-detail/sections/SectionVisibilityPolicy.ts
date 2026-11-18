/**
 * @file src/platform/entity-detail/sections/SectionVisibilityPolicy.ts
 * @description Evaluates whether each section is visible, hidden, or restricted for an EntityDetailModel (Stage 7).
 */

import type { EntityDetailModel } from '../core/EntityDetailTypes';
import {
  getSectionsForEntityType,
  hasSectionContent,
  type DetailSectionDescriptor,
  type DetailSectionId,
} from './SectionRegistry';

export type SectionVisibilityStatus =
  | 'visible'
  | 'empty-banner'
  | 'restricted'
  | 'hidden';

export interface EvaluatedSectionVisibility {
  section: DetailSectionDescriptor;
  status: SectionVisibilityStatus;
  reasonFa?: string;
}

export function evaluateSectionVisibility(
  model: EntityDetailModel,
  section: DetailSectionDescriptor
): EvaluatedSectionVisibility {
  if (!section.supportedEntityTypes.includes(model.entityType)) {
    return {
      section,
      status: 'hidden',
      reasonFa: 'این بخش برای این نوع موجودیت تعریف نشده است.',
    };
  }

  if (section.requiresPrivateAccess) {
    if (!model.capabilities.canViewPrivateData) {
      return {
        section,
        status: 'hidden',
        reasonFa: 'اطلاعات خصوصی مالک و اسناد محرمانه فقط برای مالک یا نقش مجاز قابل مشاهده است.',
      };
    }
  }

  const contentPresent = hasSectionContent(model, section);
  if (!contentPresent) {
    if (section.emptyBehavior === 'hide') {
      return {
        section,
        status: 'hidden',
        reasonFa: 'داده‌ای برای نمایش در این بخش ثبت نشده است.',
      };
    }
    return {
      section,
      status: 'empty-banner',
      reasonFa: 'بخشی از داده‌های این بخش در حال حاضر ثبت نشده یا نامشخص است.',
    };
  }

  return {
    section,
    status: 'visible',
  };
}

export function resolveVisibleEntitySections(
  model: EntityDetailModel
): Record<DetailSectionId, EvaluatedSectionVisibility> {
  const candidates = getSectionsForEntityType(model.entityType);
  const result = {} as Record<DetailSectionId, EvaluatedSectionVisibility>;
  for (const sec of candidates) {
    result[sec.id] = evaluateSectionVisibility(model, sec);
  }
  return result;
}
