/**
 * Employee 64 — Customer Experience, User Profiles, Personalization & Engagement Domain Service
 * (`server/modules/customer-experience/service.ts`)
 *
 * Exclusive ownership: `server/modules/customer-experience/`
 */

import crypto from 'node:crypto';
import {
  authorizePrincipal,
  CoreApiError,
  createStructuredAuditEvent,
  decodePaginationCursor,
  encodePaginationCursor,
  normalizePaginationParams,
  sanitizeTextInput,
  verifyAdminOrDelegatedPrincipal,
} from '../core';
import type { AuthenticatedPrincipal, TransactionContextLike } from '../core/types';
import { INITIAL_NEIGHBORHOODS } from '../../../src/data/neighborhoods';
import {
  createDefaultPropertyCatalogAdapter,
  CustomerExperienceRepository,
} from './repository';
import type {
  AccountLifecycleStatus,
  ConsentPurpose,
  CrossModuleDashboardDataAdapter,
  CustomerExperienceDomainEvent,
  CustomerExperienceDomainEventType,
  CustomerExperienceModuleDependencies,
  CustomerSavedSearchRecord,
  DashboardSectionEnvelope,
  DataRightsRequestRecord,
  DomainCompletionConfirmation,
  HydratedSavedPropertyView,
  NotificationChannel,
  OnboardingCheckpointState,
  ProfileCompletionStatus,
  PropertyCatalogLookupAdapter,
  PropertyCollectionRecord,
  SavedPropertyItemRecord,
  SearchAlertExecutionResult,
  SearchAlertFrequency,
  SearchAlertSubscriptionRecord,
  SupportedCityId,
  UgcAbuseReportReference,
  UgcModerationStatus,
  UgcTargetType,
  UgcVisibilityState,
  UserActivityEntryRecord,
  UserConsentRecord,
  UserDashboardAggregateView,
  UserGeneratedPropertyContentRecord,
  UserPersonalizationPreferences,
  UserPrivateProfileRecord,
  UserPublicProfileView,
} from './types';
import {
  ALLOWED_ALERT_FREQUENCIES,
  ALLOWED_CONSENT_PURPOSES,
  ALLOWED_DATA_RIGHTS_TYPES,
  ALLOWED_NOTIFICATION_CHANNELS,
  applyAndValidatePartialPreferencesUpdate,
  assertPlainObject,
  computeSearchCriteriaFingerprint,
  rejectMassAssignmentAndUnknownKeys,
  validateAndUpgradeSavedSearchFilters,
  validateProfileUpdateInput,
  validateSafeResourceId,
  validateUgcCreateOrUpdateInput,
  validateUserActivityInput,
} from './validation';

const MAX_PROFILE_REVISION_HISTORY = 25;
const MAX_COLLECTIONS_PER_USER = 50;
const MAX_SAVED_SEARCHES_PER_USER = 50;
const MAX_ACTIVE_ALERTS_PER_USER = 20;
const MAX_DAILY_ALERT_EXECUTIONS = 24;
const CURRENT_SAVED_SEARCH_SCHEMA_VERSION = 2;

export class CustomerExperienceService {
  private readonly repo: CustomerExperienceRepository;
  private readonly deps: CustomerExperienceModuleDependencies;
  private readonly catalogAdapter: PropertyCatalogLookupAdapter;
  private readonly crossModuleAdapter: CrossModuleDashboardDataAdapter;

  constructor(deps: CustomerExperienceModuleDependencies) {
    this.deps = deps;
    this.repo = new CustomerExperienceRepository(deps.txRunner);
    this.catalogAdapter = deps.propertyCatalogAdapter ?? createDefaultPropertyCatalogAdapter();
    this.crossModuleAdapter = deps.crossModuleAdapter ?? {};
  }

  private async assertUserAuthorized(
    principal: AuthenticatedPrincipal | null | undefined,
    resourceOwnerUid?: string,
  ): Promise<void> {
    const decision = await authorizePrincipal(
      principal,
      {
        minimumRole: 'verified_user',
        resourceOwnerUid,
      },
      this.deps.adminStore,
      this.deps.primaryAdminEmails,
    );
    if (!decision.allowed) {
      throw new CoreApiError(
        decision.status === 401 ? 'UNAUTHENTICATED' : 'FORBIDDEN',
        decision.status,
        decision.reason ?? 'Access denied.',
      );
    }
  }

  private async assertAdminAuthorized(
    principal: AuthenticatedPrincipal | null | undefined,
  ): Promise<void> {
    const decision = await verifyAdminOrDelegatedPrincipal(principal, this.deps.adminStore, {
      primaryAdminEmails: this.deps.primaryAdminEmails,
    });
    if (!decision.allowed) {
      throw new CoreApiError(
        decision.status === 401 ? 'UNAUTHENTICATED' : 'FORBIDDEN',
        decision.status,
        decision.reason ?? 'Administrative privileges required.',
      );
    }
  }

  private async emitDomainEvent(
    eventType: CustomerExperienceDomainEventType,
    actorUid: string,
    targetUid: string,
    resourceId: string,
    correlationId: string,
    payload: Record<string, unknown>,
  ): Promise<void> {
    if (!this.deps.onDomainEvent) return;
    const event: CustomerExperienceDomainEvent = {
      eventId: `cx_evt_${crypto.randomUUID()}`,
      eventType,
      actorUid,
      targetUid,
      resourceId,
      correlationId,
      payload,
      occurredAtIso: new Date().toISOString(),
    };
    await this.deps.onDomainEvent(event);
  }

  private computeProfileCompletion(profile: UserPrivateProfileRecord): {
    status: ProfileCompletionStatus;
    percent: number;
  } {
    let points = 0;
    const total = 5;
    if (profile.displayName && profile.displayName.trim().length >= 2) points += 1;
    if (profile.primaryCityId) points += 1;
    if (profile.contactPhone || profile.secondaryEmail || profile.email) points += 1;
    if (profile.bio && profile.bio.trim().length >= 10) points += 1;
    if (profile.onboarding.preferencesConfigured || profile.onboarding.privacyConsentAcknowledged) {
      points += 1;
    }
    const percent = Math.round((points / total) * 100);
    const status: ProfileCompletionStatus =
      percent >= 80 ? 'COMPLETE' : percent >= 40 ? 'PARTIAL' : 'INCOMPLETE';
    return { status, percent };
  }

  private projectPublicProfile(privateProfile: UserPrivateProfileRecord): UserPublicProfileView | null {
    if (
      !privateProfile.visibility.showPublicProfile ||
      privateProfile.lifecycleStatus === 'SUSPENDED' ||
      privateProfile.lifecycleStatus === 'CLOSED' ||
      privateProfile.lifecycleStatus === 'CLOSURE_REQUESTED'
    ) {
      return null;
    }

    const hasVerifiedCredentials = privateProfile.verification.professionalCredentialIds.length > 0;
    const view: UserPublicProfileView = {
      uid: privateProfile.uid,
      displayName: privateProfile.displayName,
      avatarObjectId: privateProfile.visibility.showAvatarPublicly ? privateProfile.avatarObjectId : null,
      avatarUrl: privateProfile.visibility.showAvatarPublicly ? privateProfile.avatarUrl : null,
      bio: privateProfile.visibility.showBioPublicly ? privateProfile.bio || null : null,
      primaryCityId: privateProfile.visibility.showCityPublicly ? privateProfile.primaryCityId : null,
      verificationSummary: {
        emailVerified: privateProfile.visibility.showVerifiedBadgesPublicly
          ? privateProfile.verification.emailVerified
          : false,
        hasVerifiedProfessionalCredentials: privateProfile.visibility.showVerifiedBadgesPublicly
          ? hasVerifiedCredentials
          : false,
        professionalCredentialIds: privateProfile.visibility.showVerifiedBadgesPublicly
          ? [...privateProfile.verification.professionalCredentialIds]
          : [],
      },
      accountStatus: privateProfile.lifecycleStatus === 'RESTRICTED' ? 'RESTRICTED' : 'ACTIVE',
      memberSinceIso: privateProfile.createdAtIso,
      updatedAtIso: privateProfile.updatedAtIso,
    };

    if (
      privateProfile.visibility.contactDisclosureMode === 'PUBLIC_FOR_PROFESSIONALS' &&
      hasVerifiedCredentials &&
      privateProfile.contactPhone
    ) {
      view.publicContactPhone = privateProfile.contactPhone;
    }

    return view;
  }

  private buildInitialPrivateProfile(
    principal: Pick<AuthenticatedPrincipal, 'uid' | 'email' | 'emailVerified'>,
    nowIso = new Date().toISOString(),
  ): UserPrivateProfileRecord {
    const emailPrefix = principal.email ? principal.email.split('@')[0] : '';
    const defaultName =
      emailPrefix && emailPrefix.length >= 2 ? emailPrefix.slice(0, 40) : `کاربر ${principal.uid.slice(0, 6)}`;

    const profile: UserPrivateProfileRecord = {
      uid: principal.uid,
      email: principal.email ?? '',
      displayName: defaultName,
      avatarObjectId: null,
      avatarUrl: null,
      bio: '',
      contactPhone: null,
      secondaryEmail: null,
      preferredContactMethod: 'IN_APP',
      primaryCityId: 'tehran',
      visibility: {
        showPublicProfile: true,
        showAvatarPublicly: true,
        showBioPublicly: true,
        showVerifiedBadgesPublicly: true,
        showCityPublicly: true,
        contactDisclosureMode: 'PRIVATE',
      },
      verification: {
        emailVerified: Boolean(principal.emailVerified),
        phoneVerified: false,
        professionalCredentialIds: [],
        identityVerificationRefId: null,
        verifiedAtIso: principal.emailVerified ? nowIso : null,
      },
      completionStatus: 'PARTIAL',
      completionPercent: 40,
      lifecycleStatus: 'ACTIVE',
      restrictionReason: null,
      restrictedByAdminUid: null,
      restrictedAtIso: null,
      closureRequestId: null,
      onboarding: {
        profileBasicsCompleted: false,
        preferencesConfigured: false,
        neighborhoodInterestsSelected: false,
        privacyConsentAcknowledged: false,
        firstSearchOrSavedPropertyCompleted: false,
        currentStep: 'WELCOME',
        completedAtIso: null,
        skippedAtIso: null,
        updatedAtIso: nowIso,
      },
      revision: 1,
      revisionHistory: [
        {
          revisionNumber: 1,
          changedByUid: principal.uid,
          changedFields: ['INITIALIZED'],
          timestampIso: nowIso,
        },
      ],
      createdAtIso: nowIso,
      updatedAtIso: nowIso,
    };

    const completion = this.computeProfileCompletion(profile);
    profile.completionStatus = completion.status;
    profile.completionPercent = completion.percent;
    return profile;
  }

  private buildInitialPreferences(
    uid: string,
    nowIso = new Date().toISOString(),
  ): UserPersonalizationPreferences {
    return {
      uid,
      localization: {
        locale: 'fa',
        currency: 'IRT',
        areaUnit: 'sqm',
        calendarSystem: 'jalali',
      },
      geographic: {
        activeCityId: 'tehran',
        preferredCityIds: ['tehran'],
        preferredNeighborhoodIds: [],
        preferredDistrictNumbers: [],
        commuteWorkHubId: null,
        maxCommuteMinutes: null,
        preferOutsideTrafficZone: false,
        preferNearMetro: false,
      },
      propertyInterests: {
        categories: ['residential'],
        transactionTypes: ['buy'],
        buyBudgetRangeMillions: { min: 1500, max: 35000 },
        depositRangeMillions: { min: 100, max: 5000 },
        monthlyRentRangeMillions: { min: 0, max: 250 },
        sizeSqmRange: { min: 50, max: 250 },
        bedroomsRange: { min: 1, max: 4 },
        maxBuildingAgeYears: 20,
        requiredAmenities: ['parking', 'elevator'],
      },
      interfaceAndAccessibility: {
        theme: 'system',
        reducedMotion: false,
        highContrast: false,
        fontScale: 'normal',
        defaultPrimaryView: 'map',
        defaultMapLens: 'budget',
      },
      notifications: {
        channels: {
          IN_APP: true,
          EMAIL: true,
          SMS: false,
          PUSH: false,
        },
        priceDropAlertsEnabled: true,
        savedSearchAlertsEnabled: true,
        marketPulseDigestEnabled: true,
        inquiryRepliesEnabled: true,
        quietHoursUtc: {
          enabled: false,
          startHour: 20,
          endHour: 5,
        },
      },
      personalization: {
        personalizedRecommendationsEnabled: true,
        saveRecentViewHistory: true,
        saveSearchHistory: true,
        recentHistoryRetentionDays: 30,
      },
      revision: 1,
      createdAtIso: nowIso,
      updatedAtIso: nowIso,
    };
  }

  private async ensureProfileInTx(
    tx: TransactionContextLike,
    principal: AuthenticatedPrincipal,
    nowIso = new Date().toISOString(),
  ): Promise<UserPrivateProfileRecord> {
    const existing = await this.repo.getPrivateProfileInTx(tx, principal.uid);
    if (existing) {
      if (principal.email && existing.email !== principal.email) {
        existing.email = principal.email;
      }
      if (principal.emailVerified && !existing.verification.emailVerified) {
        existing.verification.emailVerified = true;
      }
      return existing;
    }
    const created = this.buildInitialPrivateProfile(principal, nowIso);
    this.repo.setPrivateAndPublicProfileInTx(tx, created, this.projectPublicProfile(created));
    return created;
  }

  private assertAccountWritable(profile: UserPrivateProfileRecord, allowRestricted = true): void {
    if (profile.lifecycleStatus === 'SUSPENDED') {
      throw new CoreApiError('FORBIDDEN', 403, 'Account is currently suspended and cannot perform mutations.');
    }
    if (profile.lifecycleStatus === 'CLOSED') {
      throw new CoreApiError('FORBIDDEN', 403, 'Account is closed.');
    }
    if (!allowRestricted && profile.lifecycleStatus === 'RESTRICTED') {
      throw new CoreApiError(
        'FORBIDDEN',
        403,
        `Account is restricted from public authoring: ${profile.restrictionReason ?? 'policy restriction'}.`,
      );
    }
  }

  // ==========================================================================
  // 2. USER PROFILE DOMAIN & 10. ACCOUNT LIFECYCLE / ONBOARDING
  // ==========================================================================

  public async getOrInitOwnProfile(
    principal: AuthenticatedPrincipal,
  ): Promise<UserPrivateProfileRecord> {
    await this.assertUserAuthorized(principal, principal.uid);
    return this.repo.runInTransaction('cx.getOrInitOwnProfile', async (tx) => {
      return this.ensureProfileInTx(tx, principal);
    });
  }

