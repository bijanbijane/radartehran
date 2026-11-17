/** @file src/shared/types/index.ts — Shared Domain-Agnostic Type Contracts */
export type Nullable<T> = T | null;
export type Optional<T> = T | undefined;
export type AsyncStatus = 'idle' | 'loading' | 'ready' | 'updating' | 'error';

export interface PaginatedResult<T> {
  readonly items: readonly T[];
  readonly page: number;
  readonly pageSize: number;
  readonly totalItems: number;
  readonly totalPages: number;
}

export interface ResultEnvelope<T, E = string> {
  readonly ok: boolean;
  readonly data?: T;
  readonly error?: E;
}
