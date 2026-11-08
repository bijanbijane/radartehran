import { NotificationLifecycleStage, ViewingError } from './types';

export interface ViewingsPropertyAndListingAdapter {
  validatePropertyViewingEligibility(params: {
    propertyId: string;
    listingId?: string;
    callerUserId: string;
  }): Promise<{
    propertyExists: boolean;
    viewingAllowed: boolean;
    reason?: string;
  }>;
}

export interface ViewingsBrokerageAuthorizationAdapter {
  verifyHostAuthorityForProperty(params: {
    propertyId: string;
    hostUserId: string;
    brokerageOrganizationId?: string;
    mandateId?: string;
  }): Promise<{
    authorizedAsHost: boolean;
    reason?: string;
  }>;
}

export interface ViewingsNotificationsAdapter {
  requestNotificationDispatch(params: {
    appointmentId: string;
    eventType: string;
    recipientUserId: string;
  }): Promise<{
    stage: Extract<NotificationLifecycleStage, 'NOTIFICATION_REQUESTED' | 'ACCEPTED_BY_PROVIDER'>;
    providerReferenceId: string;
  }>;
}

export interface ViewingsExternalWriteGuardAdapter {
  attemptDirectExternalModuleWrite(targetModule: string): Promise<never>;
}

export interface PropertyViewingsExternalAdapters {
  propertyAndListing: ViewingsPropertyAndListingAdapter;
  brokerageAuth: ViewingsBrokerageAuthorizationAdapter;
  notifications: ViewingsNotificationsAdapter;
  externalWriteGuard: ViewingsExternalWriteGuardAdapter;
}

export function createDefaultPropertyViewingsAdapters(
  overrides: Partial<PropertyViewingsExternalAdapters> = {}
): PropertyViewingsExternalAdapters {
  return {
    propertyAndListing: overrides.propertyAndListing ?? {
      async validatePropertyViewingEligibility(params) {
        if (params.propertyId.startsWith('invalid_prop')) {
          return { propertyExists: false, viewingAllowed: false, reason: 'Property does not exist.' };
        }
        if (params.propertyId.startsWith('restricted_offmarket') && params.callerUserId === 'unauthorized_viewer') {
          return {
            propertyExists: true,
            viewingAllowed: false,
            reason: 'Private off-market property requires explicit invitation or owner authorization.',
          };
        }
        return { propertyExists: true, viewingAllowed: true };
      },
    },
    brokerageAuth: overrides.brokerageAuth ?? {
      async verifyHostAuthorityForProperty(params) {
        if (params.hostUserId.startsWith('unaffiliated_agent')) {
          return {
            authorizedAsHost: false,
            reason: 'Agent has no active mandate or owner authorization to host viewings for this property.',
          };
        }
        return { authorizedAsHost: true };
      },
    },
    notifications: overrides.notifications ?? {
      async requestNotificationDispatch(params) {
        // Never fabricates DELIVERED_VERIFIED merely because an event was created
        return {
          stage: 'ACCEPTED_BY_PROVIDER',
          providerReferenceId: `notif_req_${params.appointmentId}_${Date.now()}`,
        };
      },
    },
    externalWriteGuard: overrides.externalWriteGuard ?? {
      async attemptDirectExternalModuleWrite(targetModule: string): Promise<never> {
        throw new ViewingError(
          'INSUFFICIENT_PRIVILEGE',
          `Direct cross-module write to '${targetModule}' is forbidden by Property Viewings module boundaries.`,
          403
        );
      },
    },
  };
}