  public async updateOwnProfile(
    principal: AuthenticatedPrincipal,
    rawInput: unknown,
    correlationId = 'cx-profile-update',
  ): Promise<UserPrivateProfileRecord> {
    await this.assertUserAuthorized(principal, principal.uid);
    const validated = validateProfileUpdateInput(rawInput);
    const nowIso = new Date().toISOString();

    const updated = await this.repo.runInTransaction('cx.updateOwnProfile', async (tx) => {
      const profile = await this.ensureProfileInTx(tx, principal, nowIso);
      this.assertAccountWritable(profile, true);

      const changedFields: string[] = [];

      if (validated.displayName !== undefined && validated.displayName !== profile.displayName) {
        profile.displayName = validated.displayName;
        changedFields.push('displayName');
      }
      if (validated.avatarObjectId !== undefined && validated.avatarObjectId !== profile.avatarObjectId) {
        profile.avatarObjectId = validated.avatarObjectId;
        changedFields.push('avatarObjectId');
      }
      if (validated.avatarUrl !== undefined && validated.avatarUrl !== profile.avatarUrl) {
        profile.avatarUrl = validated.avatarUrl;
        changedFields.push('avatarUrl');
      }
      if (validated.bio !== undefined && validated.bio !== profile.bio) {
        profile.bio = validated.bio;
        changedFields.push('bio');
      }
      if (validated.contactPhone !== undefined && validated.contactPhone !== profile.contactPhone) {
        profile.contactPhone = validated.contactPhone;
        changedFields.push('contactPhone');
      }
      if (validated.secondaryEmail !== undefined && validated.secondaryEmail !== profile.secondaryEmail) {
        profile.secondaryEmail = validated.secondaryEmail;
        changedFields.push('secondaryEmail');
      }
      if (
        validated.preferredContactMethod !== undefined &&
        validated.preferredContactMethod !== profile.preferredContactMethod
      ) {
        profile.preferredContactMethod = validated.preferredContactMethod;
        changedFields.push('preferredContactMethod');
      }
      if (validated.primaryCityId !== undefined && validated.primaryCityId !== profile.primaryCityId) {
        profile.primaryCityId = validated.primaryCityId;
        changedFields.push('primaryCityId');
      }
      if (validated.visibility !== undefined) {
        profile.visibility = {
          ...profile.visibility,
          ...validated.visibility,
        };
        changedFields.push('visibility');
      }

      profile.onboarding.profileBasicsCompleted = Boolean(
        profile.displayName.trim().length >= 2 && profile.primaryCityId,
      );
      if (profile.onboarding.currentStep === 'WELCOME' && profile.onboarding.profileBasicsCompleted) {
        profile.onboarding.currentStep = 'PREFERENCES';
      }
      profile.onboarding.updatedAtIso = nowIso;

      const completion = this.computeProfileCompletion(profile);
      profile.completionStatus = completion.status;
      profile.completionPercent = completion.percent;

      if (changedFields.length > 0) {
        profile.revision += 1;
        profile.updatedAtIso = nowIso;
        profile.revisionHistory = [
          ...profile.revisionHistory.slice(-(MAX_PROFILE_REVISION_HISTORY - 1)),
          {
            revisionNumber: profile.revision,
            changedByUid: principal.uid,
            changedFields,
            timestampIso: nowIso,
          },
        ];
      }

      this.repo.setPrivateAndPublicProfileInTx(tx, profile, this.projectPublicProfile(profile));
      return profile;
    });

    await this.emitDomainEvent('cx.profile.updated', principal.uid, principal.uid, principal.uid, correlationId, {
      revision: updated.revision,
      completionPercent: updated.completionPercent,
    });

    return updated;
  }

  public async getPublicProfile(targetUid: string): Promise<UserPublicProfileView> {
    const cleanUid = validateSafeResourceId(targetUid, 'uid');
    const pub = await this.repo.getPublicProfile(cleanUid);
    if (!pub) {
      throw new CoreApiError('NOT_FOUND', 404, 'Public profile not found or visibility is private.');
    }
    return pub;
  }

  public async updateOnboardingCheckpoint(
    principal: AuthenticatedPrincipal,
    rawInput: unknown,
    correlationId = 'cx-onboarding',
  ): Promise<UserPrivateProfileRecord> {
    await this.assertUserAuthorized(principal, principal.uid);
    const obj = assertPlainObject(rawInput, 'Onboarding checkpoint');
    rejectMassAssignmentAndUnknownKeys(
      obj,
      new Set([
        'profileBasicsCompleted',
        'preferencesConfigured',
        'neighborhoodInterestsSelected',
        'privacyConsentAcknowledged',
        'firstSearchOrSavedPropertyCompleted',
        'currentStep',
        'skipRemaining',
      ]),
    );

    const nowIso = new Date().toISOString();
    const updated = await this.repo.runInTransaction('cx.updateOnboardingCheckpoint', async (tx) => {
      const profile = await this.ensureProfileInTx(tx, principal, nowIso);
      this.assertAccountWritable(profile, true);

      for (const boolKey of [
        'profileBasicsCompleted',
        'preferencesConfigured',
        'neighborhoodInterestsSelected',
        'privacyConsentAcknowledged',
        'firstSearchOrSavedPropertyCompleted',
      ] as const) {
        if (typeof obj[boolKey] === 'boolean') {
          profile.onboarding[boolKey] = obj[boolKey] as boolean;
        }
      }

      const allowedSteps: OnboardingCheckpointState['currentStep'][] = [
        'WELCOME',
        'PROFILE_BASICS',
        'PREFERENCES',
        'NEIGHBORHOODS',
        'PRIVACY',
        'COMPLETED',
      ];
      if (obj.currentStep !== undefined) {
        if (typeof obj.currentStep !== 'string' || !allowedSteps.includes(obj.currentStep as any)) {
          throw new CoreApiError('VALIDATION_FAILED', 400, 'Invalid onboarding currentStep.');
        }
        profile.onboarding.currentStep = obj.currentStep as OnboardingCheckpointState['currentStep'];
      }

      if (obj.skipRemaining === true) {
        profile.onboarding.skippedAtIso = nowIso;
        profile.onboarding.currentStep = 'COMPLETED';
      }

      if (
        profile.onboarding.currentStep === 'COMPLETED' ||
        (profile.onboarding.profileBasicsCompleted &&
          profile.onboarding.preferencesConfigured &&
          profile.onboarding.privacyConsentAcknowledged)
      ) {
        profile.onboarding.currentStep = 'COMPLETED';
        if (!profile.onboarding.completedAtIso) {
          profile.onboarding.completedAtIso = nowIso;
        }
        if (profile.lifecycleStatus === 'PENDING_ONBOARDING') {
          profile.lifecycleStatus = 'ACTIVE';
        }
      }

      profile.onboarding.updatedAtIso = nowIso;
      const completion = this.computeProfileCompletion(profile);
      profile.completionStatus = completion.status;
      profile.completionPercent = completion.percent;
      profile.revision += 1;
      profile.updatedAtIso = nowIso;

      this.repo.setPrivateAndPublicProfileInTx(tx, profile, this.projectPublicProfile(profile));
      return profile;
    });

    await this.emitDomainEvent('cx.profile.updated', principal.uid, principal.uid, principal.uid, correlationId, {
      onboardingStep: updated.onboarding.currentStep,
    });
    return updated;
  }

  public async adminSetAccountLifecycleStatus(
    adminPrincipal: AuthenticatedPrincipal,
    targetUid: string,
    rawInput: unknown,
    correlationId = 'cx-admin-lifecycle',
  ): Promise<UserPrivateProfileRecord> {
    await this.assertAdminAuthorized(adminPrincipal);

    const cleanUid = validateSafeResourceId(targetUid, 'targetUid');
    const obj = assertPlainObject(rawInput, 'Admin lifecycle update');
    rejectMassAssignmentAndUnknownKeys(
      obj,
      new Set(['lifecycleStatus', 'reason', 'professionalCredentialIds', 'phoneVerified']),
    );

    const allowedStatuses: AccountLifecycleStatus[] = [
      'PENDING_ONBOARDING',
      'ACTIVE',
      'RESTRICTED',
      'SUSPENDED',
      'CLOSURE_REQUESTED',
      'CLOSED',
    ];
    if (typeof obj.lifecycleStatus !== 'string' || !allowedStatuses.includes(obj.lifecycleStatus as AccountLifecycleStatus)) {
      throw new CoreApiError('VALIDATION_FAILED', 400, 'Invalid lifecycleStatus.');
    }
    const reason = typeof obj.reason === 'string' ? sanitizeTextInput(obj.reason).slice(0, 300) : '';
    if ((obj.lifecycleStatus === 'RESTRICTED' || obj.lifecycleStatus === 'SUSPENDED') && reason.length < 3) {
      throw new CoreApiError('VALIDATION_FAILED', 400, 'A reason is required when restricting or suspending an account.');
    }

    const nowIso = new Date().toISOString();
    const updated = await this.repo.runInTransaction('cx.adminSetAccountLifecycleStatus', async (tx) => {
      let profile = await this.repo.getPrivateProfileInTx(tx, cleanUid);
      if (!profile) {
        profile = this.buildInitialPrivateProfile(
          { uid: cleanUid, email: '', emailVerified: false },
          nowIso,
        );
      }

      const previousStatus = profile.lifecycleStatus;
      profile.lifecycleStatus = obj.lifecycleStatus as AccountLifecycleStatus;

      if (profile.lifecycleStatus === 'RESTRICTED' || profile.lifecycleStatus === 'SUSPENDED') {
        profile.restrictionReason = reason;
        profile.restrictedByAdminUid = adminPrincipal.uid;
        profile.restrictedAtIso = nowIso;
      } else if (profile.lifecycleStatus === 'ACTIVE') {
        profile.restrictionReason = null;
        profile.restrictedByAdminUid = null;
        profile.restrictedAtIso = null;
      }

      if (Array.isArray(obj.professionalCredentialIds)) {
        profile.verification.professionalCredentialIds = obj.professionalCredentialIds
          .filter((id): id is string => typeof id === 'string')
          .map((id) => validateSafeResourceId(id, 'professionalCredentialId'));
        profile.verification.verifiedAtIso = nowIso;
      }
      if (typeof obj.phoneVerified === 'boolean') {
        profile.verification.phoneVerified = obj.phoneVerified;
      }

      profile.revision += 1;
      profile.updatedAtIso = nowIso;
      profile.revisionHistory = [
        ...profile.revisionHistory.slice(-(MAX_PROFILE_REVISION_HISTORY - 1)),
        {
          revisionNumber: profile.revision,
          changedByUid: adminPrincipal.uid,
          changedFields: [`lifecycleStatus:${previousStatus}->${profile.lifecycleStatus}`],
          reason,
          timestampIso: nowIso,
        },
      ];

      this.repo.setPrivateAndPublicProfileInTx(tx, profile, this.projectPublicProfile(profile));
      return profile;
    });

    await this.deps.auditSink.writeAuditEvent(
      createStructuredAuditEvent({
        principal: adminPrincipal,
        correlationId,
        action: 'admin.account_lifecycle.update',
        targetCollection: 'cx_profiles_private',
        targetResourceId: cleanUid,
        outcome: 'SUCCESS',
        metadata: {
          lifecycleStatus: updated.lifecycleStatus,
          reason,
        },
      }),
    );

    await this.emitDomainEvent(
      'cx.account_lifecycle.changed',
      adminPrincipal.uid,
      cleanUid,
      cleanUid,
      correlationId,
      { lifecycleStatus: updated.lifecycleStatus, reason },
    );

    return updated;
  }

  // ==========================================================================
  // 3. USER PREFERENCES & PERSONALIZATION
  // ==========================================================================

  public async getOwnPreferences(
    principal: AuthenticatedPrincipal,
  ): Promise<UserPersonalizationPreferences> {
    await this.assertUserAuthorized(principal, principal.uid);
    return this.repo.runInTransaction('cx.getOwnPreferences', async (tx) => {
      const existing = await this.repo.getPreferencesInTx(tx, principal.uid);
      if (existing) return existing;
      const initial = this.buildInitialPreferences(principal.uid);
      this.repo.setPreferencesInTx(tx, initial);
      return initial;
    });
  }

  public async updateOwnPreferences(
    principal: AuthenticatedPrincipal,
    rawPatch: unknown,
    correlationId = 'cx-preferences-update',
  ): Promise<UserPersonalizationPreferences> {
    await this.assertUserAuthorized(principal, principal.uid);
    const nowIso = new Date().toISOString();

    const updated = await this.repo.runInTransaction('cx.updateOwnPreferences', async (tx) => {
      const profile = await this.ensureProfileInTx(tx, principal, nowIso);
      this.assertAccountWritable(profile, true);

      const existing =
        (await this.repo.getPreferencesInTx(tx, principal.uid)) ??
        this.buildInitialPreferences(principal.uid, nowIso);

      const merged = applyAndValidatePartialPreferencesUpdate(existing, rawPatch, nowIso);
      this.repo.setPreferencesInTx(tx, merged);

      profile.onboarding.preferencesConfigured = true;
      if (merged.geographic.preferredNeighborhoodIds.length > 0) {
        profile.onboarding.neighborhoodInterestsSelected = true;
      }
      const completion = this.computeProfileCompletion(profile);
      profile.completionStatus = completion.status;
      profile.completionPercent = completion.percent;
      profile.updatedAtIso = nowIso;
      this.repo.setPrivateAndPublicProfileInTx(tx, profile, this.projectPublicProfile(profile));

      return merged;
    });

    await this.emitDomainEvent(
      'cx.preferences.updated',
      principal.uid,
      principal.uid,
      principal.uid,
      correlationId,
      { revision: updated.revision },
    );

    return updated;
  }

  // ==========================================================================
  // 4. SAVED PROPERTIES, FAVORITES & NAMED COLLECTIONS
  // ==========================================================================

  private async ensureDefaultFavoritesCollectionInTx(
    tx: TransactionContextLike,
    ownerUid: string,
    nowIso: string,
  ): Promise<PropertyCollectionRecord> {
    const collections = await this.repo.listCollectionsByOwnerInTx(tx, ownerUid);
    const existingDefault = collections.find((c) => c.isDefaultFavorites);
    if (existingDefault) return existingDefault;

    const defaultCollection: PropertyCollectionRecord = {
      id: `col_fav_${ownerUid}`,
      ownerUid,
      name: 'علاقه‌مندی‌ها',
      description: 'مجموعه پیش‌فرض املاک مورد علاقه',
      privateNote: '',
      isDefaultFavorites: true,
      displayOrder: 0,
      propertyIds: [],
      visibility: 'PRIVATE',
      createdAtIso: nowIso,
      updatedAtIso: nowIso,
    };
    await this.repo.upsertCollectionInTx(tx, defaultCollection);
    return defaultCollection;
  }

