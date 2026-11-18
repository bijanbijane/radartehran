/**
 * @file src/shared/notification-ui/NotificationDeliveryStatus.tsx
 * @description Displays honest channel delivery status badges and retry option for failed channels (Stage 9).
 */

import React from 'react';
import {
  DELIVERY_CHANNEL_REGISTRY,
  summarizeNotificationDeliveries,
  type DeliveryChannel,
  type NotificationDeliveryRecord,
} from '../../platform/notifications';

export interface NotificationDeliveryStatusProps {
  deliveries: NotificationDeliveryRecord[];
  onRetryChannel?: (channel: DeliveryChannel) => void;
}

export const NotificationDeliveryStatus: React.FC<NotificationDeliveryStatusProps> = ({
  deliveries,
  onRetryChannel,
}) => {
  const summary = summarizeNotificationDeliveries(deliveries);

  return (
    <div dir="rtl" data-testid="notification-delivery-status" className="flex flex-wrap items-center gap-1.5 text-[11px]">
      {summary.channelDetails.map((d) => {
        const chTitle = DELIVERY_CHANNEL_REGISTRY[d.channel]?.labelFa || d.channel;
        return (
          <span
            key={d.channel}
            data-testid={`delivery-badge-${d.channel}-${d.status}`}
            className={`inline-flex items-center gap-1 rounded px-2 py-0.5 ${
              d.status === 'delivered'
                ? 'bg-emerald-950/50 text-emerald-300 border border-emerald-500/30'
                : d.status === 'failed'
                  ? 'bg-rose-950/50 text-rose-300 border border-rose-500/30'
                  : 'bg-slate-800 text-slate-300 border border-slate-700'
            }`}
          >
            <span>{chTitle}: {d.labelFa}</span>
            {d.status === 'failed' && onRetryChannel && (
              <button
                type="button"
                onClick={() => onRetryChannel(d.channel)}
                className="underline font-semibold text-rose-200 mr-1 cursor-pointer"
              >
                ارسال مجدد
              </button>
            )}
          </span>
        );
      })}
    </div>
  );
};
