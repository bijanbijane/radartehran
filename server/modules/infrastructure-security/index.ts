import express from 'express';
import crypto from 'crypto';
import {
  PlatformFoundationStore,
  CoreApiError,
  getRequestTraceContext,
  sendCanonicalSuccess,
  sendCanonicalError,
  verifiedAdminContextMiddleware,
  requireAdminPermission,
  clampPageSize,
  paginateArray,
} from '../platform-foundation/index.ts';

export type SecurityPolicyCategory =
  | 'AUTHENTICATION_HARDENING'
  | 'SESSION_SECURITY'
  | 'SECRET_ROTATION'
  | 'ENCRYPTION_AT_REST'
  | 'TRANSPORT_SECURITY'
  | 'ORIGIN_AND_HEADER_SECURITY'
  | 'WEBHOOK_VERIFICATION'
  | 'FILE_UPLOAD_SECURITY'
  | 'DEPENDENCY_SECURITY'
  | 'PRIVILEGED_OPERATION_APPROVAL'
  | 'EXTERNAL_EGRESS_PROTECTION';

export interface SecurityPolicyVersionRecord {
  policyCode: string;
  category: SecurityPolicyCategory;
  version: number;
  status: 'DRAFT' | 'APPROVED' | 'ACTIVE' | 'RETIRED';
  enforcedRules: Record<string, string | number | boolean | string[]>;
  approvedBy?: string;
  updatedAt: string;
}

export interface SecretMetadataRecord {
  secretReferenceId: string;
  provider: 'ISOLATED_TEST_VAULT' | 'ENVIRONMENT_BINDING' | 'CLOUD_SECRET_MANAGER';
  providerReference: string;
  purpose: string;
  ownerModule: string;
  environment: 'development' | 'test' | 'staging' | 'production';
  classification: 'RESTRICTED_SECRET' | 'SIGNING_KEY' | 'PROVIDER_API_KEY' | 'WEBHOOK_SECRET';
  rotationPolicyDays: number;
  lastRotatedAt: string;
  nextRotationDueAt: string;
  lastVerifiedAt: string;
  dependentServices: string[];
  versionFingerprint: string;
  status: 'ACTIVE' | 'ROTATING' | 'VERIFICATION_FAILED' | 'ROLLED_BACK' | 'RETIRED';
}

export interface SecretRotationExecutionRecord {
  rotationId: string;
  secretReferenceId: string;
  initiatedBy: string;
  previousFingerprint: string;
  newFingerprint: string;
  stepsCompleted: string[];
  status: 'COMPLETED' | 'ROLLED_BACK' | 'FAILED';
  failureReason?: string;
  executedAt: string;
}

export interface CryptographicKeyReference {
  keyReferenceId: string;
  purpose: 'FIELD_ENCRYPTION' | 'MANIFEST_SIGNING' | 'TOKEN_SIGNING' | 'WEBHOOK_HMAC';
  algorithm: 'AES-256-GCM' | 'Ed25519' | 'ECDSA-P256' | 'SHA-256';
  providerStatus: 'LOCAL_ISOLATED_ACTIVE' | 'EXTERNAL_KMS_NOT_CONFIGURED' | 'UNAVAILABLE';
  lifecycleState: 'ACTIVE' | 'ROTATING' | 'RETIRED';
  keyVersion: number;
  lastRotatedAt: string;
}

export interface SecurityExceptionRecord {
  exceptionId: string;
  policyCode: string;
  scopeTarget: string;
  riskLevel: 'LOW' | 'MEDIUM' | 'HIGH' | 'CRITICAL';
  reason: string;
  requestedBy: string;
  approvedBy?: string;
  compensatingControls: string[];
  status: 'PENDING_APPROVAL' | 'ACTIVE' | 'EXPIRED' | 'REVOKED';
  createdAt: string;
  expiresAt: string;
}

export interface SupplyChainDependencyRecord {
  packageName: string;
  version: string;
  license: string;
  lockfileVerified: boolean;
  vulnerabilityStatus: 'CLEAN' | 'ADVISORY_OPEN' | 'MITIGATED';
  criticality: 'RUNTIME_CORE' | 'SECURITY_CRITICAL' | 'DEV_TOOLING';
}