  public async saveOrFavoriteProperty(
    principal: AuthenticatedPrincipal,
    rawInput: unknown,
    correlationId = 'cx-save-property',
  ): Promise<SavedPropertyItemRecord> {
    await this.assertUserAuthorized(principal, principal.uid);
    const obj = assertPlainObject(rawInput, 'Save property input');
    rejectMassAssignmentAndUnknownKeys(
      obj,
      new Set(['propertyId', 'isFavorite', 'collectionIds', 'privateNote', 'customTags']),
    );

    const propertyId = validateSafeResourceId(obj.propertyId, 'propertyId');
    const lookup = await this.catalogAdapter.getPropertyById(propertyId, principal.uid);
    if (!lookup.exists) {
      throw new CoreApiError('NOT_FOUND', 404, `Referenced property "${propertyId}" does not exist.`);
    }
    if (!lookup.accessible || lookup.availabilityState === 'RESTRICTED' || lookup.availabilityState === 'DELETED') {
      throw new CoreApiError(
        'FORBIDDEN',
        403,
        `Referenced property "${propertyId}" is restricted or unavailable and cannot be saved.`,
      );
    }

    const isFavorite = obj.isFavorite !== undefined ? Boolean(obj.isFavorite) : true;
    const privateNote =
      typeof obj.privateNote === 'string' ? sanitizeTextInput(obj.privateNote).slice(0, 500) : undefined;

    let customTags: string[] | undefined;
    if (obj.customTags !== undefined) {
      if (!Array.isArray(obj.customTags) || obj.customTags.length > 10) {
        throw new CoreApiError('VALIDATION_FAILED', 400, 'customTags must be an array of up to 10 tags.');
      }
      customTags = obj.customTags.map((t) => {
        if (typeof t !== 'string') throw new CoreApiError('VALIDATION_FAILED', 400, 'Tag must be string.');
        return sanitizeTextInput(t).slice(0, 32);
      });
    }

    const requestedCollectionIds: string[] = [];
    if (obj.collectionIds !== undefined) {
      if (!Array.isArray(obj.collectionIds) || obj.collectionIds.length > 20) {
        throw new CoreApiError('VALIDATION_FAILED', 400, 'collectionIds must be an array of at most 20 collection IDs.');
      }
      for (const cid of obj.collectionIds) {
        const cleanCid = validateSafeResourceId(cid, 'collectionId');
        if (!requestedCollectionIds.includes(cleanCid)) requestedCollectionIds.push(cleanCid);
      }
    }

    const nowIso = new Date().toISOString();
    const record = await this.repo.runInTransaction('cx.saveOrFavoriteProperty', async (tx) => {
      const profile = await this.ensureProfileInTx(tx, principal, nowIso);
      this.assertAccountWritable(profile, true);

      const defaultFav = await this.ensureDefaultFavoritesCollectionInTx(tx, principal.uid, nowIso);
      const existing = await this.repo.getSavedPropertyInTx(tx, principal.uid, propertyId);

      const finalCollectionIds = new Set<string>(existing?.collectionIds ?? []);
      for (const cid of requestedCollectionIds) {
        const col = await this.repo.getCollectionInTx(tx, cid);
        if (!col) {
          throw new CoreApiError('NOT_FOUND', 404, `Collection "${cid}" not found.`);
        }
        if (col.ownerUid !== principal.uid) {
          throw new CoreApiError('FORBIDDEN', 403, 'Cannot add property to another user collection.');
        }
        finalCollectionIds.add(cid);
      }

      if (isFavorite) {
        finalCollectionIds.add(defaultFav.id);
      } else if (obj.isFavorite === false) {
        finalCollectionIds.delete(defaultFav.id);
      }

      for (const cid of finalCollectionIds) {
        const col = await this.repo.getCollectionInTx(tx, cid);
        if (col && col.ownerUid === principal.uid && !col.propertyIds.includes(propertyId)) {
          col.propertyIds = [...col.propertyIds, propertyId];
          col.updatedAtIso = nowIso;
          await this.repo.upsertCollectionInTx(tx, col);
        }
      }

      if (!isFavorite) {
        const favCol = await this.repo.getCollectionInTx(tx, defaultFav.id);
        if (favCol && favCol.propertyIds.includes(propertyId)) {
          favCol.propertyIds = favCol.propertyIds.filter((id) => id !== propertyId);
          favCol.updatedAtIso = nowIso;
          await this.repo.upsertCollectionInTx(tx, favCol);
        }
      }

      const itemSnapshot = lookup.item;
      const savedPrice =
        itemSnapshot?.transactionType === 'rent'
          ? itemSnapshot.depositMillions
          : (itemSnapshot?.totalPriceMillions ?? null);

      const savedRecord: SavedPropertyItemRecord = {
        id: existing?.id ?? `sav_${principal.uid}_${propertyId}`,
        ownerUid: principal.uid,
        propertyId,
        collectionIds: Array.from(finalCollectionIds),
        isFavorite,
        privateNote: privateNote !== undefined ? privateNote : (existing?.privateNote ?? ''),
        customTags: customTags !== undefined ? customTags : (existing?.customTags ?? []),
        savedPriceMillionsSnapshot: existing?.savedPriceMillionsSnapshot ?? savedPrice,
        cityIdSnapshot: (itemSnapshot?.cityId as SupportedCityId) ?? existing?.cityIdSnapshot ?? 'tehran',
        hoodIdSnapshot: itemSnapshot?.neighborhoodId ?? existing?.hoodIdSnapshot ?? 1,
        titleSnapshot: itemSnapshot?.title ?? existing?.titleSnapshot ?? propertyId,
        createdAtIso: existing?.createdAtIso ?? nowIso,
        updatedAtIso: nowIso,
      };

      await this.repo.upsertSavedPropertyInTx(tx, savedRecord);

      if (!profile.onboarding.firstSearchOrSavedPropertyCompleted) {
        profile.onboarding.firstSearchOrSavedPropertyCompleted = true;
        this.repo.setPrivateAndPublicProfileInTx(tx, profile, this.projectPublicProfile(profile));
      }

      return savedRecord;
    });

    await this.emitDomainEvent('cx.favorite.changed', principal.uid, principal.uid, propertyId, correlationId, {
      action: 'SAVED',
      isFavorite: record.isFavorite,
      collectionIds: record.collectionIds,
    });

    return record;
  }

  public async removeSavedProperty(
    principal: AuthenticatedPrincipal,
    propertyId: string,
    correlationId = 'cx-remove-saved-property',
  ): Promise<{ removed: boolean; propertyId: string }> {
    await this.assertUserAuthorized(principal, principal.uid);
    const cleanPropId = validateSafeResourceId(propertyId, 'propertyId');
    const nowIso = new Date().toISOString();

    const removed = await this.repo.runInTransaction('cx.removeSavedProperty', async (tx) => {
      const existing = await this.repo.getSavedPropertyInTx(tx, principal.uid, cleanPropId);
      if (!existing) return false;

      const collections = await this.repo.listCollectionsByOwnerInTx(tx, principal.uid);
      for (const col of collections) {
        if (col.propertyIds.includes(cleanPropId)) {
          col.propertyIds = col.propertyIds.filter((id) => id !== cleanPropId);
          col.updatedAtIso = nowIso;
          await this.repo.upsertCollectionInTx(tx, col);
        }
      }

      await this.repo.deleteSavedPropertyInTx(tx, principal.uid, cleanPropId);
      return true;
    });

    if (removed) {
      await this.emitDomainEvent('cx.favorite.changed', principal.uid, principal.uid, cleanPropId, correlationId, {
        action: 'REMOVED',
      });
    }

    return { removed, propertyId: cleanPropId };
  }

  public async hydrateSavedProperty(
    record: SavedPropertyItemRecord,
    requesterUid: string,
  ): Promise<HydratedSavedPropertyView> {
    const lookup = await this.catalogAdapter.getPropertyById(record.propertyId, requesterUid);
    if (!lookup.exists || !lookup.item || lookup.availabilityState !== 'AVAILABLE') {
      return {
        ...record,
        availabilityState: lookup.availabilityState,
        currentPriceMillions: null,
        priceDeltaMillions: null,
        liveSummary: null,
      };
    }

    const currentPrice =
      lookup.item.transactionType === 'rent'
        ? lookup.item.depositMillions
        : lookup.item.totalPriceMillions;
    const priceDelta =
      record.savedPriceMillionsSnapshot !== null
        ? currentPrice - record.savedPriceMillionsSnapshot
        : null;

    return {
      ...record,
      availabilityState: lookup.availabilityState,
      currentPriceMillions: currentPrice,
      priceDeltaMillions: priceDelta,
      liveSummary: {
        title: lookup.item.title,
        sqm: lookup.item.areaSqm,
        dealType: lookup.item.transactionType,
        hoodName: lookup.item.neighborhoodName,
        discountPercent: lookup.item.bargainDiscountPercent,
      },
    };
  }

  public async listSavedProperties(
    principal: AuthenticatedPrincipal,
    query: {
      limit?: unknown;
      cursor?: unknown;
      collectionId?: string;
      favoritesOnly?: boolean;
    } = {},
  ): Promise<{
    items: HydratedSavedPropertyView[];
    nextCursor: string | null;
    hasMore: boolean;
    totalCount: number;
  }> {
    await this.assertUserAuthorized(principal, principal.uid);
    const pagination = normalizePaginationParams(query);

    const allSaved = await this.repo.runInTransaction('cx.listSavedProperties', (tx) =>
      this.repo.listSavedPropertiesByOwnerInTx(tx, principal.uid),
    );

    let filtered = allSaved.sort((a, b) => b.updatedAtIso.localeCompare(a.updatedAtIso));
    if (query.favoritesOnly) {
      filtered = filtered.filter((item) => item.isFavorite);
    }
    if (query.collectionId) {
      const cleanColId = validateSafeResourceId(query.collectionId, 'collectionId');
      filtered = filtered.filter((item) => item.collectionIds.includes(cleanColId));
    }

    let startIndex = 0;
    if (pagination.cursor) {
      const decoded = decodePaginationCursor(pagination.cursor);
      const idx = filtered.findIndex((i) => i.id === decoded.docId);
      if (idx >= 0) startIndex = idx + 1;
    }

    const slice = filtered.slice(startIndex, startIndex + pagination.limit);
    const hasMore = startIndex + pagination.limit < filtered.length;
    const lastItem = slice[slice.length - 1];
    const nextCursor =
      hasMore && lastItem
        ? encodePaginationCursor({
            sortValue: lastItem.updatedAtIso,
            docId: lastItem.id,
            direction: 'desc',
          })
        : null;

    const hydrated: HydratedSavedPropertyView[] = [];
    for (const item of slice) {
      hydrated.push(await this.hydrateSavedProperty(item, principal.uid));
    }

    return {
      items: hydrated,
      nextCursor,
      hasMore,
      totalCount: filtered.length,
    };
  }

  public async createCollection(
    principal: AuthenticatedPrincipal,
    rawInput: unknown,
    correlationId = 'cx-create-collection',
  ): Promise<PropertyCollectionRecord> {
    await this.assertUserAuthorized(principal, principal.uid);
    const obj = assertPlainObject(rawInput, 'Create collection');
    rejectMassAssignmentAndUnknownKeys(obj, new Set(['name', 'description', 'privateNote', 'visibility']));

    if (typeof obj.name !== 'string') {
      throw new CoreApiError('VALIDATION_FAILED', 400, 'Collection name must be a string.');
    }
    const name = sanitizeTextInput(obj.name);
    if (name.length < 2 || name.length > 60) {
      throw new CoreApiError('VALIDATION_FAILED', 400, 'Collection name must be between 2 and 60 characters.');
    }
    const description =
      typeof obj.description === 'string' ? sanitizeTextInput(obj.description).slice(0, 240) : '';
    const privateNote =
      typeof obj.privateNote === 'string' ? sanitizeTextInput(obj.privateNote).slice(0, 500) : '';
    const visibility = obj.visibility === 'SHARED_READONLY_TOKEN' ? 'SHARED_READONLY_TOKEN' : 'PRIVATE';

    const nowIso = new Date().toISOString();
    const created = await this.repo.runInTransaction('cx.createCollection', async (tx) => {
      const profile = await this.ensureProfileInTx(tx, principal, nowIso);
      this.assertAccountWritable(profile, true);

      const existing = await this.repo.listCollectionsByOwnerInTx(tx, principal.uid);
      if (existing.length >= MAX_COLLECTIONS_PER_USER) {
        throw new CoreApiError('RATE_LIMITED', 429, `Maximum of ${MAX_COLLECTIONS_PER_USER} collections reached.`);
      }
      if (existing.some((c) => c.name.toLowerCase() === name.toLowerCase())) {
        throw new CoreApiError('CONFLICT', 409, `A collection named "${name}" already exists.`);
      }

      const maxOrder = existing.reduce((max, c) => Math.max(max, c.displayOrder), 0);
      const collection: PropertyCollectionRecord = {
        id: `col_${crypto.randomUUID().slice(0, 12)}`,
        ownerUid: principal.uid,
        name,
        description,
        privateNote,
        isDefaultFavorites: false,
        displayOrder: maxOrder + 1,
        propertyIds: [],
        visibility,
        createdAtIso: nowIso,
        updatedAtIso: nowIso,
      };
      await this.repo.upsertCollectionInTx(tx, collection);
      return collection;
    });

    await this.emitDomainEvent('cx.collection.changed', principal.uid, principal.uid, created.id, correlationId, {
      action: 'CREATED',
      name: created.name,
    });
    return created;
  }

  public async updateCollection(
    principal: AuthenticatedPrincipal,
    collectionId: string,
    rawInput: unknown,
    correlationId = 'cx-update-collection',
  ): Promise<PropertyCollectionRecord> {
    await this.assertUserAuthorized(principal, principal.uid);
    const cleanId = validateSafeResourceId(collectionId, 'collectionId');
    const obj = assertPlainObject(rawInput, 'Update collection');
    rejectMassAssignmentAndUnknownKeys(obj, new Set(['name', 'description', 'privateNote', 'visibility']));

    const nowIso = new Date().toISOString();
    const updated = await this.repo.runInTransaction('cx.updateCollection', async (tx) => {
      const col = await this.repo.getCollectionInTx(tx, cleanId);
      if (!col) throw new CoreApiError('NOT_FOUND', 404, 'Collection not found.');
      if (col.ownerUid !== principal.uid) {
        throw new CoreApiError('FORBIDDEN', 403, 'You do not own this collection.');
      }

      if (obj.name !== undefined) {
        if (typeof obj.name !== 'string') throw new CoreApiError('VALIDATION_FAILED', 400, 'name must be string.');
        const cleanName = sanitizeTextInput(obj.name);
        if (cleanName.length < 2 || cleanName.length > 60) {
          throw new CoreApiError('VALIDATION_FAILED', 400, 'name must be 2..60 characters.');
        }
        const allCols = await this.repo.listCollectionsByOwnerInTx(tx, principal.uid);
        if (allCols.some((c) => c.id !== cleanId && c.name.toLowerCase() === cleanName.toLowerCase())) {
          throw new CoreApiError('CONFLICT', 409, `A collection named "${cleanName}" already exists.`);
        }
        col.name = cleanName;
      }
      if (obj.description !== undefined) {
        if (typeof obj.description !== 'string') {
          throw new CoreApiError('VALIDATION_FAILED', 400, 'description must be string.');
        }
        col.description = sanitizeTextInput(obj.description).slice(0, 240);
      }
      if (obj.privateNote !== undefined) {
        if (typeof obj.privateNote !== 'string') {
          throw new CoreApiError('VALIDATION_FAILED', 400, 'privateNote must be string.');
        }
        col.privateNote = sanitizeTextInput(obj.privateNote).slice(0, 500);
      }
      if (obj.visibility !== undefined) {
        if (obj.visibility !== 'PRIVATE' && obj.visibility !== 'SHARED_READONLY_TOKEN') {
          throw new CoreApiError('VALIDATION_FAILED', 400, 'Invalid collection visibility.');
        }
        col.visibility = obj.visibility;
      }

      col.updatedAtIso = nowIso;
      await this.repo.upsertCollectionInTx(tx, col);
      return col;
    });

    await this.emitDomainEvent('cx.collection.changed', principal.uid, principal.uid, updated.id, correlationId, {
      action: 'UPDATED',
    });
    return updated;
  }

  public async reorderCollections(
    principal: AuthenticatedPrincipal,
    orderedCollectionIds: unknown,
    correlationId = 'cx-reorder-collections',
  ): Promise<PropertyCollectionRecord[]> {
    await this.assertUserAuthorized(principal, principal.uid);
    if (!Array.isArray(orderedCollectionIds) || orderedCollectionIds.length === 0) {
      throw new CoreApiError('VALIDATION_FAILED', 400, 'orderedCollectionIds must be a non-empty array.');
    }
    const cleanIds = orderedCollectionIds.map((id) => validateSafeResourceId(id, 'collectionId'));
    const nowIso = new Date().toISOString();

    const reordered = await this.repo.runInTransaction('cx.reorderCollections', async (tx) => {
      const existing = await this.repo.listCollectionsByOwnerInTx(tx, principal.uid);
      const map = new Map(existing.map((c) => [c.id, c]));

      for (const id of cleanIds) {
        if (!map.has(id)) {
          throw new CoreApiError('FORBIDDEN', 403, `Collection "${id}" is not owned by the current user.`);
        }
      }

      let orderCounter = 1;
      for (const id of cleanIds) {
        const col = map.get(id)!;
        col.displayOrder = orderCounter++;
        col.updatedAtIso = nowIso;
        await this.repo.upsertCollectionInTx(tx, col);
      }

      for (const col of existing) {
        if (!cleanIds.includes(col.id)) {
          col.displayOrder = orderCounter++;
          await this.repo.upsertCollectionInTx(tx, col);
        }
      }

      return this.repo.listCollectionsByOwnerInTx(tx, principal.uid);
    });

    await this.emitDomainEvent('cx.collection.changed', principal.uid, principal.uid, principal.uid, correlationId, {
      action: 'REORDERED',
    });
    return reordered;
  }

