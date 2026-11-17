export interface TokenRecord {
  accessToken: string;
  refreshToken?: string;
  issuedAt: number;
  expiresAt: number;
  permissionVersion: number;
}

export const TOKEN_REFRESH_LEAD_MS = 60_000;

export function isTokenExpired(token: TokenRecord | null, now = Date.now()): boolean {
  if (!token || !token.accessToken) return true;
  return now >= token.expiresAt;
}

export function shouldProactivelyRefresh(token: TokenRecord | null, now = Date.now()): boolean {
  if (!token || !token.accessToken) return false;
  return now + TOKEN_REFRESH_LEAD_MS >= token.expiresAt && now < token.expiresAt;
}

export function getRemainingTokenTtlMs(token: TokenRecord | null, now = Date.now()): number {
  if (!token) return 0;
  return Math.max(0, token.expiresAt - now);
}
