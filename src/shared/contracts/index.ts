/** @file src/shared/contracts/index.ts — Shared Cross-Module Contracts */
export interface CorrelationMetadata {
  readonly correlationId: string;
  readonly timestampIso: string;
}

export interface FeaturePublicContract<TId extends string = string> {
  readonly moduleId: TId;
  readonly version: string;
}

export type Result<T, E = string> =
  | { readonly ok: true; readonly value: T }
  | { readonly ok: false; readonly error: E };

export function okResult<T>(value: T): Result<T, never> {
  return { ok: true, value };
}

export function errResult<E = string>(error: E): Result<never, E> {
  return { ok: false, error };
}