  public async addPropertyToCollection(
    principal: AuthenticatedPrincipal,
    collectionId: string,
    propertyId: string,
    correlationId = 'cx-col-add-prop',
  ): Promise<PropertyCollectionRecord> {
    await this.assertUserAuthorized(principal, principal.uid);
    const cleanColId = validateSafeResourceId(collectionId, 'collectionId');
    const cleanPropId = validateSafeResourceId(propertyId, 'propertyId');

    const lookup = await this.catalogAdapter.getPropertyById(cleanPropId, principal.uid);
    if (!lookup.exists) {
      throw new CoreApiError('NOT_FOUND', 404, `Property "${cleanPropId}" does not exist.`);
    }
    if (!lookup.accessible || lookup.availabilityState === 'RESTRICTED' || lookup.availabilityState === 'DELETED') {
      throw new CoreApiError('FORBIDDEN', 403, `Property "${cleanPropId}" is restricted or unavailable.`);
    }

    const nowIso = new Date().toISOString();
    const updatedCol = await this.repo.runInTransaction('cx.addPropertyToCollection', async (tx) => {
      const col = await this.repo.getCollectionInTx(tx, cleanColId);
      if (!col) throw new CoreApiError('NOT_FOUND', 404, 'Collection not found.');
      if (col.ownerUid !== principal.uid) {
        throw new CoreApiError('FORBIDDEN', 403, 'Cannot modify another user collection.');
      }
      if (col.propertyIds.includes(cleanPropId)) {
        throw new CoreApiError('CONFLICT', 409, 'Property is already in this collection.');
      }

      col.propertyIds = [...col.propertyIds, cleanPropId];
      col.updatedAtIso = nowIso;
      await this.repo.upsertCollectionInTx(tx, col);

      const saved = await this.repo.getSavedPropertyInTx(tx, principal.uid, cleanPropId);
      if (saved) {
        if (!saved.collectionIds.includes(cleanColId)) {
          saved.collectionIds = [...saved.collectionIds, cleanColId];
          saved.updatedAtIso = nowIso;
          await this.repo.upsertSavedPropertyInTx(tx, saved);
        }
      } else {
        const item = lookup.item;
        const newSaved: SavedPropertyItemRecord = {
          id: `sav_${principal.uid}_${cleanPropId}`,
          ownerUid: principal.uid,
          propertyId: cleanPropId,
          collectionIds: [cleanColId],
          isFavorite: col.isDefaultFavorites,
          privateNote: '',
          customTags: [],
          savedPriceMillionsSnapshot: item?.totalPriceMillions ?? null,
          cityIdSnapshot: (item?.cityId as SupportedCityId) ?? 'tehran',
          hoodIdSnapshot: item?.neighborhoodId ?? 1,
          titleSnapshot: item?.title ?? cleanPropId,
          createdAtIso: nowIso,
          updatedAtIso: nowIso,
        };
        await this.repo.upsertSavedPropertyInTx(tx, newSaved);
      }

      return col;
    });

    await this.emitDomainEvent('cx.collection.changed', principal.uid, principal.uid, cleanColId, correlationId, {
      action: 'PROPERTY_ADDED',
      propertyId: cleanPropId,
    });
    return updatedCol;
  }

  public async removePropertyFromCollection(
    principal: AuthenticatedPrincipal,
    collectionId: string,
    propertyId: string,
    correlationId = 'cx-col-remove-prop',
  ): Promise<PropertyCollectionRecord> {
    await this.assertUserAuthorized(principal, principal.uid);
    const cleanColId = validateSafeResourceId(collectionId, 'collectionId');
    const cleanPropId = validateSafeResourceId(propertyId, 'propertyId');
    const nowIso = new Date().toISOString();

    const updatedCol = await this.repo.runInTransaction('cx.removePropertyFromCollection', async (tx) => {
      const col = await this.repo.getCollectionInTx(tx, cleanColId);
      if (!col) throw new CoreApiError('NOT_FOUND', 404, 'Collection not found.');
      if (col.ownerUid !== principal.uid) {
        throw new CoreApiError('FORBIDDEN', 403, 'Cannot modify another user collection.');
      }

      col.propertyIds = col.propertyIds.filter((id) => id !== cleanPropId);
      col.updatedAtIso = nowIso;
      await this.repo.upsertCollectionInTx(tx, col);

      const saved = await this.repo.getSavedPropertyInTx(tx, principal.uid, cleanPropId);
      if (saved) {
        saved.collectionIds = saved.collectionIds.filter((cid) => cid !== cleanColId);
        if (col.isDefaultFavorites) {
          saved.isFavorite = false;
        }
        saved.updatedAtIso = nowIso;
        await this.repo.upsertSavedPropertyInTx(tx, saved);
      }

      return col;
    });

    await this.emitDomainEvent('cx.collection.changed', principal.uid, principal.uid, cleanColId, correlationId, {
      action: 'PROPERTY_REMOVED',
      propertyId: cleanPropId,
    });
    return updatedCol;
  }

  public async deleteCollection(
    principal: AuthenticatedPrincipal,
    collectionId: string,
    correlationId = 'cx-delete-collection',
  ): Promise<{ deleted: boolean; collectionId: string }> {
    await this.assertUserAuthorized(principal, principal.uid);
    const cleanColId = validateSafeResourceId(collectionId, 'collectionId');
    const nowIso = new Date().toISOString();

    await this.repo.runInTransaction('cx.deleteCollection', async (tx) => {
      const col = await this.repo.getCollectionInTx(tx, cleanColId);
      if (!col) throw new CoreApiError('NOT_FOUND', 404, 'Collection not found.');
      if (col.ownerUid !== principal.uid) {
        throw new CoreApiError('FORBIDDEN', 403, 'Cannot delete another user collection.');
      }
      if (col.isDefaultFavorites) {
        throw new CoreApiError('VALIDATION_FAILED', 400, 'Default favorites collection cannot be deleted.');
      }

      const savedItems = await this.repo.listSavedPropertiesByOwnerInTx(tx, principal.uid);
      for (const item of savedItems) {
        if (item.collectionIds.includes(cleanColId)) {
          item.collectionIds = item.collectionIds.filter((id) => id !== cleanColId);
          item.updatedAtIso = nowIso;
          await this.repo.upsertSavedPropertyInTx(tx, item);
        }
      }

      await this.repo.deleteCollectionInTx(tx, principal.uid, cleanColId);
    });

    await this.emitDomainEvent('cx.collection.changed', principal.uid, principal.uid, cleanColId, correlationId, {
      action: 'DELETED',
    });
    return { deleted: true, collectionId: cleanColId };
  }

  public async listCollections(
    principal: AuthenticatedPrincipal,
  ): Promise<PropertyCollectionRecord[]> {
    await this.assertUserAuthorized(principal, principal.uid);
    return this.repo.runInTransaction('cx.listCollections', async (tx) => {
      await this.ensureDefaultFavoritesCollectionInTx(tx, principal.uid, new Date().toISOString());
      return this.repo.listCollectionsByOwnerInTx(tx, principal.uid);
    });
  }

  // ==========================================================================
  // 5. SAVED SEARCHES & SEARCH PREFERENCES
  // ==========================================================================

  public async createSavedSearch(
    principal: AuthenticatedPrincipal,
    rawInput: unknown,
    correlationId = 'cx-create-saved-search',
  ): Promise<CustomerSavedSearchRecord> {
    await this.assertUserAuthorized(principal, principal.uid);
    const obj = assertPlainObject(rawInput, 'Create saved search');
    rejectMassAssignmentAndUnknownKeys(obj, new Set(['title', 'filters', 'isPinned']));

    if (typeof obj.title !== 'string') {
      throw new CoreApiError('VALIDATION_FAILED', 400, 'Saved search title is required.');
    }
    const title = sanitizeTextInput(obj.title);
    if (title.length < 2 || title.length > 80) {
      throw new CoreApiError('VALIDATION_FAILED', 400, 'Saved search title must be 2..80 characters.');
    }

    const { filters, compatibilityNotes } = validateAndUpgradeSavedSearchFilters(obj.filters);
    const isPinned = Boolean(obj.isPinned);
    const nowIso = new Date().toISOString();

    const record = await this.repo.runInTransaction('cx.createSavedSearch', async (tx) => {
      const profile = await this.ensureProfileInTx(tx, principal, nowIso);
      this.assertAccountWritable(profile, true);

      const existing = await this.repo.listSavedSearchesByOwnerInTx(tx, principal.uid);
      if (existing.length >= MAX_SAVED_SEARCHES_PER_USER) {
        throw new CoreApiError(
          'RATE_LIMITED',
          429,
          `Maximum of ${MAX_SAVED_SEARCHES_PER_USER} saved searches reached.`,
        );
      }

      const savedSearch: CustomerSavedSearchRecord = {
        id: `ssearch_${crypto.randomUUID().slice(0, 12)}`,
        ownerUid: principal.uid,
        title,
        schemaVersion: CURRENT_SAVED_SEARCH_SCHEMA_VERSION,
        filters,
        compatibilityNotes,
        isPinned,
        lastExecutedAtIso: null,
        lastMatchedCount: null,
        createdAtIso: nowIso,
        updatedAtIso: nowIso,
      };
      await this.repo.upsertSavedSearchInTx(tx, savedSearch);
      return savedSearch;
    });

    await this.emitDomainEvent('cx.saved_search.changed', principal.uid, principal.uid, record.id, correlationId, {
      action: 'CREATED',
    });
    return record;
  }

  public async updateSavedSearch(
    principal: AuthenticatedPrincipal,
    searchId: string,
    rawInput: unknown,
    correlationId = 'cx-update-saved-search',
  ): Promise<CustomerSavedSearchRecord> {
    await this.assertUserAuthorized(principal, principal.uid);
    const cleanId = validateSafeResourceId(searchId, 'searchId');
    const obj = assertPlainObject(rawInput, 'Update saved search');
    rejectMassAssignmentAndUnknownKeys(obj, new Set(['title', 'filters', 'isPinned']));

    const nowIso = new Date().toISOString();
    const updated = await this.repo.runInTransaction('cx.updateSavedSearch', async (tx) => {
      const existing = await this.repo.getSavedSearchInTx(tx, cleanId);
      if (!existing) throw new CoreApiError('NOT_FOUND', 404, 'Saved search not found.');
      if (existing.ownerUid !== principal.uid) {
        throw new CoreApiError('FORBIDDEN', 403, 'You do not own this saved search.');
      }

      if (obj.title !== undefined) {
        if (typeof obj.title !== 'string') throw new CoreApiError('VALIDATION_FAILED', 400, 'title must be string.');
        const cleanTitle = sanitizeTextInput(obj.title);
        if (cleanTitle.length < 2 || cleanTitle.length > 80) {
          throw new CoreApiError('VALIDATION_FAILED', 400, 'title must be 2..80 characters.');
        }
        existing.title = cleanTitle;
      }

      if (obj.filters !== undefined) {
        const { filters, compatibilityNotes } = validateAndUpgradeSavedSearchFilters(obj.filters);
        existing.filters = filters;
        existing.compatibilityNotes = compatibilityNotes;
        existing.schemaVersion = CURRENT_SAVED_SEARCH_SCHEMA_VERSION;

        const newFingerprint = computeSearchCriteriaFingerprint(principal.uid, filters);
        const alerts = await this.repo.listSearchAlertsByOwnerInTx(tx, principal.uid);
        for (const alert of alerts) {
          if (alert.savedSearchId === cleanId) {
            alert.criteriaFingerprint = newFingerprint;
            alert.updatedAtIso = nowIso;
            await this.repo.upsertSearchAlertInTx(tx, alert);
          }
        }
      }

      if (obj.isPinned !== undefined) {
        if (typeof obj.isPinned !== 'boolean') {
          throw new CoreApiError('VALIDATION_FAILED', 400, 'isPinned must be boolean.');
        }
        existing.isPinned = obj.isPinned;
      }

      existing.updatedAtIso = nowIso;
      await this.repo.upsertSavedSearchInTx(tx, existing);
      return existing;
    });

    await this.emitDomainEvent('cx.saved_search.changed', principal.uid, principal.uid, updated.id, correlationId, {
      action: 'UPDATED',
    });
    return updated;
  }

  public async deleteSavedSearch(
    principal: AuthenticatedPrincipal,
    searchId: string,
    correlationId = 'cx-delete-saved-search',
  ): Promise<{ deleted: boolean; searchId: string }> {
    await this.assertUserAuthorized(principal, principal.uid);
    const cleanId = validateSafeResourceId(searchId, 'searchId');
    const nowIso = new Date().toISOString();

    await this.repo.runInTransaction('cx.deleteSavedSearch', async (tx) => {
      const existing = await this.repo.getSavedSearchInTx(tx, cleanId);
      if (!existing) throw new CoreApiError('NOT_FOUND', 404, 'Saved search not found.');
      if (existing.ownerUid !== principal.uid) {
        throw new CoreApiError('FORBIDDEN', 403, 'You do not own this saved search.');
      }

      const alerts = await this.repo.listSearchAlertsByOwnerInTx(tx, principal.uid);
      for (const alert of alerts) {
        if (alert.savedSearchId === cleanId) {
          alert.status = 'PAUSED';
          alert.updatedAtIso = nowIso;
          await this.repo.upsertSearchAlertInTx(tx, alert);
        }
      }

      await this.repo.deleteSavedSearchInTx(tx, principal.uid, cleanId);
    });

    await this.emitDomainEvent('cx.saved_search.changed', principal.uid, principal.uid, cleanId, correlationId, {
      action: 'DELETED',
    });
    return { deleted: true, searchId: cleanId };
  }

  public async listSavedSearches(
    principal: AuthenticatedPrincipal,
    query: { limit?: unknown; cursor?: unknown } = {},
  ): Promise<{
    items: CustomerSavedSearchRecord[];
    nextCursor: string | null;
    hasMore: boolean;
    totalCount: number;
  }> {
    await this.assertUserAuthorized(principal, principal.uid);
    const pagination = normalizePaginationParams(query);
    const all = await this.repo.runInTransaction('cx.listSavedSearches', (tx) =>
      this.repo.listSavedSearchesByOwnerInTx(tx, principal.uid),
    );

    let startIndex = 0;
    if (pagination.cursor) {
      const decoded = decodePaginationCursor(pagination.cursor);
      const idx = all.findIndex((s) => s.id === decoded.docId);
      if (idx >= 0) startIndex = idx + 1;
    }

    const slice = all.slice(startIndex, startIndex + pagination.limit);
    const hasMore = startIndex + pagination.limit < all.length;
    const last = slice[slice.length - 1];
    const nextCursor =
      hasMore && last
        ? encodePaginationCursor({ sortValue: last.updatedAtIso, docId: last.id, direction: 'desc' })
        : null;

    return {
      items: slice,
      nextCursor,
      hasMore,
      totalCount: all.length,
    };
  }

  public async executeSavedSearch(
    principal: AuthenticatedPrincipal,
    searchId: string,
    query: { limit?: unknown; cursor?: unknown } = {},
  ): Promise<{
    savedSearch: CustomerSavedSearchRecord;
    items: unknown[];
    totalMatchedCount: number;
    nextCursor: string | null;
    hasMore: boolean;
  }> {
    await this.assertUserAuthorized(principal, principal.uid);
    const cleanId = validateSafeResourceId(searchId, 'searchId');
    const pagination = normalizePaginationParams(query);
    const nowIso = new Date().toISOString();

    const savedSearch = await this.repo.runInTransaction('cx.getSavedSearchForExec', async (tx) => {
      const s = await this.repo.getSavedSearchInTx(tx, cleanId);
      if (!s) throw new CoreApiError('NOT_FOUND', 404, 'Saved search not found.');
      if (s.ownerUid !== principal.uid) {
        throw new CoreApiError('FORBIDDEN', 403, 'Cannot execute another user saved search.');
      }
      if (s.schemaVersion < CURRENT_SAVED_SEARCH_SCHEMA_VERSION) {
        const upgraded = validateAndUpgradeSavedSearchFilters(s.filters);
        s.filters = upgraded.filters;
        s.compatibilityNotes = [...s.compatibilityNotes, ...upgraded.compatibilityNotes];
        s.schemaVersion = CURRENT_SAVED_SEARCH_SCHEMA_VERSION;
      }
      return s;
    });

    const result = await this.catalogAdapter.executeSavedSearchFilters(savedSearch.filters, {
      limit: pagination.limit,
      cursor: pagination.cursor,
    });

    const updatedSearch = await this.repo.runInTransaction('cx.updateSavedSearchExecutionStats', async (tx) => {
      savedSearch.lastExecutedAtIso = nowIso;
      savedSearch.lastMatchedCount = result.totalMatchedCount;
      await this.repo.upsertSavedSearchInTx(tx, savedSearch);
      return savedSearch;
    });

    return {
      savedSearch: updatedSearch,
      items: result.items,
      totalMatchedCount: result.totalMatchedCount,
      nextCursor: result.nextCursor,
      hasMore: result.hasMore,
    };
  }

