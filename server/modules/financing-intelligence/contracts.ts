/**
 * External Integration Adapters & Contracts for Financing Intelligence
 * (`server/modules/financing-intelligence/contracts.ts`)
 * Exclusive ownership: `server/modules/financing-intelligence/`
 */

import { FinancingDomainEvent } from './types.js';

export interface PropertyValuationAdapter {
  getAuthoritativeValuation(propertyId: string): Promise<{
    estimatedValue: number;
    currency: string;
    valuationDateIso: string;
    methodology: string;
  } | null>;
}

export interface PropertyRegistryReferenceAdapter {
  verifyPropertyExists(propertyId: string): Promise<boolean>;
  getPropertyCategory(propertyId: string): Promise<string | null>;
}

export interface GeographyJurisdictionAdapter {
  verifyJurisdictionSupported(jurisdictionCode: string): Promise<boolean>;
  getDefaultCurrencyForJurisdiction(jurisdictionCode: string): Promise<string | null>;
}

export interface FinancingEventOutboxPublisher {
  publish(event: FinancingDomainEvent): Promise<void>;
}
