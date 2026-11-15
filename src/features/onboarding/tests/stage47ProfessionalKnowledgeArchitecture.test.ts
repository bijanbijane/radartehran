/** @file src/features/onboarding/tests/stage47ProfessionalKnowledgeArchitecture.test.ts — Stage 47 Acceptance & Architecture Suite */
import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import {
  evaluateScheduledReviewDue,
  evaluateUserDocumentPublicationRights,
  inspectSourceProvenance,
  proposeExpertContentRevision,
  resolveContentDetailHeader,
  resolveContextualKnowledgeSuggestion,
  resolveMobileKnowledgeLayout,
  searchProfessionalKnowledgeCatalog,
  separateReferenceFromInterpretation,
  submitContentErrorReport,
  supersedeKnowledgeSource,
  updateInteractiveChecklistItem,
} from '../services/professionalKnowledgeEngine';
import {
  SERVICE_GUIDE_SECTIONS_15,
  STAGE47_BOUNDARIES_5,
  STAGE47_CONTENT_CATEGORIES_14,
  STAGE47_EDITORIAL_ROLES_8,
  STAGE47_PK_COMPONENT_IDS_40,
  STAGE47_UI_PK_TASKS_30,
  STAGE47_UX_EVENTS_14,
  STAGE48_DECISION_TOOL_AXES_15,
} from '../services/professionalKnowledgeTypes';
import {
  INITIAL_STAGE47_CHECKLIST,
  INITIAL_STAGE47_GUIDES,
  STAGE47_GLOSSARY_ENTRIES,
} from '../services/stage47KnowledgeFixtures';