  // ==========================================================================
  // 6. SEARCH ALERTS & SUBSCRIPTION MANAGEMENT
  // ==========================================================================

  public async createSearchAlert(
    principal: AuthenticatedPrincipal,
    rawInput: unknown,
    correlationId = 'cx-create-alert',
  ): Promise<SearchAlertSubscriptionRecord> {
    await this.assertUserAuthorized(principal, principal.uid);
    const obj = assertPlainObject(rawInput, 'Create search alert');
    rejectMassAssignmentAndUnknownKeys(
      obj,
      new Set(['savedSearchId', 'title', 'frequency', 'channels', 'expiresInDays']),
    );

    const savedSearchId = validateSafeResourceId(obj.savedSearchId, 'savedSearchId');
    const frequency: SearchAlertFrequency =
      typeof obj.frequency === 'string' && ALLOWED_ALERT_FREQUENCIES.includes(obj.frequency as SearchAlertFrequency)
        ? (obj.frequency as SearchAlertFrequency)
        : 'DAILY';

    let channels: NotificationChannel[] = ['IN_APP'];
    if (obj.channels !== undefined) {
      if (!Array.isArray(obj.channels) || obj.channels.length === 0 || obj.channels.length > 4) {
        throw new CoreApiError('VALIDATION_FAILED', 400, 'channels must be a non-empty array of supported channels.');
      }
      const deduped: NotificationChannel[] = [];
      for (const ch of obj.channels) {
        if (typeof ch !== 'string' || !ALLOWED_NOTIFICATION_CHANNELS.includes(ch as NotificationChannel)) {
          throw new CoreApiError('VALIDATION_FAILED', 400, `Unsupported notification channel "${String(ch)}".`);
        }
        if (!deduped.includes(ch as NotificationChannel)) deduped.push(ch as NotificationChannel);
      }
      channels = deduped;
    }

    const expiresInDays =
      typeof obj.expiresInDays === 'number' && Number.isInteger(obj.expiresInDays) && obj.expiresInDays >= 1 && obj.expiresInDays <= 365
        ? obj.expiresInDays
        : 90;

    const now = new Date();
    const nowIso = now.toISOString();
    const expiresAtIso = new Date(now.getTime() + expiresInDays * 86_400_000).toISOString();

    const alertRecord = await this.repo.runInTransaction('cx.createSearchAlert', async (tx) => {
      const profile = await this.ensureProfileInTx(tx, principal, nowIso);
      this.assertAccountWritable(profile, true);

      const alertConsent = await this.repo.getConsentInTx(tx, principal.uid, 'PROPERTY_SEARCH_ALERTS');
      if (alertConsent && !alertConsent.granted) {
        throw new CoreApiError(
          'FORBIDDEN',
          403,
          'Cannot create active search alerts while PROPERTY_SEARCH_ALERTS consent is withdrawn.',
        );
      }

      const savedSearch = await this.repo.getSavedSearchInTx(tx, savedSearchId);
      if (!savedSearch) {
        throw new CoreApiError('NOT_FOUND', 404, 'Referenced savedSearchId does not exist.');
      }
      if (savedSearch.ownerUid !== principal.uid) {
        throw new CoreApiError('FORBIDDEN', 403, 'Cannot create an alert for another user saved search.');
      }

      const fingerprint = computeSearchCriteriaFingerprint(principal.uid, savedSearch.filters);
      const existingAlerts = await this.repo.listSearchAlertsByOwnerInTx(tx, principal.uid);
      const activeAlerts = existingAlerts.filter((a) => a.status === 'ACTIVE');

      if (activeAlerts.length >= MAX_ACTIVE_ALERTS_PER_USER) {
        throw new CoreApiError(
          'RATE_LIMITED',
          429,
          `Maximum of ${MAX_ACTIVE_ALERTS_PER_USER} active search alerts reached.`,
        );
      }

      const duplicate = activeAlerts.find(
        (a) => a.savedSearchId === savedSearchId || a.criteriaFingerprint === fingerprint,
      );
      if (duplicate) {
        throw new CoreApiError(
          'CONFLICT',
          409,
          'An active search alert with equivalent ownership and search criteria already exists.',
        );
      }

      const title =
        typeof obj.title === 'string' && sanitizeTextInput(obj.title).length >= 2
          ? sanitizeTextInput(obj.title).slice(0, 80)
          : `اعلان: ${savedSearch.title}`;

      const created: SearchAlertSubscriptionRecord = {
        id: `salert_${crypto.randomUUID().slice(0, 12)}`,
        ownerUid: principal.uid,
        savedSearchId,
        title,
        criteriaFingerprint: fingerprint,
        status: 'ACTIVE',
        frequency,
        channels,
        lastExecutedAtIso: null,
        lastSuccessAtIso: null,
        lastDeliveredNotificationId: null,
        lastDeliveredPropertyIds: [],
        lastExecutionStatus: 'IDLE',
        consecutiveFailures: 0,
        dailyExecutionCount: 0,
        dailyExecutionWindowDate: nowIso.slice(0, 10),
        expiresAtIso,
        createdAtIso: nowIso,
        updatedAtIso: nowIso,
      };

      await this.repo.upsertSearchAlertInTx(tx, created);
      return created;
    });

    await this.emitDomainEvent('cx.search_alert.changed', principal.uid, principal.uid, alertRecord.id, correlationId, {
      action: 'CREATED',
      status: alertRecord.status,
    });
    return alertRecord;
  }

  public async updateSearchAlert(
    principal: AuthenticatedPrincipal,
    alertId: string,
    rawInput: unknown,
    correlationId = 'cx-update-alert',
  ): Promise<SearchAlertSubscriptionRecord> {
    await this.assertUserAuthorized(principal, principal.uid);
    const cleanId = validateSafeResourceId(alertId, 'alertId');
    const obj = assertPlainObject(rawInput, 'Update search alert');
    rejectMassAssignmentAndUnknownKeys(obj, new Set(['title', 'status', 'frequency', 'channels']));

    const nowIso = new Date().toISOString();
    const updated = await this.repo.runInTransaction('cx.updateSearchAlert', async (tx) => {
      const alert = await this.repo.getSearchAlertInTx(tx, cleanId);
      if (!alert) throw new CoreApiError('NOT_FOUND', 404, 'Search alert not found.');
      if (alert.ownerUid !== principal.uid) {
        throw new CoreApiError('FORBIDDEN', 403, 'You do not own this search alert.');
      }

      if (obj.title !== undefined) {
        if (typeof obj.title !== 'string') throw new CoreApiError('VALIDATION_FAILED', 400, 'title must be string.');
        const cleanTitle = sanitizeTextInput(obj.title);
        if (cleanTitle.length < 2 || cleanTitle.length > 80) {
          throw new CoreApiError('VALIDATION_FAILED', 400, 'title must be 2..80 characters.');
        }
        alert.title = cleanTitle;
      }

      if (obj.frequency !== undefined) {
        if (typeof obj.frequency !== 'string' || !ALLOWED_ALERT_FREQUENCIES.includes(obj.frequency as SearchAlertFrequency)) {
          throw new CoreApiError('VALIDATION_FAILED', 400, 'Invalid alert frequency.');
        }
        alert.frequency = obj.frequency as SearchAlertFrequency;
      }

      if (obj.channels !== undefined) {
        if (!Array.isArray(obj.channels) || obj.channels.length === 0 || obj.channels.length > 4) {
          throw new CoreApiError('VALIDATION_FAILED', 400, 'channels must be a non-empty array.');
        }
        const deduped: NotificationChannel[] = [];
        for (const ch of obj.channels) {
          if (typeof ch !== 'string' || !ALLOWED_NOTIFICATION_CHANNELS.includes(ch as NotificationChannel)) {
            throw new CoreApiError('VALIDATION_FAILED', 400, `Unsupported channel "${String(ch)}".`);
          }
          if (!deduped.includes(ch as NotificationChannel)) deduped.push(ch as NotificationChannel);
        }
        alert.channels = deduped;
      }

      if (obj.status !== undefined) {
        if (obj.status !== 'ACTIVE' && obj.status !== 'PAUSED') {
          throw new CoreApiError('VALIDATION_FAILED', 400, 'User can only set alert status to ACTIVE or PAUSED.');
        }
        if (alert.status === 'DISABLED_BY_ADMIN') {
          throw new CoreApiError('FORBIDDEN', 403, 'Alert disabled by administrator cannot be resumed by user.');
        }
        if (obj.status === 'ACTIVE' && alert.status !== 'ACTIVE') {
          const consent = await this.repo.getConsentInTx(tx, principal.uid, 'PROPERTY_SEARCH_ALERTS');
          if (consent && !consent.granted) {
            throw new CoreApiError(
              'FORBIDDEN',
              403,
              'Cannot resume search alert while PROPERTY_SEARCH_ALERTS consent is withdrawn.',
            );
          }
          const allAlerts = await this.repo.listSearchAlertsByOwnerInTx(tx, principal.uid);
          const conflict = allAlerts.find(
            (a) =>
              a.id !== alert.id &&
              a.status === 'ACTIVE' &&
              a.criteriaFingerprint === alert.criteriaFingerprint,
          );
          if (conflict) {
            throw new CoreApiError(
              'CONFLICT',
              409,
              'Another active alert with equivalent search criteria already exists.',
            );
          }
        }
        alert.status = obj.status;
      }

      alert.updatedAtIso = nowIso;
      await this.repo.upsertSearchAlertInTx(tx, alert);
      return alert;
    });

    await this.emitDomainEvent('cx.search_alert.changed', principal.uid, principal.uid, updated.id, correlationId, {
      action: 'UPDATED',
      status: updated.status,
    });
    return updated;
  }

  public async deleteSearchAlert(
    principal: AuthenticatedPrincipal,
    alertId: string,
    correlationId = 'cx-delete-alert',
  ): Promise<{ deleted: boolean; alertId: string }> {
    await this.assertUserAuthorized(principal, principal.uid);
    const cleanId = validateSafeResourceId(alertId, 'alertId');

    await this.repo.runInTransaction('cx.deleteSearchAlert', async (tx) => {
      const alert = await this.repo.getSearchAlertInTx(tx, cleanId);
      if (!alert) throw new CoreApiError('NOT_FOUND', 404, 'Search alert not found.');
      if (alert.ownerUid !== principal.uid) {
        throw new CoreApiError('FORBIDDEN', 403, 'You do not own this search alert.');
      }
      await this.repo.deleteSearchAlertInTx(tx, principal.uid, cleanId);
    });

    await this.emitDomainEvent('cx.search_alert.changed', principal.uid, principal.uid, cleanId, correlationId, {
      action: 'DELETED',
    });
    return { deleted: true, alertId: cleanId };
  }

  public async listSearchAlerts(
    principal: AuthenticatedPrincipal,
  ): Promise<SearchAlertSubscriptionRecord[]> {
    await this.assertUserAuthorized(principal, principal.uid);
    return this.repo.runInTransaction('cx.listSearchAlerts', (tx) =>
      this.repo.listSearchAlertsByOwnerInTx(tx, principal.uid),
    );
  }

  public async executeSearchAlertJob(
    alertId: string,
    jobExecutionKey: string,
    nowIso = new Date().toISOString(),
  ): Promise<SearchAlertExecutionResult> {
    const cleanAlertId = validateSafeResourceId(alertId, 'alertId');
    const cleanJobKey = validateSafeResourceId(jobExecutionKey, 'jobExecutionKey');

    const preCheck = await this.repo.runInTransaction('cx.alertJobPreCheck', async (tx) => {
      const existingExec = await this.repo.getAlertExecutionByKeyInTx(tx, cleanAlertId, cleanJobKey);
      if (existingExec) {
        return { replayedResult: { ...existingExec, replayed: true }, alert: null, savedSearch: null };
      }

      const alert = await this.repo.getSearchAlertInTx(tx, cleanAlertId);
      if (!alert) {
        throw new CoreApiError('NOT_FOUND', 404, `Search alert "${cleanAlertId}" not found.`);
      }

      const ownerProfile = await this.repo.getPrivateProfileInTx(tx, alert.ownerUid);
      if (
        ownerProfile &&
        (ownerProfile.lifecycleStatus === 'SUSPENDED' ||
          ownerProfile.lifecycleStatus === 'CLOSED' ||
          ownerProfile.lifecycleStatus === 'CLOSURE_REQUESTED')
      ) {
        alert.status = 'PAUSED';
        alert.updatedAtIso = nowIso;
        await this.repo.upsertSearchAlertInTx(tx, alert);
      }

      if (alert.expiresAtIso <= nowIso && alert.status === 'ACTIVE') {
        alert.status = 'EXPIRED';
        alert.updatedAtIso = nowIso;
        await this.repo.upsertSearchAlertInTx(tx, alert);
      }

      if (alert.status === 'EXPIRED') {
        const res: SearchAlertExecutionResult = {
          alertId: cleanAlertId,
          jobExecutionKey: cleanJobKey,
          replayed: false,
          status: 'SKIPPED_EXPIRED',
          matchedPropertyIds: [],
          newPropertyIds: [],
          notificationOutboxId: null,
          executedAtIso: nowIso,
        };
        this.repo.setAlertExecutionByKeyInTx(tx, res);
        return { replayedResult: res, alert: null, savedSearch: null };
      }

      if (alert.status !== 'ACTIVE') {
        const res: SearchAlertExecutionResult = {
          alertId: cleanAlertId,
          jobExecutionKey: cleanJobKey,
          replayed: false,
          status: 'SKIPPED_INACTIVE',
          matchedPropertyIds: [],
          newPropertyIds: [],
          notificationOutboxId: null,
          executedAtIso: nowIso,
        };
        this.repo.setAlertExecutionByKeyInTx(tx, res);
        return { replayedResult: res, alert: null, savedSearch: null };
      }

      const currentWindowDate = nowIso.slice(0, 10);
      if (alert.dailyExecutionWindowDate !== currentWindowDate) {
        alert.dailyExecutionWindowDate = currentWindowDate;
        alert.dailyExecutionCount = 0;
      }

      if (alert.dailyExecutionCount >= MAX_DAILY_ALERT_EXECUTIONS) {
        alert.lastExecutedAtIso = nowIso;
        alert.lastExecutionStatus = 'SKIPPED_RATE_LIMIT';
        await this.repo.upsertSearchAlertInTx(tx, alert);
        const res: SearchAlertExecutionResult = {
          alertId: cleanAlertId,
          jobExecutionKey: cleanJobKey,
          replayed: false,
          status: 'SKIPPED_QUOTA',
          matchedPropertyIds: [],
          newPropertyIds: [],
          notificationOutboxId: null,
          executedAtIso: nowIso,
        };
        this.repo.setAlertExecutionByKeyInTx(tx, res);
        return { replayedResult: res, alert: null, savedSearch: null };
      }

      const savedSearch = await this.repo.getSavedSearchInTx(tx, alert.savedSearchId);
      if (!savedSearch) {
        alert.status = 'INVALID_CRITERIA';
        alert.updatedAtIso = nowIso;
        await this.repo.upsertSearchAlertInTx(tx, alert);
        const res: SearchAlertExecutionResult = {
          alertId: cleanAlertId,
          jobExecutionKey: cleanJobKey,
          replayed: false,
          status: 'SKIPPED_INACTIVE',
          matchedPropertyIds: [],
          newPropertyIds: [],
          notificationOutboxId: null,
          executedAtIso: nowIso,
        };
        this.repo.setAlertExecutionByKeyInTx(tx, res);
        return { replayedResult: res, alert: null, savedSearch: null };
      }

      return { replayedResult: null, alert, savedSearch };
    });

    if (preCheck.replayedResult) {
      return preCheck.replayedResult;
    }

    const alert = preCheck.alert!;
    const savedSearch = preCheck.savedSearch!;

    const searchResult = await this.catalogAdapter.executeSavedSearchFilters(savedSearch.filters, {
      limit: 25,
    });
    const matchedPropertyIds = searchResult.items.map((item) => item.id);
    const previouslyDeliveredSet = new Set(alert.lastDeliveredPropertyIds);
    const newMatches = searchResult.items.filter((item) => !previouslyDeliveredSet.has(item.id));
    const newPropertyIds = newMatches.map((item) => item.id);

    let notificationOutboxId: string | null = null;
    if (newMatches.length > 0) {
      if (this.crossModuleAdapter.dispatchAlertNotification) {
        const dispatchRes = await this.crossModuleAdapter.dispatchAlertNotification({
          recipientUid: alert.ownerUid,
          alertId: alert.id,
          alertTitle: alert.title,
          channels: alert.channels,
          matchedProperties: newMatches,
          idempotencyKey: `cx_alert_${alert.id}_${cleanJobKey}`,
        });
        notificationOutboxId = dispatchRes.notificationId;
      } else {
        notificationOutboxId = `notif_cx_${alert.id}_${cleanJobKey}`;
      }
    }

    return this.repo.runInTransaction('cx.alertJobCommit', async (tx) => {
      const existingExec = await this.repo.getAlertExecutionByKeyInTx(tx, cleanAlertId, cleanJobKey);
      if (existingExec) {
        return { ...existingExec, replayed: true };
      }

      const freshAlert = (await this.repo.getSearchAlertInTx(tx, cleanAlertId)) ?? alert;
      freshAlert.dailyExecutionCount += 1;
      freshAlert.lastExecutedAtIso = nowIso;
      freshAlert.consecutiveFailures = 0;

      let status: SearchAlertExecutionResult['status'] = 'NO_NEW_MATCHES';
      if (newPropertyIds.length > 0) {
        status = 'DELIVERED';
        freshAlert.lastSuccessAtIso = nowIso;
        freshAlert.lastDeliveredNotificationId = notificationOutboxId;
        freshAlert.lastDeliveredPropertyIds = Array.from(
          new Set([...freshAlert.lastDeliveredPropertyIds, ...newPropertyIds]),
        ).slice(-200);
        freshAlert.lastExecutionStatus = 'SUCCEEDED';
      } else {
        freshAlert.lastExecutionStatus = 'NO_NEW_MATCHES';
      }

      freshAlert.updatedAtIso = nowIso;
      await this.repo.upsertSearchAlertInTx(tx, freshAlert);

      const finalResult: SearchAlertExecutionResult = {
        alertId: cleanAlertId,
        jobExecutionKey: cleanJobKey,
        replayed: false,
        status,
        matchedPropertyIds,
        newPropertyIds,
        notificationOutboxId,
        executedAtIso: nowIso,
      };
      this.repo.setAlertExecutionByKeyInTx(tx, finalResult);
      return finalResult;
    });
  }

