import { getFirebaseAdminFirestoreForServer } from '../../../src/utils/serverAdminAndTelegramSecurity';
import {
  HostAvailabilityWindowRecord,
  PropertyAccessCoordinationRecord,
  PropertyViewingAppointmentRecord,
  TemporarySlotHoldRecord,
  ViewingAttendanceRecord,
  ViewingFeedbackRecord,
  ViewingNotificationEventRecord,
  VirtualViewingSessionRecord,
} from './types';
import { PropertyViewingsStore } from './store';

export const VIEWINGS_FIRESTORE_COLLECTIONS = {
  availability: 'property_viewings_availability',
  holds: 'property_viewings_slot_holds',
  appointments: 'property_viewings_appointments',
  access: 'property_viewings_access_coordination',
  virtualSessions: 'property_viewings_virtual_sessions',
  attendance: 'property_viewings_attendance',
  feedback: 'property_viewings_feedback',
  notifications: 'property_viewings_notification_events',
  idempotency: 'property_viewings_idempotency',
} as const;

export class FirestorePropertyViewingsStore implements PropertyViewingsStore {
  private get db() {
    const firestore = getFirebaseAdminFirestoreForServer();
    if (!firestore) {
      throw new Error('Firebase Admin Firestore is not initialized for PropertyViewingsStore');
    }
    return firestore;
  }

  async runExclusiveBookingTransaction<T>(fn: () => Promise<T>): Promise<T> {
    return this.db.runTransaction(async () => fn());
  }

  async saveAvailabilityWindow(window: HostAvailabilityWindowRecord): Promise<void> {
    await this.db.collection(VIEWINGS_FIRESTORE_COLLECTIONS.availability).doc(window.id).set(window);
  }
  async getAvailabilityWindowById(id: string): Promise<HostAvailabilityWindowRecord | null> {
    const s = await this.db.collection(VIEWINGS_FIRESTORE_COLLECTIONS.availability).doc(id).get();
    return s.exists ? (s.data() as HostAvailabilityWindowRecord) : null;
  }
  async listAvailabilityWindowsByHost(ownerUserId: string): Promise<HostAvailabilityWindowRecord[]> {
    const s = await this.db
      .collection(VIEWINGS_FIRESTORE_COLLECTIONS.availability)
      .where('ownerUserId', '==', ownerUserId)
      .limit(100)
      .get();
    return s.docs.map((d) => d.data() as HostAvailabilityWindowRecord);
  }

  async saveSlotHold(hold: TemporarySlotHoldRecord): Promise<void> {
    await this.db.collection(VIEWINGS_FIRESTORE_COLLECTIONS.holds).doc(hold.id).set(hold);
  }
  async getSlotHoldById(id: string): Promise<TemporarySlotHoldRecord | null> {
    const s = await this.db.collection(VIEWINGS_FIRESTORE_COLLECTIONS.holds).doc(id).get();
    return s.exists ? (s.data() as TemporarySlotHoldRecord) : null;
  }
  async listSlotHoldsByPropertyOrHost(propertyId: string, hostUserId: string): Promise<TemporarySlotHoldRecord[]> {
    const [byProp, byHost] = await Promise.all([
      this.db.collection(VIEWINGS_FIRESTORE_COLLECTIONS.holds).where('propertyId', '==', propertyId).limit(50).get(),
      this.db.collection(VIEWINGS_FIRESTORE_COLLECTIONS.holds).where('hostUserId', '==', hostUserId).limit(50).get(),
    ]);
    const map = new Map<string, TemporarySlotHoldRecord>();
    for (const d of byProp.docs) map.set(d.id, d.data() as TemporarySlotHoldRecord);
    for (const d of byHost.docs) map.set(d.id, d.data() as TemporarySlotHoldRecord);
    return Array.from(map.values());
  }

  async saveAppointment(appointment: PropertyViewingAppointmentRecord): Promise<void> {
    await this.db.collection(VIEWINGS_FIRESTORE_COLLECTIONS.appointments).doc(appointment.id).set(appointment);
  }
  async getAppointmentById(id: string): Promise<PropertyViewingAppointmentRecord | null> {
    const s = await this.db.collection(VIEWINGS_FIRESTORE_COLLECTIONS.appointments).doc(id).get();
    return s.exists ? (s.data() as PropertyViewingAppointmentRecord) : null;
  }
  async listAppointmentsByProperty(propertyId: string, limit = 50): Promise<PropertyViewingAppointmentRecord[]> {
    const s = await this.db
      .collection(VIEWINGS_FIRESTORE_COLLECTIONS.appointments)
      .where('propertyId', '==', propertyId)
      .limit(Math.min(limit, 100))
      .get();
    return s.docs.map((d) => d.data() as PropertyViewingAppointmentRecord);
  }
  async listAppointmentsByHost(hostUserId: string, limit = 50): Promise<PropertyViewingAppointmentRecord[]> {
    const s = await this.db
      .collection(VIEWINGS_FIRESTORE_COLLECTIONS.appointments)
      .where('hostUserId', '==', hostUserId)
      .limit(Math.min(limit, 100))
      .get();
    return s.docs.map((d) => d.data() as PropertyViewingAppointmentRecord);
  }

