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
    splitShell: `mt-[136px] h-[calc(100%-136px)] rounded-t-3xl border-t ${SPLIT_WIDTH}`,
  };
}
