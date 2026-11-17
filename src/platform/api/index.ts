/** @file src/platform/api/index.ts — Unified Platform API Layer Barrel */
export * from './client/apiError';
export * from './client/requestConfig';
export * from './client/responseParser';
export * from './client/apiClient';
export * from './interceptors/authInterceptor';
export * from './interceptors/errorInterceptor';
export * from './contracts';
export * from './adapters';
export * from './endpoints';
