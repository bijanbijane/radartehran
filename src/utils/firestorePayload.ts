/**
 * @file src/utils/firestorePayload.ts
 * @description Pure Firestore payload sanitization. This module deliberately has no
 * Firebase SDK or app-initialization dependency so DTO mappers and domain tests stay pure.
 */
import { recordDiagnosticEvent, sanitizePayload } from './security';

/**
 * Sanitizes and validates a document payload before writing to Firestore so no
 * undefined fields or oversized strings cause SDK or security-rule rejections.
 */
export function prepareFirestorePayload<T extends Record<string, unknown>>(data: T): T {
  try {
    const sanitized = sanitizePayload(data);
    if (sanitized === null || typeof sanitized !== 'object' || Array.isArray(sanitized)) {
      throw new Error('INVALID_SANITIZED_PAYLOAD');
    }
    const cleaned: Record<string, unknown> = {};
    for (const [key, value] of Object.entries(sanitized)) {
      if (value !== undefined) cleaned[key] = value;
    }
    return cleaned as T;
  } catch {
    recordDiagnosticEvent('Firestore', 'Payload rejected before write', 'blocked');
    throw new Error('FIRESTORE_PAYLOAD_SANITIZATION_FAILED');
  }
}
