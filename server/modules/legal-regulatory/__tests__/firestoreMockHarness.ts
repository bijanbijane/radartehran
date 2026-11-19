import type { Firestore as AdminFirestore } from 'firebase-admin/firestore';
import {
  CreateComplianceRequirementInput,
  CreateRegulatoryDocumentInput,
  CreateRegulatoryProvisionInput,
  CreateRegulatorySourceInput,
  CreateApplicabilityRuleInput,
  LegalRegulatoryActorContext,
  PropertyContextReferenceAdapter,
  RecordRegulatoryChangeInput,
} from '../index';

export interface MockDocRef {
  readonly collectionName: string;
  readonly id: string;
  readonly path: string;
  get(): Promise<{ exists: boolean; data(): Record<string, unknown> | undefined }>;
  set(data: Record<string, unknown>): Promise<void>;
}

interface FilterClause {
  field: string;
  value: unknown;
}

/**
 * High-fidelity transactional Firestore Emulator-equivalent harness for Stage 29 unit tests.
 * Enforces strict Firestore Read-before-Write, optimistic concurrency detection on concurrent
 * transactions, atomic multi-document commit/rollback, and targeted collection write failures.
 */
export class TransactionalFirestoreMock {
  private readonly collections = new Map<string, Map<string, Record<string, unknown>>>();
  private readonly docRevisions = new Map<string, number>();
  private globalRevision = 0;

  public readLog: string[] = [];
  public txCommitCount = 0;
  public txAbortCount = 0;
  public lastTxOps: Array<'READ' | 'WRITE'> = [];
  public failNextReadError: Error | null = null;
  public failNextTxError: Error | null = null;
  public failOnCollectionWrite: string | null = null;
  public failAtTxWriteIndex: number | null = null;
  public beforeCommitHook: (() => Promise<void>) | null = null;

  private getColMap(name: string): Map<string, Record<string, unknown>> {
    let col = this.collections.get(name);
    if (!col) {
      col = new Map<string, Record<string, unknown>>();
      this.collections.set(name, col);
    }
    return col;
  }

  public getCollectionSize(collectionName: string): number {
    return this.getColMap(collectionName).size;
  }

  public getRawDoc(collectionName: string, docId: string): Record<string, unknown> | null {
    const val = this.getColMap(collectionName).get(docId);
    return val ? structuredClone(val) : null;
  }

  public asAdminFirestore(): AdminFirestore {
    return this as unknown as AdminFirestore;
  }

  public collection(name: string) {
    const self = this;
    const makeQuery = (filters: FilterClause[], limitVal?: number) => ({
      where(field: string, _op: string, value: unknown) {
        return makeQuery([...filters, { field, value }], limitVal);
      },
      limit(n: number) {
        return makeQuery(filters, n);
      },
      async get() {
        if (self.failNextReadError) {
          const err = self.failNextReadError;
          self.failNextReadError = null;
          throw err;
        }
        self.readLog.push(`QUERY:${name}`);
        let rows = Array.from(self.getColMap(name).values());
        for (const f of filters) {
          rows = rows.filter((r) => r[f.field] === f.value);
        }
        if (limitVal !== undefined) rows = rows.slice(0, limitVal);
        return {
          docs: rows.map((r) => ({ data: () => structuredClone(r) })),
        };
      },
      doc(docId: string): MockDocRef {
        return {
          collectionName: name,
          id: docId,
          path: `${name}/${docId}`,
          async get() {
            if (self.failNextReadError) {
              const err = self.failNextReadError;
              self.failNextReadError = null;
              throw err;
            }
            self.readLog.push(`GET:${name}/${docId}`);
            const found = self.getColMap(name).get(docId);
            return {
              exists: Boolean(found),
              data: () => (found ? structuredClone(found) : undefined),
            };
          },
          async set(data: Record<string, unknown>) {
            self.getColMap(name).set(docId, structuredClone(data));
            self.globalRevision += 1;
            self.docRevisions.set(`${name}/${docId}`, self.globalRevision);
          },
        };
      },
    });
    return makeQuery([]);
  }