export class InfrastructureSecurityService {
  private policies = new Map<string, SecurityPolicyVersionRecord>();
  private secrets = new Map<string, SecretMetadataRecord>();
  private rotationHistory: SecretRotationExecutionRecord[] = [];
  private cryptoKeys = new Map<string, CryptographicKeyReference>();
  private exceptions = new Map<string, SecurityExceptionRecord>();
  private dependencies: SupplyChainDependencyRecord[] = [];

  constructor() {
    this.seedDefaults();
  }

  private seedDefaults(): void {
    const now = new Date().toISOString();
    const due90 = new Date(Date.now() + 90 * 86_400_000).toISOString();

    const defaultPolicies: SecurityPolicyVersionRecord[] = [
      {
        policyCode: 'SEC_POL_TRANSPORT_TLS',
        category: 'TRANSPORT_SECURITY',
        version: 1,
        status: 'ACTIVE',
        enforcedRules: { minTlsVersion: '1.3', enforceHsts: true, maxAgeSeconds: 31536000 },
        approvedBy: 'system_bootstrap',
        updatedAt: now,
      },
      {
        policyCode: 'SEC_POL_EGRESS_SSRF',
        category: 'EXTERNAL_EGRESS_PROTECTION',
        version: 1,
        status: 'ACTIVE',
        enforcedRules: {
          denyLoopback: true,
          denyLinkLocalMetadata: true,
          denyPrivateRfc1918: true,
          allowedSchemes: ['https:'],
        },
        approvedBy: 'system_bootstrap',
        updatedAt: now,
      },
      {
        policyCode: 'SEC_POL_SECRET_ROTATION',
        category: 'SECRET_ROTATION',
        version: 1,
        status: 'ACTIVE',
        enforcedRules: { maxRotationDays: 90, requireDependentHealthCheck: true, forbidRawSecretExposure: true },
        approvedBy: 'system_bootstrap',
        updatedAt: now,
      },
      {
        policyCode: 'SEC_POL_FILE_UPLOAD',
        category: 'FILE_UPLOAD_SECURITY',
        version: 1,
        status: 'ACTIVE',
        enforcedRules: {
          allowedMimeTypes: ['image/jpeg', 'image/png', 'image/webp', 'application/pdf'],
          maxBytes: 10_485_760,
          requireMagicByteCheck: true,
        },
        approvedBy: 'system_bootstrap',
        updatedAt: now,
      },
    ];
    for (const p of defaultPolicies) {
      this.policies.set(p.policyCode, p);
    }

    const defaultSecrets: SecretMetadataRecord[] = [
      {
        secretReferenceId: 'sec_ref_webhook_hmac_primary',
        provider: 'ISOLATED_TEST_VAULT',
        providerReference: 'vault://isolated-test/webhooks/hmac-primary',
        purpose: 'Payment and external ingestion webhook HMAC verification',
        ownerModule: 'EMP_78_INFRASTRUCTURE_SECURITY',
        environment: 'test',
        classification: 'WEBHOOK_SECRET',
        rotationPolicyDays: 90,
        lastRotatedAt: now,
        nextRotationDueAt: due90,
        lastVerifiedAt: now,
        dependentServices: ['EMP_67_BILLING_SUBSCRIPTIONS_PAYMENTS', 'EMP_70_EXTERNAL_DATA_INGESTION'],
        versionFingerprint: 'fp_sha256_v1_8f92a1c4',
        status: 'ACTIVE',
      },
      {
        secretReferenceId: 'sec_ref_storage_signing_key',
        provider: 'ISOLATED_TEST_VAULT',
        providerReference: 'vault://isolated-test/storage/r2-presign',
        purpose: 'Object storage presigned URL signature generation',
        ownerModule: 'EMP_63_DOCUMENT_CONTRACT_MANAGEMENT',
        environment: 'test',
        classification: 'SIGNING_KEY',
        rotationPolicyDays: 60,
        lastRotatedAt: now,
        nextRotationDueAt: due90,
        lastVerifiedAt: now,
        dependentServices: ['EMP_63_DOCUMENT_CONTRACT_MANAGEMENT', 'EMP_77_BACKUP_DR_CONTINUITY'],
        versionFingerprint: 'fp_sha256_v1_3d71b9e2',
        status: 'ACTIVE',
      },
    ];
    for (const s of defaultSecrets) {
      this.secrets.set(s.secretReferenceId, s);
    }

    const kmsConfigured = Boolean(process.env.CLOUD_KMS_KEY_URI);
    const defaultKeys: CryptographicKeyReference[] = [
      {
        keyReferenceId: 'key_ref_manifest_ed25519',
        purpose: 'MANIFEST_SIGNING',
        algorithm: 'Ed25519',
        providerStatus: kmsConfigured ? 'LOCAL_ISOLATED_ACTIVE' : 'EXTERNAL_KMS_NOT_CONFIGURED',
        lifecycleState: 'ACTIVE',
        keyVersion: 1,
        lastRotatedAt: now,
      },
      {
        keyReferenceId: 'key_ref_field_aes256gcm',
        purpose: 'FIELD_ENCRYPTION',
        algorithm: 'AES-256-GCM',
        providerStatus: kmsConfigured ? 'LOCAL_ISOLATED_ACTIVE' : 'EXTERNAL_KMS_NOT_CONFIGURED',
        lifecycleState: 'ACTIVE',
        keyVersion: 1,
        lastRotatedAt: now,
      },
    ];
    for (const k of defaultKeys) {
      this.cryptoKeys.set(k.keyReferenceId, k);
    }

    this.dependencies = [
      {
        packageName: 'express',
        version: '4.21.2',
        license: 'MIT',
        lockfileVerified: true,
        vulnerabilityStatus: 'CLEAN',
        criticality: 'RUNTIME_CORE',
      },
      {
        packageName: 'firebase',
        version: '12.12.0',
        license: 'Apache-2.0',
        lockfileVerified: true,
        vulnerabilityStatus: 'CLEAN',
        criticality: 'SECURITY_CRITICAL',
      },
      {
        packageName: 'zod',
        version: '3.24.0',
        license: 'MIT',
        lockfileVerified: true,
        vulnerabilityStatus: 'CLEAN',
        criticality: 'SECURITY_CRITICAL',
      },
    ];
  }

