/** @file src/platform/data/clientDataPolicy.ts — RT-DATA-001: Client must not mount the Firestore Web SDK */
/**
 * Durable product rule (OPERATOR_CONFIRMED 2026-11-21):
 * - Browser / PWA / SPA (`src/**`) must NOT import `firebase/firestore` or call client Firestore listeners.
 * - Persisted domain data flows through Express `/api/*` (server may use Firestore Admin or in-memory stores).
 * - Browser identity is a same-origin Cloudflare D1 session cookie; Firebase Auth tokens are not accepted.
 */
export const CLIENT_FIRESTORE_FORBIDDEN = true as const;
export const CLIENT_DATA_PLANE = 'express_api' as const;