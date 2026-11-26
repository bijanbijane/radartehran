/** @file server/modules/communications/commsRoutes.ts — Communications DTOs and pure pagination helpers */
import type { Request } from 'express';
import type { ConversationRecord, ConversationType, MessageAttachmentMeta, MessageRecord } from '../../../src/features/communications/types/comms.types';

export interface CommunicationsRoutesOptions {
  checkRateLimit?: (ip: string, bucket: 'general', max: number, windowMs: number) => boolean;
  getClientIp?: (req: Request) => string;
  /**
   * Server-side resolver for non-support conversations. It must load the
   * referenced entity, verify creator access, and return the canonical counterparty UID.
   * Client-supplied counterpartyUid is never an identity source.
   */
  resolveContextCounterpartyUid?: (input: {
    type: ConversationType;
    contextEntityType: ConversationRecord['contextEntityType'];
    contextEntityId: string;
    creatorUid: string;
  }) => Promise<{ uid: string; displayNameFa?: string; contextTitleFa?: string } | null>;
  /** Verifies attachment ownership and returns canonical metadata for this sender. */
  resolveOwnedConversationAttachments?: (uid: string, attachmentIds: string[]) => Promise<MessageAttachmentMeta[]>;
}

export function toConversationSummary(conversation: ConversationRecord, viewerUid: string) {
  const lastMessage = conversation.messages[conversation.messages.length - 1];
  return {
    conversationId: conversation.conversationId,
    type: conversation.type,
    contextEntityType: conversation.contextEntityType,
    contextEntityId: conversation.contextEntityId,
    contextTitleFa: conversation.contextTitleFa,
    status: conversation.status,
    participants: conversation.participants.map((participant) => ({
      uid: participant.uid,
      displayNameFa: participant.displayNameFa,
      roleLabelFa: participant.roleLabelFa,
      senderType: participant.senderType,
      ...(participant.uid === viewerUid
        ? {
            muted: participant.muted,
            archived: participant.archived,
            blockedOtherParticipant: participant.blockedOtherParticipant,
          }
        : {}),
    })),
    lastMessage: lastMessage
      ? {
          messageId: lastMessage.messageId,
          senderUid: lastMessage.senderUid,
          senderLabelFa: lastMessage.senderLabelFa,
          bodyFa: lastMessage.bodyFa,
          status: lastMessage.status,
          createdAtIso: lastMessage.createdAtIso,
          attachmentCount: lastMessage.attachments.length,
        }
      : null,
    messageCount: conversation.messages.length,
    unreadCount: conversation.messages.filter((message) => !message.readByUids.includes(viewerUid)).length,
    createdAtIso: conversation.createdAtIso,
    updatedAtIso: conversation.updatedAtIso,
  };
}

export function paginateConversationMessages(
  messages: MessageRecord[],
  limit: number,
  beforeMessageId?: string,
): { ok: true; items: MessageRecord[]; hasMore: boolean; nextCursor: string | null } | { ok: false } {
  const beforeIndex = beforeMessageId
    ? messages.findIndex((message) => message.messageId === beforeMessageId)
    : messages.length;
  if (beforeIndex < 0) return { ok: false };
  const startIndex = Math.max(0, beforeIndex - limit);
  return {
    ok: true,
    items: messages.slice(startIndex, beforeIndex),
    hasMore: startIndex > 0,
    nextCursor: startIndex > 0 ? messages[startIndex].messageId : null,
  };
}
