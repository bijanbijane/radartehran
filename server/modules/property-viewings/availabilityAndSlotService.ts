import crypto from 'crypto';
import {
  AvailabilityWindowType,
  BookableViewingSlot,
  HostAvailabilityWindowRecord,
  TemporarySlotHoldRecord,
  ViewingActorContext,
  ViewingError,
} from './types';
import {
  formatLocalTimeInZone,
  intervalsOverlapWithBuffer,
  validateIanaTimezone,
  validateTimeRange,
} from './validationAndTimezone';
import { PropertyViewingsStore } from './store';

export class AvailabilityAndSlotService {
  constructor(private readonly store: PropertyViewingsStore) {}

  async registerAvailabilityWindow(
    actor: ViewingActorContext,
    input: {
      id?: string;
      ownerUserId?: string;
      ownerType?: HostAvailabilityWindowRecord['ownerType'];
      propertyId?: string;
      availabilityType: AvailabilityWindowType;
      startIso: string;
      endIso: string;
      timezoneId: string;
      recurrenceRule?: HostAvailabilityWindowRecord['recurrenceRule'];
      capacity?: number;
      bufferBeforeMinutes?: number;
      bufferAfterMinutes?: number;
      minAdvanceNoticeMinutes?: number;
      maxAdvanceHorizonDays?: number;
    }
  ): Promise<HostAvailabilityWindowRecord> {
    const ownerUserId = input.ownerUserId || actor.userId;
    if (ownerUserId !== actor.userId && actor.role !== 'BROKERAGE_ADMIN') {
      throw new ViewingError(
        'INSUFFICIENT_PRIVILEGE',
        `Actor '${actor.userId}' cannot register availability for '${ownerUserId}'.`,
        403
      );
    }

    const timezoneId = validateIanaTimezone(input.timezoneId);
    const { startMs, endMs } = validateTimeRange(input.startIso, input.endIso);

    if (input.availabilityType === 'RECURRING_AVAILABLE') {
      if (
        !input.recurrenceRule ||
        !input.recurrenceRule.daysOfWeek ||
        input.recurrenceRule.daysOfWeek.length === 0 ||
        input.recurrenceRule.daysOfWeek.some((d) => d < 0 || d > 6) ||
        !/^\d{2}:\d{2}$/.test(input.recurrenceRule.localStartTimeHm) ||
        !/^\d{2}:\d{2}$/.test(input.recurrenceRule.localEndTimeHm) ||
        input.recurrenceRule.localStartTimeHm >= input.recurrenceRule.localEndTimeHm
      ) {
        throw new ViewingError(
          'VALIDATION_FAILED',
          'RECURRING_AVAILABLE requires valid daysOfWeek (0..6) and localStartTimeHm < localEndTimeHm.',
          400
        );
      }
    }

    if (input.availabilityType === 'UNAVAILABLE_BLACKOUT') {
      const existingBookings = await this.store.listAppointmentsByHost(ownerUserId, 100);
      const conflict = existingBookings.find(
        (b) =>
          b.status === 'CONFIRMED' &&
          b.confirmedStartIso &&
          b.confirmedEndIso &&
          intervalsOverlapWithBuffer(
            startMs,
            endMs,
            new Date(b.confirmedStartIso).getTime(),
            new Date(b.confirmedEndIso).getTime()
          )
      );
      if (conflict) {
        throw new ViewingError(
          'SCHEDULING_CONFLICT_DOUBLE_BOOKING',
          `Cannot mark blackout window overlapping confirmed appointment '${conflict.id}'.`,
          409
        );
      }
    }

    const now = new Date().toISOString();
    const record: HostAvailabilityWindowRecord = {
      id: input.id || `vavail_${crypto.randomBytes(6).toString('hex')}`,
      ownerUserId,
      ownerType: input.ownerType ?? 'REAL_ESTATE_PROFESSIONAL',
      propertyId: input.propertyId,
      availabilityType: input.availabilityType,
      startIso: input.startIso,
      endIso: input.endIso,
      timezoneId,
      recurrenceRule: input.recurrenceRule,
      status: 'ACTIVE',
      capacity: input.capacity ?? 1,
      bufferBeforeMinutes: input.bufferBeforeMinutes ?? 0,
      bufferAfterMinutes: input.bufferAfterMinutes ?? 0,
      minAdvanceNoticeMinutes: input.minAdvanceNoticeMinutes ?? 60,
      maxAdvanceHorizonDays: input.maxAdvanceHorizonDays ?? 30,
      createdAt: now,
      updatedAt: now,
    };

    await this.store.saveAvailabilityWindow(record);
    return record;
  }

