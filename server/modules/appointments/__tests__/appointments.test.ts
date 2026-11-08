/**
 * Comprehensive Automated Tests for Appointments Module
 * (`server/modules/appointments/__tests__/appointments.test.ts`)
 * Exclusive ownership: `server/modules/appointments/`
 */

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
  createAppointmentService,
  InMemoryAppointmentRepository,
  AppointmentDomainEvent,
  EventOutboxPublisher
} from '../index.js';

describe('Appointments Module - Domain & Lifecycle Tests', () => {
  const publishedEvents: AppointmentDomainEvent[] = [];
  const testPublisher: EventOutboxPublisher = {
    publish: async (event) => {
      publishedEvents.push(event);
    }
  };

  function setup() {
    publishedEvents.length = 0;
    const repo = new InMemoryAppointmentRepository();
    const service = createAppointmentService({
      repository: repo,
      outboxPublisher: testPublisher
    });
    return { repo, service };
  }

  it('validates duration limits and ISO timestamps', async () => {
    const { service } = setup();

    // Less than 15 minutes
    await assert.rejects(
      async () => {
        await service.createAppointment({
          appointmentType: 'buyer_consultation',
          titleFa: 'مشاوره کوتاه',
          organizerUserId: 'user-agent-1',
          startIso: '2026-12-01T10:00:00.000Z',
          endIso: '2026-12-01T10:10:00.000Z', // 10 mins
          location: { mode: 'online_meeting', exactAddressDisclosed: true },
          participants: []
        });
      },
      /حداقل مدت زمان جلسه (15|۱۵) دقیقه است/
    );

    // End before start
    await assert.rejects(
      async () => {
        await service.createAppointment({
          appointmentType: 'buyer_consultation',
          titleFa: 'زمان معکوس',
          organizerUserId: 'user-agent-1',
          startIso: '2026-12-01T12:00:00.000Z',
          endIso: '2026-12-01T11:00:00.000Z',
          location: { mode: 'online_meeting', exactAddressDisclosed: true },
          participants: []
        });
      },
      /زمان شروع باید پیش از زمان پایان باشد/
    );
  });

  it('detects scheduling conflicts and buffer collisions for participants and properties', async () => {
    const { service } = setup();

    // First appointment: 10:00 to 11:00 with 15 min buffer after (until 11:15)
    await service.createAppointment({
      appointmentType: 'buyer_consultation',
      titleFa: 'جلسه اول با خریدار',
      organizerUserId: 'agent-100',
      propertyId: 'prop-tehran-1',
      startIso: '2026-12-02T10:00:00.000Z',
      endIso: '2026-12-02T11:00:00.000Z',
      bufferAfterMinutes: 15,
      location: { mode: 'in_person_at_office', exactAddressDisclosed: true },
      participants: [
        { nameFa: 'خریدار الف', role: 'buyer', userId: 'buyer-200', isOrganizer: false, invitationStatus: 'accepted' }
      ]
    });

    // Second appointment for same agent at 11:10 (inside 15 min buffer)
    await assert.rejects(
      async () => {
        await service.createAppointment({
          appointmentType: 'seller_consultation',
          titleFa: 'جلسه دوم مشاور',
          organizerUserId: 'agent-100',
          startIso: '2026-12-02T11:10:00.000Z',
          endIso: '2026-12-02T12:00:00.000Z',
          location: { mode: 'online_meeting', exactAddressDisclosed: true },
          participants: []
        });
      },
      /تداخل در زمان‌بندی/
    );

    // Second appointment for same property at 10:30 (overlapping property)
    await assert.rejects(
      async () => {
        await service.createAppointment({
          appointmentType: 'property_inspection',
          titleFa: 'کارشناسی همزمان ملک',
          organizerUserId: 'other-agent-999',
          propertyId: 'prop-tehran-1',
          startIso: '2026-12-02T10:30:00.000Z',
          endIso: '2026-12-02T11:30:00.000Z',
          location: { mode: 'in_person_at_property', exactAddressDisclosed: false },
          participants: []
        });
      },
      /ملک مورد نظر در بازه انتخابی با جلسه/
    );
  });

  it('enforces viewing address privacy masking until confirmation', async () => {
    const { service } = setup();

    const appt = await service.createAppointment({
      appointmentType: 'property_viewing',
      titleFa: 'بازدید اول آپارتمان سعادت‌آباد',
      organizerUserId: 'agent-saadat',
      propertyId: 'prop-saadat-101',
      startIso: '2026-12-03T14:00:00.000Z',
      endIso: '2026-12-03T15:00:00.000Z',
      location: {
        mode: 'in_person_at_property',
        cityId: 'tehran',
        hoodId: 2,
        hoodNameFa: 'سعادت‌آباد',
        streetText: 'خیابان سرو غربی، کوچه ارغوان، پلاک ۱۲، واحد ۴',
        exactAddressDisclosed: false
      },
      participants: [
        { nameFa: 'متقاضی بازدید', role: 'buyer', userId: 'viewer-buyer-1', isOrganizer: false, invitationStatus: 'pending' }
      ]
    });

    // Initially exactAddressDisclosed is false
    assert.equal(appt.location.exactAddressDisclosed, false);

    // Unconfirmed buyer viewer retrieves appointment: streetText should be masked
    const viewedByBuyer = await service.getAppointment(appt.appointmentId, 'viewer-buyer-1');
    assert.equal(viewedByBuyer.location.streetText, undefined);
    assert.equal(viewedByBuyer.location.hoodNameFa, 'سعادت‌آباد');

    // Confirm appointment by organizer
    const confirmedAppt = await service.confirmAppointment(appt.appointmentId, 'agent-saadat');
    assert.equal(confirmedAppt.status, 'confirmed');
    assert.equal(confirmedAppt.location.exactAddressDisclosed, true);

    // After confirmation, buyer retrieves appointment: address is disclosed
    const confirmedViewedByBuyer = await service.getAppointment(appt.appointmentId, 'viewer-buyer-1');
    assert.equal(confirmedViewedByBuyer.location.streetText, 'خیابان سرو غربی، کوچه ارغوان، پلاک ۱۲، واحد ۴');
  });

  it('handles participant responses, rescheduling proposals, and revision tracking', async () => {
    const { service } = setup();

    const appt = await service.createAppointment({
      appointmentType: 'seller_consultation',
      titleFa: 'جلسه هماهنگی فروشنده',
      organizerUserId: 'agent-consult',
      startIso: '2026-12-04T09:00:00.000Z',
      endIso: '2026-12-04T10:00:00.000Z',
      location: { mode: 'online_meeting', exactAddressDisclosed: true },
      participants: [
        { nameFa: 'فروشنده', role: 'seller', userId: 'seller-50', isOrganizer: false, invitationStatus: 'pending' }
      ]
    });

    assert.equal(appt.revision, 1);

    // Participant responds
    const accepted = await service.respondToInvitation(appt.appointmentId, 'seller-50', 'accepted');
    const p = accepted.participants.find(part => part.userId === 'seller-50');
    assert.equal(p?.invitationStatus, 'accepted');
    assert.equal(accepted.revision, 2);

    // Participant requests reschedule
    const rescheduled = await service.requestReschedule(
      appt.appointmentId,
      'seller-50',
      '2026-12-04T11:00:00.000Z',
      '2026-12-04T12:00:00.000Z',
      'تغییر زمان به دلیل ترافیک'
    );
    assert.equal(rescheduled.status, 'reschedule_requested');
    assert.equal(rescheduled.reschedulingHistory.length, 1);
    assert.equal(rescheduled.reschedulingHistory[0].reasonFa, 'تغییر زمان به دلیل ترافیک');
    assert.equal(rescheduled.revision, 3);

    // Organizer accepts reschedule
    const finalized = await service.acceptReschedule(appt.appointmentId, 'agent-consult');
    assert.equal(finalized.status, 'confirmed');
    assert.equal(finalized.startIso, '2026-12-04T11:00:00.000Z');
    assert.equal(finalized.revision, 4);
  });

  it('records attendance, detects no-show, and handles completion', async () => {
    const { service } = setup();

    const appt = await service.createAppointment({
      appointmentType: 'handover_meeting',
      titleFa: 'تحویل کلید واحد',
      organizerUserId: 'organizer-owner',
      startIso: '2026-12-05T15:00:00.000Z',
      endIso: '2026-12-05T16:00:00.000Z',
      location: { mode: 'in_person_at_office', exactAddressDisclosed: true },
      participants: [
        { nameFa: 'مستاجر جدید', role: 'tenant', userId: 'tenant-10', isOrganizer: false, invitationStatus: 'accepted' }
      ]
    });

    // Record no-show
    const noShowRecord = await service.recordAttendance(appt.appointmentId, 'organizer-owner', [
      { userId: 'tenant-10', status: 'did_not_attend', notesFa: 'تماس پاسخ داده نشد' }
    ]);

    assert.equal(noShowRecord.status, 'no_show');
    const tenantPart = noShowRecord.participants.find(p => p.userId === 'tenant-10');
    assert.equal(tenantPart?.attendanceStatus, 'did_not_attend');
  });

  it('generates recurring series and supports cursor calendar pagination', async () => {
    const { service } = setup();

    const { series, createdAppointments } = await service.createRecurringSeries({
      organizerUserId: 'agent-recurring',
      frequency: 'weekly',
      firstOccurrenceStartIso: '2026-12-08T09:00:00.000Z',
      durationMinutes: 60,
      maxOccurrences: 4,
      seriesEndIso: '2027-01-15T00:00:00.000Z',
      template: {
        appointmentType: 'buyer_consultation',
        titleFa: 'جلسه بررسی هفتگی پروژه',
        organizerUserId: 'agent-recurring',
        startIso: '2026-12-08T09:00:00.000Z',
        endIso: '2026-12-08T10:00:00.000Z',
        location: { mode: 'online_meeting', exactAddressDisclosed: true },
        participants: []
      }
    });

    assert.equal(series.frequency, 'weekly');
    assert.equal(createdAppointments.length, 4);
    assert.equal(createdAppointments[0].isRecurringInstance, true);
    assert.equal(createdAppointments[0].recurrenceSeriesId, series.seriesId);

    // Query calendar with pagination
    const page1 = await service.getCalendarView(
      {
        userId: 'agent-recurring',
        fromIso: '2026-12-01T00:00:00.000Z',
        toIso: '2027-01-01T00:00:00.000Z',
        limit: 2
      },
      'agent-recurring'
    );

    assert.equal(page1.appointments.length, 2);
    assert.ok(page1.nextCursor);

    // Page 2
    const page2 = await service.getCalendarView(
      {
        userId: 'agent-recurring',
        fromIso: '2026-12-01T00:00:00.000Z',
        toIso: '2027-01-01T00:00:00.000Z',
        limit: 2,
        cursor: page1.nextCursor
      },
      'agent-recurring'
    );

    assert.equal(page2.appointments.length, 2);
    assert.notEqual(page1.appointments[0].appointmentId, page2.appointments[0].appointmentId);
  });

  it('rejects stale edits with optimistic concurrency CAS conflict', async () => {
    const { repo } = setup();

    const initial = {
      appointmentId: 'cas-test-1',
      appointmentType: 'buyer_consultation' as const,
      titleFa: 'آزمون همزمانی',
      organizerUserId: 'user-1',
      startIso: '2026-12-10T10:00:00.000Z',
      endIso: '2026-12-10T11:00:00.000Z',
      timezone: 'Asia/Tehran',
      durationMinutes: 60,
      bufferBeforeMinutes: 0,
      bufferAfterMinutes: 0,
      location: { mode: 'online_meeting' as const, exactAddressDisclosed: true },
      participants: [],
      status: 'proposed' as const,
      reschedulingHistory: [],
      isRecurringInstance: false,
      revision: 1,
      createdAtIso: new Date().toISOString(),
      updatedAtIso: new Date().toISOString()
    };

    await repo.save(initial);

    // Successful update with revision 2
    await repo.save({ ...initial, revision: 2 });

    // Stale update with revision 2 again instead of 3
    await assert.rejects(
      async () => {
        await repo.save({ ...initial, revision: 2 });
      },
      /Optimistic Concurrency Conflict/
    );
  });
});
