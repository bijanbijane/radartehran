/**
 * @file server.ts
 * @description Root shim for backward compatibility (tests, npm run dev).
 * Canonical API application entry: `apps/api/server.ts` (`radartehran-api`).
 * OP-DEC-001 international currency parity: formatMillionTomanAsIntlCurrency (implemented in apps/api/server.ts).
 */
import './apps/api/server.ts';