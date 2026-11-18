/**
 * @file src/platform/entity-detail/state/EntityDetailRequestManager.ts
 * @description Coordinates in-flight Entity Detail requests with AbortController cancellation so switching entities never overwrites newer state (Stage 7).
 */

import type { EntityDetailModel, EntityType } from '../core/EntityDetailTypes';

export interface EntityDetailFetchRequest {
  entityType: EntityType;
  entityId: string;
  workspaceId: string;
  permissionVersion: number;
}

export interface EntityDetailFetchOutcome {
  requestId: number;
  aborted: boolean;
  model: EntityDetailModel | null;
  httpStatus?: number;
  errorMessageFa?: string;
}

export class EntityDetailRequestManager {
  private requestCounter = 0;
  private activeAbortController: AbortController | null = null;
  private activeRequestKey: string | null = null;

  public async executeFetch(
    request: EntityDetailFetchRequest,
    fetcher: (req: EntityDetailFetchRequest, signal: AbortSignal) => Promise<EntityDetailModel>
  ): Promise<EntityDetailFetchOutcome> {
    if (this.activeAbortController) {
      this.activeAbortController.abort();
    }

    const requestId = ++this.requestCounter;
    const controller = new AbortController();
    this.activeAbortController = controller;
    const reqKey = `${request.workspaceId}:v${request.permissionVersion}:${request.entityType}:${request.entityId}`;
    this.activeRequestKey = reqKey;

    try {
      const model = await fetcher(request, controller.signal);
      if (controller.signal.aborted || requestId !== this.requestCounter) {
        return {
          requestId,
          aborted: true,
          model: null,
        };
      }
      return {
        requestId,
        aborted: false,
        model,
        httpStatus: 200,
      };
    } catch (err: unknown) {
      if (controller.signal.aborted || requestId !== this.requestCounter) {
        return {
          requestId,
          aborted: true,
          model: null,
        };
      }
      const status = typeof (err as { status?: number })?.status === 'number' ? (err as { status: number }).status : 500;
      const msg = err instanceof Error ? err.message : 'خطا در دریافت اطلاعات موجودیت';
      return {
        requestId,
        aborted: false,
        model: null,
        httpStatus: status,
        errorMessageFa: msg,
      };
    }
  }

  public cancelInFlight(): void {
    if (this.activeAbortController) {
      this.activeAbortController.abort();
      this.activeAbortController = null;
      this.activeRequestKey = null;
    }
  }

  public getActiveRequestKey(): string | null {
    return this.activeRequestKey;
  }
}
