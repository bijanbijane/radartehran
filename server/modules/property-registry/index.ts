export * from './types';
export * from './lifecycleAndValidation';
export * from './duplicateAndRelationshipEngine';
export * from './service';
export * from './routes';
export * from './contracts/externalAdapters';
export * from './services/propertyRegistryContext';

import type { PropertyRegistryServiceDependencies } from './services/propertyRegistryContext';
import { createPropertyRegistryCoreOperations } from './services/propertyRegistryCoreService';
import { createPropertyRegistryGraphAndIdentifiersOperations } from './services/propertyRegistryGraphAndIdentifiersService';
import { createPropertyRegistryLineageAndMergeOperations } from './services/propertyRegistryLineageAndMergeService';

export function createPropertyRegistryService(deps: PropertyRegistryServiceDependencies) {
  return {
    ...createPropertyRegistryCoreOperations(deps),
    ...createPropertyRegistryGraphAndIdentifiersOperations(deps),
    ...createPropertyRegistryLineageAndMergeOperations(deps),
  };
}

