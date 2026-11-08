import { PropertyRightsError } from './sharesAndValidation';
import {
  CanonicalPropertyAssetCategory,
  IdentityConfidenceState,
  LegalPartyType,
  PartyReference,
  PropertyEntityReference,
} from './types';

export interface PropertyRegistryReferenceAdapter {
  validatePropertyReference(propertyId: string): Promise<PropertyEntityReference | null>;
}

export interface PartyIdentityReferenceAdapter {
  validatePartyReference(partyId: string): Promise<{
    partyId: string;
    partyType: LegalPartyType;
    identityConfidence: IdentityConfidenceState;
  } | null>;
}

export interface MediaEvidenceReferenceAdapter {
  verifyMediaObjectExists(mediaObjectId: string): Promise<{
    exists: boolean;
    mediaObjectId: string;
    mimeType?: string;
  }>;
}

export class ReadOnlyPropertyRegistryAdapter implements PropertyRegistryReferenceAdapter {
  private readonly knownProperties = new Map<string, PropertyEntityReference>();

  constructor(initialProperties: PropertyEntityReference[] = []) {
    for (const prop of initialProperties) {
      this.knownProperties.set(prop.propertyId, { ...prop });
    }
  }

  public registerKnownPropertyForTest(prop: PropertyEntityReference): void {
    this.knownProperties.set(prop.propertyId, { ...prop });
  }

  async validatePropertyReference(propertyId: string): Promise<PropertyEntityReference | null> {
    const trimmed = propertyId.trim();
    const found = this.knownProperties.get(trimmed);
    return found ? { ...found } : null;
  }

  public attemptProhibitedPropertyWrite(_propertyId: string): never {
    throw new PropertyRightsError(
      'CROSS_MODULE_WRITE_PROHIBITED',
      'Property Ownership & Rights Registry module is strictly prohibited from creating or mutating canonical Property Registry entities.',
      403,
    );
  }
}

export class ReadOnlyPartyIdentityAdapter implements PartyIdentityReferenceAdapter {
  private readonly knownParties = new Map<
    string,
    { partyId: string; partyType: LegalPartyType; identityConfidence: IdentityConfidenceState }
  >();

  constructor(
    initialParties: Array<{
      partyId: string;
      partyType: LegalPartyType;
      identityConfidence: IdentityConfidenceState;
    }> = [],
  ) {
    for (const party of initialParties) {
      this.knownParties.set(party.partyId, { ...party });
    }
  }

  public registerKnownPartyForTest(party: {
    partyId: string;
    partyType: LegalPartyType;
    identityConfidence: IdentityConfidenceState;
  }): void {
    this.knownParties.set(party.partyId, { ...party });
  }

  async validatePartyReference(partyId: string): Promise<{
    partyId: string;
    partyType: LegalPartyType;
    identityConfidence: IdentityConfidenceState;
  } | null> {
    const found = this.knownParties.get(partyId.trim());
    return found ? { ...found } : null;
  }

  public attemptProhibitedPartyWrite(_partyId: string): never {
    throw new PropertyRightsError(
      'CROSS_MODULE_WRITE_PROHIBITED',
      'Property Ownership & Rights Registry module is strictly prohibited from mutating Identity or Brokerage Organization records.',
      403,
    );
  }
}

export class ReadOnlyMediaReferenceAdapter implements MediaEvidenceReferenceAdapter {
  private readonly validMediaIds = new Set<string>();

  constructor(initialMediaIds: string[] = []) {
    for (const id of initialMediaIds) {
      this.validMediaIds.add(id);
    }
  }

  public registerMediaIdForTest(mediaObjectId: string): void {
    this.validMediaIds.add(mediaObjectId);
  }

  async verifyMediaObjectExists(mediaObjectId: string): Promise<{
    exists: boolean;
    mediaObjectId: string;
    mimeType?: string;
  }> {
    const exists = this.validMediaIds.has(mediaObjectId.trim());
    return {
      exists,
      mediaObjectId: mediaObjectId.trim(),
      mimeType: exists ? 'application/pdf' : undefined,
    };
  }
}

export async function assertValidPropertyAndPartyReferences(params: {
  propertyRef: PropertyEntityReference;
  partyRef: PartyReference;
  propertyAdapter?: PropertyRegistryReferenceAdapter;
  partyAdapter?: PartyIdentityReferenceAdapter;
}): Promise<{
  verifiedPropertyRef: PropertyEntityReference;
  verifiedPartyRef: PartyReference;
}> {
  const { propertyRef, partyRef, propertyAdapter, partyAdapter } = params;
  if (!propertyRef || !propertyRef.propertyId || propertyRef.propertyId.trim() === '') {
    throw new PropertyRightsError(
      'INVALID_PROPERTY_REFERENCE',
      'propertyRef.propertyId must be a non-empty canonical property identifier.',
      400,
    );
  }
  const validCategories: CanonicalPropertyAssetCategory[] = [
    'LAND_PARCEL',
    'BUILDING',
    'INDEPENDENT_UNIT',
    'COMMERCIAL_PREMISES',
    'STORAGE_OR_PARKING_APPENDIX',
    'MIXED_COMPLEX',
  ];
  if (!validCategories.includes(propertyRef.assetCategory)) {
    throw new PropertyRightsError(
      'INVALID_PROPERTY_REFERENCE',
      `Unsupported property assetCategory '${String(propertyRef.assetCategory)}'.`,
      400,
    );
  }

  let verifiedPropertyRef = structuredClone(propertyRef);
  if (propertyAdapter) {
    const canonicalProp = await propertyAdapter.validatePropertyReference(propertyRef.propertyId);
    if (!canonicalProp) {
      throw new PropertyRightsError(
        'INVALID_PROPERTY_REFERENCE',
        `Canonical property '${propertyRef.propertyId}' does not exist in PropertyRegistryReferenceAdapter.`,
        404,
      );
    }
    verifiedPropertyRef = {
      ...canonicalProp,
      registrationPlatePelakSabti:
        propertyRef.registrationPlatePelakSabti ?? canonicalProp.registrationPlatePelakSabti,
    };
  }

  if (!partyRef || !partyRef.partyId || partyRef.partyId.trim() === '') {
    throw new PropertyRightsError(
      'INVALID_PARTY_REFERENCE',
      'partyRef.partyId must be a non-empty canonical party identifier.',
      400,
    );
  }

  let verifiedPartyRef = structuredClone(partyRef);
  if (partyAdapter) {
    const canonicalParty = await partyAdapter.validatePartyReference(partyRef.partyId);
    if (!canonicalParty) {
      throw new PropertyRightsError(
        'INVALID_PARTY_REFERENCE',
        `Party '${partyRef.partyId}' does not exist in PartyIdentityReferenceAdapter.`,
        404,
      );
    }
    verifiedPartyRef = {
      ...partyRef,
      partyType: canonicalParty.partyType,
      identityConfidence: canonicalParty.identityConfidence,
    };
  }

  return { verifiedPropertyRef, verifiedPartyRef };
}
