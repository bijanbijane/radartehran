/**
 * @file src/features/search/index.ts
 * @description Barrel export preserving existing Stage 27/30 search exports and adding Stage 5 Unified Search modules.
 */

export * from './models/search.types';
export * from './services/searchNormalizerAndPlanner';
export * from './services/searchOrchestratorEngine';
export * from './services/searchWorkspaceService';
export * from './services/searchDomainAdapters';
export * from './components/GlobalSearchWorkspace';
export * from './components/SearchResultsAndDiscoveryGrid';

export * from './adapters/searchBackendAdapter';
export * from './state/searchStateStore';
export * from './hooks/useUnifiedSearch';
export * from './pages/UnifiedSearchPage';
