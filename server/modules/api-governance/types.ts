/**
 * @file server/modules/api-governance/types.ts
 * @description Domain models, lifecycle states, classifications, and DTOs for Platform API Governance,
 * Integration Gateway, and Developer Ecosystem (Employee 73).
 */

export type ServiceClassification =
  | 'PUBLIC'
  | 'PARTNER'
  | 'INTERNAL'
  | 'ADMINISTRATIVE'
  | 'SYSTEM'
  | 'RESTRICTED';

export type ServiceLifecycleStatus =
  | 'DRAFT'
  | 'ACTIVE'
  | 'DEPRECATED'
  | 'SUNSET'
  | 'DISABLED';

export type EndpointLifecycleStatus =
  | 'DRAFT'
  | 'ACTIVE'
  | 'DEPRECATED'
  | 'SUNSET'
  | 'RETIRED';

export type ConsumerType =
  | 'FIRST_PARTY'
  | 'APPROVED_PARTNER'
  | 'APPROVED_VENDOR'
  | 'INTERNAL_SERVICE'
  | 'ADMINISTRATIVE'
  | 'APPROVED_RESEARCH';

export type ConsumerStatus =
  | 'PENDING'
  | 'UNDER_REVIEW'
  | 'APPROVED'
  | 'SUSPENDED'
  | 'REJECTED'
  | 'REVOKED'
  | 'CLOSED';

export type AccessGrantStatus =
  | 'PENDING'
  | 'ACTIVE'
  | 'SUSPENDED'
  | 'EXPIRED'
  | 'REVOKED';

export type CredentialType = 'API_KEY' | 'CLIENT_SECRET' | 'BEARER_TOKEN';

export type CredentialStatus = 'ACTIVE' | 'ROTATING' | 'EXPIRED' | 'REVOKED';

export type BreakingChangeClassification =
  | 'NON_BREAKING'
  | 'POTENTIALLY_BREAKING'
  | 'BREAKING'
  | 'SECURITY_CRITICAL';

export type RateLimitBehaviorOnLimit =
  | 'REJECT'
  | 'QUEUE_IF_SUPPORTED'
  | 'DEGRADE_NONCRITICAL';

export type WebhookSubscriptionStatus =
  | 'ACTIVE'
  | 'SUSPENDED'
  | 'PENDING_VERIFICATION'
  | 'REVOKED';

export type IntegrationHealthState =
  | 'HEALTHY'
  | 'DEGRADED'
  | 'UNSTABLE'
  | 'UNAVAILABLE'
  | 'SUSPENDED'
  | 'UNKNOWN';

export interface ApiService {
  id: string;
  serviceCode: string;
  serviceName: string;
  description: string;
  ownerModule: string;
  ownerTeam: string;
  basePath: string;
  apiVersions: string[];
  serviceClassification: ServiceClassification;
  dataSensitivity: 'PUBLIC' | 'CONFIDENTIAL' | 'RESTRICTED' | 'HIGHLY_SENSITIVE';
  tenantScope: 'GLOBAL' | 'TENANT_ISOLATED' | 'ORGANIZATION_BOUND';
  authenticationRequirement: 'NONE' | 'API_KEY' | 'OAUTH2' | 'FIREBASE_JWT' | 'MTLS';
  authorizationPolicyReference?: string;
  rateLimitPolicyReference?: string;
  availabilityClassification: 'TIER_1_CRITICAL' | 'TIER_2_STANDARD' | 'TIER_3_INTERNAL';
  lifecycleStatus: ServiceLifecycleStatus;
  documentationReference?: string;
  openApiDocumentReference?: string;
  createdAt: string;
  updatedAt: string;
  version: number;
}

export interface ApiEndpoint {
  id: string;
  serviceId: string;
  endpointCode: string;
  method: 'GET' | 'POST' | 'PUT' | 'PATCH' | 'DELETE' | 'OPTIONS';
  pathTemplate: string;
  version: string;
  summary: string;
  description: string;
  operationId: string;
  authenticationRequired: boolean;
  permissionRequirements: string[];
  dataClassification: 'PUBLIC' | 'INTERNAL' | 'CONFIDENTIAL' | 'RESTRICTED';
  tenantIsolationRequired: boolean;
  requestSchemaReference?: string;
  responseSchemaReference?: string;
  rateLimitPolicyId?: string;
  idempotencyRequired: boolean;
  deprecationStatus: boolean;
  sunsetAt?: string;
  ownerModule: string;
  lifecycleStatus: EndpointLifecycleStatus;
  createdAt: string;
  updatedAt: string;
}

export interface ApiContract {
  id: string;
  serviceId: string;
  serviceCode: string;
  version: string;
  title: string;
  description: string;
  specType: 'OPENAPI_V3' | 'JSON_SCHEMA';
  specContent: Record<string, unknown>;
  checksumSha256: string;
  status: 'DRAFT' | 'PUBLISHED' | 'DEPRECATED' | 'SUNSET';
  publishedAt?: string;
  deprecatedAt?: string;
  sunsetAt?: string;
  breakingChangeClassification?: BreakingChangeClassification;
  createdAt: string;
  updatedAt: string;
}

