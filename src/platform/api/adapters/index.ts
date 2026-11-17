/** @file src/platform/api/adapters/index.ts — DTO-to-Domain Adapters */
export function adaptNullableArray<TDto, TDomain>(
  raw: readonly TDto[] | null | undefined,
  mapper: (item: TDto) => TDomain,
): TDomain[] {
  if (!Array.isArray(raw)) return [];
  return raw.map(mapper);
}
