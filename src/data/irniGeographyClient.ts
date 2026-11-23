export interface IrniLegacyAlias {
  aliasId: string;
  legacySystemCode: string;
  legacyIdentifierValue: string;
  canonicalGeographicEntityId: string;
  aliasStatus: string;
  recordedAtRegistryRevision: number;
  resolutionEvidenceRef: string;
}

export interface IrniLegacyAliasSnapshot {
  registryRevision: number;
  items: IrniLegacyAlias[];
}

interface IrniLegacyAliasApiResponse {
  status: 'ok';
  registryRevision: number;
  items: IrniLegacyAlias[];
  source: 'IRNI_CANONICAL_REGISTRY';
}

export async function fetchIrniLegacyAliases(
  signal?: AbortSignal,
): Promise<IrniLegacyAliasSnapshot> {
  const response = await fetch(
    '/api/v1/geography/legacy-aliases?legacySystemCode=TEHRAN_RADAR',
    { headers: { accept: 'application/json' }, signal, cache: 'no-store' },
  );
  const body = await response.json().catch(() => null) as IrniLegacyAliasApiResponse | null;
  if (!response.ok || !body || body.status !== 'ok' ||
      body.source !== 'IRNI_CANONICAL_REGISTRY' ||
      !Number.isSafeInteger(body.registryRevision) || !Array.isArray(body.items)) {
    const code = body && typeof body === 'object' && 'code' in body ? String(body.code) : 'IRNI_LEGACY_ALIAS_API_UNAVAILABLE';
    throw new Error(code);
  }
  return {
    registryRevision: body.registryRevision,
    items: body.items.filter((item) =>
      item.legacySystemCode === 'TEHRAN_RADAR' &&
      item.aliasStatus === 'ACTIVE_COMPATIBILITY_ALIAS' &&
      typeof item.legacyIdentifierValue === 'string' &&
      typeof item.canonicalGeographicEntityId === 'string',
    ),
  };
}

/**
 * Attach only explicit IRNI legacy aliases. Never resolve by name, coordinates,
 * nearest-neighbor matching, or numeric-ID coincidence.
 */
export function attachIrniCanonicalIdentities<T extends { id: number }>(
  neighborhoods: readonly T[],
  aliases: readonly IrniLegacyAlias[],
  registryRevision: number | null,
  available = true,
): (T & {
  geographicEntityId: string | null;
  geographicIdentityResolutionStatus: 'RESOLVED' | 'UNRESOLVED' | 'UNAVAILABLE';
  geographicRegistryRevision: number | null;
})[] {
  if (!available || registryRevision === null) {
    return neighborhoods.map((item) => ({
      ...item,
      geographicEntityId: null,
      geographicIdentityResolutionStatus: 'UNAVAILABLE',
      geographicRegistryRevision: null,
    }));
  }

  const aliasByLegacyId = new Map<string, string>();
  for (const alias of aliases) {
    if (alias.legacySystemCode !== 'TEHRAN_RADAR' ||
        alias.aliasStatus !== 'ACTIVE_COMPATIBILITY_ALIAS') continue;
    if (aliasByLegacyId.has(alias.legacyIdentifierValue)) {
      throw new Error('DUPLICATE_IRNI_LEGACY_ALIAS');
    }
    aliasByLegacyId.set(alias.legacyIdentifierValue, alias.canonicalGeographicEntityId);
  }

  return neighborhoods.map((item) => {
    const geographicEntityId = aliasByLegacyId.get(String(item.id)) ?? null;
    return {
      ...item,
      geographicEntityId,
      geographicIdentityResolutionStatus: geographicEntityId ? 'RESOLVED' : 'UNRESOLVED',
      geographicRegistryRevision: registryRevision,
    };
  });
}
