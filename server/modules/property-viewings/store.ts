import {
  HostAvailabilityWindowRecord,
  PropertyAccessCoordinationRecord,
  PropertyViewingAppointmentRecord,
  TemporarySlotHoldRecord,
  ViewingAttendanceRecord,
  ViewingError,
  ViewingFeedbackRecord,
  ViewingNotificationEventRecord,
  VirtualViewingSessionRecord,
} from './types';

export interface PropertyViewingsStore {
  runExclusiveBookingTransaction<T>(fn: () => Promise<T>): Promise<T>;

  saveAvailabilityWindow(window: HostAvailabilityWindowRecord): Promise<void>;
  getAvailabilityWindowById(id: string): Promise<HostAvailabilityWindowRecord | null>;
  listAvailabilityWindowsByHost(ownerUserId: string): Promise<HostAvailabilityWindowRecord[]>;

  saveSlotHold(hold: TemporarySlotHoldRecord): Promise<void>;
  getSlotHoldById(id: string): Promise<TemporarySlotHoldRecord | null>;
  listSlotHoldsByPropertyOrHost(propertyId: string, hostUserId: string): Promise<TemporarySlotHoldRecord[]>;

  saveAppointment(appointment: PropertyViewingAppointmentRecord): Promise<void>;
  getAppointmentById(id: string): Promise<PropertyViewingAppointmentRecord | null>;
  listAppointmentsByProperty(propertyId: string, limit?: number): Promise<PropertyViewingAppointmentRecord[]>;
  listAppointmentsByHost(hostUserId: string, limit?: number): Promise<PropertyViewingAppointmentRecord[]>;

  saveAccessCoordination(record: PropertyAccessCoordinationRecord): Promise<void>;
  getAccessCoordinationById(id: string): Promise<PropertyAccessCoordinationRecord | null>;
  getAccessCoordinationByAppointment(appointmentId: string): Promise<PropertyAccessCoordinationRecord | null>;

  saveVirtualSession(session: VirtualViewingSessionRecord): Promise<void>;
  getVirtualSessionById(id: string): Promise<VirtualViewingSessionRecord | null>;
  getVirtualSessionByAppointment(appointmentId: string): Promise<VirtualViewingSessionRecord | null>;

  saveAttendance(record: ViewingAttendanceRecord): Promise<void>;
  listAttendanceByAppointment(appointmentId: string): Promise<ViewingAttendanceRecord[]>;

  saveFeedback(record: ViewingFeedbackRecord): Promise<void>;
  listFeedbackByAppointment(appointmentId: string): Promise<ViewingFeedbackRecord[]>;

  appendNotificationEvent(event: ViewingNotificationEventRecord): Promise<void>;
  listNotificationEventsByAppointment(appointmentId: string): Promise<ViewingNotificationEventRecord[]>;

  getIdempotencyAppointmentId(key: string): Promise<string | null>;
  saveIdempotencyAppointmentId(key: string, appointmentId: string): Promise<void>;
}

export class InMemoryPropertyViewingsStore implements PropertyViewingsStore {
  private readonly availability = new Map<string, HostAvailabilityWindowRecord>();
  private readonly holds = new Map<string, TemporarySlotHoldRecord>();
  private readonly appointments = new Map<string, PropertyViewingAppointmentRecord>();
  private readonly accessRecords = new Map<string, PropertyAccessCoordinationRecord>();
  private readonly virtualSessions = new Map<string, VirtualViewingSessionRecord>();
  private readonly attendance = new Map<string, ViewingAttendanceRecord>();
  private readonly feedback = new Map<string, ViewingFeedbackRecord>();
  private readonly notifications: ViewingNotificationEventRecord[] = [];
  private readonly idempotencyKeys = new Map<string, string>();
  private mutexQueue: Promise<unknown> = Promise.resolve();
  private simulateNextWriteFailure = false;

  public triggerNextWriteFailure(): void {
    this.simulateNextWriteFailure = true;
  }

  private checkWriteFailure(): void {
    if (this.simulateNextWriteFailure) {
      this.simulateNextWriteFailure = false;
      throw new ViewingError(
        'PERSISTENCE_FAILURE',
        'Simulated database write failure; booking or schedule mutation was rolled back.',
        503
      );
    }
  }

  async runExclusiveBookingTransaction<T>(fn: () => Promise<T>): Promise<T> {
    const next = this.mutexQueue.then(() => fn());
    this.mutexQueue = next.catch(() => undefined);
    return next;
  }

  async saveAvailabilityWindow(window: HostAvailabilityWindowRecord): Promise<void> {
    this.checkWriteFailure();
    this.availability.set(window.id, structuredClone(window));
  }

  async getAvailabilityWindowById(id: string): Promise<HostAvailabilityWindowRecord | null> {
    const r = this.availability.get(id);
    return r ? structuredClone(r) : null;
  }

