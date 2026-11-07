/**
 * @file server/modules/real-estate-professionals/registryVerificationAdapter.ts
 * @description Authoritative government/union registry lookup adapters with truthful offline fallback.
 */

import type {
  ProfessionalCredentialType,
  RegistryLookupResult,
} from './professionalTypes';

export interface AuthoritativeRegistryAdapter {
  readonly authorityName: string;
  readonly isConnected: boolean;
  lookupLicense(credentialType: ProfessionalCredentialType, licenseNumber: string): Promise<RegistryLookupResult>;
}

/**
 * Default adapter when external government/union API integration is not yet connected.
 * Strictly adheres to truthfulness: does NOT pretend that government lookup succeeded!
 */
export class UnavailableRegistryAdapter implements AuthoritativeRegistryAdapter {
  public readonly authorityName = 'سامانه ملی مجوزها / اتحادیه مشاورین املاک (کاتب)';
  public readonly isConnected = false;

  public async lookupLicense(
    _credentialType: ProfessionalCredentialType,
    licenseNumber: string,
  ): Promise<RegistryLookupResult> {
    return {
      status: 'UNAVAILABLE',
      authorityName: this.authorityName,
      licenseNumber,
      isExpired: false,
      failureReason: 'GATEWAY_NOT_CONFIGURED: وب‌سرویس مستقیم سامانه کاتب / درگاه اصناف در این محیط متصل نشده است.',
      executionTimeMs: 0,
    };
  }
}

/**
 * Mock adapter for comprehensive testing of registry responses (verified, expired, not found).
 */
export class MockOfficialRegistryAdapter implements AuthoritativeRegistryAdapter {
  constructor(
    public readonly authorityName: string = 'اتحادیه مشاورین املاک و سامانه کاتب',
    private readonly simulatedOutcome: 'VERIFIED' | 'EXPIRED' | 'NOT_FOUND' | 'UNAVAILABLE' = 'VERIFIED',
  ) {}

  public readonly isConnected = true;

  public async lookupLicense(
    _credentialType: ProfessionalCredentialType,
    licenseNumber: string,
  ): Promise<RegistryLookupResult> {
    if (this.simulatedOutcome === 'NOT_FOUND') {
      return {
        status: 'NOT_FOUND',
        authorityName: this.authorityName,
        licenseNumber,
        isExpired: false,
        failureReason: 'شماره پروانه در سامانه ثبت اصناف یافت نشد.',
        executionTimeMs: 40,
      };
    }

    if (this.simulatedOutcome === 'EXPIRED') {
      return {
        status: 'EXPIRED',
        authorityName: this.authorityName,
        licenseNumber,
        holderNameFa: 'دفتر معاملات نمونه',
        officialReferenceNumber: `REF_EXP_${licenseNumber}`,
        expiryDateIso: '2024-01-01T00:00:00.000Z',
        isExpired: true,
        failureReason: 'اعتبار پروانه کسب به پایان رسیده است.',
        executionTimeMs: 50,
      };
    }

    if (this.simulatedOutcome === 'UNAVAILABLE') {
      return {
        status: 'UNAVAILABLE',
        authorityName: this.authorityName,
        licenseNumber,
        isExpired: false,
        failureReason: 'درگاه استعلام دولتی در حال حاضر پاسخگو نمی‌باشد.',
        executionTimeMs: 500,
      };
    }

    return {
      status: 'VERIFIED',
      authorityName: this.authorityName,
      licenseNumber,
      holderNameFa: 'دفتر مشاور املاک رسمی',
      officialReferenceNumber: `GOV_REG_${Date.now()}`,
      expiryDateIso: '2028-12-29T00:00:00.000Z',
      isExpired: false,
      executionTimeMs: 35,
    };
  }
}
