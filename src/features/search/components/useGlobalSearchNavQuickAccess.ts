import { useMemo } from 'react';
import { searchNavigationDiscovery } from '../../../navigation/discovery/navigationDiscoveryCatalog';
import { useNavigationVisibilityContext } from '../../../navigation/hooks/useNavigationVisibilityContext';

export function useGlobalSearchNavQuickAccess(rawQuery: string) {
  const visibilityCtx = useNavigationVisibilityContext();
  return useMemo(
    () =>
      rawQuery.trim().length >= 2
        ? searchNavigationDiscovery(rawQuery, visibilityCtx).pages.slice(0, 5)
        : [],
    [rawQuery, visibilityCtx],
  );
}