/**
 * @file src/platform/notifications/delivery/DeliveryStatusAdapter.ts
 * @description Honest delivery status evaluation without fabricating 'delivered' when server status is queued/processing/failed/unknown (Stage 9).
 */

import { DELIVERY_STATUS_LABELS_FA } from '../core/NotificationRegistry';
import type {
  DeliveryChannel,
  DeliveryStatus,
  NotificationDeliveryRecord,
} from '../core/NotificationTypes';

export interface DeliverySummaryView {
  overallStatus: DeliveryStatus;
  overallLabelFa: string;
  hasFailedChannel: boolean;
  retryableChannels: DeliveryChannel[];
  channelDetails: Array<{
    channel: DeliveryChannel;
    status: DeliveryStatus;
    labelFa: string;
    failureReason?: string;
  }>;
}

export function summarizeNotificationDeliveries(
  deliveries: NotificationDeliveryRecord[]
): DeliverySummaryView {
  if (!Array.isArray(deliveries) || deliveries.length === 0) {
    return {
      overallStatus: 'unknown',
      overallLabelFa: DELIVERY_STATUS_LABELS_FA.unknown,
      hasFailedChannel: false,
      retryableChannels: [],
      channelDetails: [],
    };
  }

  const details = deliveries.map((d) => ({
    channel: d.channel,
    status: d.status,
    labelFa: DELIVERY_STATUS_LABELS_FA[d.status] || DELIVERY_STATUS_LABELS_FA.unknown,
    failureReason: d.failureReason,
  }));

  const retryableChannels = deliveries
    .filter((d) => d.status === 'failed')
    .map((d) => d.channel);

  const hasFailedChannel = retryableChannels.length > 0;

  let overallStatus: DeliveryStatus = 'unknown';
  if (deliveries.every((d) => d.status === 'delivered')) {
    overallStatus = 'delivered';
  } else if (hasFailedChannel) {
    overallStatus = 'failed';
  } else if (deliveries.some((d) => d.status === 'processing')) {
    overallStatus = 'processing';
  } else if (deliveries.some((d) => d.status === 'queued')) {
    overallStatus = 'queued';
  } else if (deliveries.some((d) => d.status === 'sent')) {
    overallStatus = 'sent';
  } else if (deliveries.every((d) => d.status === 'cancelled')) {
    overallStatus = 'cancelled';
  } else if (deliveries.some((d) => d.status === 'delivered')) {
    overallStatus = 'delivered';
  }

  return {
    overallStatus,
    overallLabelFa: DELIVERY_STATUS_LABELS_FA[overallStatus],
    hasFailedChannel,
    retryableChannels,
    channelDetails: details,
  };
}
