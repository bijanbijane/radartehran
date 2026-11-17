/** @file src/design-system/tokens/zIndex.ts — Central z-index Hierarchy Registry */
import { ELEVATION_LEVELS } from '../spacingGeometrySystem';

export const RADAR_ELEVATION_LAYERS = ELEVATION_LEVELS;

export const DESIGN_Z_INDEX_LAYERS = {
  mapCanvas: 0,
  mapOverlayControls: 20,
  inspectorDrawer: 30,
  floatingToolbar: 40,
  globalHeader: 45,
  megaMenuAndPopovers: 50,
  modalBackdrop: 60,
  modalDialog: 70,
  modal: 70,
  toastAndAlertBanner: 80,
  impersonationSecurityBanner: 90,
  criticalSystemTrap: 100,
} as const;

export const Z_INDEX_TOKENS = DESIGN_Z_INDEX_LAYERS;

export type DesignZIndexLayerKey = keyof typeof DESIGN_Z_INDEX_LAYERS;

export function getZIndexToken(layer: DesignZIndexLayerKey): number {
  return DESIGN_Z_INDEX_LAYERS[layer];
}
