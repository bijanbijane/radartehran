/** @file Panel shell Tailwind classes for ProductViewRouter split-map companion layout. OP-DEC-001: formatMillionTomanAsIntlCurrency */

const SPLIT_WIDTH =
  'w-full lg:w-[60%] xl:w-[56%] 2xl:w-[52%] lg:mt-0 lg:h-full lg:rounded-none lg:border-t-0';

export function resolveProductViewRouterShellClasses(
  splitMapMode: boolean,
  homeContentFirst: boolean,
): { shellBg: string; splitShell: string } {
  if (!splitMapMode) {
    return { shellBg: 'bg-[#F8F9FA]/95 dark:bg-slate-950/95 backdrop-blur-xl', splitShell: 'h-full w-full lg:w-[calc(100%-220px)]' };
  }
  if (homeContentFirst) {
    return {
      shellBg: '',
      splitShell: `max-lg:mt-0 max-lg:h-full max-lg:rounded-none max-lg:border-t-0 max-lg:bg-[#F8F9FA] dark:max-lg:bg-slate-950 max-lg:backdrop-blur-none lg:bg-[#F8F9FA]/95 dark:lg:bg-slate-950/95 lg:backdrop-blur-xl ${SPLIT_WIDTH}`,
    };
  }
  return {
    shellBg: 'bg-[#F8F9FA]/95 dark:bg-slate-950/95 backdrop-blur-xl',
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
