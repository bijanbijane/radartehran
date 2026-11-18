/**
 * @file src/platform/notifications/realtime/NotificationRealtimeAdapter.ts
 * @description Manages Realtime/Polling notification streams with exponential backoff, Page Visibility awareness, and clean disposal (Stage 9).
 */

import type { NotificationRecord } from '../core/NotificationTypes';

export type NotificationStreamMode = 'realtime' | 'polling' | 'paused' | 'disconnected';

export interface NotificationStreamState {
  mode: NotificationStreamMode;
  consecutiveFailures: number;
  currentPollingIntervalMs: number;
  isPageVisible: boolean;
  lastSyncedAt: string | null;
}

export class NotificationRealtimeAdapter {
  private state: NotificationStreamState = {
    mode: 'disconnected',
    consecutiveFailures: 0,
    currentPollingIntervalMs: 15_000,
    isPageVisible: true,
    lastSyncedAt: null,
  };

  private readonly baseIntervalMs: number;
  private readonly maxIntervalMs: number;
  private timerId: ReturnType<typeof setTimeout> | null = null;
  private listeners = new Set<(incoming: Array<Partial<NotificationRecord>>) => void>();

  constructor(options: { baseIntervalMs?: number; maxIntervalMs?: number } = {}) {
    this.baseIntervalMs = options.baseIntervalMs ?? 15_000;
    this.maxIntervalMs = options.maxIntervalMs ?? 120_000;
    this.state.currentPollingIntervalMs = this.baseIntervalMs;
  }

  public getState(): NotificationStreamState {
    return { ...this.state };
  }

  public onReceive(listener: (incoming: Array<Partial<NotificationRecord>>) => void): () => void {
    this.listeners.add(listener);
    return () => {
      this.listeners.delete(listener);
    };
  }

  public pushRealtimeBatch(batch: Array<Partial<NotificationRecord>>): void {
    this.state.mode = 'realtime';
    this.state.consecutiveFailures = 0;
    this.state.currentPollingIntervalMs = this.baseIntervalMs;
    this.state.lastSyncedAt = new Date().toISOString();
    for (const listener of this.listeners) {
      listener(batch);
    }
  }

  public recordPollSuccess(batch: Array<Partial<NotificationRecord>> = []): NotificationStreamState {
    this.state.mode = 'polling';
    this.state.consecutiveFailures = 0;
    this.state.currentPollingIntervalMs = this.state.isPageVisible
      ? this.baseIntervalMs
      : Math.min(this.maxIntervalMs, this.baseIntervalMs * 4);
    this.state.lastSyncedAt = new Date().toISOString();
    if (batch.length > 0) {
      for (const listener of this.listeners) {
        listener(batch);
      }
    }
    return this.getState();
  }

  public recordPollFailure(): NotificationStreamState {
    this.state.consecutiveFailures += 1;
    const factor = Math.pow(2, Math.min(5, this.state.consecutiveFailures));
    this.state.currentPollingIntervalMs = Math.min(
      this.maxIntervalMs,
      this.baseIntervalMs * factor
    );
    return this.getState();
  }

  public setPageVisibility(isVisible: boolean): NotificationStreamState {
    this.state.isPageVisible = isVisible;
    if (!isVisible) {
      this.state.currentPollingIntervalMs = Math.min(this.maxIntervalMs, this.baseIntervalMs * 4);
    } else if (this.state.consecutiveFailures === 0) {
      this.state.currentPollingIntervalMs = this.baseIntervalMs;
    }
    return this.getState();
  }

  public dispose(): void {
    if (this.timerId) {
      clearTimeout(this.timerId);
      this.timerId = null;
    }
    this.state.mode = 'disconnected';
    this.listeners.clear();
  }
}
