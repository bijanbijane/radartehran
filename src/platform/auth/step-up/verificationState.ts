import { SENSITIVE_ACTION_POLICIES, SensitiveActionId } from './sensitiveActions';

export interface StepUpVerificationRecord {
  userId: string;
  verifiedAt: number;
  method: 'otp' | 'password' | 'hardware_key';
  actionScope?: SensitiveActionId | 'all';
}

export class VerificationStateStore {
  private records = new Map<string, StepUpVerificationRecord>();

  recordVerification(record: StepUpVerificationRecord): void {
    this.records.set(record.userId, record);
  }

  isVerifiedForAction(userId: string, actionId: SensitiveActionId, now = Date.now()): boolean {
    const record = this.records.get(userId);
    if (!record) return false;
    const policy = SENSITIVE_ACTION_POLICIES[actionId];
    if (!policy) return false;
    if (record.actionScope && record.actionScope !== 'all' && record.actionScope !== actionId) {
      return false;
    }
    return now - record.verifiedAt <= policy.maxVerificationAgeMs;
  }

  clearVerification(userId?: string): void {
    if (userId) {
      this.records.delete(userId);
    } else {
      this.records.clear();
    }
  }
}

let defaultVerificationStore: VerificationStateStore | null = null;

export function getVerificationStateStore(): VerificationStateStore {
  if (!defaultVerificationStore) {
    defaultVerificationStore = new VerificationStateStore();
  }
  return defaultVerificationStore;
}
