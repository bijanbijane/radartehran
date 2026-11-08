/**
 * @file server/modules/trust-safety/trustSafetyAdapters.ts
 * @description Cross-module enforcement dispatch adapters.
 * Invariant: Trust & Safety requests enforcement; owning modules validate and apply it.
 */

import type { EnforcementDecisionRecord } from './trustSafetyTypes';

export interface EnforcementExecutionResult {
  readonly accepted: boolean;
  readonly applied: boolean;
  readonly externalReferenceId?: string;
  readonly failureReasonFa?: string;
}

export interface CrossModuleEnforcementAdapter {
  dispatchEnforcementRequest(decision: EnforcementDecisionRecord): Promise<EnforcementExecutionResult>;
  reverseEnforcementRequest(decision: EnforcementDecisionRecord, reasonFa: string): Promise<EnforcementExecutionResult>;
}

export class MockCrossModuleEnforcementAdapter implements CrossModuleEnforcementAdapter {
  public readonly dispatchedDecisions: EnforcementDecisionRecord[] = [];
  public readonly reversedDecisions: { decisionId: string; reasonFa: string }[] = [];
  private shouldFail = false;

  public setSimulateFailure(fail: boolean): void {
    this.shouldFail = fail;
  }

  public async dispatchEnforcementRequest(decision: EnforcementDecisionRecord): Promise<EnforcementExecutionResult> {
    this.dispatchedDecisions.push(decision);
    if (this.shouldFail) {
      return {
        accepted: false,
        applied: false,
        failureReasonFa: 'ماژول مقصد درخواست اعمال محدودیت را رد کرد.',
      };
    }
    return {
      accepted: true,
      applied: true,
      externalReferenceId: `mod_ack_${decision.id}`,
    };
  }

  public async reverseEnforcementRequest(
    decision: EnforcementDecisionRecord,
    reasonFa: string,
  ): Promise<EnforcementExecutionResult> {
    this.reversedDecisions.push({ decisionId: decision.id, reasonFa });
    return {
      accepted: true,
      applied: true,
      externalReferenceId: `mod_rev_${decision.id}`,
    };
  }
}