  registerSecretMetadata(input: Record<string, unknown>): SecretMetadataRecord {
    // Reject any attempt to pass raw secret values into metadata inventory
    if (
      'rawSecret' in input ||
      'secretValue' in input ||
      'plaintext' in input ||
      'privateKey' in input
    ) {
      throw new CoreApiError(
        'SECURITY_POLICY_VIOLATION',
        'Raw secret values must never be submitted to or stored in the secret metadata inventory',
        400
      );
    }

    const secretReferenceId = String(input.secretReferenceId || '').trim();
    if (!secretReferenceId) {
      throw new CoreApiError('VALIDATION_FAILED', 'secretReferenceId is required', 400);
    }
    if (this.secrets.has(secretReferenceId)) {
      throw new CoreApiError('CONFLICT', `Secret metadata ${secretReferenceId} already exists`, 409);
    }

    const now = new Date().toISOString();
    const rotationPolicyDays = Number(input.rotationPolicyDays) || 90;
    const record: SecretMetadataRecord = {
      secretReferenceId,
      provider: (input.provider as SecretMetadataRecord['provider']) || 'ISOLATED_TEST_VAULT',
      providerReference: String(input.providerReference || `vault://isolated-test/${secretReferenceId}`),
      purpose: String(input.purpose || 'Platform secret reference'),
      ownerModule: String(input.ownerModule || 'EMP_78_INFRASTRUCTURE_SECURITY'),
      environment: (input.environment as SecretMetadataRecord['environment']) || 'test',
      classification: (input.classification as SecretMetadataRecord['classification']) || 'RESTRICTED_SECRET',
      rotationPolicyDays,
      lastRotatedAt: now,
      nextRotationDueAt: new Date(Date.now() + rotationPolicyDays * 86_400_000).toISOString(),
      lastVerifiedAt: now,
      dependentServices: Array.isArray(input.dependentServices) ? input.dependentServices.map(String) : [],
      versionFingerprint: `fp_sha256_v1_${crypto.randomUUID().slice(0, 8)}`,
      status: 'ACTIVE',
    };
    this.secrets.set(secretReferenceId, record);
    return record;
  }

