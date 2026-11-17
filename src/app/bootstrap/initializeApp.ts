import { runAppBootstrap, BootstrapDiagnostic } from './bootstrap';
import { bootstrapAuthSession, AuthUserSnapshot, AuthBootstrapResult } from '../../platform/auth';

export interface AppInitializationResult {
  bootstrap: BootstrapDiagnostic;
  auth: AuthBootstrapResult;
}

export async function initializeApp(initialUser: AuthUserSnapshot | null = null): Promise<AppInitializationResult> {
  const bootstrap = runAppBootstrap();
  const auth = await bootstrapAuthSession(initialUser);
  return { bootstrap, auth };
}
