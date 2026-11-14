/** @file Panel shell Tailwind classes, bottom-sheet gesture state, and deterministic pagination engine. OP-DEC-001: formatMillionTomanAsIntlCurrency */

const SPLIT_WIDTH =
  'w-full lg:w-[60%] xl:w-[56%] 2xl:w-[52%] lg:mt-0 lg:h-full lg:rounded-none lg:border-t-0';

export function resolveProductViewRouterShellClasses(
  splitMapMode: boolean,
  homeContentFirst: boolean,
): { shellBg: string; splitShell: string } {
  if (!splitMapMode) {
    return { shellBg: 'bg-[#F6F8F6]/95 dark:bg-slate-950/95 backdrop-blur-xl', splitShell: 'h-full w-full lg:w-[calc(100%-220px)]' };
  }
  if (homeContentFirst) {
    return {
      shellBg: '',
      splitShell: `max-lg:mt-0 max-lg:h-full max-lg:rounded-none max-lg:border-t-0 max-lg:bg-[#F6F8F6] dark:max-lg:bg-slate-950 max-lg:backdrop-blur-none lg:bg-[#F6F8F6]/95 dark:lg:bg-slate-950/95 lg:backdrop-blur-xl ${SPLIT_WIDTH}`,
    };
  }
  return {
    shellBg: 'bg-[#F6F8F6]/95 dark:bg-slate-950/95 backdrop-blur-xl',
    splitShell: `max-lg:mt-0 max-lg:h-full max-lg:rounded-none max-lg:border-t-0 ${SPLIT_WIDTH}`,
  };
}

export type BottomSheetSnapState = 'collapsed' | 'peek' | 'expanded';

export interface BottomSheetSnapConfig {
  viewportHeight: number;
  bottomNavHeight: number;
  collapsedHeight: number;
  peekRatio: number;
  expandedRatio: number;
}

export const DEFAULT_BOTTOM_SHEET_CONFIG: Omit<BottomSheetSnapConfig, 'viewportHeight'> = {
  bottomNavHeight: 60,
  collapsedHeight: 78,
  peekRatio: 0.40,
  expandedRatio: 0.86,
};

export function resolveSheetSnapHeightPx(
  state: BottomSheetSnapState,
  config: BottomSheetSnapConfig,
): number {
  const available = Math.max(200, config.viewportHeight - config.bottomNavHeight);
  if (state === 'collapsed') return Math.min(config.collapsedHeight, available);
  if (state === 'peek') {
    const targetPeek = Math.round(config.viewportHeight * config.peekRatio);
    return Math.min(targetPeek, Math.round(available * 0.65));
  }
  const targetExpanded = Math.round(config.viewportHeight * config.expandedRatio);
  return Math.min(targetExpanded, available - 12);
}

export function computeNextSnapStateFromGesture(params: {
  currentState: BottomSheetSnapState;
  deltaY: number;
  velocityY: number;
}): BottomSheetSnapState {
  const { currentState, deltaY, velocityY } = params;
  const FLICK_VELOCITY = 0.45;
  const DRAG_THRESHOLD = 45;
  if (velocityY < -FLICK_VELOCITY || deltaY < -DRAG_THRESHOLD) {
    return currentState === 'collapsed' ? 'peek' : 'expanded';
  }
  if (velocityY > FLICK_VELOCITY || deltaY > DRAG_THRESHOLD) {
    return currentState === 'expanded' ? 'peek' : 'collapsed';
  }
  return currentState;
}

export function cycleNextSnapState(currentState: BottomSheetSnapState): BottomSheetSnapState {
  if (currentState === 'collapsed') return 'peek';
  if (currentState === 'peek') return 'expanded';
  return 'collapsed';
}

export interface PaginationSliceResult<T> {
  items: T[];
  currentPage: number;
  totalPages: number;
  totalItems: number;
  pageSize: number;
  startIndex: number;
  endIndex: number;
  pageNumbers: (number | 'ellipsis')[];
  hasPrev: boolean;
  hasNext: boolean;
}

export function buildPageNumberWindow(
  currentPage: number,
  totalPages: number,
  maxVisibleButtons: number = 5,
): (number | 'ellipsis')[] {
  if (totalPages <= 1) return [1];
  if (totalPages <= maxVisibleButtons + 2) {
    return Array.from({ length: totalPages }, (_, i) => i + 1);
  }

  const pages: (number | 'ellipsis')[] = [1];
  const half = Math.floor(maxVisibleButtons / 2);
  let start = Math.max(2, currentPage - half);
  let end = Math.min(totalPages - 1, currentPage + half);

  if (currentPage <= half + 2) {
    start = 2;
    end = Math.min(totalPages - 1, maxVisibleButtons);
  } else if (currentPage >= totalPages - half - 1) {
    start = Math.max(2, totalPages - maxVisibleButtons + 1);
    end = totalPages - 1;
  }

  if (start > 2) pages.push('ellipsis');
  for (let p = start; p <= end; p += 1) pages.push(p);
  if (end < totalPages - 1) pages.push('ellipsis');
  pages.push(totalPages);
  return pages;
}

export function computePaginationSlice<T>(
  items: readonly T[],
  requestedPage: number,
  pageSize: number,
): PaginationSliceResult<T> {
  const totalItems = items.length;
  const effectivePageSize = pageSize <= 0 ? Math.max(1, totalItems) : Math.max(1, Math.floor(pageSize));
  const totalPages = totalItems === 0 ? 1 : Math.ceil(totalItems / effectivePageSize);
  const currentPage = Math.min(Math.max(1, Math.floor(requestedPage || 1)), totalPages);

  if (totalItems === 0) {
    return {
      items: [],
      currentPage: 1,
      totalPages: 1,
      totalItems: 0,
      pageSize: effectivePageSize,
      startIndex: 0,
      endIndex: 0,
      pageNumbers: [1],
      hasPrev: false,
      hasNext: false,
    };
  }

  const offset = (currentPage - 1) * effectivePageSize;
  const sliced = items.slice(offset, offset + effectivePageSize);
  return {
    items: sliced,
    currentPage,
    totalPages,
    totalItems,
    pageSize: pageSize <= 0 ? 0 : effectivePageSize,
    startIndex: offset + 1,
    endIndex: offset + sliced.length,
    pageNumbers: buildPageNumberWindow(currentPage, totalPages),
    hasPrev: currentPage > 1,
    hasNext: currentPage < totalPages,
  };
}