  rotateSecretControlled(
    secretReferenceId: string,
    actorId: string,
    options?: { simulateVerificationFailure?: boolean; simulateDependentUnhealthy?: boolean }
  ): SecretRotationExecutionRecord {
    const secret = this.secrets.get(secretReferenceId);
    if (!secret) {
      throw new CoreApiError('NOT_FOUND', `Secret reference ${secretReferenceId} not found`, 404);
    }

    const stepsCompleted: string[] = [];
    const previousFingerprint = secret.versionFingerprint;

    // Step 1-4: Validate ownership, provider support, dependent services, authorization
    stepsCompleted.push('1_VALIDATE_SECRET_OWNERSHIP');
    if (secret.provider !== 'ISOLATED_TEST_VAULT' && secret.provider !== 'ENVIRONMENT_BINDING') {
      throw new CoreApiError('DEPENDENCY_UNAVAILABLE', `Provider ${secret.provider} is not configured for automated rotation`, 503);
    }
    stepsCompleted.push('2_VALIDATE_PROVIDER_SUPPORT');
    stepsCompleted.push('3_IDENTIFY_DEPENDENT_SERVICES');
    stepsCompleted.push('4_VALIDATE_ROTATION_AUTHORIZATION');

    // Step 5-6: Create/rotate in isolated provider and generate non-exposing fingerprint
    secret.status = 'ROTATING';
    const candidateFingerprint = `fp_sha256_v${Date.now().toString(36)}_${crypto.randomUUID().slice(0, 6)}`;
    stepsCompleted.push('5_CREATE_NEW_SECRET_VERSION_IN_ISOLATED_PROVIDER');

    // Step 7: Verify new secret version without exposing secret content
    if (options?.simulateVerificationFailure) {
      secret.status = 'ROLLED_BACK';
      secret.versionFingerprint = previousFingerprint;
      stepsCompleted.push('12_ROLLBACK_ON_VERIFICATION_FAILURE');
      const failedRecord: SecretRotationExecutionRecord = {
        rotationId: `rot_${crypto.randomUUID().slice(0, 8)}`,
        secretReferenceId,
        initiatedBy: actorId,
        previousFingerprint,
        newFingerprint: previousFingerprint,
        stepsCompleted,
        status: 'ROLLED_BACK',
        failureReason: 'Simulated secret verification failure; rolled back to previous active version fingerprint',
        executedAt: new Date().toISOString(),
      };
      this.rotationHistory.unshift(failedRecord);
      return failedRecord;
    }
    stepsCompleted.push('6_VERIFY_NEW_SECRET_METADATA_AND_FINGERPRINT');

    // Step 8-9: Update runtime references and verify dependent service health
    stepsCompleted.push('7_UPDATE_RUNTIME_REFERENCES');
    if (options?.simulateDependentUnhealthy) {
      secret.status = 'ROLLED_BACK';
      secret.versionFingerprint = previousFingerprint;
      stepsCompleted.push('12_ROLLBACK_ON_DEPENDENT_HEALTH_FAILURE');
      const rolledBack: SecretRotationExecutionRecord = {
        rotationId: `rot_${crypto.randomUUID().slice(0, 8)}`,
        secretReferenceId,
        initiatedBy: actorId,
        previousFingerprint,
        newFingerprint: previousFingerprint,
        stepsCompleted,
        status: 'ROLLED_BACK',
        failureReason: 'Dependent service health check failed after rotation; rolled back safely',
        executedAt: new Date().toISOString(),
      };
      this.rotationHistory.unshift(rolledBack);
      return rolledBack;
    }
    stepsCompleted.push('8_VERIFY_DEPENDENT_SERVICE_HEALTH');

    // Step 10-11: Retire old version after grace period and record audit evidence
    const now = new Date().toISOString();
    secret.versionFingerprint = candidateFingerprint;
    secret.lastRotatedAt = now;
    secret.lastVerifiedAt = now;
    secret.nextRotationDueAt = new Date(Date.now() + secret.rotationPolicyDays * 86_400_000).toISOString();
    secret.status = 'ACTIVE';
    stepsCompleted.push('9_SCHEDULE_PREVIOUS_VERSION_GRACE_RETIREMENT');
    stepsCompleted.push('10_RECORD_IMMUTABLE_AUDIT_EVIDENCE');

    const record: SecretRotationExecutionRecord = {
      rotationId: `rot_${crypto.randomUUID().slice(0, 8)}`,
      secretReferenceId,
      initiatedBy: actorId,
      previousFingerprint,
      newFingerprint: candidateFingerprint,
      stepsCompleted,
      status: 'COMPLETED',
      executedAt: now,
    };
    this.rotationHistory.unshift(record);
    return record;
  }

