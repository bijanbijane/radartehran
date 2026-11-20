import type { SearchDocument } from '../models/search.types';
import { isAllowDemoSearchDataEnabled } from './searchDemoDataPolicy';

const NON_PUBLIC_SOURCE_STATUSES = new Set([
  'DRAFT',
  'PENDING_REVIEW',
  'REJECTED',
  'ARCHIVED',
  'EXPIRED',
  'DEMO',
]);

export function resolveDocumentSourceStatus(doc: SearchDocument): string {
  const fromMeta = doc.metadata?.sourceStatus;
  if (typeof fromMeta === 'string' && fromMeta.trim()) return fromMeta.trim();
  if (doc.visibility === 'DELETED') return 'ARCHIVED';
  return 'PUBLISHED';
}

export function isDocumentEligibleForPublicIndex(
  doc: SearchDocument,
  allowDemo = isAllowDemoSearchDataEnabled(),
): boolean {
  if (doc.visibility === 'DELETED') return false;
  const sourceStatus = resolveDocumentSourceStatus(doc);
  if (NON_PUBLIC_SOURCE_STATUSES.has(sourceStatus)) return false;
  const provenance = String(doc.metadata?.provenance ?? '');
  if (provenance === 'DEMO' && !allowDemo) return false;
  const verificationStatus = String(doc.metadata?.verificationStatus ?? '');
  if (verificationStatus === 'PENDING_REVIEW' || verificationStatus === 'REJECTED') return false;
  return true;
}