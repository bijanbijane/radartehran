/**
 * Property Transaction Lifecycle State Machine & Milestone Generator
 * (`server/modules/property-transactions/stateMachine.ts`)
 * Exclusive ownership: `server/modules/property-transactions/`
 */

import type {
  DealLifecycleStatus,
  DealMilestoneRecord,
  DealWorkflowRecord,
  ParticipantRole,
  TransactionType,
} from './types';
import { DealValidationError } from './validation';

export const ALLOWED_DEAL_TRANSITIONS: Record<DealLifecycleStatus, DealLifecycleStatus[]> = {
  initiated: ['participants_pending', 'active_negotiation', 'viewing_pending', 'cancelled'],
  participants_pending: ['active_negotiation', 'viewing_pending', 'cancelled'],
  active_negotiation: [
    'viewing_pending',
    'offer_submitted',
    'counteroffer_pending',
    'cancelled',
    'expired',
    'disputed',
  ],
  viewing_pending: ['viewing_completed', 'active_negotiation', 'cancelled', 'expired'],
  viewing_completed: ['active_negotiation', 'offer_submitted', 'cancelled'],
  offer_submitted: [
    'counteroffer_pending',
    'offer_accepted',
    'active_negotiation',
    'cancelled',
    'expired',
  ],
  counteroffer_pending: [
    'offer_submitted',
    'offer_accepted',
    'active_negotiation',
    'cancelled',
    'expired',
  ],
  offer_accepted: ['awaiting_external_completion', 'disputed', 'cancelled'],
  awaiting_external_completion: ['completed', 'disputed', 'cancelled'],
  completed: [], // Terminal
  cancelled: ['active_negotiation'], // Explicit reopening condition only with unanimous consensus
  expired: [], // Terminal
  disputed: ['active_negotiation', 'cancelled'],
};

export function canTransitionDealState(from: DealLifecycleStatus, to: DealLifecycleStatus): boolean {
  if (from === to) return true; // Idempotent
  const allowed = ALLOWED_DEAL_TRANSITIONS[from];
  return Boolean(allowed && allowed.includes(to));
}

export function validateDealStateTransition(
  deal: DealWorkflowRecord,
  nextStatus: DealLifecycleStatus,
  actorUserId: string,
  reason?: string,
): void {
  if (deal.lifecycleStatus === nextStatus) {
    return; // Idempotent no-op
  }

  if (!canTransitionDealState(deal.lifecycleStatus, nextStatus)) {
    throw new DealValidationError(
      'INVALID_LIFECYCLE_TRANSITION',
      `Cannot transition deal ${deal.dealId} from '${deal.lifecycleStatus}' to '${nextStatus}'.`,
      'lifecycleStatus',
    );
  }

  // Guard specific states
  if (nextStatus === 'offer_accepted' && !deal.acceptedOfferId && !deal.activeOfferId) {
    throw new DealValidationError(
      'MISSING_ACCEPTED_OFFER',
      'Cannot transition deal to offer_accepted without an accepted or active offer.',
    );
  }

  if (nextStatus === 'completed') {
    if (deal.lifecycleStatus !== 'awaiting_external_completion') {
      throw new DealValidationError(
        'INVALID_COMPLETION_ORIGIN',
        'Deal must be in awaiting_external_completion state before completion.',
      );
    }
    const allMilestonesComplete = deal.milestones.every(
      (m) => m.status === 'verified_complete' || m.status === 'reported_complete' || m.status === 'skipped',
    );
    if (!allMilestonesComplete) {
      throw new DealValidationError(
        'INCOMPLETE_MILESTONES',
        'All deal milestones must be completed or skipped prior to marking deal completed.',
      );
    }
  }

  if (nextStatus === 'cancelled' && !reason) {
    throw new DealValidationError(
      'MISSING_CANCELLATION_REASON',
      'A non-empty reason is required to cancel a deal.',
      'reason',
    );
  }
}