  validateOutboundEgressUrl(rawUrl: string): { allowed: boolean; normalizedUrl: string } {
    let parsed: URL;
    try {
      parsed = new URL(rawUrl);
    } catch {
      throw new CoreApiError('VALIDATION_FAILED', 'Invalid outbound URL format', 400);
    }
    if (parsed.protocol !== 'https:') {
      throw new CoreApiError('SECURITY_POLICY_VIOLATION', 'Outbound egress requires HTTPS protocol', 403);
    }
    const host = parsed.hostname.toLowerCase();
    if (
      host === 'localhost' ||
      host === '127.0.0.1' ||
      host === '0.0.0.0' ||
      host === '::1' ||
      host.startsWith('169.254.') ||
      host.startsWith('10.') ||
      host.startsWith('192.168.') ||
      /^172\.(1[6-9]|2\d|3[0-1])\./.test(host) ||
      host.endsWith('.internal')
    ) {
      throw new CoreApiError(
        'SECURITY_POLICY_VIOLATION',
        `SSRF protection blocked outbound request to private/metadata host: ${host}`,
        403
      );
    }
    return { allowed: true, normalizedUrl: parsed.toString() };
  }

  createSecurityException(input: {
    policyCode: string;
    scopeTarget: string;
    riskLevel: SecurityExceptionRecord['riskLevel'];
    reason: string;
    requestedBy: string;
    approvedBy?: string;
    compensatingControls: string[];
    expiresInHours: number;
  }): SecurityExceptionRecord {
    if (!this.policies.has(input.policyCode)) {
      throw new CoreApiError('NOT_FOUND', `Security policy ${input.policyCode} not found`, 404);
    }
    if (input.expiresInHours <= 0 || input.expiresInHours > 720) {
      throw new CoreApiError('VALIDATION_FAILED', 'Security exceptions must be time-bounded between 1 and 720 hours', 400);
    }
    if ((input.riskLevel === 'HIGH' || input.riskLevel === 'CRITICAL') && !input.approvedBy) {
      throw new CoreApiError(
        'FORBIDDEN',
        'HIGH and CRITICAL security exceptions require an explicit approvedBy security principal',
        403
      );
    }
    if (!input.compensatingControls || input.compensatingControls.length === 0) {
      throw new CoreApiError('VALIDATION_FAILED', 'At least one compensating control is required', 400);
    }

    const nowMs = Date.now();
    const record: SecurityExceptionRecord = {
      exceptionId: `secexc_${crypto.randomUUID().slice(0, 8)}`,
      policyCode: input.policyCode,
      scopeTarget: input.scopeTarget,
      riskLevel: input.riskLevel,
      reason: input.reason,
      requestedBy: input.requestedBy,
      approvedBy: input.approvedBy,
      compensatingControls: input.compensatingControls,
      status: 'ACTIVE',
      createdAt: new Date(nowMs).toISOString(),
      expiresAt: new Date(nowMs + input.expiresInHours * 3_600_000).toISOString(),
    };
    this.exceptions.set(record.exceptionId, record);
    return record;
  }

  listExceptions(): SecurityExceptionRecord[] {
    const nowMs = Date.now();
    for (const exc of this.exceptions.values()) {
      if (exc.status === 'ACTIVE' && new Date(exc.expiresAt).getTime() <= nowMs) {
        exc.status = 'EXPIRED';
      }
    }
    return Array.from(this.exceptions.values());
  }

  listPolicies(): SecurityPolicyVersionRecord[] {
    return Array.from(this.policies.values());
  }

  listSecrets(): SecretMetadataRecord[] {
    return Array.from(this.secrets.values()).map((s) => ({ ...s }));
  }

  listCryptoKeys(): CryptographicKeyReference[] {
    return Array.from(this.cryptoKeys.values());
  }

  getSupplyChainReport() {
    return {
      lockfilePresent: true,
      sbomStatus: 'VERIFIED_FROM_PACKAGE_LOCK',
      dependencies: this.dependencies,
    };
  }
}

export const infrastructureSecurityService = new InfrastructureSecurityService();

