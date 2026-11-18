/**
 * @file src/platform/presentation/pagination/PaginationController.ts
 * @description Manages Pagination state transitions without fabricating totalPages when totalCount is unknown or cursor-based.
 */

import {
  DEFAULT_RESULT_PAGE_SIZE,
  MAX_RESULT_PAGE_SIZE,
  type PaginationStatusState,
  type ResultPaginationModel,
} from './PaginationState';

export interface BuildPaginationModelInput {
  mode?: 'offset' | 'cursor';
  page?: number;
  pageSize?: number;
  receivedCount: number;
  totalCount?: number | null;
  nextCursor?: string | null;
  prevCursor?: string | null;
  isLoading?: boolean;
  isError?: boolean;
  isPartial?: boolean;
}

export function clampPageSize(rawSize?: number): number {
  if (typeof rawSize !== 'number' || !Number.isFinite(rawSize) || rawSize < 1) {
    return DEFAULT_RESULT_PAGE_SIZE;
  }
  return Math.min(MAX_RESULT_PAGE_SIZE, Math.floor(rawSize));
}

export function buildResultPaginationModel(input: BuildPaginationModelInput): ResultPaginationModel {
  const mode = input.mode ?? (input.nextCursor !== undefined ? 'cursor' : 'offset');
  const page = Math.max(1, Math.floor(input.page ?? 1));
  const pageSize = clampPageSize(input.pageSize);
  const receivedCount = Math.max(0, Math.floor(input.receivedCount));

  // Never fabricate totalCount or totalPages from a single page sample!
  const hasRealTotal =
    mode === 'offset' &&
    typeof input.totalCount === 'number' &&
    Number.isFinite(input.totalCount) &&
    input.totalCount >= 0;

  const totalCount = hasRealTotal ? Math.floor(input.totalCount!) : null;
  const totalPages =
    totalCount !== null ? (totalCount === 0 ? 0 : Math.max(1, Math.ceil(totalCount / pageSize))) : null;

  let status: PaginationStatusState = 'FirstPage';
  if (input.isLoading) {
    status = 'Loading';
  } else if (input.isError) {
    status = 'Error';
  } else if (input.isPartial) {
    status = 'PartialResult';
  } else if (receivedCount === 0 && (totalCount === 0 || page === 1)) {
    status = 'EmptyResult';
  } else if (mode === 'cursor') {
    if (!input.prevCursor && page === 1) status = 'FirstPage';
    else if (!input.nextCursor) status = 'LastPage';
    else status = 'MiddlePage';
  } else if (totalPages !== null) {
    if (page <= 1) status = 'FirstPage';
    else if (page >= totalPages) status = 'LastPage';
    else status = 'MiddlePage';
  } else {
    status = page === 1 ? 'FirstPage' : receivedCount < pageSize ? 'LastPage' : 'MiddlePage';
  }

  return {
    mode,
    page,
    pageSize,
    receivedCount,
    totalCount,
    totalPages,
    nextCursor: input.nextCursor ?? null,
    prevCursor: input.prevCursor ?? null,
    status,
  };
}
