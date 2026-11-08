/**
 * Appointment Repository Interface and In-Memory Implementation
 * (`server/modules/appointments/repository.ts`)
 * Exclusive ownership: `server/modules/appointments/`
 */

import {
  AppointmentRecord,
  CalendarQueryFilters,
  RecurringAppointmentSeries
} from './types.js';
import { doIntervalsCollide } from './validation.js';

export interface AppointmentRepository {
  findById(appointmentId: string): Promise<AppointmentRecord | null>;
  save(record: AppointmentRecord): Promise<void>;
  findPotentialCollisions(
    participantUserIds: string[],
    propertyId: string | undefined,
    startIso: string,
    endIso: string,
    bufferBeforeMinutes: number,
    bufferAfterMinutes: number,
    excludeAppointmentId?: string
  ): Promise<AppointmentRecord[]>;
  queryCalendar(
    filters: CalendarQueryFilters
  ): Promise<{ appointments: AppointmentRecord[]; nextCursor?: string; totalCount: number }>;
  saveSeries(series: RecurringAppointmentSeries): Promise<void>;
  findSeriesById(seriesId: string): Promise<RecurringAppointmentSeries | null>;
  findAppointmentsBySeriesId(seriesId: string): Promise<AppointmentRecord[]>;
}

export class InMemoryAppointmentRepository implements AppointmentRepository {
  private appointments: Map<string, AppointmentRecord> = new Map();
  private seriesStore: Map<string, RecurringAppointmentSeries> = new Map();

  async findById(appointmentId: string): Promise<AppointmentRecord | null> {
    const record = this.appointments.get(appointmentId);
    if (!record) return null;
    return JSON.parse(JSON.stringify(record));
  }

  async save(record: AppointmentRecord): Promise<void> {
    const existing = this.appointments.get(record.appointmentId);
    if (existing) {
      if (existing.revision !== record.revision - 1) {
        throw new Error(
          `خطای همزمانی داده (Optimistic Concurrency Conflict): ویرایش برای قرار ${record.appointmentId} ناموفق بود.`
        );
      }
    } else {
      if (record.revision !== 1) {
        throw new Error('نسخه رکورد جدید باید ۱ باشد.');
      }
    }

    this.appointments.set(record.appointmentId, JSON.parse(JSON.stringify(record)));
  }

  async findPotentialCollisions(
    participantUserIds: string[],
    propertyId: string | undefined,
    startIso: string,
    endIso: string,
    bufferBeforeMinutes: number,
    bufferAfterMinutes: number,
    excludeAppointmentId?: string
  ): Promise<AppointmentRecord[]> {
    const collisions: AppointmentRecord[] = [];
    const activeStatuses = new Set([
      'draft',
      'proposed',
      'awaiting_responses',
      'confirmed',
      'reschedule_requested',
      'in_progress'
    ]);

    for (const appt of this.appointments.values()) {
      if (excludeAppointmentId && appt.appointmentId === excludeAppointmentId) {
        continue;
      }

      if (!activeStatuses.has(appt.status)) {
        continue;
      }

      // Check time collision
      const collides = doIntervalsCollide(
        startIso,
        endIso,
        bufferBeforeMinutes,
        bufferAfterMinutes,
        appt.startIso,
        appt.endIso,
        appt.bufferBeforeMinutes,
        appt.bufferAfterMinutes
      );

      if (!collides) {
        continue;
      }

      // Check property collision
      if (propertyId && appt.propertyId && propertyId === appt.propertyId) {
        collisions.push(JSON.parse(JSON.stringify(appt)));
        continue;
      }

      // Check participant collision
      const apptParticipantUserIds = new Set(
        appt.participants.map(p => p.userId).filter((id): id is string => Boolean(id))
      );
      if (appt.organizerUserId) {
        apptParticipantUserIds.add(appt.organizerUserId);
      }

      const hasSharedParticipant = participantUserIds.some(uid => apptParticipantUserIds.has(uid));
      if (hasSharedParticipant) {
        collisions.push(JSON.parse(JSON.stringify(appt)));
      }
    }

    return collisions;
  }

  async queryCalendar(
    filters: CalendarQueryFilters
  ): Promise<{ appointments: AppointmentRecord[]; nextCursor?: string; totalCount: number }> {
    const fromTime = new Date(filters.fromIso).getTime();
    const toTime = new Date(filters.toIso).getTime();

    let matched: AppointmentRecord[] = [];

    for (const appt of this.appointments.values()) {
      const apptStart = new Date(appt.startIso).getTime();
      const apptEnd = new Date(appt.endIso).getTime();

      // Check interval overlap with query window
      if (apptEnd <= fromTime || apptStart >= toTime) {
        continue;
      }

      // Status filter
      if (filters.status && appt.status !== filters.status) {
        continue;
      }

      // Organizer filter
      if (filters.organizerId && appt.organizerUserId !== filters.organizerId) {
        continue;
      }

      // Property filter
      if (filters.propertyId && appt.propertyId !== filters.propertyId) {
        continue;
      }

      // User filter (organizer or participant)
      if (filters.userId) {
        const isOrganizer = appt.organizerUserId === filters.userId;
        const isParticipant = appt.participants.some(p => p.userId === filters.userId);
        if (!isOrganizer && !isParticipant) {
          continue;
        }
      }

      matched.push(JSON.parse(JSON.stringify(appt)));
    }

    // Sort by start time ascending
    matched.sort((a, b) => new Date(a.startIso).getTime() - new Date(b.startIso).getTime());

    const totalCount = matched.length;

    // Apply cursor
    let startIndex = 0;
    if (filters.cursor) {
      const cursorIndex = matched.findIndex(a => a.appointmentId === filters.cursor);
      if (cursorIndex !== -1) {
        startIndex = cursorIndex + 1;
      }
    }

    const limit = Math.max(1, Math.min(filters.limit || 50, 100));
    const paginated = matched.slice(startIndex, startIndex + limit);
    const hasMore = startIndex + limit < matched.length;
    const nextCursor = hasMore && paginated.length > 0 ? paginated[paginated.length - 1].appointmentId : undefined;

    return {
      appointments: paginated,
      nextCursor,
      totalCount
    };
  }

  async saveSeries(series: RecurringAppointmentSeries): Promise<void> {
    this.seriesStore.set(series.seriesId, JSON.parse(JSON.stringify(series)));
  }

  async findSeriesById(seriesId: string): Promise<RecurringAppointmentSeries | null> {
    const s = this.seriesStore.get(seriesId);
    if (!s) return null;
    return JSON.parse(JSON.stringify(s));
  }

  async findAppointmentsBySeriesId(seriesId: string): Promise<AppointmentRecord[]> {
    const results: AppointmentRecord[] = [];
    for (const appt of this.appointments.values()) {
      if (appt.recurrenceSeriesId === seriesId) {
        results.push(JSON.parse(JSON.stringify(appt)));
      }
    }
    return results.sort((a, b) => new Date(a.startIso).getTime() - new Date(b.startIso).getTime());
  }

  // Helper for test isolation
  clear(): void {
    this.appointments.clear();
    this.seriesStore.clear();
  }
}
