/**
 * @file src/features/map/types/map.types.ts
 * @description Stage 15 (RT-UI-MAP-001) Main Map Experience & Stage 16 (RT-UI-LAYERS-001) Layer Architecture Types.
 */

/** Section 15.31 — Canonical Map Interaction Modes */
export type MapMode =
  | 'explore'
  | 'filter'
  | 'draw'
  | 'measure'
  | 'compare';

/** Section 15.6.1 & 15.31 — Right Context Panel Host Views */
export type MapPanelView =
  | 'explore'
  | 'layers'
  | 'filters'
  | 'selection'
  | 'compare';

/** Section 15.6.3 — Context Panel Collapse States (352px / 52px / 0px) */
export type MapPanelCollapseState = 'expanded' | 'compact' | 'closed';

/** Section 15.31 — Map Viewport Coordinates */
export interface MapViewport {
  latitude: number;
  longitude: number;
  zoom: number;
}

/** Section 15.31 — Central Map State Contract */
export interface MapState {
  cityId: string;
  viewport: MapViewport;
  searchedViewport: MapViewport;
  activeLayerIds: string[];
  panel: {
    view: MapPanelView;
    open: boolean;
    collapseState?: MapPanelCollapseState;
  };
  mode: MapMode;
  selectedFeature?: {
    type: 'neighborhood' | 'property' | 'amenity';
    id: string;
  };
  appliedFilters: Record<string, unknown>;
  draftFilters?: Record<string, unknown>;
  pendingViewportSearch: boolean;
}

/** Section 15.22 — Map Layer Geometry, Category & Quality Contracts */
export type MapLayerGeometry =
  | 'point'
  | 'line'
  | 'polygon'
  | 'raster';

export type MapLayerCategory =
  | 'base'
  | 'boundaries'
  | 'property'
  | 'amenity'
  | 'urban-analysis';

export type MapLayerQuality =
  | 'verified'
  | 'estimated'
  | 'incomplete'
  | 'stale'
  | 'unavailable';

export interface MapLayerConfig {
  id: string;
  title: string;
  description: string;
  category: MapLayerCategory;
  geometry: MapLayerGeometry;
  defaultVisible: boolean;
  selectable: boolean;
  opacityAdjustable: boolean;
  isSurfaceHeatmap?: boolean;
  minZoom?: number;
  maxZoom?: number;
  legendId?: string;
  sourceId: string;
  sourceLabelFa: string;
  quality: MapLayerQuality;
  updatedAt: string | null;
  requiresPermission?: string;
}

/** Section 15.8 — Dynamic Map Layer Legend Contract */
export interface MapLayerLegendSpec {
  legendId: string;
  layerId: string;
  indicatorTitleFa: string;
  unitFa: string;
  minNumericValue: number;
  maxNumericValue: number;
  lowLabelFa: string;
  highLabelFa: string;
  geographyScopeFa: string;
  periodLabelFa: string;
  stops: { labelFa: string; colorHex: string; symbol: string }[];
}

/** Section 15.13 — Spatial Drawing Tools Contract */
export type DrawingToolKind = 'point' | 'radius' | 'rectangle' | 'polygon';

export type DrawingLifecycleState =
  | 'ready'
  | 'drawing'
  | 'completed'
  | 'invalid'
  | 'validating'
  | 'applied'
  | 'cancelled';

export interface GeoPointWGS84 {
  lat: number;
  lng: number;
}

export interface PolygonValidationResult {
  valid: boolean;
  state: DrawingLifecycleState;
  vertexCount: number;
  areaSqKm: number;
  hasSelfIntersection: boolean;
  errorMessageFa?: string;
}

/** Section 15.14 — Geodesic Measurement Tool Contract */
export type MeasurementToolKind = 'linear_distance' | 'area' | 'radius' | 'perimeter';

export interface GeodesicMeasurementResult {
  kind: MeasurementToolKind;
  rawValueMetersOrSqm: number;
  formattedValueFa: string;
  unitFa: string;
  vertexCount: number;
}

/** Section 15.11 — Three-Level Zoom Clustering Contract */
export type ClusterZoomTier = 'low_zoom_cluster' | 'mid_zoom_group' | 'high_zoom_markers';

/** Section 15.16 — Viewport Area Search Status Copy */
export type AreaSearchStatusKind =
  | 'viewport_moved'
  | 'searching'
  | 'updated'
  | 'empty'
  | 'error'
  | 'partial';

/** Section 15.27 — Privacy-Safe Map Telemetry Events */
export type MapTelemetryEventName =
  | 'map_open'
  | 'map_layer_toggle'
  | 'map_filter_apply'
  | 'map_search_area'
  | 'map_feature_select'
  | 'map_cluster_open'
  | 'map_draw_complete'
  | 'map_compare_start'
  | 'map_panel_toggle';

export interface PrivacySafeMapTelemetryEvent {
  event: MapTelemetryEventName;
  timestampIso: string;
  module: 'map_workspace';
  mode: MapMode;
  layerId?: string;
  featureType?: 'neighborhood' | 'property' | 'amenity';
  durationMs?: number;
  outcome: 'success' | 'cancelled' | 'error';
  piiAndExactTrackScrubbed: true;
}

/** Section 15.28 — 22 Map UI Test Scenarios (MAP-UI-01..22) */
export interface MapUiTestScenario {
  id: string;
  scenarioFa: string;
  expectedOutcomeFa: string;
  verified: boolean;
}

/** Section 15.29 — 19 Phased Map Implementation Packages (MAP-01..19) */
export interface MapImplementationPackage {
  id: string;
  phase: 1 | 2 | 3 | 4;
  titleEn: string;
  deliverableFa: string;
  status: 'implemented';
}

/** Stage 16 (RT-UI-LAYERS-001) — 16 Layer Management Architecture Topics */
export interface Stage16LayerArchitectureItem {
  id: string;
  index: number;
  topicFa: string;
  publicationPolicy: 'public_spatial' | 'aggregated_only' | 'restricted_internal';
}
