/**
 * @file src/platform/entity-detail/core/EntityDetailTypes.ts
 * @description Canonical EntityDetailModel, Field-Level DataConfidence, GeoPoint, Polygon Geometry, and Lifecycle States for Stage 7 (RT-FE-REBUILD-ENTITY-DETAIL-007).
 */

export type EntityType =
  | 'property'
  | 'listing'
  | 'building'
  | 'neighborhood';

export type DataConfidence =
  | 'verified'
  | 'estimated'
  | 'unverified'
  | 'conflicting'
  | 'unknown';

export interface EntityDetailField<T = unknown> {
  value: T | null;
  unit?: string;

  confidence: DataConfidence;

  sourceId?: string;
  observedAt?: string;
  updatedAt?: string;
  limitationNoteFa?: string;
}

export interface EntityGeoPoint {
  latitude: number;
  longitude: number;
  precision:
    | 'exact'
    | 'building'
    | 'street'
    | 'neighborhood'
    | 'approximate';
}

export interface NeighborhoodGeometry {
  type: 'Polygon' | 'MultiPolygon';
  coordinates: number[][][] | number[][][][];
  coordinateReferenceSystem: 'EPSG:4326';
}

export type ListingLifecycleState =
  | 'DRAFT'
  | 'PENDING_REVIEW'
  | 'REJECTED'
  | 'PUBLISHED'
  | 'EXPIRED'
  | 'REMOVED'
  | 'SUSPENDED';

export type PropertyListingMatchConfidence = 'EXACT_VERIFIED' | 'PROBABLE_MATCH' | 'UNLINKED';

export type EntityDetailPageStatus =
  | 'Initial'
  | 'Loading'
  | 'Success'
  | 'Partial'
  | 'NotFound'
  | 'Restricted'
  | 'Deleted'
  | 'Archived'
  | 'Stale'
  | 'Conflict'
  | 'Error';

export interface EntityDetailMediaItem {
  id: string;
  type: 'image' | 'video' | 'pdf' | 'document';
  url: string;
  thumbnailUrl?: string;
  aspectRatio?: string;
  titleFa?: string;
  isPrivate: boolean;
  exifScrubbed: boolean;
}

export interface EntityDetailModel {
  id: string;
  entityType: EntityType;

  title: string;
  canonicalPath: string;

  cityId?: string;
  cityNameFa?: string;
  neighborhoodId?: string;
  neighborhoodNameFa?: string;

  pageStatus?: EntityDetailPageStatus;

  geoPoint?: EntityGeoPoint | null;
  geometry?: NeighborhoodGeometry | null;

  fields: Record<string, EntityDetailField>;

  media?: EntityDetailMediaItem[];

  relatedEntities?: Array<{
    id: string;
    entityType: EntityType;
    title: string;
    canonicalPath: string;
    matchStatus?: PropertyListingMatchConfidence;
  }>;

  capabilities: {
    canEdit: boolean;
    canReport: boolean;
    canFavorite: boolean;
    canCompare: boolean;
    canShare: boolean;
    canViewPrivateData?: boolean;
  };

  timestamps: {
    createdAt?: string;
    updatedAt?: string;
    lastVerifiedAt?: string;
    publishedAt?: string;
    lastObservedAt?: string;
  };
}