  async listAvailabilityWindowsByHost(ownerUserId: string): Promise<HostAvailabilityWindowRecord[]> {
    return Array.from(this.availability.values())
      .filter((w) => w.ownerUserId === ownerUserId)
      .map((w) => structuredClone(w));
  }

  async saveSlotHold(hold: TemporarySlotHoldRecord): Promise<void> {
    this.checkWriteFailure();
    this.holds.set(hold.id, structuredClone(hold));
  }

  async getSlotHoldById(id: string): Promise<TemporarySlotHoldRecord | null> {
    const r = this.holds.get(id);
    return r ? structuredClone(r) : null;
  }

  async listSlotHoldsByPropertyOrHost(propertyId: string, hostUserId: string): Promise<TemporarySlotHoldRecord[]> {
    return Array.from(this.holds.values())
      .filter((h) => h.propertyId === propertyId || h.hostUserId === hostUserId)
      .map((h) => structuredClone(h));
  }

  async saveAppointment(appointment: PropertyViewingAppointmentRecord): Promise<void> {
    this.checkWriteFailure();
    this.appointments.set(appointment.id, structuredClone(appointment));
  }

  async getAppointmentById(id: string): Promise<PropertyViewingAppointmentRecord | null> {
    const r = this.appointments.get(id);
    return r ? structuredClone(r) : null;
  }

  async listAppointmentsByProperty(propertyId: string, limit = 50): Promise<PropertyViewingAppointmentRecord[]> {
    return Array.from(this.appointments.values())
      .filter((a) => a.propertyId === propertyId)
      .sort((a, b) => a.requestedStartIso.localeCompare(b.requestedStartIso))
      .slice(0, limit)
      .map((a) => structuredClone(a));
  }

  async listAppointmentsByHost(hostUserId: string, limit = 50): Promise<PropertyViewingAppointmentRecord[]> {
    return Array.from(this.appointments.values())
      .filter((a) => a.hostUserId === hostUserId)
      .sort((a, b) => a.requestedStartIso.localeCompare(b.requestedStartIso))
      .slice(0, limit)
      .map((a) => structuredClone(a));
  }

  async saveAccessCoordination(record: PropertyAccessCoordinationRecord): Promise<void> {
    this.checkWriteFailure();
    this.accessRecords.set(record.id, structuredClone(record));
  }

  async getAccessCoordinationById(id: string): Promise<PropertyAccessCoordinationRecord | null> {
    const r = this.accessRecords.get(id);
    return r ? structuredClone(r) : null;
  }

  async getAccessCoordinationByAppointment(appointmentId: string): Promise<PropertyAccessCoordinationRecord | null> {
    const found = Array.from(this.accessRecords.values()).find((r) => r.appointmentId === appointmentId);
    return found ? structuredClone(found) : null;
  }

  async saveVirtualSession(session: VirtualViewingSessionRecord): Promise<void> {
    this.checkWriteFailure();
    this.virtualSessions.set(session.id, structuredClone(session));
  }

  async getVirtualSessionById(id: string): Promise<VirtualViewingSessionRecord | null> {
    const r = this.virtualSessions.get(id);
    return r ? structuredClone(r) : null;
  }

  async getVirtualSessionByAppointment(appointmentId: string): Promise<VirtualViewingSessionRecord | null> {
    const found = Array.from(this.virtualSessions.values()).find((s) => s.appointmentId === appointmentId);
    return found ? structuredClone(found) : null;
  }

  async saveAttendance(record: ViewingAttendanceRecord): Promise<void> {
    this.checkWriteFailure();
    this.attendance.set(record.id, structuredClone(record));
  }

  async listAttendanceByAppointment(appointmentId: string): Promise<ViewingAttendanceRecord[]> {
    return Array.from(this.attendance.values())
      .filter((a) => a.appointmentId === appointmentId)
      .map((a) => structuredClone(a));
  }

  async saveFeedback(record: ViewingFeedbackRecord): Promise<void> {
    this.checkWriteFailure();
    this.feedback.set(record.id, structuredClone(record));
  }

  async listFeedbackByAppointment(appointmentId: string): Promise<ViewingFeedbackRecord[]> {
    return Array.from(this.feedback.values())
      .filter((f) => f.appointmentId === appointmentId)
      .map((f) => structuredClone(f));
  }

  async appendNotificationEvent(event: ViewingNotificationEventRecord): Promise<void> {
    this.notifications.push(structuredClone(event));
  }

  async listNotificationEventsByAppointment(appointmentId: string): Promise<ViewingNotificationEventRecord[]> {
    return this.notifications
      .filter((n) => n.appointmentId === appointmentId)
      .map((n) => structuredClone(n));
  }

  async getIdempotencyAppointmentId(key: string): Promise<string | null> {
    return this.idempotencyKeys.get(key) ?? null;
  }

  async saveIdempotencyAppointmentId(key: string, appointmentId: string): Promise<void> {
    this.idempotencyKeys.set(key, appointmentId);
  }
}