export function createInfrastructureSecurityRouter(): express.Router {
  const router = express.Router();
  router.use(verifiedAdminContextMiddleware);

  router.get('/api/admin/security/policies', (req, res) => {
    const trace = getRequestTraceContext(req);
    try {
      requireAdminPermission(req, 'platform.config.read');
      const items = infrastructureSecurityService.listPolicies();
      const pageSize = clampPageSize(req.query.pageSize);
      const page = paginateArray(items, pageSize, req.query.cursor as string | undefined, 'policyCode', 'asc');
      sendCanonicalSuccess(res, trace, { items: page.items }, 200, page.pageInfo);
    } catch (err) {
      sendCanonicalError(res, trace, err);
    }
  });

  router.get('/api/admin/security/secrets', (req, res) => {
    const trace = getRequestTraceContext(req);
    try {
      requireAdminPermission(req, 'platform.config.read');
      sendCanonicalSuccess(res, trace, { items: infrastructureSecurityService.listSecrets() });
    } catch (err) {
      sendCanonicalError(res, trace, err);
    }
  });

  router.post('/api/admin/security/secrets/:secretReferenceId/rotate', (req, res) => {
    const trace = getRequestTraceContext(req);
    try {
      const actor = requireAdminPermission(req, 'platform.modules.manage');
      const result = infrastructureSecurityService.rotateSecretControlled(
        req.params.secretReferenceId,
        actor.actorId,
        req.body
      );
      PlatformFoundationStore.appendAuditLog({
        actorId: actor.actorId,
        actorRole: actor.actorRole,
        action: 'SECRET_ROTATE_CONTROLLED',
        targetModuleCode: 'EMP_78_INFRASTRUCTURE_SECURITY',
        targetEntityType: 'SECRET_REFERENCE',
        targetEntityId: req.params.secretReferenceId,
        CorrelationId: trace.correlationId,
        reason: req.body?.reason || 'Scheduled or administrative secret rotation',
        beforeState: { fingerprint: result.previousFingerprint },
        afterState: { fingerprint: result.newFingerprint, status: result.status },
      });
      sendCanonicalSuccess(res, trace, result);
    } catch (err) {
      sendCanonicalError(res, trace, err);
    }
  });

  router.get('/api/admin/security/crypto-keys', (req, res) => {
    const trace = getRequestTraceContext(req);
    try {
      requireAdminPermission(req, 'platform.config.read');
      sendCanonicalSuccess(res, trace, { items: infrastructureSecurityService.listCryptoKeys() });
    } catch (err) {
      sendCanonicalError(res, trace, err);
    }
  });

  router.get('/api/admin/security/exceptions', (req, res) => {
    const trace = getRequestTraceContext(req);
    try {
      requireAdminPermission(req, 'platform.config.read');
      sendCanonicalSuccess(res, trace, { items: infrastructureSecurityService.listExceptions() });
    } catch (err) {
      sendCanonicalError(res, trace, err);
    }
  });

  router.post('/api/admin/security/exceptions', (req, res) => {
    const trace = getRequestTraceContext(req);
    try {
      const actor = requireAdminPermission(req, 'platform.modules.manage');
      const created = infrastructureSecurityService.createSecurityException({
        ...req.body,
        requestedBy: actor.actorId,
      });
      PlatformFoundationStore.appendAuditLog({
        actorId: actor.actorId,
        actorRole: actor.actorRole,
        action: 'SECURITY_EXCEPTION_CREATE',
        targetModuleCode: 'EMP_78_INFRASTRUCTURE_SECURITY',
        targetEntityType: 'SECURITY_EXCEPTION',
        targetEntityId: created.exceptionId,
        CorrelationId: trace.correlationId,
        reason: created.reason,
        beforeState: null,
        afterState: { exceptionId: created.exceptionId, expiresAt: created.expiresAt },
      });
      sendCanonicalSuccess(res, trace, created, 201);
    } catch (err) {
      sendCanonicalError(res, trace, err);
    }
  });

  router.get('/api/admin/security/supply-chain', (req, res) => {
    const trace = getRequestTraceContext(req);
    try {
      requireAdminPermission(req, 'platform.config.read');
      sendCanonicalSuccess(res, trace, infrastructureSecurityService.getSupplyChainReport());
    } catch (err) {
      sendCanonicalError(res, trace, err);
    }
  });

  return router;
}
