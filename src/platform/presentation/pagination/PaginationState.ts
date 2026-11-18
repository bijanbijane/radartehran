/**
 * @file src/platform/presentation/pagination/PaginationState.ts
 * @description Canonical Offset and Cursor Pagination contracts and 7 Pagination status states (Stage 6).
 */

export const DEFAULT_RESULT_PAGE_SIZE = 20;
export const ALLOWED_RESULT_PAGE_SIZES = [20, 40, 60] as const;
export const MAX_RESULT_PAGE_SIZE = 100;

export type PaginationStatusState =
  | 'FirstPage'
  | 'MiddlePage'
  | 'LastPage'
  | 'EmptyResult'
  | 'Loading'
  | 'Error'
  | 'PartialResult';

export interface ResultPaginationModel {
  mode: 'offset' | 'cursor';
  page: number;
  pageSize: number;
  receivedCount: number;
  totalCount: number | null;
  totalPages: number | null;
  nextCursor?: string | null;
  prevCursor?: string | null;
  status: PaginationStatusState;
}