  async updateAvailability(
    actor: ViewingActorContext,
    input: {
      availabilityId: string;
      startIso?: string;
      endIso?: string;
      status?: 'ACTIVE' | 'INACTIVE';
      capacity?: number;
      bufferBeforeMinutes?: number;
      bufferAfterMinutes?: number;
    }
  ): Promise<HostAvailabilityWindowRecord> {
    const win = await this.store.getAvailabilityWindowById(input.availabilityId);
    if (!win) {
      throw new ViewingError('RESOURCE_NOT_FOUND', `Availability '${input.availabilityId}' not found.`, 404);
    }
    if (win.ownerUserId !== actor.userId && actor.role !== 'BROKERAGE_ADMIN') {
      throw new ViewingError('INSUFFICIENT_PRIVILEGE', 'Not authorized to update availability window.', 403);
    }

    const nextStart = input.startIso ?? win.startIso;
    const nextEnd = input.endIso ?? win.endIso;
    validateTimeRange(nextStart, nextEnd);

    const updated: HostAvailabilityWindowRecord = {
      ...win,
      startIso: nextStart,
      endIso: nextEnd,
      status: input.status ?? win.status,
      capacity: input.capacity ?? win.capacity,
      bufferBeforeMinutes: input.bufferBeforeMinutes ?? win.bufferBeforeMinutes,
      bufferAfterMinutes: input.bufferAfterMinutes ?? win.bufferAfterMinutes,
      updatedAt: new Date().toISOString(),
    };
    await this.store.saveAvailabilityWindow(updated);
    return updated;
  }

  async markUnavailablePeriod(
    actor: ViewingActorContext,
    input: {
      ownerUserId?: string;
      propertyId?: string;
      startIso: string;
      endIso: string;
      timezoneId: string;
    }
  ): Promise<HostAvailabilityWindowRecord> {
    return this.registerAvailabilityWindow(actor, {
      ownerUserId: input.ownerUserId,
      propertyId: input.propertyId,
      availabilityType: 'UNAVAILABLE_BLACKOUT',
      startIso: input.startIso,
      endIso: input.endIso,
      timezoneId: input.timezoneId,
      capacity: 0,
    });
  }

