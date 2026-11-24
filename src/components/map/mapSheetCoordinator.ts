/**
 * @file src/components/map/mapSheetCoordinator.ts
 * Pure state machine coordinating single-sheet mutual exclusion on mobile/tablet (<1024px)
 * and unified right-panel mode ('list' | 'inspector') on desktop (>=1024px).
 */

export type MobileMapSheetId = 'none' | 'list' | 'inspector' | 'filter' | 'tools' | 'legend';
export type DesktopMapPanelMode = 'list' | 'inspector' | 'collapsed';

export interface MapWorkspacePanelState {
  desktopPanelMode: DesktopMapPanelMode;
  mobileActiveSheet: MobileMapSheetId;
}

export type MapPanelAction =
  | { type: 'OPEN_LIST'; isDesktop: boolean }
  | { type: 'OPEN_INSPECTOR'; isDesktop: boolean }
  | { type: 'OPEN_FILTER'; isDesktop: boolean }
  | { type: 'OPEN_TOOLS'; isDesktop: boolean }
  | { type: 'OPEN_LEGEND'; isDesktop: boolean }
  | { type: 'COLLAPSE_PANEL'; isDesktop: boolean }
  | { type: 'CLOSE_ALL' }
  | { type: 'SELECT_HOOD_FROM_MAP'; isDesktop: boolean }
  | { type: 'SELECT_HOOD_FROM_LIST'; isDesktop: boolean };

export function resolveInitialSidebarOpen(viewportWidth: number, storedPreference: string | null): boolean {
  if (!Number.isFinite(viewportWidth) || viewportWidth < 1024) {
    return false;
  }
  return storedPreference !== '0';
}

export function createInitialMapPanelState(
  viewportWidth: number,
  storedPreference: string | null,
): MapWorkspacePanelState {
  const sidebarOpen = resolveInitialSidebarOpen(viewportWidth, storedPreference);
  return {
    desktopPanelMode: sidebarOpen ? 'list' : 'collapsed',
    mobileActiveSheet: 'none',
  };
}

export function reduceMapPanelState(
  state: MapWorkspacePanelState,
  action: MapPanelAction,
): MapWorkspacePanelState {
  switch (action.type) {
    case 'CLOSE_ALL':
      return {
        ...state,
        mobileActiveSheet: 'none',
      };
    case 'COLLAPSE_PANEL':
      return action.isDesktop
        ? { ...state, desktopPanelMode: 'collapsed' }
        : { ...state, mobileActiveSheet: 'none' };
    case 'OPEN_LIST':
      return action.isDesktop
        ? { ...state, desktopPanelMode: 'list' }
        : { ...state, mobileActiveSheet: state.mobileActiveSheet === 'list' ? 'none' : 'list' };
    case 'OPEN_INSPECTOR':
      return action.isDesktop
        ? { ...state, desktopPanelMode: 'inspector' }
        : { ...state, mobileActiveSheet: state.mobileActiveSheet === 'inspector' ? 'none' : 'inspector' };
    case 'OPEN_FILTER':
      return {
        ...state,
        mobileActiveSheet: state.mobileActiveSheet === 'filter' ? 'none' : 'filter',
      };
    case 'OPEN_TOOLS':
      return {
        ...state,
        mobileActiveSheet: state.mobileActiveSheet === 'tools' ? 'none' : 'tools',
      };
    case 'OPEN_LEGEND':
      return {
        ...state,
        mobileActiveSheet: state.mobileActiveSheet === 'legend' ? 'none' : 'legend',
      };
    case 'SELECT_HOOD_FROM_MAP':
      return action.isDesktop
        ? { ...state, desktopPanelMode: 'inspector', mobileActiveSheet: 'none' }
        : { ...state, mobileActiveSheet: 'none' };
    case 'SELECT_HOOD_FROM_LIST':
      return action.isDesktop
        ? { ...state, desktopPanelMode: 'list', mobileActiveSheet: 'none' }
        : { ...state, mobileActiveSheet: 'none' };
    default:
      return state;
  }
}
