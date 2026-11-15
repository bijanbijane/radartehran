import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
  createPropertyPriceMonitor,
  evaluateListingPriceChangeAlert,
  evaluateListingRemovalStatus,
  classifyDuplicateOrRepostedListing,
  evaluateSavedSearchAndFilterIsolation,
  evaluateNeighborhoodIndexMonitor,
  filterEventsByMapPolygonMonitor,
  deduplicateAndGroupRelatedEvents,
  evaluateQuietHoursAndDelivery,
  resolveMonitorSourceOutageState,
  manageAlertCorrectionAndMonitorLifecycle,
} from '../services/marketMonitoringEngine';
import {
  STAGE49_BOUNDARIES_8,
  STAGE49_MM_COMPONENT_IDS_45,
  STAGE49_UI_MM_TASKS_35,
  STAGE49_UX_EVENTS_20,
  STAGE50_REPORTING_AXES_16,
} from '../services/marketMonitoringTypes';
import {
  INITIAL_STAGE49_ALERTS,
  INITIAL_STAGE49_MONITORS,
} from '../services/stage49MonitoringFixtures';

describe('Stage 49 (RT-UI-MARKET-MONITORING-001) Acceptance & Architecture Suite', () => {
  it('T49-00: enforces 8 boundaries, 45 MM components, 35 UI-MM tasks, 20 UX events, and 16 Stage 50 axes', () => {
    assert.equal(STAGE49_BOUNDARIES_8.length, 8);
    assert.equal(STAGE49_MM_COMPONENT_IDS_45.length, 45);
    assert.equal(STAGE49_UI_MM_TASKS_35.length, 35);
    assert.equal(STAGE49_UX_EVENTS_20.length, 20);
    assert.equal(STAGE50_REPORTING_AXES_16.length, 16);
  });

  it('T49-01 & T49-02 (Acceptance Tests 1 & 2): creates property price monitor and separates changeTimeFa vs observedTimeFa with asking_price !== deal_price wording', () => {
    const mon = createPropertyPriceMonitor({
      monitorId: 'MON-T1',
      titleFa: 'پایش واحد ۱۱۰ متری یوسف‌آباد',
      baselineAskingPriceM: 16000,
      thresholdPercent: 3,
      createdAtFa: '۱۴۰۵/۰۸/۰۱',
    });
    assert.equal(mon.status, 'فعال');
    assert.equal(mon.hysteresisDeactivatePercent, 2);

    const alt = evaluateListingPriceChangeAlert({
      eventId: 'EVT-T2',
      monitorId: mon.monitorId,
      subjectTitleFa: 'واحد ۱۱۰ متری یوسف‌آباد',
      previousAskingPriceM: 16000,
      newAskingPriceM: 15200,
      changeTimeFa: '۱۴۰۵/۰۸/۱۵ · ۱۰:۰۰',
      observedTimeFa: '۱۴۰۵/۰۸/۱۵ · ۱۰:۲۰',
      sourceNameFa: 'منبع آگهی',
    });
    assert.equal(alt.eventTypeFa, 'کاهش قیمت آگهی');
    assert.equal(alt.priceConcept, 'قیمت آگهی');
    assert.notEqual(alt.changeTimeFa, alt.observedTimeFa);
    assert.ok(alt.triggerRuleReasonFa.includes('صرفاً قیمت آگهی است و به معنی تغییر قیمت معامله قطعی نیست'));
  });

  it('T49-03 & T49-04 (Acceptance Tests 3 & 4): records removed listings as unavailable (never sold) and suppresses duplicate repost alerts', () => {
    const rem = evaluateListingRemovalStatus({
      listingId: 'LST-404',
      observedTimeFa: '۱۴۰۵/۰۸/۱۵ · ۱۱:۰۰',
      sourceNameFa: 'پایشگر منطقه ۲',
    });
    assert.equal(rem.statusLabelFa, 'دیگر قابل مشاهده نیست (عدم دسترسی به آگهی)');
    assert.equal(rem.claimedAsDefinitivelySold, false);

    const dup = classifyDuplicateOrRepostedListing({
      newListingId: 'LST-902',
      priorListingId: 'LST-801',
      sameAreaAndFloor: true,
      sameGeoBlock: true,
    });
    assert.equal(dup.classification, 'بازنشر آگهی قبلی');
    assert.equal(dup.sendStandaloneDuplicateAlert, false);
  });

  it('T49-05 & T49-06 (Acceptance Tests 5 & 6): matches saved search criteria and isolates existing monitor when main search filters change', () => {
    const res = evaluateSavedSearchAndFilterIsolation({
      savedMonitor: INITIAL_STAGE49_MONITORS[1],
      candidateListing: { areaSqm: 110, priceM: 21500, hoodFa: 'سعادت‌آباد' },
      requiredHoodFa: 'سعادت‌آباد',
      minSqm: 95,
      maxPriceM: 23000,
      userChangedMainSearchFilters: true,
      userChoseAction: 'create_new',
    });
    assert.equal(res.matchesSavedSearch, true);
    assert.equal(res.existingMonitorMutatedSilently, false);
    assert.equal(res.monitorActionTaken, 'create_new');
  });

  it('T49-07 & T49-08 (Acceptance Tests 7 & 8): evaluates neighborhood index monitor and flags sample composition shifts without claiming market boom/crash', () => {
    const idx = evaluateNeighborhoodIndexMonitor({
      hoodNameFa: 'سعادت‌آباد',
      periodFa: 'ماهانه',
      previousMedianM: 180,
      newMedianM: 210,
      observationCount: 48,
      lowPriceListingsRemovedRecently: true,
    });
    assert.equal(idx.requiresCompositionAndQualityCheck, true);
    assert.equal(idx.claimsDefinitiveMarketBoomOrCrash, false);
    assert.ok(idx.limitationNoticeFa.includes('تغییر ترکیب نمونه'));
  });

  it('T49-09 & T49-10 (Acceptance Tests 9 & 10): filters events strictly inside drawn map polygon and deduplicates multi-monitor alerts', () => {
    const polyMonitor = INITIAL_STAGE49_MONITORS[2];
    const inside = filterEventsByMapPolygonMonitor({
      monitor: polyMonitor,
      candidateEventLat: 35.782,
      candidateEventLng: 51.375,
      boundaryEditedByUser: true,
    });
    assert.equal(inside.isInsideMonitoredPolygon, true);
    assert.equal(inside.newPolygonVersionCreatedOnEdit, true);
    assert.equal(inside.previousHistoryOverwrittenSilently, false);

    const outside = filterEventsByMapPolygonMonitor({
      monitor: polyMonitor,
      candidateEventLat: 35.71,
      candidateEventLng: 51.31,
      boundaryEditedByUser: false,
    });
    assert.equal(outside.isInsideMonitoredPolygon, false);
    assert.equal(outside.shouldTriggerAlert, false);

    const grouped = deduplicateAndGroupRelatedEvents([
      INITIAL_STAGE49_ALERTS[0],
      { ...INITIAL_STAGE49_ALERTS[0], monitorIds: ['MON-49-103'] },
    ]);
    assert.equal(grouped.groupedAlerts.length, 1);
    assert.equal(grouped.groupedAlerts[0].monitorIds.length, 3);
    assert.equal(grouped.summaryBannerFa('EVT-49-9001'), 'این تغییر با 3 پایش شما مرتبط است.');
  });

  it('T49-11..18 (Acceptance Tests 11–18): handles quiet hours, external channel failure fallback, source outage distinction, error correction history, and pause/delete rule separation', () => {
    const quiet = evaluateQuietHoursAndDelivery({
      isWithinQuietHours: true,
      isUrgentUserException: false,
      externalChannelFailed: false,
    });
    assert.equal(quiet.storedInInAppCenter, true);
    assert.equal(quiet.externalPushSentImmediately, false);
    assert.equal(quiet.deliveryStatus, 'تجمیع‌شده');

    const failedExt = evaluateQuietHoursAndDelivery({
      isWithinQuietHours: false,
      isUrgentUserException: false,
      externalChannelFailed: true,
    });
    assert.equal(failedExt.storedInInAppCenter, true);
    assert.equal(failedExt.deliveryStatus, 'ناموفق');

    const outage = resolveMonitorSourceOutageState(false, false);
    assert.equal(outage.checkStatus, 'بررسی ناموفق');
    assert.equal(outage.reportedAsNoChange, false);

    const lifecycle = manageAlertCorrectionAndMonitorLifecycle({
      alert: INITIAL_STAGE49_ALERTS[0],
      monitor: INITIAL_STAGE49_MONITORS[0],
      confirmErrorCorrectionTextFa: 'اصلاح قیمت به ۲۲٬۰۰۰ م.ت',
      pauseMonitor: true,
      downgradeSourceQuality: true,
      feedbackCount: 1,
    });
    assert.equal(lifecycle.feedback.status, 'اصلاح‌شده');
    assert.equal(lifecycle.updatedAlert.handlingStatus, 'اصلاح‌شده');
    assert.equal(lifecycle.updatedAlert.dataQualityStatus, 'نیازمند بررسی');
    assert.ok(lifecycle.updatedAlert.correctionHistoryFa && lifecycle.updatedAlert.correctionHistoryFa.length > 0);
    assert.equal(lifecycle.updatedMonitor.status, 'متوقف‌شده');
    assert.equal(lifecycle.alertHistoryPreservedOnPauseOrRuleDelete, true);
    assert.equal(lifecycle.generatesNewAlertsWhilePaused, false);
  });
});
