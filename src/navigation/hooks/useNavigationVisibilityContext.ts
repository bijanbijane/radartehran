import { useMemo } from 'react';
import { useAppAuth } from '../../app/providers/AuthProvider';
import { buildNavigationVisibilityContext } from '../registry/navigationPermissionBridge';
import type { NavigationVisibilityContext } from '../registry/navigationVisibility';

export function useNavigationVisibilityContext(): NavigationVisibilityContext {
  const { state, permissions, activeRole } = useAppAuth();
  return useMemo(
    () => buildNavigationVisibilityContext({ state, permissions, activeRole }),
    [state, permissions, activeRole],
  );
}