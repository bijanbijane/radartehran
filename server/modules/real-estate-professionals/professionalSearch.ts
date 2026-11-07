/**
 * @file server/modules/real-estate-professionals/professionalSearch.ts
 * @description Public discovery and trusted verification profile lookup for real-estate professionals and agencies.
 */

import type { ProfessionalStore } from './professionalStore';
import type {
  AgencyProfile,
  ProfessionalPublicProfile,
  RealEstateRole,
  VerificationStatus,
} from './professionalTypes';

export interface ProfessionalSearchFilters {
  readonly query?: string;
  readonly cityId?: string;
  readonly hoodId?: number;
  readonly role?: RealEstateRole;
  readonly verificationStatus?: VerificationStatus;
  readonly limit?: number;
  readonly cursor?: string | null;
}

export interface ProfessionalSearchResult {
  readonly items: readonly ProfessionalPublicProfile[];
  readonly nextCursor: string | null;
  readonly totalMatches: number;
}

export class ProfessionalSearch {
  constructor(private readonly store: ProfessionalStore) {}

  public async searchProfessionals(filters: ProfessionalSearchFilters = {}): Promise<ProfessionalSearchResult> {
    const limit = Math.max(1, Math.min(50, filters.limit || 20));
    const all = await this.store.listPublicProfessionals({
      cityId: filters.cityId,
      hoodId: filters.hoodId,
      role: filters.role,
      verificationStatus: filters.verificationStatus,
      limit: 1000,
    });

    let filtered = all;

    if (filters.query) {
      const q = filters.query.trim().toLowerCase();
      filtered = filtered.filter(
        (p) =>
          p.publicDisplayName.toLowerCase().includes(q) ||
          p.publicBioFa.toLowerCase().includes(q),
      );
    }

    const totalMatches = filtered.length;
    let startIndex = 0;

    if (filters.cursor) {
      const idx = filtered.findIndex((p) => p.id === filters.cursor);
      if (idx !== -1) {
        startIndex = idx + 1;
      }
    }

    const items = filtered.slice(startIndex, startIndex + limit);
    const nextCursor = startIndex + limit < filtered.length ? items[items.length - 1].id : null;

    return {
      items,
      nextCursor,
      totalMatches,
    };
  }

  public async getPublicVerificationProfile(id: string): Promise<{
    found: boolean;
    type: 'professional' | 'agency';
    profile?: ProfessionalPublicProfile | Omit<AgencyProfile, 'privateContactPhone'>;
    verificationBadgeFa: string;
    trustNoticeFa: string;
  }> {
    // 1. Try professional
    const prof = await this.store.getPublicProfessionalById(id);
    if (prof) {
      const { badgeFa, trustNoticeFa } = this.resolveVerificationTrustMessage(prof.verificationStatus);
      return {
        found: true,
        type: 'professional',
        profile: prof,
        verificationBadgeFa: badgeFa,
        trustNoticeFa,
      };
    }

    // 2. Try agency
    const ag = await this.store.getPublicAgencyById(id);
    if (ag) {
      const { badgeFa, trustNoticeFa } = this.resolveVerificationTrustMessage(ag.verificationStatus);
      return {
        found: true,
        type: 'agency',
        profile: ag,
        verificationBadgeFa: badgeFa,
        trustNoticeFa,
      };
    }

    return {
      found: false,
      type: 'professional',
      verificationBadgeFa: 'یافت نشد',
      trustNoticeFa: 'مشخصات استعلام‌شده در بانک اطلاعاتی موجود نمی‌باشد.',
    };
  }

  private resolveVerificationTrustMessage(status: VerificationStatus): { badgeFa: string; trustNoticeFa: string } {
    switch (status) {
      case 'VERIFIED_BY_REGISTRY':
        return {
          badgeFa: 'پروانه معتبر (استعلام رسمی)',
          trustNoticeFa: 'اصالت پروانه کسب این مشاور/دفتر به صورت برخط و مستقیم از درگاه رسمی اصناف/کاتب استعلام و تایید شده است.',
        };
      case 'MANUALLY_REVIEWED_BY_PLATFORM':
        return {
          badgeFa: 'بررسی مدارک هویتی توسط رادار',
          trustNoticeFa: 'مدارک و پروانه بارگذاری‌شده توسط کارشناسان حقوقی رادار تهران تطبیق داده شده است.',
        };
      case 'SUBMITTED_UNVERIFIED':
      case 'UNDER_MANUAL_REVIEW':
      case 'PENDING_VERIFICATION':
        return {
          badgeFa: 'در صف بررسی و اعتبارسنجی',
          trustNoticeFa: 'مدارک این مشاور در صف بررسی قرار دارد و هنوز اصالت پروانه نهایی نشده است.',
        };
      case 'EXPIRED':
        return {
          badgeFa: 'پروانه منقضی‌شده',
          trustNoticeFa: 'مهلت قانونی پروانه کسب این مشاور به پایان رسیده و نیاز به تمدید صنفی دارد.',
        };
      case 'SUSPENDED':
      case 'REVOKED':
        return {
          badgeFa: 'تعلیق شده',
          trustNoticeFa: 'فعالیت این مشاور به دلایل انضباطی یا صنفی به صورت موقت یا دائم تعلیق گردیده است.',
        };
      case 'REGISTRY_UNAVAILABLE':
        return {
          badgeFa: 'استعلام دولتی موقتاً در دسترس نیست',
          trustNoticeFa: 'درگاه رسمی مراجع نظارتی در حال حاضر پاسخگو نمی‌باشد و اعتبارسنجی خودکار مقدور نیست.',
        };
      default:
        return {
          badgeFa: 'احراز نشده',
          trustNoticeFa: 'این کاربر مدرک صنفی ارائه نداده و تنها شماره تماس خود را تایید کرده است.',
        };
    }
  }
}