  async generateViewingSlots(input: {
    propertyId: string;
    hostUserId: string;
    rangeStartIso: string;
    rangeEndIso: string;
    slotDurationMinutes: number;
    asOfIso?: string;
    maxSlotsLimit?: number;
  }): Promise<BookableViewingSlot[]> {
    const { startMs: rangeStartMs, endMs: rangeEndMs } = validateTimeRange(
      input.rangeStartIso,
      input.rangeEndIso
    );
    // Reject unbounded date range (> 31 days)
    if (rangeEndMs - rangeStartMs > 31 * 24 * 60 * 60 * 1000) {
      throw new ViewingError('VALIDATION_FAILED', 'Requested slot generation range cannot exceed 31 days.', 400);
    }
    if (input.slotDurationMinutes < 15 || input.slotDurationMinutes > 480) {
      throw new ViewingError('VALIDATION_FAILED', 'slotDurationMinutes must be between 15 and 480.', 400);
    }

    const asOfMs = new Date(input.asOfIso ?? new Date().toISOString()).getTime();
    const maxSlots = Math.min(input.maxSlotsLimit ?? 50, 200);

    const [windows, hostBookings, propBookings, holds] = await Promise.all([
      this.store.listAvailabilityWindowsByHost(input.hostUserId),
      this.store.listAppointmentsByHost(input.hostUserId, 100),
      this.store.listAppointmentsByProperty(input.propertyId, 100),
      this.store.listSlotHoldsByPropertyOrHost(input.propertyId, input.hostUserId),
    ]);

    const activeWindows = windows.filter(
      (w) =>
        w.status === 'ACTIVE' &&
        (!w.propertyId || w.propertyId === input.propertyId) &&
        (w.availabilityType === 'ONE_TIME_AVAILABLE' ||
          w.availabilityType === 'RECURRING_AVAILABLE' ||
          w.availabilityType === 'TEMPORARY_OVERRIDE')
    );
    const blackoutWindows = windows.filter(
      (w) =>
        w.status === 'ACTIVE' &&
        (!w.propertyId || w.propertyId === input.propertyId) &&
        w.availabilityType === 'UNAVAILABLE_BLACKOUT'
    );

    const allConfirmedOrActive = [...hostBookings, ...propBookings].filter(
      (b) => b.status === 'CONFIRMED' || b.status === 'RESCHEDULED'
    );
    const activeHolds = holds.filter(
      (h) => h.status === 'ACTIVE_HOLD' && new Date(h.expiresAtIso).getTime() > asOfMs
    );

    const slots: BookableViewingSlot[] = [];
    const slotDurationMs = input.slotDurationMinutes * 60000;

    for (const win of activeWindows) {
      const winStartMs = Math.max(rangeStartMs, new Date(win.startIso).getTime());
      const winEndMs = Math.min(rangeEndMs, new Date(win.endIso).getTime());
      const minNoticeCutoffMs = asOfMs + win.minAdvanceNoticeMinutes * 60000;
      const maxHorizonCutoffMs = asOfMs + win.maxAdvanceHorizonDays * 24 * 60 * 60 * 1000;

      const stepMs = (input.slotDurationMinutes + win.bufferBeforeMinutes + win.bufferAfterMinutes) * 60000;

      for (let cursorMs = winStartMs; cursorMs + slotDurationMs <= winEndMs; cursorMs += stepMs) {
        if (slots.length >= maxSlots) break;
        const slotEndMs = cursorMs + slotDurationMs;

        if (cursorMs < minNoticeCutoffMs || cursorMs > maxHorizonCutoffMs) {
          continue;
        }

        const localStart = formatLocalTimeInZone(new Date(cursorMs).toISOString(), win.timezoneId);
        const localEnd = formatLocalTimeInZone(new Date(slotEndMs).toISOString(), win.timezoneId);

        if (win.availabilityType === 'RECURRING_AVAILABLE' && win.recurrenceRule) {
          if (
            !win.recurrenceRule.daysOfWeek.includes(localStart.dayOfWeek) ||
            localStart.hm < win.recurrenceRule.localStartTimeHm ||
            localEnd.hm > win.recurrenceRule.localEndTimeHm
          ) {
            continue;
          }
        }

        // Check blackout overlap
        const inBlackout = blackoutWindows.some((blk) =>
          intervalsOverlapWithBuffer(
            cursorMs,
            slotEndMs,
            new Date(blk.startIso).getTime(),
            new Date(blk.endIso).getTime()
          )
        );
        if (inBlackout) continue;

        // Check active holds overlap
        const heldCount = activeHolds.filter((h) =>
          intervalsOverlapWithBuffer(
            cursorMs,
            slotEndMs,
            new Date(h.startIso).getTime(),
            new Date(h.endIso).getTime(),
            win.bufferBeforeMinutes,
            win.bufferAfterMinutes
          )
        ).length;

        // Check confirmed appointments overlap (deduplicating by appointment ID)
        const overlappingBookingIds = new Set<string>();
        let bookedParticipantsCount = 0;
        for (const b of allConfirmedOrActive) {
          if (overlappingBookingIds.has(b.id)) continue;
          const bStart = new Date(b.confirmedStartIso || b.requestedStartIso).getTime();
          const bEnd = new Date(b.confirmedEndIso || b.requestedEndIso).getTime();
          if (
            intervalsOverlapWithBuffer(
              cursorMs,
              slotEndMs,
              bStart,
              bEnd,
              win.bufferBeforeMinutes,
              win.bufferAfterMinutes
            )
          ) {
            overlappingBookingIds.add(b.id);
            bookedParticipantsCount += Math.max(1, b.participants.filter((p) => p.invitationStatus !== 'REMOVED' && p.invitationStatus !== 'CANCELLED').length);
          }
        }

        const remainingCapacity = win.capacity - bookedParticipantsCount - heldCount;
        if (remainingCapacity <= 0) continue;

        slots.push({
          slotId: `slot_${win.id}_${cursorMs}`,
          propertyId: input.propertyId,
          hostUserId: input.hostUserId,
          availabilityWindowId: win.id,
          startIso: new Date(cursorMs).toISOString(),
          endIso: new Date(slotEndMs).toISOString(),
          timezoneId: win.timezoneId,
          localStartDisplay: localStart.formatted,
          durationMinutes: input.slotDurationMinutes,
          remainingCapacity,
        });
      }
    }

    return slots;
  }

  async createTemporarySlotHold(
    actor: ViewingActorContext,
    input: {
      id?: string;
      propertyId: string;
      hostUserId: string;
      startIso: string;
      endIso: string;
      holdDurationMinutes?: number;
      nowIso?: string;
    }
  ): Promise<TemporarySlotHoldRecord> {
    validateTimeRange(input.startIso, input.endIso);
    const nowMs = new Date(input.nowIso ?? new Date().toISOString()).getTime();
    const holdMinutes = Math.min(Math.max(input.holdDurationMinutes ?? 10, 1), 60);
    const hold: TemporarySlotHoldRecord = {
      id: input.id || `vhold_${crypto.randomBytes(6).toString('hex')}`,
      propertyId: input.propertyId,
      hostUserId: input.hostUserId,
      requestedByUserId: actor.userId,
      startIso: input.startIso,
      endIso: input.endIso,
      expiresAtIso: new Date(nowMs + holdMinutes * 60000).toISOString(),
      status: 'ACTIVE_HOLD',
      createdAt: new Date(nowMs).toISOString(),
    };
    await this.store.saveSlotHold(hold);
    return hold;
  }
}
