/** @file src/platform/error-handling/errorReporter.ts — Bounded Ring-Buffer Error Reporter (Zero Token/PII Leak) */
import type { NormalizedFrontendError } from './errorTypes';
import { redactSensitiveErrorText } from './errorNormalizer';

const MAX_REPORTED_ERRORS = 100;
const errorLogRingBuffer: NormalizedFrontendError[] = [];

export function reportNormalizedError(err: NormalizedFrontendError): NormalizedFrontendError {
  const sanitized: NormalizedFrontendError = {
    ...err,
    technicalMessage: redactSensitiveErrorText(err.technicalMessage),
    userMessageFa: redactSensitiveErrorText(err.userMessageFa),
  };
  errorLogRingBuffer.unshift(sanitized);
  if (errorLogRingBuffer.length > MAX_REPORTED_ERRORS) {
    errorLogRingBuffer.pop();
  }
  return sanitized;
}

export function getReportedFrontendErrors(): readonly NormalizedFrontendError[] {
  return [...errorLogRingBuffer];
}

export function clearReportedFrontendErrors(): void {
  errorLogRingBuffer.length = 0;
}