  async saveAccessCoordination(record: PropertyAccessCoordinationRecord): Promise<void> {
    await this.db.collection(VIEWINGS_FIRESTORE_COLLECTIONS.access).doc(record.id).set(record);
  }
  async getAccessCoordinationById(id: string): Promise<PropertyAccessCoordinationRecord | null> {
    const s = await this.db.collection(VIEWINGS_FIRESTORE_COLLECTIONS.access).doc(id).get();
    return s.exists ? (s.data() as PropertyAccessCoordinationRecord) : null;
  }
  async getAccessCoordinationByAppointment(appointmentId: string): Promise<PropertyAccessCoordinationRecord | null> {
    const s = await this.db
      .collection(VIEWINGS_FIRESTORE_COLLECTIONS.access)
      .where('appointmentId', '==', appointmentId)
      .limit(1)
      .get();
    return s.empty ? null : (s.docs[0].data() as PropertyAccessCoordinationRecord);
  }

  async saveVirtualSession(session: VirtualViewingSessionRecord): Promise<void> {
    await this.db.collection(VIEWINGS_FIRESTORE_COLLECTIONS.virtualSessions).doc(session.id).set(session);
  }
  async getVirtualSessionById(id: string): Promise<VirtualViewingSessionRecord | null> {
    const s = await this.db.collection(VIEWINGS_FIRESTORE_COLLECTIONS.virtualSessions).doc(id).get();
    return s.exists ? (s.data() as VirtualViewingSessionRecord) : null;
  }
  async getVirtualSessionByAppointment(appointmentId: string): Promise<VirtualViewingSessionRecord | null> {
    const s = await this.db
      .collection(VIEWINGS_FIRESTORE_COLLECTIONS.virtualSessions)
      .where('appointmentId', '==', appointmentId)
      .limit(1)
      .get();
    return s.empty ? null : (s.docs[0].data() as VirtualViewingSessionRecord);
  }

  async saveAttendance(record: ViewingAttendanceRecord): Promise<void> {
    await this.db.collection(VIEWINGS_FIRESTORE_COLLECTIONS.attendance).doc(record.id).set(record);
  }
  async listAttendanceByAppointment(appointmentId: string): Promise<ViewingAttendanceRecord[]> {
    const s = await this.db
      .collection(VIEWINGS_FIRESTORE_COLLECTIONS.attendance)
      .where('appointmentId', '==', appointmentId)
      .limit(100)
      .get();
    return s.docs.map((d) => d.data() as ViewingAttendanceRecord);
  }

  async saveFeedback(record: ViewingFeedbackRecord): Promise<void> {
    await this.db.collection(VIEWINGS_FIRESTORE_COLLECTIONS.feedback).doc(record.id).set(record);
  }
  async listFeedbackByAppointment(appointmentId: string): Promise<ViewingFeedbackRecord[]> {
    const s = await this.db
      .collection(VIEWINGS_FIRESTORE_COLLECTIONS.feedback)
      .where('appointmentId', '==', appointmentId)
      .limit(100)
      .get();
    return s.docs.map((d) => d.data() as ViewingFeedbackRecord);
  }

  async appendNotificationEvent(event: ViewingNotificationEventRecord): Promise<void> {
    await this.db.collection(VIEWINGS_FIRESTORE_COLLECTIONS.notifications).doc(event.id).set(event);
  }
  async listNotificationEventsByAppointment(appointmentId: string): Promise<ViewingNotificationEventRecord[]> {
    const s = await this.db
      .collection(VIEWINGS_FIRESTORE_COLLECTIONS.notifications)
      .where('appointmentId', '==', appointmentId)
      .limit(100)
      .get();
    return s.docs.map((d) => d.data() as ViewingNotificationEventRecord);
  }

  async getIdempotencyAppointmentId(key: string): Promise<string | null> {
    const s = await this.db.collection(VIEWINGS_FIRESTORE_COLLECTIONS.idempotency).doc(key).get();
    return s.exists ? (s.data() as { appointmentId: string }).appointmentId : null;
  }
  async saveIdempotencyAppointmentId(key: string, appointmentId: string): Promise<void> {
    await this.db.collection(VIEWINGS_FIRESTORE_COLLECTIONS.idempotency).doc(key).set({
      appointmentId,
      createdAt: new Date().toISOString(),
    });
  }
}
