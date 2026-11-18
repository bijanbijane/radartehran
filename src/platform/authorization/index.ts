/**
 * @file src/platform/authorization/index.ts
 * @description Public barrel export for Stage 25 Authorization & Access-Control Platform (RT-FE-USER-ACCESS-CONTROL-025).
 */

export * from './core/Permission';
export * from './core/Capability';
export * from './core/AccessContext';
export * from './core/AccessDecision';
export * from './core/AccessPolicy';

export * from './catalog/resourceRegistry';
export * from './catalog/permissionRegistry';
export * from './catalog/capabilityRegistry';

export * from './policies/rolePolicy';
export * from './policies/resourcePolicy';
export * from './policies/workspacePolicy';
export * from './policies/sensitiveActionPolicy';

export * from './cache/accessQueryKeys';
export * from './cache/accessCachePolicy';
export * from './cache/permissionInvalidation';

export * from './adapters/backendAccessAdapter';
export * from './adapters/legacyPermissionAdapter';

export * from './context/ActiveWorkspaceContext';
export * from './context/PermissionVersionContext';
export * from './context/AccessContextProvider';

export * from './guards/RouteAccessGuard';
export * from './guards/ActionAccessGuard';
export * from './guards/DataAccessGuard';
export * from './guards/FeatureAccessGuard';
