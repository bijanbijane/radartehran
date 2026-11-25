/**
 * Redacts credentials and direct identifiers before Worker errors enter logs.
 * Keep this deliberately conservative: error text is untrusted and may contain
 * copied request headers, query strings, or provider responses.
 */
export function sanitizeWorkerErrorMessage(message: string): string {
  return message
    .replace(/(?:Bearer|Basic)\s+\S+/gi, '[REDACTED_AUTH_SCHEME]')
    .replace(/\beyJ[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\b/g, '[REDACTED_JWT]')
    .replace(/\b(cookie|set-cookie)\s*:\s*[^\r\n]+/gi, '$1: [REDACTED]')
    .replace(/(__Host-radar_session|radar_session)=([^;\s]+)/gi, '$1=[REDACTED]')
    .replace(/\b(x-admin-token|api[_-]?key|access[_-]?token|refresh[_-]?token|id[_-]?token|client[_-]?secret|password|secret|otp)\s*[:=]\s*["']?([^\s,"'&;]+)/gi, '$1=[REDACTED]')
    .replace(/[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/gi, '[REDACTED_EMAIL]')
    .replace(/\b(?:\+98|0098|98|0)?9\d{9}\b/g, '[REDACTED_PHONE]')
    .replace(/\b(?:(?:25[0-5]|2[0-4]\d|1?\d?\d)\.){3}(?:25[0-5]|2[0-4]\d|1?\d?\d)\b/g, '[REDACTED_IP]')
    .replace(/\bsk_[A-Za-z0-9_-]{8,200}\b/g, '[REDACTED_SUBJECT_KEY]')
    .slice(0, 240);
}
