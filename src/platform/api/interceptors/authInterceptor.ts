/** @file src/platform/api/interceptors/authInterceptor.ts — Cookie Session & Correlation Header Interceptor */
import { generateCorrelationId } from '../../../shared/utilities';

export interface AuthTokenSupplier {
  getAccessToken(): Promise<string | null>;
  refreshTokenSingleFlight(): Promise<string | null>;
  getCurrentUserId(): string | null;
  getCurrentWorkspaceId(): string | null;
}

let activeAuthSupplier: AuthTokenSupplier = {
  getAccessToken: async () => null,
  refreshTokenSingleFlight: async () => null,
  getCurrentUserId: () => null,
  getCurrentWorkspaceId: () => null,
};

export function registerApiAuthTokenSupplier(supplier: AuthTokenSupplier): void {
  activeAuthSupplier = supplier;
}

export function getRegisteredApiAuthTokenSupplier(): AuthTokenSupplier {
  return activeAuthSupplier;
}

export async function attachAuthAndCorrelationHeaders(
  inputHeaders: Readonly<Record<string, string>> = {},
  explicitCorrelationId?: string,
  idempotencyKey?: string,
): Promise<{ readonly headers: Record<string, string>; readonly correlationId: string }> {
  const correlationId = explicitCorrelationId || generateCorrelationId('req');
  const headers: Record<string, string> = {
    Accept: 'application/json',
    'X-Correlation-Id': correlationId,
    ...inputHeaders,
  };

  if (idempotencyKey) {
    headers['Idempotency-Key'] = idempotencyKey;
  }

  const wsId = activeAuthSupplier.getCurrentWorkspaceId();
  if (wsId) {
    headers['X-Workspace-Id'] = wsId;
  }


  return { headers, correlationId };
}
