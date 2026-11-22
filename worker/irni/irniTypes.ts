/**
 * @file worker/irni/irniTypes.ts
 * @description Strict concrete TypeScript contracts for the Read-Only Server-to-Server IRNI
 * Neighborhood Reference Client (ZERO `unknown`/`any` payload types, ZERO D1 bindings, ZERO writes).
 */

export interface IrniProvince {
  readonly id: string;
  readonly code: string;
  readonly nameFa: string;
  readonly nameEn: string | null;
}

export interface IrniCounty {
  readonly id: string;
  readonly provinceId: string;
  readonly code: string;
  readonly nameFa: string;
  readonly nameEn: string | null;
}

export interface IrniCity {
  readonly id: string;
  readonly provinceId: string;
  readonly countyId: string;
  readonly code: string;
  readonly nameFa: string;
  readonly nameEn: string | null;
  readonly centerLat: number | null;
  readonly centerLng: number | null;
}

export interface IrniNeighborhood {
  readonly id: string;
  readonly cityId: string;
  readonly countyId: string | null;
  readonly provinceId: string | null;
  readonly districtCode: string | null;
  readonly nameFa: string;
  readonly nameEn: string | null;
  readonly slug: string | null;
  readonly centerLat: number | null;
  readonly centerLng: number | null;
  readonly populationEstimate: number | null;
  readonly updatedAtIso: string | null;
}

export interface IrniPaginationParams {
  readonly page?: number;
  readonly pageSize?: number;
  readonly cursor?: string;
}

export interface IrniPaginationMeta {
  readonly page: number;
  readonly pageSize: number;
  readonly totalItems: number;
  readonly totalPages: number;
  readonly nextCursor: string | null;
}

export interface IrniProvenanceMeta {
  readonly source: 'IRNI';
  readonly contractVersion: string;
  readonly fetchedAtIso: string;
  readonly expiresAtIso: string;
  readonly cacheStatus: 'HIT' | 'MISS' | 'STALE';
}

export interface IrniPaginatedData<TItem> {
  readonly items: readonly TItem[];
  readonly pagination: IrniPaginationMeta;
  readonly provenance: IrniProvenanceMeta;
}

export interface IrniSingleData<TItem> {
  readonly item: TItem;
  readonly provenance: IrniProvenanceMeta;
}

export type IrniClientErrorCode =
  | 'BLOCKED_EXTERNAL_IRNI_CONTRACT'
  | 'IRNI_CIRCUIT_OPEN'
  | 'IRNI_REQUEST_TIMEOUT'
  | 'IRNI_UPSTREAM_ERROR'
  | 'IRNI_UNAUTHORIZED'
  | 'IRNI_NOT_FOUND'
  | 'IRNI_SCHEMA_VALIDATION_FAILED'
  | 'IRNI_STALE_DATA_REJECTED'
  | 'IRNI_INVALID_PARAMETERS';

export interface IrniClientFailure {
  readonly ok: false;
  readonly statusCode: 400 | 404 | 502 | 503 | 504;
  readonly code: IrniClientErrorCode;
  readonly messageFa: string;
  readonly retryable: boolean;
  readonly requiredExternalPrerequisites?: readonly string[];
}

export type IrniClientResult<TData> =
  | { readonly ok: true; readonly data: TData }
  | IrniClientFailure;

export interface NeighborhoodReferenceClient {
  getProvinces(params?: IrniPaginationParams): Promise<IrniClientResult<IrniPaginatedData<IrniProvince>>>;
  getCounties(
    params: IrniPaginationParams & { readonly provinceId: string },
  ): Promise<IrniClientResult<IrniPaginatedData<IrniCounty>>>;
  getCities(
    params: IrniPaginationParams & { readonly countyId?: string; readonly provinceId?: string },
  ): Promise<IrniClientResult<IrniPaginatedData<IrniCity>>>;
  getNeighborhoods(
    params: IrniPaginationParams & { readonly cityId: string; readonly districtCode?: string },
  ): Promise<IrniClientResult<IrniPaginatedData<IrniNeighborhood>>>;
  getNeighborhoodById(id: string): Promise<IrniClientResult<IrniSingleData<IrniNeighborhood>>>;
}