  // ==========================================================================
  // 7. USER-FACING ACTIVITY & RECENTLY VIEWED PROPERTIES
  // ==========================================================================

  public async recordUserActivity(
    principal: AuthenticatedPrincipal,
    rawInput: unknown,
  ): Promise<{ recorded: boolean; entry: UserActivityEntryRecord | null }> {
    await this.assertUserAuthorized(principal, principal.uid);
    const validated = validateUserActivityInput(rawInput);
    const now = new Date();
    const nowIso = now.toISOString();

    return this.repo.runInTransaction('cx.recordUserActivity', async (tx) => {
      const prefs =
        (await this.repo.getPreferencesInTx(tx, principal.uid)) ??
        this.buildInitialPreferences(principal.uid, nowIso);

      if (!prefs.personalization.saveRecentViewHistory) {
        return { recorded: false, entry: null };
      }

      const historyConsent = await this.repo.getConsentInTx(tx, principal.uid, 'ACTIVITY_HISTORY_STORAGE');
      if (historyConsent && !historyConsent.granted) {
        return { recorded: false, entry: null };
      }

      const retentionDays = prefs.personalization.recentHistoryRetentionDays || 30;
      const expiresAtIso = new Date(now.getTime() + retentionDays * 86_400_000).toISOString();
      const deterministicId = `act_${principal.uid}_${validated.actionType}_${validated.targetId}`;

      const existing = await this.repo.getActivityEntryInTx(tx, deterministicId);
      const entry: UserActivityEntryRecord = {
        id: deterministicId,
        ownerUid: principal.uid,
        actionType: validated.actionType,
        targetId: validated.targetId,
        targetType: validated.targetType,
        cityId: validated.cityId,
        hoodId: validated.hoodId,
        summaryTitle: validated.summaryTitle,
        priceMillionsSnapshot: validated.priceMillionsSnapshot,
        sqmSnapshot: validated.sqmSnapshot,
        viewedCount: existing ? existing.viewedCount + 1 : 1,
        firstViewedAtIso: existing ? existing.firstViewedAtIso : nowIso,
        lastViewedAtIso: nowIso,
        expiresAtIso,
      };

      await this.repo.upsertActivityEntryInTx(tx, entry);
      return { recorded: true, entry };
    });
  }

  public async listUserActivity(
    principal: AuthenticatedPrincipal,
    query: {
      limit?: unknown;
      cursor?: unknown;
      targetType?: 'PROPERTY' | 'NEIGHBORHOOD' | 'SAVED_SEARCH';
      nowIso?: string;
    } = {},
  ): Promise<{
    items: UserActivityEntryRecord[];
    nextCursor: string | null;
    hasMore: boolean;
    totalCount: number;
  }> {
    await this.assertUserAuthorized(principal, principal.uid);
    const pagination = normalizePaginationParams(query);
    const nowIso = query.nowIso ?? new Date().toISOString();

    const all = await this.repo.runInTransaction('cx.listUserActivity', (tx) =>
      this.repo.listActivityByOwnerInTx(tx, principal.uid),
    );

    let activeItems = all.filter((item) => item.expiresAtIso > nowIso);
    if (query.targetType) {
      activeItems = activeItems.filter((item) => item.targetType === query.targetType);
    }

    let startIndex = 0;
    if (pagination.cursor) {
      const decoded = decodePaginationCursor(pagination.cursor);
      const idx = activeItems.findIndex((i) => i.id === decoded.docId);
      if (idx >= 0) startIndex = idx + 1;
    }

    const slice = activeItems.slice(startIndex, startIndex + pagination.limit);
    const hasMore = startIndex + pagination.limit < activeItems.length;
    const last = slice[slice.length - 1];
    const nextCursor =
      hasMore && last
        ? encodePaginationCursor({ sortValue: last.lastViewedAtIso, docId: last.id, direction: 'desc' })
        : null;

    return {
      items: slice,
      nextCursor,
      hasMore,
      totalCount: activeItems.length,
    };
  }

  public async deleteActivityEntry(
    principal: AuthenticatedPrincipal,
    entryId: string,
  ): Promise<{ deleted: boolean; entryId: string }> {
    await this.assertUserAuthorized(principal, principal.uid);
    const cleanId = validateSafeResourceId(entryId, 'entryId');

    await this.repo.runInTransaction('cx.deleteActivityEntry', async (tx) => {
      const existing = await this.repo.getActivityEntryInTx(tx, cleanId);
      if (!existing) throw new CoreApiError('NOT_FOUND', 404, 'Activity entry not found.');
      if (existing.ownerUid !== principal.uid) {
        throw new CoreApiError('FORBIDDEN', 403, 'Cannot delete another user activity entry.');
      }
      await this.repo.deleteActivityEntryInTx(tx, principal.uid, cleanId);
    });

    return { deleted: true, entryId: cleanId };
  }

  public async clearActivityHistory(
    principal: AuthenticatedPrincipal,
    targetTypeFilter?: 'PROPERTY' | 'NEIGHBORHOOD' | 'SAVED_SEARCH',
  ): Promise<{ clearedCount: number }> {
    await this.assertUserAuthorized(principal, principal.uid);
    return this.repo.runInTransaction('cx.clearActivityHistory', async (tx) => {
      const all = await this.repo.listActivityByOwnerInTx(tx, principal.uid);
      let clearedCount = 0;
      for (const entry of all) {
        if (!targetTypeFilter || entry.targetType === targetTypeFilter) {
          await this.repo.deleteActivityEntryInTx(tx, principal.uid, entry.id);
          clearedCount += 1;
        }
      }
      return { clearedCount };
    });
  }

  // ==========================================================================
  // 8. USER DASHBOARD AGGREGATION (WITH SECTION FAULT ISOLATION)
  // ==========================================================================

  private async isolateDashboardSection<T>(
    work: () => Promise<T>,
  ): Promise<DashboardSectionEnvelope<T>> {
    try {
      const data = await work();
      return { status: 'OK', data };
    } catch (err) {
      const errorCode = err instanceof CoreApiError ? err.code : 'DEPENDENCY_UNAVAILABLE';
      return {
        status: 'PARTIAL_UNAVAILABLE',
        data: null,
        errorCode,
      };
    }
  }

  public async getUserDashboard(
    principal: AuthenticatedPrincipal,
    targetUid = principal.uid,
  ): Promise<UserDashboardAggregateView> {
    await this.assertUserAuthorized(principal, targetUid);
    const nowIso = new Date().toISOString();

    const [
      profileSummary,
      savedPropertiesSummary,
      savedSearchesSummary,
      searchAlertsSummary,
      recentlyViewedSummary,
      ownedListingsSummary,
      inquiriesAndLeadsSummary,
      transactionsAndTenanciesSummary,
      notificationsSummary,
    ] = await Promise.all([
      this.isolateDashboardSection(async () => {
        const profile = await this.getOrInitOwnProfile(principal);
        const verifiedBadgesCount =
          (profile.verification.emailVerified ? 1 : 0) +
          (profile.verification.phoneVerified ? 1 : 0) +
          profile.verification.professionalCredentialIds.length;
        return {
          displayName: profile.displayName,
          completionStatus: profile.completionStatus,
          completionPercent: profile.completionPercent,
          lifecycleStatus: profile.lifecycleStatus,
          onboardingStep: profile.onboarding.currentStep,
          verifiedBadgesCount,
        };
      }),

      this.isolateDashboardSection(async () => {
        const [savedList, collections] = await Promise.all([
          this.listSavedProperties(principal, { limit: 10 }),
          this.listCollections(principal),
        ]);
        const recentFavorites = savedList.items.filter((i) => i.isFavorite).slice(0, 5);
        return {
          totalFavoritesCount: savedList.items.filter((i) => i.isFavorite).length,
          totalSavedCount: savedList.totalCount,
          collectionsCount: collections.length,
          recentFavorites,
        };
      }),

      this.isolateDashboardSection(async () => {
        const searches = await this.listSavedSearches(principal, { limit: 10 });
        return {
          activeSavedSearchesCount: searches.totalCount,
          items: searches.items,
        };
      }),

      this.isolateDashboardSection(async () => {
        const alerts = await this.listSearchAlerts(principal);
        return {
          activeAlertsCount: alerts.filter((a) => a.status === 'ACTIVE').length,
          pausedAlertsCount: alerts.filter((a) => a.status === 'PAUSED').length,
          items: alerts.slice(0, 10),
        };
      }),

      this.isolateDashboardSection(async () => {
        const activity = await this.listUserActivity(principal, {
          limit: 10,
          targetType: 'PROPERTY',
        });
        return {
          totalCount: activity.totalCount,
          items: activity.items,
        };
      }),

      this.isolateDashboardSection(async () => {
        const listings = await this.catalogAdapter.listUserOwnedListings(principal.uid);
        const byLifecycleState: Record<string, number> = {};
        for (const item of listings) {
          byLifecycleState[item.lifecycleState] = (byLifecycleState[item.lifecycleState] ?? 0) + 1;
        }
        return {
          totalCount: listings.length,
          byLifecycleState,
          items: listings.slice(0, 10),
        };
      }),

      this.isolateDashboardSection(async () => {
        if (this.crossModuleAdapter.getInquiriesAndLeadsCounts) {
          return this.crossModuleAdapter.getInquiriesAndLeadsCounts(principal.uid);
        }
        return {
          submittedInquiriesCount: 0,
          receivedInquiriesCount: 0,
          activeBuyerAlertsCount: 0,
          scheduledViewingsCount: 0,
        };
      }),

      this.isolateDashboardSection(async () => {
        if (this.crossModuleAdapter.getTransactionsAndTenanciesSummary) {
          const summary = await this.crossModuleAdapter.getTransactionsAndTenanciesSummary(principal.uid);
          return {
            activeTransactionsCount: summary.activeTransactionsCount,
            activeTenanciesCount: summary.activeTenanciesCount,
            relevantDocumentIds: summary.relevantDocumentIds,
          };
        }
        return {
          activeTransactionsCount: 0,
          activeTenanciesCount: 0,
          relevantDocumentIds: [],
        };
      }),

      this.isolateDashboardSection(async () => {
        const unreadCount = this.crossModuleAdapter.getUnreadNotificationsCount
          ? await this.crossModuleAdapter.getUnreadNotificationsCount(principal.uid)
          : 0;
        return { unreadCount };
      }),
    ]);

    return {
      uid: principal.uid,
      generatedAtIso: nowIso,
      profileSummary,
      savedPropertiesSummary,
      savedSearchesSummary,
      searchAlertsSummary,
      recentlyViewedSummary,
      ownedListingsSummary,
      inquiriesAndLeadsSummary,
      transactionsAndTenanciesSummary,
      notificationsSummary,
    };
  }

  // ==========================================================================
  // 9. PRIVACY, CONSENT & USER DATA RIGHTS
  // ==========================================================================

  public async listConsents(
    principal: AuthenticatedPrincipal,
  ): Promise<UserConsentRecord[]> {
    await this.assertUserAuthorized(principal, principal.uid);
    return this.repo.runInTransaction('cx.listConsents', (tx) =>
      this.repo.listConsentsByOwnerInTx(tx, principal.uid),
    );
  }

