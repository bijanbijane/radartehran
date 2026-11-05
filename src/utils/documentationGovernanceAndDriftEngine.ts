import fs from 'node:fs'; import path from 'node:path'; import { API_ENDPOINT_CONTRACTS } from './serverConfigValidator'; import { RUNTIME_ENV_KEYS } from './serverRuntimeEnvStore'; import { formatAreaUnitLabel, formatMillionTomanAsIntlCurrency, getStoredAreaUnit, getStoredIntlCurrency } from './areaUnit'; export interface DocumentationArtifactAudit { filePath: string; purpose: string; intendedAudience: 'DEVELOPERS' | 'OPERATORS' | 'SECURITY_AUDITORS' | 'AI_AGENTS'; existsOnDisk: boolean; synchronizedWithCodebase: boolean; verifiedTopics: readonly string[]; } export const REPOSITORY_DOCUMENTATION_CATALOG: readonly Omit<
  DocumentationArtifactAudit, 'existsOnDisk' | 'synchronizedWithCodebase'
>[] = [ { filePath: 'README.md', purpose: 'Quickstart, system overview, and environment setup entry point', intendedAudience: 'DEVELOPERS', verifiedTopics: ['port-3000', 'vite-express', 'gemini-fallback'], }, { filePath: 'ARCHITECTURE.md', purpose: 'Strict module dependency hierarchy, <500 line ceiling, and legacy ratchet', intendedAudience: 'DEVELOPERS', verifiedTopics: ['dependency-direction', 'max-lines-500', 'architecture-baseline.json'], }, { filePath: 'AGENTS.md', purpose: 'Mandatory AI-agent and contributor rules, verification commands, and sync protocol', intendedAudience: 'AI_AGENTS', verifiedTopics: ['file-size-limits', 'verification-commands', 'doc-sync-protocol'], },
  { filePath: 'security_spec.md', purpose: 'Firebase authentication, RBAC, and API boundary security specification', intendedAudience: 'SECURITY_AUDITORS', verifiedTopics: ['firebase-jwt', 'admin-rbac', 'rate-limiting'], }, {
    filePath: 'docs/system-architecture.md', purpose: 'C4 architecture diagrams, runtime sequence flows, and Firestore collection dictionary', intendedAudience: 'DEVELOPERS', verifiedTopics: ['c4-model', 'sequence-diagrams', 'firestore-collections'], }, { filePath: 'docs/development-guide.md',
    purpose: 'Local setup, engineer onboarding path, admin operator guide, and domain glossary', intendedAudience: 'DEVELOPERS', verifiedTopics: ['onboarding', 'commands-inventory', 'admin-guide', 'domain-glossary'], },
  { filePath: 'docs/deployment.md', purpose: 'Complete 20-variable environment reference, rules deployment, and 10-scenario runbook', intendedAudience: 'OPERATORS', verifiedTopics: ['env-vars', 'firestore-deploy', 'operational-runbook'], }, { filePath: 'docs/security.md',
    purpose: 'Firestore rules access matrix, admin identity, and HTTP rate-limit boundaries', intendedAudience: 'SECURITY_AUDITORS', verifiedTopics: ['firestore.rules', 'bootstrap-admins', '1..999-multi-city'], },
  { filePath: 'docs/backup-and-recovery.md', purpose: 'Atomic disk cache persistence, JSON backup/restore, pending-delete recovery, and SEV-1..4 IR', intendedAudience: 'OPERATORS',
    verifiedTopics: ['atomic-0o600', 'json-restore', 'incident-response'], }, {
    filePath: 'docs/adr-evolution-and-governance.md', purpose: 'Retrospective ADRs (ADR-001..008), module ownership map, changelog, and roadmaps',
    intendedAudience: 'DEVELOPERS',
    verifiedTopics: ['ADR-001', 'ADR-008', 'module-ownership'],
  },
  {
    filePath: 'docs/implementation-checkpoint.md',
    purpose: 'Milestone verification checkpoint and completed engineering phases',
    intendedAudience: 'DEVELOPERS',
    verifiedTopics: ['verification-checkpoint'],
  },
  {
    filePath: 'docs/implementation-inventory.md',
    purpose: 'Stack ground-truth versions and pre-deployment verification matrix',
    intendedAudience: 'OPERATORS',
    verifiedTopics: ['gen-lang-client-0713157837', 'ai-studio-e48df7a4-9535-4bf0-a948-61a6a0f37a6a'],
  },
  {
    filePath: 'docs/remaining-work.md',
    purpose: 'Production cutover prerequisites and optional external API credential matrix',
    intendedAudience: 'OPERATORS',
    verifiedTopics: ['firestore-rules-cutover', 'optional-external-keys'],
  },
];
export function auditRepositoryTechnicalDocumentation(
  rootDir = process.cwd(),
): DocumentationArtifactAudit[] {
  return REPOSITORY_DOCUMENTATION_CATALOG.map((item) => {
    const abs = path.resolve(rootDir, item.filePath);
    const existsOnDisk = fs.existsSync(abs);
    const content = existsOnDisk ? fs.readFileSync(abs, 'utf8') : '';
    const hasOutdatedProjectId = content.includes('gen-lang-client-0671259189');
    const hasOutdatedDbId = content.includes('ai-studio-3bf3671d-e233-4cc0-81ed-3e600cf890ff');
    return {
      ...item,
      existsOnDisk,
      synchronizedWithCodebase: existsOnDisk && !hasOutdatedProjectId && !hasOutdatedDbId,
    };
  });
}
export interface C4ArchitectureDocumentation {
  systemContextMermaid: string;
  containerDiagramMermaid: string;
  layerHierarchy: readonly string[];
  runtimeSequenceFlows: readonly {
    flowId: string;
    title: string;
    participants: readonly string[];
    failureAndFallbackPath: string;
  }[];
}
export function buildC4ArchitectureModelAndSequenceFlows(): C4ArchitectureDocumentation {
  return {
    systemContextMermaid:
      'flowchart LR\n  User[Homebuyer / Renter / Admin] --> Radar[Radar Tehran Web & PWA]\n  Radar --> Firestore[(Cloud Firestore)]\n  Radar --> OpenMeteo[Open-Meteo AQI API]\n  Radar --> MapTiles[Neshan / CARTO / OSM]',
    containerDiagramMermaid:
      'flowchart TB\n  SPA[React 19 + Leaflet + Recharts SPA] <--> Express[Express Server Port 3000]\n  SPA <--> Firestore[(Cloud Firestore)]\n  Express <--> DiskCache[.cache-data.json 0o600]\n  Express <--> ObjectStore[.object-storage-local / S3]',
    layerHierarchy: [
      'src/App.tsx & server.ts (Composition Roots)',
      'src/components/* (UI Components & Hooks)',
      'src/data/* (Pure Domain Logic, Hedonic Pricing, Legal & Tax Calculators)',
      'src/utils/* (Security, Storage, API Contracts, Governance)',
      'src/types/* (Canonical TypeScript Interfaces & Guards)',
    ],
    runtimeSequenceFlows: [
      {
        flowId: 'SEQ-01-INITIAL-LOAD',
        title: 'Initial Application Load & Multi-City Market Pulse Fetch',
        participants: ['Browser SPA', 'GET /api/market-pulse', 'serverMarketPulseEngine', 'Open-Meteo API'],
        failureAndFallbackPath: 'Falls back to .cache-data.json and deterministic CITY_AIR_STATIONS seed values',
      },
      {
        flowId: 'SEQ-02-NEIGHBORHOOD-SEARCH-AND-EVALUATION',
        title: 'Neighborhood Search, Hedonic Valuation & Firestore Override Merge',
        participants: ['FloatingTopBar', 'searchEngineeringEngine', 'hedonicPricingEngine', 'Cloud Firestore'],
        failureAndFallbackPath: 'Offline localStorage cache + deterministic seed dataset across 190 neighborhoods',
      },
      {
        flowId: 'SEQ-03-AUTHENTICATED-MEDIA-UPLOAD',
        title: 'Authenticated Media Upload, Sharp WebP Transcoding & Bargain Batch Write',
        participants: ['SubmitBargainModal', 'POST /api/object-storage/upload', 'Sharp Semaphore', 'Firestore Batch'],
        failureAndFallbackPath: 'Two-phase deletion journal (deletionJournal.ts) prevents orphaned files on partial failure',
      },
      {
        flowId: 'SEQ-04-ADMIN-RUNTIME-CONFIG-AND-BACKUP',
        title: 'Admin Authorization, Runtime Env Update & Validated Atomic JSON Restore',
        participants: ['AdminModal', 'verifyAdminApiAuthorization', 'serverRuntimeEnvStore', 'validateAndBuildRestoredState'],
        failureAndFallbackPath: 'Rejects unverified tokens (401/403) and invalid backup schemas without mutating state',
      },
    ],
  };
}
export interface FirestoreCollectionDictionaryEntry {
  collectionPath: string;
  docIdPattern: string;
  typescriptInterface: string;
  publicReadAllowed: boolean;
  writeRuleSummary: string;
  requiredFields: readonly string[];
}
export const FIRESTORE_COLLECTION_DATA_DICTIONARY: readonly FirestoreCollectionDictionaryEntry[] = [
  {
    collectionPath: '/votes/{voteId}',
    docIdPattern: '${uid}_hood_${hoodId}',
    typescriptInterface: 'NeighborhoodVoteDoc',
    publicReadAllowed: false,
    writeRuleSummary: 'Verified owner create/update with 24h update cooldown; owner/admin delete',
    requiredFields: ['userId', 'hoodId', 'vote', 'createdAt', 'lastUpdatedAt'],
  },
  {
    collectionPath: '/bargains/{bargainId}',
    docIdPattern: 'UUID / Auto-ID',
    typescriptInterface: 'BargainListing',
    publicReadAllowed: true,
    writeRuleSummary: 'Verified owner batch-paired with /bargainOwners/{bargainId} or verified admin',
    requiredFields: ['hoodId', 'title', 'type', 'sqm', 'priceText', 'discountPercent', 'buyerProfitText', 'street'],
  },
  {
    collectionPath: '/bargainOwners/{bargainId}',
    docIdPattern: 'Matches /bargains/{bargainId}',
    typescriptInterface: 'BargainOwnerRecord',
    publicReadAllowed: false,
    writeRuleSummary: 'Verified owner create (userId == request.auth.uid); owner/admin delete',
    requiredFields: ['userId'],
  },
  {
    collectionPath: '/buyerAlerts/{alertId}',
    docIdPattern: '${uid}_hood_${hoodId}',
    typescriptInterface: 'BuyerAlertLeadItem',
    publicReadAllowed: false,
    writeRuleSummary: 'Verified owner create/update with ^09[0-9]{9}$ phone; owner/admin read & delete',
    requiredFields: ['userId', 'hoodId', 'hoodName', 'fullName', 'phone', 'dealType', 'maxBudgetText', 'createdAtFa'],
  },
  {
    collectionPath: '/sponsorRequests/{requestId}',
    docIdPattern: 'UUID / Auto-ID',
    typescriptInterface: 'SponsorCrmRequestItem',
    publicReadAllowed: false,
    writeRuleSummary: 'Verified user create (status == pending); verified admin read/update/delete',
    requiredFields: ['hoodId', 'hoodName', 'agencyName', 'phone', 'specialty', 'experienceYears', 'monthlyTariffMillion', 'status', 'createdAtFa'],
  },
  {
    collectionPath: '/neighborhoodOverrides/{hoodId}',
    docIdPattern: '<1..999> or hood_<1..999>',
    typescriptInterface: 'NeighborhoodOverrideDoc',
    publicReadAllowed: true,
    writeRuleSummary: 'Verified admin create/update/delete for multi-city IDs 1..999',
    requiredFields: ['hoodId', 'buyPerSqm', 'rahn80m'],
  },
  {
    collectionPath: '/appConfig/{configId}',
    docIdPattern: 'featureFlags | monetization',
    typescriptInterface: 'FeatureFlagsConfig',
    publicReadAllowed: true,
    writeRuleSummary: 'Public get only (list: false); verified admin create/update; delete: false',
    requiredFields: ['enable3D', 'enableAI', 'enableVoice', 'enableExport', 'enableCompare', 'enableLeadForm', 'enableSponsorHighlight', 'enableUserBargains'],
  },
  {
    collectionPath: '/userPreferences/{userId}',
    docIdPattern: '${request.auth.uid}',
    typescriptInterface: 'UserPreferencesDoc',
    publicReadAllowed: false,
    writeRuleSummary: 'Verified owner read/write (favoriteHoodIds <= 25 items in 1..999); admin read/delete',
    requiredFields: ['userId', 'favoriteHoodIds', 'updatedAtIso'],
  },
  {
    collectionPath: '/admins/{adminId}',
    docIdPattern: '${uid}',
    typescriptInterface: 'DelegatedAdminDoc',
    publicReadAllowed: false,
    writeRuleSummary: 'Verified admin read only; write: false (provisioned out-of-band)',
    requiredFields: ['role', 'email'],
  },
];
export interface DocumentationDriftReport {
  zeroDriftConfirmed: boolean;
  missingDocFiles: string[];
  brokenMarkdownLinks: { sourceFile: string; targetRef: string }[];
  undocumentedEnvVars: string[];
  outdatedFirebaseIdMentions: string[];
  potentialSecretLeaksInDocs: string[];
  openApiEndpointCount: number;
  firestoreCollectionsDocumentedCount: number;
  displayAreaUnitLabel?: string;
  referenceValuationIntlText?: string;
}
const SECRET_LEAK_PATTERNS: readonly RegExp[] = [
  /AIzaSy[0-9A-Za-z_-]{33}/, // Real 39-char Google API key pattern
  /-----BEGIN (?:RSA )?PRIVATE KEY-----/,
];
export function detectDocumentationDriftAgainstCodebase(
  rootDir = process.cwd(),
): DocumentationDriftReport {
  const missingDocFiles: string[] = [];
  const brokenMarkdownLinks: { sourceFile: string; targetRef: string }[] = [];
  const outdatedFirebaseIdMentions: string[] = [];
  const potentialSecretLeaksInDocs: string[] = [];
  for (const docItem of REPOSITORY_DOCUMENTATION_CATALOG) {
    const absPath = path.resolve(rootDir, docItem.filePath);
    if (!fs.existsSync(absPath)) {
      missingDocFiles.push(docItem.filePath);
      continue;
    }
    const content = fs.readFileSync(absPath, 'utf8');
    if (content.includes('gen-lang-client-0671259189') || content.includes('ai-studio-3bf3671d-e233-4cc0-81ed-3e600cf890ff')) {
      outdatedFirebaseIdMentions.push(docItem.filePath);
    }
    for (const pattern of SECRET_LEAK_PATTERNS) {
      if (pattern.test(content)) potentialSecretLeaksInDocs.push(docItem.filePath);
    }
    const linkRegex = /\[[^\]]+\]\(([^)#\s]+)(?:#[^)]*)?\)/g;
    let match: RegExpExecArray | null;
    while ((match = linkRegex.exec(content)) !== null) {
      const ref = match[1];
      if (ref.startsWith('http://') || ref.startsWith('https://') || ref.startsWith('mailto:')) continue;
      const resolvedRef = ref.startsWith('/') ? path.resolve(rootDir, '.' + ref) : path.resolve(path.dirname(absPath), ref);
      if (!fs.existsSync(resolvedRef)) brokenMarkdownLinks.push({ sourceFile: docItem.filePath, targetRef: ref });
    }
  }
  const deploymentDoc = fs.existsSync(path.resolve(rootDir, 'docs/deployment.md'))
    ? fs.readFileSync(path.resolve(rootDir, 'docs/deployment.md'), 'utf8')
    : '';
  const undocumentedEnvVars = RUNTIME_ENV_KEYS.filter((key) => !deploymentDoc.includes(key));
  const zeroDriftConfirmed =
    missingDocFiles.length === 0 &&
    brokenMarkdownLinks.length === 0 &&
    undocumentedEnvVars.length === 0 &&
    outdatedFirebaseIdMentions.length === 0 &&
    potentialSecretLeaksInDocs.length === 0 &&
    API_ENDPOINT_CONTRACTS.length >= 20 &&
    FIRESTORE_COLLECTION_DATA_DICTIONARY.length === 9;
  return {
    zeroDriftConfirmed,
    missingDocFiles,
    brokenMarkdownLinks,
    undocumentedEnvVars,
    outdatedFirebaseIdMentions,
    potentialSecretLeaksInDocs,
    openApiEndpointCount: API_ENDPOINT_CONTRACTS.length,
    firestoreCollectionsDocumentedCount: FIRESTORE_COLLECTION_DATA_DICTIONARY.length,
    displayAreaUnitLabel: formatAreaUnitLabel(getStoredAreaUnit()),
    referenceValuationIntlText: formatMillionTomanAsIntlCurrency(10000, getStoredIntlCurrency()),
  };
}
export interface AiAgentCompletionReportInput {
  modifiedFiles: readonly string[];
  executedCommands: readonly string[];
  updatedRelatedDocs: boolean;
  containsUnverifiedClaims: boolean;
}
export function validateAiAgentCompletionReport(input: AiAgentCompletionReportInput): {
  compliant: boolean;
  missingMandatoryCommands: string[];
} {
  const mandatory = ['npm run lint', 'npm run arch:check', 'npm test', 'npm run build'];
  const missingMandatoryCommands = mandatory.filter(
    (cmd) => !input.executedCommands.some((ran) => ran.includes(cmd)),
  );
  return {
    compliant:
      input.modifiedFiles.length > 0 &&
      missingMandatoryCommands.length === 0 &&
      input.updatedRelatedDocs &&
      !input.containsUnverifiedClaims,
    missingMandatoryCommands,
  };
}
export const PRIORITIZED_DOCUMENTATION_ROADMAP = [
  {
    phase: 'IMMEDIATE_RISK_REDUCTION',
    item: 'Synchronize Firebase projectId/databaseId, OpenAPI contracts, and 20 runtime env vars across docs',
    status: 'COMPLETED',
  },
  { phase: 'SHORT_TERM_DEVELOPER_PRODUCTIVITY', item: 'Maintain C4 architecture diagrams, runtime sequence flows, and 1st-day onboarding guide', status: 'COMPLETED', }, { phase: 'LONG_TERM_GOVERNANCE', item: 'Enforce automated documentation-drift and broken-link detection in npm test CI gate', status: 'COMPLETED', }, ] as const;