  public async runTransaction<T>(
    updateFunction: (tx: {
      get(ref: MockDocRef): Promise<{ exists: boolean; data(): Record<string, unknown> | undefined }>;
      set(ref: MockDocRef, data: Record<string, unknown>): void;
    }) => Promise<T>,
  ): Promise<T> {
    if (this.failNextTxError) {
      const err = this.failNextTxError;
      this.failNextTxError = null;
      this.txAbortCount += 1;
      throw err;
    }

    const ops: Array<'READ' | 'WRITE'> = [];
    const stagedWrites: Array<{ ref: MockDocRef; data: Record<string, unknown> }> = [];
    const readSnapshotRevisions = new Map<string, number>();
    let hasWritten = false;

    const tx = {
      get: async (ref: MockDocRef) => {
        if (hasWritten) {
          throw new Error('Firestore transactions require all reads to be executed before all writes.');
        }
        if (this.failNextReadError) {
          const err = this.failNextReadError;
          this.failNextReadError = null;
          throw err;
        }
        ops.push('READ');
        const key = `${ref.collectionName}/${ref.id}`;
        readSnapshotRevisions.set(key, this.docRevisions.get(key) ?? 0);
        const found = this.getColMap(ref.collectionName).get(ref.id);
        return {
          exists: Boolean(found),
          data: () => (found ? structuredClone(found) : undefined),
        };
      },
      set: (ref: MockDocRef, data: Record<string, unknown>) => {
        hasWritten = true;
        ops.push('WRITE');
        stagedWrites.push({ ref, data: structuredClone(data) });
      },
    };

    try {
      const result = await updateFunction(tx);
      if (this.beforeCommitHook) {
        await this.beforeCommitHook();
      }

      // Check serializable isolation: if any read document changed concurrently before commit, abort!
      for (const [key, expectedRev] of readSnapshotRevisions.entries()) {
        const actualRev = this.docRevisions.get(key) ?? 0;
        if (actualRev !== expectedRev) {
          throw new Error(`ABORTED: Concurrent transaction modified document ${key} before commit.`);
        }
      }

      const failCol = this.failOnCollectionWrite;
      const failIdx = this.failAtTxWriteIndex;
      this.failOnCollectionWrite = null;
      this.failAtTxWriteIndex = null;

      for (let i = 0; i < stagedWrites.length; i += 1) {
        const w = stagedWrites[i];
        if (failIdx !== null && i === failIdx) {
          throw new Error(`Simulated Firestore commit failure at write index ${i} (${w.ref.path}).`);
        }
        if (failCol !== null && w.ref.collectionName === failCol) {
          throw new Error(`Simulated Firestore commit failure on collection ${failCol} (${w.ref.path}).`);
        }
      }

      // Commit all writes atomically.
      for (const w of stagedWrites) {
        this.getColMap(w.ref.collectionName).set(w.ref.id, w.data);
        this.globalRevision += 1;
        this.docRevisions.set(`${w.ref.collectionName}/${w.ref.id}`, this.globalRevision);
      }

      this.lastTxOps = ops;
      this.txCommitCount += 1;
      return result;
    } catch (err) {
      this.lastTxOps = ops;
      this.txAbortCount += 1;
      throw err;
    }
  }
}

export const ADMIN_ACTOR: LegalRegulatoryActorContext = {
  actorId: 'legal-admin-01',
  role: 'REGULATORY_ADMIN',
  isAuthenticated: true,
};

export const REVIEWER_ACTOR: LegalRegulatoryActorContext = {
  actorId: 'legal-reviewer-02',
  role: 'LEGAL_REVIEWER',
  isAuthenticated: true,
};

export const PROD_PROPERTY_ADAPTER: PropertyContextReferenceAdapter = {
  async getPropertyCharacteristicsById({ propertyId }) {
    return {
      status: 'FOUND',
      snapshot: {
        propertyId,
        cityId: 'tehran',
        provinceId: 'tehran',
        districtNumber: 5,
        neighborhoodId: 'پونک',
        propertyCategory: 'RESIDENTIAL_APARTMENT',
      },
    };
  },
};

