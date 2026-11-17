/** @file src/platform/api/endpoints/index.ts — Canonical Backend API Endpoint Paths */
export const PLATFORM_API_ENDPOINTS = {
  marketPulse: '/api/market-pulse',
  systemHealth: '/api/system-health',
  accountExport: '/api/account/export',
  accountDelete: '/api/account/delete',
  casperHubNotes: '/api/casper-hub/notes',
  casperHubShortlist: '/api/casper-hub/shortlist',
  valuationVerify: '/api/listing-verdict',
} as const;
