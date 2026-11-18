/**
 * @file src/platform/messaging/index.ts
 * @description Stage 10 (RT-FE-REBUILD-MESSAGING-010) — Messaging Platform Contract,
 * Client Message Idempotency, Delivery vs Read State Machine, Attachment Pipeline & Scoped Cache Keys.
 */

export const RT_FE_REBUILD_STAGE_10_SPEC_ID = 'RT-FE-REBUILD-MESSAGING-010' as const;

export type MessageDeliveryStatus = 'pending' | 'sent' | 'delivered' | 'read' | 'failed';
export type AttachmentPipelineState =
  | 'SELECTED'
  | 'VALIDATING'
  | 'UPLOADING'
  | 'QUARANTINED'
  | 'PROCESSING'
  | 'AVAILABLE'
  | 'ATTACHED_TO_MESSAGE'
  | 'FAILED';

export interface PlatformMessageRecord {
  readonly messageId: string;
  readonly clientMessageId: string;
  readonly conversationId: string;
  readonly senderAuthoritativeUid: string;
  readonly body: string;
  readonly deliveryStatus: MessageDeliveryStatus;
  readonly createdAtIso: string;
}

export function buildScopedMessagingCacheKey(input: {
  userId: string;
  workspaceId?: string | null;
  conversationId?: string | null;
}): string {
  const uid = String(input.userId ?? '').trim();
  if (!uid || uid === 'local-user' || uid === 'anonymous') {
    throw new Error('MESSAGING_CACHE_KEY_REQUIRES_AUTHENTICATED_USER_ID');
  }
  const ws = input.workspaceId ? `ws:${input.workspaceId}` : 'ws:personal';
  const conv = input.conversationId ? `conv:${input.conversationId}` : 'conv:inbox';
  return `rt:messaging:${uid}:${ws}:${conv}`;
}

export function transitionMessageDeliveryState(
  current: MessageDeliveryStatus,
  event: 'SERVER_ACK_SENT' | 'RECIPIENT_DELIVERED' | 'RECIPIENT_READ' | 'NETWORK_FAILED' | 'RETRY_SEND',
): MessageDeliveryStatus {
  if (current === 'read') return 'read';
  switch (event) {
    case 'SERVER_ACK_SENT':
      return current === 'delivered' ? 'delivered' : 'sent';
    case 'RECIPIENT_DELIVERED':
      return 'delivered';
    case 'RECIPIENT_READ':
      return 'read';
    case 'NETWORK_FAILED':
      return current === 'pending' ? 'failed' : current;
    case 'RETRY_SEND':
      return current === 'failed' ? 'pending' : current;
    default:
      return current;
  }
}

export function deduplicateRealtimeMessage(
  existingMessages: readonly PlatformMessageRecord[],
  incoming: PlatformMessageRecord,
): {
  readonly messages: readonly PlatformMessageRecord[];
  readonly wasDuplicate: boolean;
} {
  const idx = existingMessages.findIndex(
    (m) =>
      m.messageId === incoming.messageId ||
      (Boolean(m.clientMessageId) && m.clientMessageId === incoming.clientMessageId),
  );
  if (idx === -1) {
    return { messages: [...existingMessages, incoming], wasDuplicate: false };
  }
  const updated = [...existingMessages];
  updated[idx] = incoming;
  return { messages: updated, wasDuplicate: true };
}

export function transitionAttachmentUploadState(input: {
  currentState: AttachmentPipelineState;
  mimeType: string;
  byteSize: number;
  virusScanPassed?: boolean;
}): AttachmentPipelineState {
  if (input.byteSize <= 0 || input.byteSize > 15 * 1024 * 1024) {
    return 'FAILED';
  }
  const lowerMime = input.mimeType.toLowerCase();
  if (lowerMime.includes('svg') || lowerMime.includes('html') || lowerMime.includes('javascript')) {
    return 'FAILED';
  }
  if (input.currentState === 'SELECTED') return 'VALIDATING';
  if (input.currentState === 'VALIDATING') return 'UPLOADING';
  if (input.currentState === 'UPLOADING') return 'QUARANTINED';
  if (input.currentState === 'QUARANTINED') {
    return input.virusScanPassed ? 'AVAILABLE' : 'FAILED';
  }
  if (input.currentState === 'AVAILABLE') return 'ATTACHED_TO_MESSAGE';
  return input.currentState;
}
