import type { SearchDocument } from '../../../src/features/search/models/search.types';
import { DEMO_ALL_CITY_SEARCH_DOCUMENTS } from '../../../src/features/search/fixtures/demoSearchDocuments';
import { isAllowDemoSearchDataEnabled } from './searchIndexPolicy';
import { isDocumentEligibleForPublicIndex } from './publicIndexEligibility';

export interface SearchDocumentSource {
  loadPublishableDocuments(): Promise<SearchDocument[]>;
}

export function loadBootstrapDocumentsSync(): SearchDocument[] {
  const allowDemo = isAllowDemoSearchDataEnabled();
  const raw = allowDemo ? [...DEMO_ALL_CITY_SEARCH_DOCUMENTS] : [];
  return raw.filter((doc) => isDocumentEligibleForPublicIndex(doc, allowDemo));
}

export class ProductionSearchDocumentSource implements SearchDocumentSource {
  async loadPublishableDocuments(): Promise<SearchDocument[]> {
    return loadBootstrapDocumentsSync();
  }
}