  public async upsertConsent(
    principal: AuthenticatedPrincipal,
    rawInput: unknown,
    correlationId = 'cx-consent-upsert',
  ): Promise<UserConsentRecord> {
    await this.assertUserAuthorized(principal, principal.uid);
    const obj = assertPlainObject(rawInput, 'Consent update');
    rejectMassAssignmentAndUnknownKeys(
      obj,
      new Set(['purpose', 'granted', 'policyVersion', 'scopeDescription']),
    );

    if (typeof obj.purpose !== 'string' || !ALLOWED_CONSENT_PURPOSES.includes(obj.purpose as ConsentPurpose)) {
      throw new CoreApiError('VALIDATION_FAILED', 400, 'Invalid consent purpose.');
    }
    if (typeof obj.granted !== 'boolean') {
      throw new CoreApiError('VALIDATION_FAILED', 400, 'granted must be a boolean.');
    }
    const purpose = obj.purpose as ConsentPurpose;
    if (purpose === 'ESSENTIAL_ACCOUNT_SERVICE' && obj.granted === false) {
      throw new CoreApiError(
        'VALIDATION_FAILED',
        400,
        'ESSENTIAL_ACCOUNT_SERVICE consent cannot be withdrawn while account remains active; submit an account closure request instead.',
      );
    }

    const policyVersion =
      typeof obj.policyVersion === 'string' && sanitizeTextInput(obj.policyVersion)
        ? sanitizeTextInput(obj.policyVersion).slice(0, 32)
        : 'v2026.1';
    const scopeDescription =
      typeof obj.scopeDescription === 'string'
        ? sanitizeTextInput(obj.scopeDescription).slice(0, 200)
        : `User consent for ${purpose}`;

    const nowIso = new Date().toISOString();

    const record = await this.repo.runInTransaction('cx.upsertConsent', async (tx) => {
      const profile = await this.ensureProfileInTx(tx, principal, nowIso);
      const existing = await this.repo.getConsentInTx(tx, principal.uid, purpose);

      const grantedBool = Boolean(obj.granted);
      const updatedConsent: UserConsentRecord = {
        id: existing?.id ?? `consent_${principal.uid}_${purpose}`,
        ownerUid: principal.uid,
        purpose,
        granted: grantedBool,
        policyVersion,
        scopeDescription,
        grantedAtIso: grantedBool ? nowIso : (existing?.grantedAtIso ?? null),
        withdrawnAtIso: grantedBool ? null : nowIso,
        revision: (existing?.revision ?? 0) + 1,
        updatedAtIso: nowIso,
      };
      await this.repo.upsertConsentInTx(tx, updatedConsent);

      profile.onboarding.privacyConsentAcknowledged = true;

      if (!obj.granted) {
        if (purpose === 'PROPERTY_SEARCH_ALERTS') {
          const alerts = await this.repo.listSearchAlertsByOwnerInTx(tx, principal.uid);
          for (const alert of alerts) {
            if (alert.status === 'ACTIVE') {
              alert.status = 'PAUSED';
              alert.updatedAtIso = nowIso;
              await this.repo.upsertSearchAlertInTx(tx, alert);
            }
          }
        } else if (purpose === 'ACTIVITY_HISTORY_STORAGE') {
          const prefs =
            (await this.repo.getPreferencesInTx(tx, principal.uid)) ??
            this.buildInitialPreferences(principal.uid, nowIso);
          prefs.personalization.saveRecentViewHistory = false;
          prefs.personalization.saveSearchHistory = false;
          prefs.updatedAtIso = nowIso;
          this.repo.setPreferencesInTx(tx, prefs);
        } else if (purpose === 'PERSONALIZED_RECOMMENDATIONS') {
          const prefs =
            (await this.repo.getPreferencesInTx(tx, principal.uid)) ??
            this.buildInitialPreferences(principal.uid, nowIso);
          prefs.personalization.personalizedRecommendationsEnabled = false;
          prefs.updatedAtIso = nowIso;
          this.repo.setPreferencesInTx(tx, prefs);
        } else if (purpose === 'PUBLIC_DIRECTORY_LISTING') {
          profile.visibility.showPublicProfile = false;
        }
      }

      this.repo.setPrivateAndPublicProfileInTx(tx, profile, this.projectPublicProfile(profile));
      return updatedConsent;
    });

    await this.deps.auditSink.writeAuditEvent(
      createStructuredAuditEvent({
        principal,
        correlationId,
        action: obj.granted ? 'consent.granted' : 'consent.withdrawn',
        targetCollection: 'cx_consents',
        targetResourceId: record.id,
        outcome: 'SUCCESS',
        metadata: { purpose, policyVersion },
      }),
    );

    return record;
  }

  public async submitDataRightsRequest(
    principal: AuthenticatedPrincipal,
    rawInput: unknown,
    correlationId = 'cx-data-rights-submit',
  ): Promise<DataRightsRequestRecord> {
    await this.assertUserAuthorized(principal, principal.uid);
    const obj = assertPlainObject(rawInput, 'Data rights request');
    rejectMassAssignmentAndUnknownKeys(obj, new Set(['requestType', 'reason', 'correctionPayload']));

    if (
      typeof obj.requestType !== 'string' ||
      !ALLOWED_DATA_RIGHTS_TYPES.includes(obj.requestType as any)
    ) {
      throw new CoreApiError('VALIDATION_FAILED', 400, 'Invalid data rights requestType.');
    }
    const requestType = obj.requestType as DataRightsRequestRecord['requestType'];
    const reason =
      typeof obj.reason === 'string' && sanitizeTextInput(obj.reason).length >= 3
        ? sanitizeTextInput(obj.reason).slice(0, 400)
        : `User submitted ${requestType}`;

    let correctionPayload: Record<string, unknown> | undefined;
    if (requestType === 'DATA_CORRECTION') {
      correctionPayload = assertPlainObject(obj.correctionPayload ?? {}, 'correctionPayload');
    }

    let hasFinancialOrContractualRetention = false;
    let retainedDocumentIds: string[] = [];
    if (this.crossModuleAdapter.getTransactionsAndTenanciesSummary) {
      try {
        const txSummary = await this.crossModuleAdapter.getTransactionsAndTenanciesSummary(principal.uid);
        hasFinancialOrContractualRetention = txSummary.hasActiveFinancialOrContractualObligations;
        retainedDocumentIds = txSummary.relevantDocumentIds;
      } catch {
        // Fault-tolerant check
      }
    }

    const nowIso = new Date().toISOString();
    const requestId = `drr_${crypto.randomUUID().slice(0, 12)}`;

    let exportArtifactId: string | null = null;
    if (
      (requestType === 'DATA_EXPORT' || requestType === 'DATA_ACCESS') &&
      this.crossModuleAdapter.generateExportArtifactDocument
    ) {
      const profile = await this.getOrInitOwnProfile(principal);
      const prefs = await this.getOwnPreferences(principal);
      const artifact = await this.crossModuleAdapter.generateExportArtifactDocument({
        ownerUid: principal.uid,
        requestId,
        exportPayload: {
          uid: principal.uid,
          profile: { displayName: profile.displayName, primaryCityId: profile.primaryCityId },
          preferences: prefs,
          exportedAtIso: nowIso,
        },
      });
      exportArtifactId = artifact.artifactDocumentId;
    }

    const created = await this.repo.runInTransaction('cx.submitDataRightsRequest', async (tx) => {
      const profile = await this.ensureProfileInTx(tx, principal, nowIso);

      const defaultConfirmations: DomainCompletionConfirmation[] = [
        {
          domain: 'PROFILE_AND_PREFERENCES',
          completed: requestType === 'DATA_ACCESS' || Boolean(exportArtifactId),
          disposition: exportArtifactId ? 'EXPORTED' : 'PENDING',
          confirmedAtIso: exportArtifactId ? nowIso : null,
        },
        {
          domain: 'SAVED_PROPERTIES_AND_SEARCHES',
          completed: requestType === 'DATA_ACCESS' || Boolean(exportArtifactId),
          disposition: exportArtifactId ? 'EXPORTED' : 'PENDING',
          confirmedAtIso: exportArtifactId ? nowIso : null,
        },
        {
          domain: 'ACTIVITY_AND_UGC',
          completed: requestType === 'DATA_ACCESS' || Boolean(exportArtifactId),
          disposition: exportArtifactId ? 'EXPORTED' : 'PENDING',
          confirmedAtIso: exportArtifactId ? nowIso : null,
        },
        {
          domain: 'LISTINGS_AND_MEDIA',
          completed: requestType === 'DATA_ACCESS' || Boolean(exportArtifactId),
          disposition: exportArtifactId ? 'EXPORTED' : 'PENDING',
          confirmedAtIso: exportArtifactId ? nowIso : null,
        },
        {
          domain: 'TRANSACTIONS_AND_FINANCE_RETENTION_CHECK',
          completed: requestType === 'DATA_ACCESS' || Boolean(exportArtifactId),
          disposition: hasFinancialOrContractualRetention
            ? 'RETAINED_BY_LAW'
            : exportArtifactId
              ? 'EXPORTED'
              : 'PENDING',
          confirmedAtIso: exportArtifactId ? nowIso : null,
          notes: hasFinancialOrContractualRetention
            ? 'Financial/transaction records must be retained under statutory commercial retention rules.'
            : undefined,
        },
        {
          domain: 'LEGAL_HOLD_AND_AUDIT_CHECK',
          completed: requestType === 'DATA_ACCESS' || Boolean(exportArtifactId),
          disposition: exportArtifactId ? 'EXPORTED' : 'PENDING',
          confirmedAtIso: exportArtifactId ? nowIso : null,
        },
      ];

      const allComplete = defaultConfirmations.every((c) => c.completed);

      const record: DataRightsRequestRecord = {
        id: requestId,
        ownerUid: principal.uid,
        requestType,
        status: allComplete ? 'COMPLETED' : 'SUBMITTED',
        reason,
        correctionPayload,
        legalHoldActive: false,
        legalHoldReasons: [],
        retainedRecordReferences: retainedDocumentIds,
        domainConfirmations: defaultConfirmations,
        exportDocumentArtifactId: exportArtifactId,
        lifecycleJobId: requestType === 'ACCOUNT_CLOSURE_AND_DELETION' ? `ljob_${requestId}` : null,
        adminReviewerUid: null,
        adminReviewNotes: null,
        submittedAtIso: nowIso,
        reviewedAtIso: null,
        completedAtIso: allComplete ? nowIso : null,
        updatedAtIso: nowIso,
      };

      if (requestType === 'ACCOUNT_CLOSURE_AND_DELETION') {
        profile.lifecycleStatus = 'CLOSURE_REQUESTED';
        profile.closureRequestId = requestId;
        profile.updatedAtIso = nowIso;
        this.repo.setPrivateAndPublicProfileInTx(tx, profile, this.projectPublicProfile(profile));

        const alerts = await this.repo.listSearchAlertsByOwnerInTx(tx, principal.uid);
        for (const alert of alerts) {
          if (alert.status === 'ACTIVE') {
            alert.status = 'PAUSED';
            alert.updatedAtIso = nowIso;
            await this.repo.upsertSearchAlertInTx(tx, alert);
          }
        }
      }

      await this.repo.upsertDataRightsRequestInTx(tx, record);
      return record;
    });

    await this.deps.auditSink.writeAuditEvent(
      createStructuredAuditEvent({
        principal,
        correlationId,
        action: 'privacy.data_rights_request.submitted',
        targetCollection: 'cx_data_rights_requests',
        targetResourceId: created.id,
        outcome: 'SUCCESS',
        metadata: { requestType, status: created.status },
      }),
    );

    await this.emitDomainEvent(
      'cx.privacy_request.changed',
      principal.uid,
      principal.uid,
      created.id,
      correlationId,
      { requestType, status: created.status },
    );

    return created;
  }

  public async confirmDataRightsDomainCompletion(
    adminPrincipal: AuthenticatedPrincipal,
    requestId: string,
    rawInput: unknown,
    correlationId = 'cx-domain-confirm',
  ): Promise<DataRightsRequestRecord> {
    await this.assertAdminAuthorized(adminPrincipal);

    const cleanId = validateSafeResourceId(requestId, 'requestId');
    const obj = assertPlainObject(rawInput, 'Domain confirmation');
    rejectMassAssignmentAndUnknownKeys(obj, new Set(['domain', 'disposition', 'notes']));

    const allowedDomains: DomainCompletionConfirmation['domain'][] = [
      'PROFILE_AND_PREFERENCES',
      'SAVED_PROPERTIES_AND_SEARCHES',
      'ACTIVITY_AND_UGC',
      'LISTINGS_AND_MEDIA',
      'TRANSACTIONS_AND_FINANCE_RETENTION_CHECK',
      'LEGAL_HOLD_AND_AUDIT_CHECK',
    ];
    if (typeof obj.domain !== 'string' || !allowedDomains.includes(obj.domain as any)) {
      throw new CoreApiError('VALIDATION_FAILED', 400, 'Invalid domain identifier.');
    }
    const allowedDispositions: DomainCompletionConfirmation['disposition'][] = [
      'PURGED',
      'ANONYMIZED',
      'RETAINED_BY_LAW',
      'EXPORTED',
    ];
    if (typeof obj.disposition !== 'string' || !allowedDispositions.includes(obj.disposition as any)) {
      throw new CoreApiError('VALIDATION_FAILED', 400, 'Invalid completion disposition.');
    }

    const nowIso = new Date().toISOString();
    const updated = await this.repo.runInTransaction('cx.confirmDataRightsDomainCompletion', async (tx) => {
      const req = await this.repo.getDataRightsRequestInTx(tx, cleanId);
      if (!req) throw new CoreApiError('NOT_FOUND', 404, 'Data rights request not found.');

      if (req.legalHoldActive) {
        req.status = 'BLOCKED_BY_LEGAL_HOLD';
        req.updatedAtIso = nowIso;
        await this.repo.upsertDataRightsRequestInTx(tx, req);
        throw new CoreApiError(
          'CONFLICT',
          409,
          'Cannot complete deletion/closure while a legal hold is active on the account.',
        );
      }

      const targetDomain = req.domainConfirmations.find((d) => d.domain === obj.domain);
      if (!targetDomain) {
        throw new CoreApiError('VALIDATION_FAILED', 400, 'Domain not present on request.');
      }

      targetDomain.completed = true;
      targetDomain.disposition = obj.disposition as DomainCompletionConfirmation['disposition'];
      targetDomain.confirmedAtIso = nowIso;
      if (typeof obj.notes === 'string') {
        targetDomain.notes = sanitizeTextInput(obj.notes).slice(0, 250);
      }

      if (req.requestType === 'ACCOUNT_CLOSURE_AND_DELETION') {
        if (obj.domain === 'SAVED_PROPERTIES_AND_SEARCHES') {
          const savedProps = await this.repo.listSavedPropertiesByOwnerInTx(tx, req.ownerUid);
          for (const sp of savedProps) {
            await this.repo.deleteSavedPropertyInTx(tx, req.ownerUid, sp.propertyId);
          }
          const searches = await this.repo.listSavedSearchesByOwnerInTx(tx, req.ownerUid);
          for (const s of searches) {
            await this.repo.deleteSavedSearchInTx(tx, req.ownerUid, s.id);
          }
          const alerts = await this.repo.listSearchAlertsByOwnerInTx(tx, req.ownerUid);
          for (const a of alerts) {
            await this.repo.deleteSearchAlertInTx(tx, req.ownerUid, a.id);
          }
        } else if (obj.domain === 'ACTIVITY_AND_UGC') {
          const activities = await this.repo.listActivityByOwnerInTx(tx, req.ownerUid);
          for (const act of activities) {
            await this.repo.deleteActivityEntryInTx(tx, req.ownerUid, act.id);
          }
        }
      }

      const allDomainsCompleted = req.domainConfirmations.every((d) => d.completed === true);
      if (allDomainsCompleted && !req.legalHoldActive) {
        req.status = 'COMPLETED';
        req.completedAtIso = nowIso;

        if (req.requestType === 'ACCOUNT_CLOSURE_AND_DELETION') {
          const profile = await this.repo.getPrivateProfileInTx(tx, req.ownerUid);
          if (profile) {
            profile.lifecycleStatus = 'CLOSED';
            profile.displayName = 'حساب کاربری بسته‌شده';
            profile.bio = '';
            profile.contactPhone = null;
            profile.secondaryEmail = null;
            profile.avatarObjectId = null;
            profile.avatarUrl = null;
            profile.visibility.showPublicProfile = false;
            profile.updatedAtIso = nowIso;
            this.repo.setPrivateAndPublicProfileInTx(tx, profile, null);
          }
        }
      } else {
        req.status = 'ORCHESTRATING_DOMAINS';
      }

      req.updatedAtIso = nowIso;
      await this.repo.upsertDataRightsRequestInTx(tx, req);
      return req;
    });

    await this.deps.auditSink.writeAuditEvent(
      createStructuredAuditEvent({
        principal: adminPrincipal,
        correlationId,
        action: 'admin.data_rights.domain_confirmed',
        targetCollection: 'cx_data_rights_requests',
        targetResourceId: cleanId,
        outcome: 'SUCCESS',
        metadata: {
          domain: obj.domain,
          disposition: obj.disposition,
          overallStatus: updated.status,
        },
      }),
    );

    return updated;
  }

