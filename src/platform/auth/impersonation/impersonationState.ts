import { AppRole } from '../authorization/roleResolver';

export interface ImpersonationSession {
  operatorUid: string;
  operatorEmail: string;
  targetUserUid: string;
  targetUserDisplayName: string;
  targetRole: AppRole;
  reason: string;
  startedAt: number;
  expiresAt: number;
  readOnlyFinancials: boolean;
}

export class ImpersonationManager {
  private session: ImpersonationSession | null = null;

  startImpersonation(session: Omit<ImpersonationSession, 'startedAt' | 'expiresAt' | 'readOnlyFinancials'> & { ttlMs?: number }): ImpersonationSession {
    const now = Date.now();
    const ttl = session.ttlMs ?? 30 * 60 * 1000;
    this.session = {
      operatorUid: session.operatorUid,
      operatorEmail: session.operatorEmail,
      targetUserUid: session.targetUserUid,
      targetUserDisplayName: session.targetUserDisplayName,
      targetRole: session.targetRole,
      reason: session.reason,
      startedAt: now,
      expiresAt: now + ttl,
      readOnlyFinancials: true,
    };
    return this.session;
  }

  stopImpersonation(): void {
    this.session = null;
  }

  getActiveSession(now = Date.now()): ImpersonationSession | null {
    if (!this.session) return null;
    if (now >= this.session.expiresAt) {
      this.session = null;
      return null;
    }
    return this.session;
  }

  isImpersonating(now = Date.now()): boolean {
    return this.getActiveSession(now) !== null;
  }
}

let defaultImpersonationManager: ImpersonationManager | null = null;

export function getImpersonationManager(): ImpersonationManager {
  if (!defaultImpersonationManager) {
    defaultImpersonationManager = new ImpersonationManager();
  }
  return defaultImpersonationManager;
}
