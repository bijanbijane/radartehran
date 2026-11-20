/** @file src/platform/api/endpoints/index.ts — Canonical Backend API Endpoint Paths */
export const PLATFORM_API_ENDPOINTS = {
  marketPulse: '/api/market-pulse',
  systemHealth: '/api/system-health',
  accountExport: '/api/account/export-data',
  accountDelete: '/api/account/delete',
  valuationVerify: '/api/listing-verdict/comparables',
} as const;
