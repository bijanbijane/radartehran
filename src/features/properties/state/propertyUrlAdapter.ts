/** @file src/features/properties/state/propertyUrlAdapter.ts — Privacy-Safe Property URL Sync & Telemetry */
import type { AppliedPropertyFilters } from '../filters/PropertyFilterDraft';

export function serializePropertyFiltersToQuery(f: AppliedPropertyFilters): string {
  const params = new URLSearchParams();
  if (f.transactionType !== 'all') params.set('tx', f.transactionType);
  if (f.propertyType !== 'all') params.set('ptype', f.propertyType);
  if (f.sortBy !== 'relevance') params.set('sort', f.sortBy);
  if (f.verifiedOnly) params.set('verified', '1');
  if (f.onlySelectedHood) params.set('hoodOnly', '1');
  return params.toString();
}

export function trackPropertyEvent(
  eventName:
    | 'property_filter_applied'
    | 'property_detail_opened'
    | 'property_saved_toggled'
    | 'property_compare_toggled'
    | 'property_submission_step'
    | 'property_submitted'
    | 'property_reported',
  meta: Record<string, string | number | boolean> = {},
): void {
  // Privacy-safe structured telemetry: never transmit raw phone/PII
  if (typeof window !== 'undefined' && typeof CustomEvent === 'function') {
    window.dispatchEvent(new CustomEvent('radar:property-telemetry', { detail: { eventName, ...meta } }));
  }
}