export interface ApiConsumer {
  id: string;
  consumerCode: string;
  displayName: string;
  consumerType: ConsumerType;
  organizationId: string;
  ownerUserId: string;
  technicalContact: { name: string; email: string; phone?: string };
  businessContact: { name: string; email: string };
  description: string;
  requestedServices: string[];
  approvedServices: string[];
  allowedEnvironments: ('development' | 'preview' | 'staging' | 'production')[];
  dataAccessClassification: 'PUBLIC' | 'CONFIDENTIAL' | 'RESTRICTED';
  status: ConsumerStatus;
  onboardingStatus: string;
  onboardingStage: number;
  riskClassification: 'LOW' | 'MEDIUM' | 'HIGH' | 'PROHIBITED';
  createdAt: string;
  updatedAt: string;
  version: number;
}

export interface ApiAccessGrant {
  id: string;
  consumerId: string;
  serviceId: string;
  environment: 'development' | 'preview' | 'staging' | 'production';
  permissions: string[];
  allowedScopes: string[];
  tenantRestrictions: string[];
  dataClassificationCeiling: 'PUBLIC' | 'CONFIDENTIAL' | 'RESTRICTED';
  rateLimitPolicyId?: string;
  quotaPolicyId?: string;
  validFrom: string;
  validUntil: string;
  approvedBy?: string;
  approvalReference?: string;
  status: AccessGrantStatus;
  createdAt: string;
  updatedAt: string;
  version: number;
}

export interface ApiCredential {
  id: string;
  consumerId: string;
  accessGrantId: string;
  credentialType: CredentialType;
  keyPrefix: string;
  secretHash: string;
  secretReference: string;
  environment: 'development' | 'preview' | 'staging' | 'production';
  createdAt: string;
  expiresAt: string;
  lastUsedAt?: string;
  rotatedAt?: string;
  revokedAt?: string;
  status: CredentialStatus;
  label?: string;
  version: number;
}

export interface OAuthClientRegistration {
  clientId: string;
  consumerId: string;
  clientName: string;
  allowedGrantTypes: ('authorization_code' | 'client_credentials' | 'refresh_token')[];
  redirectUris: string[];
  allowedScopes: string[];
  environment: 'development' | 'preview' | 'staging' | 'production';
  tokenLifetimePolicy: { accessTokenTtlSeconds: number; refreshTokenTtlSeconds: number };
  status: 'ACTIVE' | 'SUSPENDED' | 'REVOKED';
  createdAt: string;
  updatedAt: string;
}

export interface ApiRateLimitPolicy {
  id: string;
  name: string;
  requestsPerWindow: number;
  windowSeconds: number;
  burstLimit: number;
  concurrencyLimit: number;
  dailyQuota: number;
  monthlyQuota: number;
  priorityClass: 'HIGH' | 'STANDARD' | 'BATCH';
  behaviorOnLimit: RateLimitBehaviorOnLimit;
  status: 'ACTIVE' | 'ARCHIVED';
  version: number;
}

export interface WebhookSubscription {
  id: string;
  consumerId: string;
  endpointUrl: string;
  description: string;
  subscribedEventTypes: string[];
  environment: 'development' | 'preview' | 'staging' | 'production';
  signingSecretReference: string;
  signingSecretHash: string;
  deliveryPolicyReference: { maxRetries: number; backoffSeconds: number };
  status: WebhookSubscriptionStatus;
  createdAt: string;
  updatedAt: string;
  version: number;
}

export interface WebhookDeliveryEnvelope<T = Record<string, unknown>> {
  id: string;
  type: string;
  version: string;
  occurredAt: string;
  consumerId: string;
  deliveryId: string;
  correlationId: string;
  data: T;
}

export interface IntegrationHealthSnapshot {
  consumerId: string;
  overallStatus: IntegrationHealthState;
  credentialValidity: boolean;
  accessGrantStatus: AccessGrantStatus;
  serviceAvailability: number;
  contractCompatibility: boolean;
  webhookHealth: 'HEALTHY' | 'DEGRADED' | 'FAILING' | 'NOT_CONFIGURED';
  deliverySuccessRate: number;
  repeatedAuthFailures: number;
  rateLimitPressure: 'LOW' | 'MODERATE' | 'HIGH' | 'EXHAUSTED';
  quotaUtilizationPercent: number;
  timestampIso: string;
}

export interface ApiSecurityEvent {
  id: string;
  eventType: string;
  consumerId?: string;
  severity: 'INFO' | 'WARN' | 'CRITICAL';
  sourceIp: string;
  details: Record<string, unknown>;
  timestampIso: string;
}

export interface GovernanceAuditEvent {
  id: string;
  action: string;
  actorId: string;
  resourceType: string;
  resourceId: string;
  details: Record<string, unknown>;
  timestampIso: string;
}
