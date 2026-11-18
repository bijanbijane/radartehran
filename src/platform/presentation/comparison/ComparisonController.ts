/**
 * @file src/platform/presentation/comparison/ComparisonController.ts
 * @description Homogeneous-entity Comparison Controller enforcing per-entity caps and exit warning flags.
 */

import type { ResultEntityType, ResultItem } from '../core/ResultTypes';
import {
  COMPARISON_MAX_BY_ENTITY,
  getComparisonFieldsForEntityType,
  type ComparisonModel,
} from './ComparisonSchema';

export interface ComparisonOperationOutcome {
  ok: boolean;
  reason:
    | 'ADDED'
    | 'REMOVED'
    | 'ALREADY_EXISTS'
    | 'PERMISSION_DENIED'
    | 'ENTITY_TYPE_MISMATCH'
    | 'CAPACITY_EXCEEDED'
    | 'INVALID_ENTITY';
  messageFa: string;
  model: ComparisonModel;
}

export class ResultComparisonController {
  private items: ResultItem[] = [];
  private activeEntityType: ResultEntityType | null = null;

  getItems(): ResultItem[] {
    return [...this.items];
  }

  getModel(): ComparisonModel {
    const entityType = this.activeEntityType ?? 'property';
    return {
      items: this.items.map((i) => ({ entityId: i.id, entityType: i.entityType })),
      fields: getComparisonFieldsForEntityType(entityType),
    };
  }

  hasUnsavedComparison(): boolean {
    return this.items.length > 0;
  }

  addEntity(item: ResultItem): ComparisonOperationOutcome {
    if (!item || !item.id || !item.entityType) {
      return {
        ok: false,
        reason: 'INVALID_ENTITY',
        messageFa: 'موجودیت انتخاب‌شده برای مقایسه نامعتبر است.',
        model: this.getModel(),
      };
    }

    if (!item.permissions.canCompare) {
      return {
        ok: false,
        reason: 'PERMISSION_DENIED',
        messageFa: 'امکان مقایسه برای این مورد فعال نیست.',
        model: this.getModel(),
      };
    }

    if (this.activeEntityType && this.activeEntityType !== item.entityType) {
      return {
        ok: false,
        reason: 'ENTITY_TYPE_MISMATCH',
        messageFa: 'مقایسه انواع مختلف موجودیت (مثلاً ملک با محله) در یک جدول مشترک مجاز نیست.',
        model: this.getModel(),
      };
    }

    if (this.items.some((existing) => existing.id === item.id)) {
      return {
        ok: false,
        reason: 'ALREADY_EXISTS',
        messageFa: 'این مورد قبلاً به میز کار مقایسه اضافه شده است.',
        model: this.getModel(),
      };
    }

    const maxCap = COMPARISON_MAX_BY_ENTITY[item.entityType] ?? 4;
    if (this.items.length >= maxCap) {
      return {
        ok: false,
        reason: 'CAPACITY_EXCEEDED',
        messageFa: `حداکثر تعداد مجاز مقایسه همزمان برای این نوع موجودیت ${maxCap} مورد است.`,
        model: this.getModel(),
      };
    }

    this.activeEntityType = item.entityType;
    this.items.push(item);

    return {
      ok: true,
      reason: 'ADDED',
      messageFa: `«${item.title}» به میز کار مقایسه اضافه شد.`,
      model: this.getModel(),
    };
  }

  removeEntity(entityId: string): ComparisonOperationOutcome {
    this.items = this.items.filter((i) => i.id !== entityId);
    if (this.items.length === 0) {
      this.activeEntityType = null;
    }
    return {
      ok: true,
      reason: 'REMOVED',
      messageFa: 'مورد از جدول مقایسه حذف شد.',
      model: this.getModel(),
    };
  }

  clearAll(): void {
    this.items = [];
    this.activeEntityType = null;
  }
}