export function generateDefaultDealMilestones(
  dealId: string,
  transactionType: TransactionType,
): DealMilestoneRecord[] {
  if (transactionType === 'sale') {
    return [
      {
        milestoneId: `ms_${dealId}_1`,
        dealId,
        milestoneKey: 'sale_offer_accepted',
        titleFa: 'توافق اولیه و پذیرش پیشنهاد خرید',
        descriptionFa: 'پذیرش پیشنهاد خرید توسط طرفین معامله (توافق اولیه در سامانه)',
        sequenceOrder: 1,
        status: 'pending',
        responsibleRole: 'seller',
        isLegalDeterminationDisclaimer: true,
      },
      {
        milestoneId: `ms_${dealId}_2`,
        dealId,
        milestoneKey: 'sale_external_doc_started',
        titleFa: 'آغاز استعلامات و فرآیند اسناد ثبتی',
        descriptionFa: 'گزارش شروع استعلامات از شهرداری، دارایی و ثبت توسط طرفین',
        sequenceOrder: 2,
        status: 'pending',
        responsibleRole: 'seller',
        isLegalDeterminationDisclaimer: true,
      },
      {
        milestoneId: `ms_${dealId}_3`,
        dealId,
        milestoneKey: 'sale_notary_appointment',
        titleFa: 'هماهنگی نوبت دفتر اسناد رسمی',
        descriptionFa: 'ثبت تاریخ و شماره دفترخانه رسمی برای تنظیم سند قطعی انتقال',
        sequenceOrder: 3,
        status: 'pending',
        responsibleRole: 'buyer',
        isLegalDeterminationDisclaimer: true,
      },
      {
        milestoneId: `ms_${dealId}_4`,
        dealId,
        milestoneKey: 'sale_final_review',
        titleFa: 'بررسی نهایی مفاصاحساب و تسویه‌حساب',
        descriptionFa: 'تایید اتمام بررسی مفاصاحساب شهرداری، تامین اجتماعی و شارژ ساختمان',
        sequenceOrder: 4,
        status: 'pending',
        responsibleRole: 'seller',
        isLegalDeterminationDisclaimer: true,
      },
      {
        milestoneId: `ms_${dealId}_5`,
        dealId,
        milestoneKey: 'sale_transfer_reported',
        titleFa: 'گزارش ثبت سند و تحویل ملک',
        descriptionFa: 'گزارش طرفین مبنی بر امضای سند رسمی در دفترخانه و تحویل مبیع',
        sequenceOrder: 5,
        status: 'pending',
        responsibleRole: 'buyer',
        isLegalDeterminationDisclaimer: true,
      },
      {
        milestoneId: `ms_${dealId}_6`,
        dealId,
        milestoneKey: 'sale_deal_closed',
        titleFa: 'خاتمه پرونده معامله',
        descriptionFa: 'بسته‌شدن موفقیت‌آمیز پرونده معامله در سامانه رادار',
        sequenceOrder: 6,
        status: 'pending',
        responsibleRole: 'seller',
        isLegalDeterminationDisclaimer: true,
      },
    ];
  }

  return [
    {
      milestoneId: `ms_${dealId}_1`,
      dealId,
      milestoneKey: 'rental_offer_accepted',
      titleFa: 'توافق اولیه بر شرایط رهن و اجاره',
      descriptionFa: 'تایید مبلغ ودیعه، اجاره ماهانه و تاریخ شروع قرارداد توسط طرفین',
      sequenceOrder: 1,
      status: 'pending',
      responsibleRole: 'landlord',
      isLegalDeterminationDisclaimer: true,
    },
    {
      milestoneId: `ms_${dealId}_2`,
      dealId,
      milestoneKey: 'rental_lease_drafting',
      titleFa: 'تهیه و ثبت پیش‌نویس اجاره‌نامه',
      descriptionFa: 'ثبت قرارداد در سامانه املاک و اسناد / خودنویس با کد رهگیری',
      sequenceOrder: 2,
      status: 'pending',
      responsibleRole: 'landlord',
      isLegalDeterminationDisclaimer: true,
    },
    {
      milestoneId: `ms_${dealId}_3`,
      dealId,
      milestoneKey: 'rental_signatures_complete',
      titleFa: 'امضای رسمی اجاره‌نامه توسط طرفین و شهود',
      descriptionFa: 'گزارش امضای نسخه کاغذی یا دیجیتال اجاره‌نامه با حضور دو شاهد',
      sequenceOrder: 3,
      status: 'pending',
      responsibleRole: 'tenant',
      isLegalDeterminationDisclaimer: true,
    },
    {
      milestoneId: `ms_${dealId}_4`,
      dealId,
      milestoneKey: 'rental_move_in_scheduled',
      titleFa: 'هماهنگی تحویل واحد و صورت‌جلسه',
      descriptionFa: 'تعیین زمان تحویل ملک و تنظیم صورت‌جلسه اقلام و تجهیزات',
      sequenceOrder: 4,
      status: 'pending',
      responsibleRole: 'landlord',
      isLegalDeterminationDisclaimer: true,
    },
    {
      milestoneId: `ms_${dealId}_5`,
      dealId,
      milestoneKey: 'rental_handover_complete',
      titleFa: 'گزارش تحویل کلید و سکونت',
      descriptionFa: 'تایید تحویل کامل واحد مسکونی/تجاری به مستاجر',
      sequenceOrder: 5,
      status: 'pending',
      responsibleRole: 'tenant',
      isLegalDeterminationDisclaimer: true,
    },
    {
      milestoneId: `ms_${dealId}_6`,
      dealId,
      milestoneKey: 'rental_deal_closed',
      titleFa: 'خاتمه پرونده اجاره',
      descriptionFa: 'بسته‌شدن موفق پرونده رهن و اجاره در سامانه رادار',
      sequenceOrder: 6,
      status: 'pending',
      responsibleRole: 'landlord',
      isLegalDeterminationDisclaimer: true,
    },
  ];
}
