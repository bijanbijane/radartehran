/**
 * @file src/platform/presentation/selection/SelectionController.ts
 * @description Renderer-independent Selection Controller (up to 100 per page, 500 across pages, preserved across view switches).
 */

import type { ResultItem } from '../core/ResultTypes';

export const MAX_SELECTION_PER_PAGE = 100;
export const MAX_SELECTION_ACROSS_PAGES = 500;

export interface ResultSelectionState {
  selectedIds: string[];
  entityTypeScope: string | null;
  datasetContextKey: string;
}

export class ResultSelectionController {
  private selectedSet = new Set<string>();
  private entityTypeScope: string | null = null;
  private datasetContextKey: string;

  constructor(datasetContextKey = 'default') {
    this.datasetContextKey = datasetContextKey;
  }

  getState(): ResultSelectionState {
    return {
      selectedIds: Array.from(this.selectedSet),
      entityTypeScope: this.entityTypeScope,
      datasetContextKey: this.datasetContextKey,
    };
  }

  getCount(): number {
    return this.selectedSet.size;
  }

  isSelected(id: string): boolean {
    return this.selectedSet.has(id);
  }

  selectOne(item: ResultItem): boolean {
    if (!item.permissions.canSelect) return false;
    if (this.selectedSet.size >= MAX_SELECTION_ACROSS_PAGES && !this.selectedSet.has(item.id)) {
      return false;
    }
    if (!this.entityTypeScope) {
      this.entityTypeScope = item.entityType;
    }
    this.selectedSet.add(item.id);
    return true;
  }

  deselectOne(id: string): void {
    this.selectedSet.delete(id);
    if (this.selectedSet.size === 0) {
      this.entityTypeScope = null;
    }
  }

  toggleOne(item: ResultItem): boolean {
    if (this.selectedSet.has(item.id)) {
      this.deselectOne(item.id);
      return false;
    }
    return this.selectOne(item);
  }

  selectCurrentPage(items: readonly ResultItem[]): number {
    const selectable = items.filter((i) => i.permissions.canSelect).slice(0, MAX_SELECTION_PER_PAGE);
    let added = 0;
    for (const item of selectable) {
      if (this.selectedSet.size >= MAX_SELECTION_ACROSS_PAGES) break;
      if (!this.selectedSet.has(item.id)) {
        this.selectedSet.add(item.id);
        if (!this.entityTypeScope) this.entityTypeScope = item.entityType;
        added++;
      }
    }
    return added;
  }

  clearSelection(): void {
    this.selectedSet.clear();
    this.entityTypeScope = null;
  }

  /**
   * Preserves selection when switching renderers (e.g. Card Grid -> Data Table),
   * but clears selection when the underlying dataset context changes incompatibly (e.g. City or Scope switch).
   */
  syncWithDatasetContext(nextContextKey: string): void {
    if (nextContextKey !== this.datasetContextKey) {
      this.datasetContextKey = nextContextKey;
      this.clearSelection();
    }
  }
}