export function makeSourceInput(overrides: Partial<CreateRegulatorySourceInput> = {}): CreateRegulatorySourceInput {
  return {
    id: 'src_durable_01',
    officialTitleFa: '[TEST] مبحث سوم مقررات ملی ساختمان',
    issuingAuthority: 'وزارت راه و شهرسازی',
    jurisdictionScope: { level: 'NATIONAL', countryCode: 'IR' },
    sourceCategory: 'NATIONAL_BUILDING_CODE_MABHAS',
    reliabilityTier: 'PRIMARY_OFFICIAL_STATUTE',
    verificationStatus: 'PENDING_VERIFICATION',
    officialReferenceNumber: 'REF-M3-1403',
    publicationDateIso: '2024-01-10',
    effectiveFromIso: '2024-02-01',
    isSyntheticTestFixture: true,
    ...overrides,
  };
}

export function makeDocInput(overrides: Partial<CreateRegulatoryDocumentInput> = {}): CreateRegulatoryDocumentInput {
  return {
    id: 'doc_durable_01',
    sourceId: 'src_durable_01',
    documentCode: 'DOC-M3-01',
    titleFa: '[TEST] سند اصلی مبحث سوم',
    documentCategory: 'BUILDING_SAFETY_CODE',
    effectiveFromIso: '2024-02-01',
    ...overrides,
  };
}

export function makeProvisionInput(
  overrides: Partial<CreateRegulatoryProvisionInput> = {},
): CreateRegulatoryProvisionInput {
  return {
    id: 'prov_durable_01',
    sourceId: 'src_durable_01',
    documentId: 'doc_durable_01',
    hierarchyLevel: 'ARTICLE',
    provisionNumber: '3-1',
    citationLabel: 'مبحث ۳، بند ۳-۱',
    titleFa: '[TEST] الزامات راه خروج اضطراری',
    documentCategory: 'BUILDING_SAFETY_CODE',
    originalTextVerbatim: 'کلیه ساختمان‌های بیش از ۵ طبقه ملزم به تعبیه راه خروج اضطراری استاندارد هستند.',
    effectiveFromIso: '2024-02-01',
    ...overrides,
  };
}

export function makeChangeInput(
  overrides: Partial<RecordRegulatoryChangeInput> = {},
): RecordRegulatoryChangeInput {
  return {
    targetProvisionId: 'prov_durable_01',
    changeType: 'AMENDMENT',
    enactingSourceId: 'src_durable_01',
    newOriginalTextVerbatim: 'کلیه ساختمان‌های بیش از ۴ طبقه ملزم به تعبیه راه خروج اضطراری و سیستم اعلام حریق هستند.',
    effectiveFromIso: '2025-01-01',
    changeSummary: 'اصلاحیه جدید برای کاهش آستانه طبقه از ۵ به ۴',
    ...overrides,
  };
}

export function makeRuleInput(
  overrides: Partial<CreateApplicabilityRuleInput> = {},
): CreateApplicabilityRuleInput {
  return {
    id: 'rule_durable_01',
    sourceId: 'src_durable_01',
    provisionId: 'prov_durable_01',
    ruleName: 'الزام خروج اضطراری بالای ۵ طبقه',
    conditions: { propertyCategories: ['RESIDENTIAL_APARTMENT'], minFloorsCount: 5 },
    restrictionOrObligationSummary: 'نیاز به تأییدیه آتش‌نشانی قبل از پایان کار',
    mandatoryClassification: 'MANDATORY_STATUTORY',
    effectiveFromIso: '2024-02-01',
    ...overrides,
  };
}

export function makeComplianceInput(
  overrides: Partial<CreateComplianceRequirementInput> = {},
): CreateComplianceRequirementInput {
  return {
    id: 'comp_durable_01',
    requirementCode: 'FIRE-EXIT-01',
    sourceId: 'src_durable_01',
    provisionId: 'prov_durable_01',
    applicablePropertyCategories: ['RESIDENTIAL_APARTMENT'],
    applicableTransactionContexts: ['CONSTRUCTION_PERMIT'],
    titleFa: 'گواهی ایمنی آتش‌نشانی',
    requirementDescription: 'ارائه تأییدیه سازمان آتش‌نشانی برای راه خروج اضطراری',
    mandatoryVersionClassification: 'MANDATORY_STATUTORY',
    requiredEvidenceTypes: ['FIRE_DEPT_CERTIFICATE'],
    verificationMethodDescription: 'استعلام رسمی سامانه آتش‌نشانی',
    responsibleAuthorityName: 'سازمان آتش‌نشانی و خدمات ایمنی',
    effectiveFromIso: '2024-02-01',
    ...overrides,
  };
}