  public async adminReviewDataRightsRequest(
    adminPrincipal: AuthenticatedPrincipal,
    requestId: string,
    rawInput: unknown,
    correlationId = 'cx-admin-data-rights',
  ): Promise<DataRightsRequestRecord> {
    await this.assertAdminAuthorized(adminPrincipal);

    const cleanId = validateSafeResourceId(requestId, 'requestId');
    const obj = assertPlainObject(rawInput, 'Admin review data rights request');
    rejectMassAssignmentAndUnknownKeys(
      obj,
      new Set(['decision', 'legalHoldActive', 'legalHoldReasons', 'adminReviewNotes']),
    );

    const nowIso = new Date().toISOString();
    const updated = await this.repo.runInTransaction('cx.adminReviewDataRightsRequest', async (tx) => {
      const req = await this.repo.getDataRightsRequestInTx(tx, cleanId);
      if (!req) throw new CoreApiError('NOT_FOUND', 404, 'Data rights request not found.');

      if (typeof obj.legalHoldActive === 'boolean') {
        req.legalHoldActive = obj.legalHoldActive;
      }
      if (Array.isArray(obj.legalHoldReasons)) {
        req.legalHoldReasons = obj.legalHoldReasons
          .filter((r): r is string => typeof r === 'string')
          .map((r) => sanitizeTextInput(r).slice(0, 200));
      }
      if (typeof obj.adminReviewNotes === 'string') {
        req.adminReviewNotes = sanitizeTextInput(obj.adminReviewNotes).slice(0, 500);
      }

      if (req.legalHoldActive) {
        req.status = 'BLOCKED_BY_LEGAL_HOLD';
      } else if (obj.decision === 'REJECT') {
        req.status = 'REJECTED';
      } else if (obj.decision === 'APPROVE_FOR_ORCHESTRATION') {
        req.status = 'ORCHESTRATING_DOMAINS';
      } else {
        req.status = 'UNDER_ADMIN_REVIEW';
      }

      req.adminReviewerUid = adminPrincipal.uid;
      req.reviewedAtIso = nowIso;
      req.updatedAtIso = nowIso;
      await this.repo.upsertDataRightsRequestInTx(tx, req);
      return req;
    });

    await this.deps.auditSink.writeAuditEvent(
      createStructuredAuditEvent({
        principal: adminPrincipal,
        correlationId,
        action: 'admin.data_rights.reviewed',
        targetCollection: 'cx_data_rights_requests',
        targetResourceId: cleanId,
        outcome: 'SUCCESS',
        metadata: {
          status: updated.status,
          legalHoldActive: updated.legalHoldActive,
        },
      }),
    );

    return updated;
  }

  public async listOwnDataRightsRequests(
    principal: AuthenticatedPrincipal,
  ): Promise<DataRightsRequestRecord[]> {
    await this.assertUserAuthorized(principal, principal.uid);
    return this.repo.runInTransaction('cx.listOwnDataRightsRequests', (tx) =>
      this.repo.listDataRightsByOwnerInTx(tx, principal.uid),
    );
  }

  // ==========================================================================
  // 11. USER-GENERATED CONTENT (REVIEWS, RATINGS, MODERATION, ABUSE REPORTS)
  // ==========================================================================

  public async createUgcReview(
    principal: AuthenticatedPrincipal,
    rawInput: unknown,
    correlationId = 'cx-ugc-create',
  ): Promise<UserGeneratedPropertyContentRecord> {
    await this.assertUserAuthorized(principal, principal.uid);
    const validated = validateUgcCreateOrUpdateInput(rawInput);

    if (validated.targetType === 'PROPERTY_LISTING') {
      const lookup = await this.catalogAdapter.getPropertyById(validated.targetId, principal.uid);
      if (!lookup.exists) {
        throw new CoreApiError('NOT_FOUND', 404, `Target property "${validated.targetId}" does not exist.`);
      }
      if (!lookup.accessible || lookup.availabilityState === 'RESTRICTED' || lookup.availabilityState === 'DELETED') {
        throw new CoreApiError('FORBIDDEN', 403, `Target property "${validated.targetId}" is not accessible for review.`);
      }
    } else if (validated.targetType === 'NEIGHBORHOOD') {
      const hoodExists = INITIAL_NEIGHBORHOODS.some(
        (h) => String(h.id) === validated.targetId || h.id === validated.hoodId,
      );
      if (!hoodExists) {
        throw new CoreApiError('NOT_FOUND', 404, 'Target neighborhood does not exist.');
      }
    }

    const nowIso = new Date().toISOString();
    const record = await this.repo.runInTransaction('cx.createUgcReview', async (tx) => {
      const profile = await this.ensureProfileInTx(tx, principal, nowIso);
      this.assertAccountWritable(profile, false);

      const ugc: UserGeneratedPropertyContentRecord = {
        id: `ugc_${crypto.randomUUID().slice(0, 12)}`,
        authorUid: principal.uid,
        authorDisplayName: profile.displayName,
        targetType: validated.targetType,
        targetId: validated.targetId,
        cityId: validated.cityId,
        hoodId: validated.hoodId,
        overallRating: validated.overallRating,
        structuredRatings: validated.structuredRatings,
        comment: validated.comment,
        prosTags: validated.prosTags,
        consTags: validated.consTags,
        visibility: 'PUBLISHED',
        moderationStatus: 'APPROVED',
        moderatedByUid: null,
        moderationNote: null,
        moderatedAtIso: null,
        abuseReports: [],
        editHistory: [],
        revision: 1,
        createdAtIso: nowIso,
        updatedAtIso: nowIso,
      };

      await this.repo.upsertUgcItemInTx(tx, ugc);
      return ugc;
    });

    await this.emitDomainEvent('cx.ugc.changed', principal.uid, principal.uid, record.id, correlationId, {
      action: 'CREATED',
      targetType: record.targetType,
      targetId: record.targetId,
    });
    return record;
  }

  public async updateOwnUgcReview(
    principal: AuthenticatedPrincipal,
    ugcId: string,
    rawInput: unknown,
    correlationId = 'cx-ugc-update',
  ): Promise<UserGeneratedPropertyContentRecord> {
    await this.assertUserAuthorized(principal, principal.uid);
    const cleanId = validateSafeResourceId(ugcId, 'ugcId');
    const obj = assertPlainObject(rawInput, 'Update UGC review');

    const nowIso = new Date().toISOString();
    const updated = await this.repo.runInTransaction('cx.updateOwnUgcReview', async (tx) => {
      const profile = await this.ensureProfileInTx(tx, principal, nowIso);
      this.assertAccountWritable(profile, false);

      const existing = await this.repo.getUgcItemInTx(tx, cleanId);
      if (!existing || existing.visibility === 'DELETED_BY_AUTHOR') {
        throw new CoreApiError('NOT_FOUND', 404, 'Review not found.');
      }
      if (existing.authorUid !== principal.uid) {
        throw new CoreApiError('FORBIDDEN', 403, 'You can only edit your own reviews.');
      }

      const mergedPayload = {
        targetType: existing.targetType,
        targetId: existing.targetId,
        cityId: existing.cityId,
        hoodId: existing.hoodId,
        overallRating: obj.overallRating ?? existing.overallRating,
        structuredRatings: obj.structuredRatings ?? existing.structuredRatings,
        comment: obj.comment ?? existing.comment,
        prosTags: obj.prosTags ?? existing.prosTags,
        consTags: obj.consTags ?? existing.consTags,
      };
      const validated = validateUgcCreateOrUpdateInput(mergedPayload);

      existing.editHistory = [
        ...existing.editHistory.slice(-9),
        {
          revision: existing.revision,
          previousComment: existing.comment,
          previousRating: existing.overallRating,
          editedAtIso: nowIso,
        },
      ];
      existing.overallRating = validated.overallRating;
      existing.structuredRatings = validated.structuredRatings;
      existing.comment = validated.comment;
      existing.prosTags = validated.prosTags;
      existing.consTags = validated.consTags;
      existing.revision += 1;
      existing.updatedAtIso = nowIso;

      await this.repo.upsertUgcItemInTx(tx, existing);
      return existing;
    });

    await this.emitDomainEvent('cx.ugc.changed', principal.uid, principal.uid, updated.id, correlationId, {
      action: 'UPDATED',
      revision: updated.revision,
    });
    return updated;
  }

  public async deleteOwnUgcReview(
    principal: AuthenticatedPrincipal,
    ugcId: string,
    correlationId = 'cx-ugc-delete',
  ): Promise<UserGeneratedPropertyContentRecord> {
    await this.assertUserAuthorized(principal, principal.uid);
    const cleanId = validateSafeResourceId(ugcId, 'ugcId');
    const nowIso = new Date().toISOString();

    const deleted = await this.repo.runInTransaction('cx.deleteOwnUgcReview', async (tx) => {
      const existing = await this.repo.getUgcItemInTx(tx, cleanId);
      if (!existing) throw new CoreApiError('NOT_FOUND', 404, 'Review not found.');
      if (existing.authorUid !== principal.uid) {
        throw new CoreApiError('FORBIDDEN', 403, 'You can only delete your own reviews.');
      }

      existing.visibility = 'DELETED_BY_AUTHOR';
      existing.updatedAtIso = nowIso;
      await this.repo.upsertUgcItemInTx(tx, existing);
      return existing;
    });

    await this.emitDomainEvent('cx.ugc.changed', principal.uid, principal.uid, deleted.id, correlationId, {
      action: 'DELETED',
    });
    return deleted;
  }

  public async reportUgcAbuse(
    principal: AuthenticatedPrincipal,
    ugcId: string,
    rawInput: unknown,
    correlationId = 'cx-ugc-report',
  ): Promise<UserGeneratedPropertyContentRecord> {
    await this.assertUserAuthorized(principal);
    const cleanId = validateSafeResourceId(ugcId, 'ugcId');
    const obj = assertPlainObject(rawInput, 'Abuse report');
    rejectMassAssignmentAndUnknownKeys(obj, new Set(['reason', 'details']));

    const allowedReasons: UgcAbuseReportReference['reason'][] = [
      'SPAM',
      'HARASSMENT',
      'FAKE_REVIEW',
      'PRIVATE_PII_EXPOSURE',
      'OFF_TOPIC',
    ];
    if (typeof obj.reason !== 'string' || !allowedReasons.includes(obj.reason as any)) {
      throw new CoreApiError('VALIDATION_FAILED', 400, 'Invalid abuse report reason.');
    }
    const details =
      typeof obj.details === 'string' ? sanitizeTextInput(obj.details).slice(0, 300) : '';
    const nowIso = new Date().toISOString();

    const updated = await this.repo.runInTransaction('cx.reportUgcAbuse', async (tx) => {
      const item = await this.repo.getUgcItemInTx(tx, cleanId);
      if (!item || item.visibility === 'DELETED_BY_AUTHOR') {
        throw new CoreApiError('NOT_FOUND', 404, 'Review not found.');
      }
      if (item.abuseReports.some((r) => r.reporterUid === principal.uid)) {
        throw new CoreApiError('CONFLICT', 409, 'You have already reported this content.');
      }

      item.abuseReports.push({
        reportId: `rep_${crypto.randomUUID().slice(0, 10)}`,
        reporterUid: principal.uid,
        reason: obj.reason as UgcAbuseReportReference['reason'],
        details,
        createdAtIso: nowIso,
      });

      if (item.abuseReports.length >= 3 && item.moderationStatus !== 'REJECTED') {
        item.moderationStatus = 'FLAGGED_ABUSE';
        item.visibility = 'PENDING_MODERATION';
      }

      item.updatedAtIso = nowIso;
      await this.repo.upsertUgcItemInTx(tx, item);
      return item;
    });

    await this.emitDomainEvent('cx.ugc.changed', principal.uid, updated.authorUid, updated.id, correlationId, {
      action: 'ABUSE_REPORTED',
      reportsCount: updated.abuseReports.length,
    });
    return updated;
  }

  public async adminModerateUgc(
    adminPrincipal: AuthenticatedPrincipal,
    ugcId: string,
    rawInput: unknown,
    correlationId = 'cx-admin-moderate-ugc',
  ): Promise<UserGeneratedPropertyContentRecord> {
    await this.assertAdminAuthorized(adminPrincipal);

    const cleanId = validateSafeResourceId(ugcId, 'ugcId');
    const obj = assertPlainObject(rawInput, 'Admin moderate UGC');
    rejectMassAssignmentAndUnknownKeys(obj, new Set(['moderationStatus', 'visibility', 'moderationNote']));

    const allowedStatuses: UgcModerationStatus[] = ['PENDING', 'APPROVED', 'REJECTED', 'FLAGGED_ABUSE'];
    const allowedVisibilities: UgcVisibilityState[] = [
      'PUBLISHED',
      'PENDING_MODERATION',
      'HIDDEN_BY_MODERATOR',
      'DELETED_BY_AUTHOR',
    ];

    if (typeof obj.moderationStatus !== 'string' || !allowedStatuses.includes(obj.moderationStatus as any)) {
      throw new CoreApiError('VALIDATION_FAILED', 400, 'Invalid moderationStatus.');
    }
    if (obj.visibility !== undefined && !allowedVisibilities.includes(obj.visibility as any)) {
      throw new CoreApiError('VALIDATION_FAILED', 400, 'Invalid visibility state.');
    }

    const moderationNote =
      typeof obj.moderationNote === 'string' ? sanitizeTextInput(obj.moderationNote).slice(0, 300) : null;
    const nowIso = new Date().toISOString();

    const updated = await this.repo.runInTransaction('cx.adminModerateUgc', async (tx) => {
      const item = await this.repo.getUgcItemInTx(tx, cleanId);
      if (!item) throw new CoreApiError('NOT_FOUND', 404, 'UGC item not found.');

      item.moderationStatus = obj.moderationStatus as UgcModerationStatus;
      if (obj.visibility !== undefined) {
        item.visibility = obj.visibility as UgcVisibilityState;
      } else {
        item.visibility =
          item.moderationStatus === 'APPROVED' ? 'PUBLISHED' : 'HIDDEN_BY_MODERATOR';
      }
      item.moderatedByUid = adminPrincipal.uid;
      item.moderationNote = moderationNote;
      item.moderatedAtIso = nowIso;
      item.updatedAtIso = nowIso;

      await this.repo.upsertUgcItemInTx(tx, item);
      return item;
    });

    await this.deps.auditSink.writeAuditEvent(
      createStructuredAuditEvent({
        principal: adminPrincipal,
        correlationId,
        action: 'admin.ugc.moderated',
        targetCollection: 'cx_ugc_items',
        targetResourceId: cleanId,
        outcome: 'SUCCESS',
        metadata: {
          moderationStatus: updated.moderationStatus,
          visibility: updated.visibility,
          moderationNote,
        },
      }),
    );

    return updated;
  }

  public async listPublishedUgcForTarget(
    targetType: UgcTargetType,
    targetId: string,
    query: { limit?: unknown; cursor?: unknown } = {},
  ): Promise<{
    items: UserGeneratedPropertyContentRecord[];
    nextCursor: string | null;
    hasMore: boolean;
    totalCount: number;
  }> {
    if (targetType !== 'PROPERTY_LISTING' && targetType !== 'NEIGHBORHOOD') {
      throw new CoreApiError('VALIDATION_FAILED', 400, 'Invalid targetType.');
    }
    const cleanTargetId = validateSafeResourceId(targetId, 'targetId');
    const pagination = normalizePaginationParams(query);

    const all = await this.repo.runInTransaction('cx.listPublishedUgcForTarget', (tx) =>
      this.repo.listUgcByTargetInTx(tx, targetType, cleanTargetId),
    );

    const published = all.filter(
      (item) => item.visibility === 'PUBLISHED' && item.moderationStatus === 'APPROVED',
    );

    let startIndex = 0;
    if (pagination.cursor) {
      const decoded = decodePaginationCursor(pagination.cursor);
      const idx = published.findIndex((i) => i.id === decoded.docId);
      if (idx >= 0) startIndex = idx + 1;
    }

    const slice = published.slice(startIndex, startIndex + pagination.limit);
    const hasMore = startIndex + pagination.limit < published.length;
    const last = slice[slice.length - 1];
    const nextCursor =
      hasMore && last
        ? encodePaginationCursor({ sortValue: last.createdAtIso, docId: last.id, direction: 'desc' })
        : null;

    return {
      items: slice,
      nextCursor,
      hasMore,
      totalCount: published.length,
    };
  }
}