describe('Stage 47 (RT-UI-PROFESSIONAL-KNOWLEDGE-001) Acceptance & Architecture Suite', () => {
  it('T47-00: enforces 5 boundaries, 14 categories, 15 service guide sections, 8 editorial roles, 40 PK components, 14 UX events, 30 UI-PK tasks, and 15 Stage 48 axes', () => {
    assert.equal(STAGE47_BOUNDARIES_5.length, 5);
    assert.equal(STAGE47_CONTENT_CATEGORIES_14.length, 14);
    assert.equal(SERVICE_GUIDE_SECTIONS_15.length, 15);
    assert.equal(STAGE47_EDITORIAL_ROLES_8.length, 8);
    assert.equal(STAGE47_PK_COMPONENT_IDS_40.length, 40);
    assert.equal(STAGE47_PK_COMPONENT_IDS_40[0], 'PK-01');
    assert.equal(STAGE47_PK_COMPONENT_IDS_40[39], 'PK-40');
    assert.equal(STAGE47_UX_EVENTS_14.length, 14);
    assert.equal(STAGE47_UI_PK_TASKS_30.length, 30);
    assert.equal(STAGE48_DECISION_TOOL_AXES_15.length, 15);
  });

  it('T47-01 & T47-02 (Acceptance Tests 1 & 2): resolves content type/audience/scope header and keeps missing source metadata explicitly as نامشخص', () => {
    const header = resolveContentDetailHeader(INITIAL_STAGE47_GUIDES[0]);
    assert.equal(header.hasCompleteTopBanner, true);
    assert.equal(header.contentType, 'practical_guide');

    const partialSource = inspectSourceProvenance({
      sourceId: 'SRC-TEST-99',
      fullTitleFa: 'سند آزمایشی',
      publisherFa: 'مرجع تخصصی',
    });
    assert.equal(partialSource.authorFa, 'نامشخص');
    assert.equal(partialSource.effectiveDateFa, 'نامشخص');
    assert.equal(partialSource.replacementSourceId, 'نامشخص');
  });

  it('T47-03 & T47-04 (Acceptance Tests 3 & 4): superseding a source or passing review due date flags content as نیازمند بازبینی without auto-renewal', () => {
    const sup = supersedeKnowledgeSource({
      guide: INITIAL_STAGE47_GUIDES[0],
      oldSourceId: 'SRC-MABHAS-14',
      newSourceId: 'SRC-MABHAS-14-1405',
      impactsGuideContent: true,
    });
    assert.equal(sup.queuedForEditorialReview, true);
    assert.equal(sup.updatedGuide.publicationStatus, 'نیازمند بازبینی');
    assert.equal(sup.updatedGuide.sources[0].status, 'superseded');
    assert.equal(sup.updatedGuide.sources[0].replacementSourceId, 'SRC-MABHAS-14-1405');

    const overdue = evaluateScheduledReviewDue(INITIAL_STAGE47_GUIDES[0], '2027-02-01T00:00:00.000Z');
    assert.equal(overdue.isReviewOverdue, true);
    assert.equal(overdue.autoRenewedValidity, false);
    assert.equal(overdue.updatedGuide.publicationStatus, 'نیازمند بازبینی');
  });

  it('T47-05 & T47-06 (Acceptance Tests 5 & 6): error reporting binds to section with tracking ID and expert revision preserves diff before publication', () => {
    const rep = submitContentErrorReport({
      existingCount: 1,
      guideId: INITIAL_STAGE47_GUIDES[0].guideId,
      targetSectionFa: 'بخش ۱',
      problemType: 'ادعای تخصصی نادرست',
      descriptionFa: 'فشار تست نیاز به بازنگری دارد',
    });
    assert.equal(rep.reportId, 'ERR-PK-102');
    assert.equal(rep.routingPathFa, 'بررسی متخصص مرتبط');
    assert.equal(rep.status, 'دریافت‌شده');

    const rev = proposeExpertContentRevision({
      guide: INITIAL_STAGE47_GUIDES[0],
      sectionId: 'sec-scope-1',
      proposedTextFa: 'متن اصلاح‌شده توسط متخصص',
      expertNameFa: 'مهندس کاظمی',
      reviewLimitationNoteFa: 'محدود به لوله‌کشی داخلی',
    });
    assert.equal(rev.workflowStatus, 'در بازبینی تخصصی');
    assert.equal(rev.publishedImmediately, false);
    assert.notEqual(rev.previousTextFa, rev.proposedTextFa);
  });

  it('T47-07 & T47-08 (Acceptance Tests 7 & 8): 5-state interactive checklist saves progress with non-certification disclaimer and contextual widget is non-intrusive', () => {
    const chk = updateInteractiveChecklistItem({
      checklist: INITIAL_STAGE47_CHECKLIST,
      itemId: 'chk-item-1',
      nextStatus: 'نیازمند متخصص',
      userNoteFa: 'افت فشار شدید',
    });
    assert.equal(chk.isOfficialTechnicalOrLegalCertification, false);
    assert.ok(chk.disclaimerFa.includes('به‌هیچ‌وجه به معنی تأیید فنی یا حقوقی'));

    const ctx = resolveContextualKnowledgeSuggestion('renovation_request');
    assert.equal(ctx.coversPrimaryCtaButton, false);
    assert.equal(ctx.recordsPassiveViewAsConsent, false);
    assert.equal(ctx.dismissible, true);
  });

  it('T47-09 & T47-10 (Acceptance Tests 9 & 10): zero-result search suggests spelling/topics without forcing unrelated results and separates source fact from author interpretation', () => {
    const emptyRes = searchProfessionalKnowledgeCatalog(INITIAL_STAGE47_GUIDES, 'کلمه_ناموجود_۱۲۳');
    assert.equal(emptyRes.matchedGuides.length, 0);
    assert.ok(emptyRes.zeroResultRecovery);
    assert.equal(emptyRes.zeroResultRecovery.forcedUnrelatedResults, false);

    const sep = separateReferenceFromInterpretation(INITIAL_STAGE47_GUIDES[0].sections[0], 'صددرصد صحیح');
    assert.equal(sep.layersDistinct, true);
    assert.equal(sep.isLabelAllowed, false);
    assert.equal(sep.sanitizedTrustLabel, 'منبع تخصصی دارد');
    assert.notEqual(STAGE47_GLOSSARY_ENTRIES[0].simpleDefinitionFa, STAGE47_GLOSSARY_ENTRIES[0].technicalDefinitionFa);
  });

  it('T47-11 & T47-12 (Acceptance Tests 11 & 12): enforces document publication rights + PII guard and mobile single-column reading + AI human review gate', () => {
    const piiBlocked = evaluateUserDocumentPublicationRights({
      uploadedByUser: true,
      explicitPublicLicenseGranted: true,
      containsPersonalPii: true,
      intendedUse: 'public_licensed',
    });
    assert.equal(piiBlocked.uploadAloneGrantsPublicRelease, false);
    assert.equal(piiBlocked.canPublishPublicly, false);
    assert.equal(piiBlocked.effectivePermission, 'internal_review_only');

    const mob = resolveMobileKnowledgeLayout(390, 'legal_interpretation');
    assert.equal(mob.singleColumnNarrowText, true);
    assert.equal(mob.requiresHorizontalPageScroll, false);
    assert.equal(mob.aiCanAutoPublishDirectly, false);
    assert.equal(mob.requiresHumanSpecialistReview, true);
  });
});
