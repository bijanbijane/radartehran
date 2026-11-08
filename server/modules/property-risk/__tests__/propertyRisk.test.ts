/**
 * Comprehensive Automated Tests for Property Risk & Resilience Module
 * (`server/modules/property-risk/__tests__/propertyRisk.test.ts`)
 * Exclusive ownership: `server/modules/property-risk/`
 */

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
  createPropertyRiskService,
  InMemoryPropertyRiskRepository,
  PropertyRiskDomainEvent,
  PropertyRiskEventOutboxPublisher
} from '../index.js';
import { classifySubsidenceExposure } from '../spatialAndHazardEngine.js';

describe('Property Risk Module - Comprehensive Test Suite', () => {
  const publishedEvents: PropertyRiskDomainEvent[] = [];
  const testPublisher: PropertyRiskEventOutboxPublisher = {
    publish: async (event) => {
      publishedEvents.push(event);
    }
  };

  function setup() {
    publishedEvents.length = 0;
    const repo = new InMemoryPropertyRiskRepository();
    const service = createPropertyRiskService({
      repository: repo,
      outboxPublisher: testPublisher
    });
    return { repo, service };
  }

  it('manages hazard zones and performs point-in-polygon spatial matching', async () => {
    const { service } = setup();

    // Register a flood hazard zone in Tehran District 22 (Chitgar lake basin)
    const zone = await service.registerHazardZone({
      zoneId: 'zone-flood-chitgar-100yr',
      hazardCategory: 'river_flood',
      jurisdiction: 'IR',
      cityId: 'tehran',
      hoodId: 22,
      boundingBox: {
        minLat: 35.730,
        maxLat: 35.760,
        minLng: 51.190,
        maxLng: 51.240
      },
      intensityLevel: 'high',
      recurrenceIntervalYears: 100,
      sourceDatasetName: 'نقشه حریم و بستر مسیل‌های آب منطقه‌ای تهران',
      sourceAuthorityFa: 'شرکت آب منطقه‌ای تهران',
      effectiveFromIso: new Date().toISOString(),
      spatialResolution: 'district_grid',
      isVerified: true
    });

    assert.equal(zone.zoneId, 'zone-flood-chitgar-100yr');
    assert.equal(publishedEvents.length, 1);
    assert.equal(publishedEvents[0].eventType, 'property_risk.hazard_zone.created');

    // Assess property with coordinates inside bounding box
    const insideExposure = await service.assessPropertyExposure({
      propertyId: 'prop-chitgar-tower-1',
      hazardCategory: 'river_flood',
      coordinates: { lat: 35.745, lng: 51.215 }
    });

    assert.equal(insideExposure.exposureLevel, 'high');
    assert.equal(insideExposure.matchMethod, 'exact_coordinates');
    assert.equal(insideExposure.confidenceRating, 'high');

    // Assess property outside bounding box in another district without flood zone
    const outsideExposure = await service.assessPropertyExposure({
      propertyId: 'prop-far-away',
      hazardCategory: 'river_flood',
      coordinates: { lat: 35.800, lng: 51.400 }
    });

    assert.equal(outsideExposure.exposureLevel, 'no_documented_exposure');
    assert.equal(outsideExposure.matchMethod, 'regional_default');
  });

  it('evaluates fault line proximity buffers accurately', async () => {
    const repo = new InMemoryPropertyRiskRepository();
    // Geography adapter returning 350 meters from North Tehran Fault
    const mockGeographyAdapter = {
      getNeighborhoodCentroid: async () => ({ lat: 35.81, lng: 51.42 }),
      getDistanceToNearestActiveFaultMeters: async () => 350,
      isPointInsideHazardPolygon: async () => false
    };

    const service = createPropertyRiskService({
      repository: repo,
      geographyAdapter: mockGeographyAdapter
    });

    const exposure = await service.assessPropertyExposure({
      propertyId: 'prop-niavaran-fault',
      hazardCategory: 'surface_fault_rupture',
      coordinates: { lat: 35.815, lng: 51.425 }
    });

    assert.equal(exposure.exposureLevel, 'very_high');
    assert.equal(exposure.distanceToHazardSourceMeters, 350);
    assert.ok(exposure.notesFa.includes('حریم حاد گسل'));
  });

  it('classifies land subsidence rates from InSAR measurement thresholds', () => {
    // Critical > 150 mm/yr
    const c1 = classifySubsidenceExposure(220);
    assert.equal(c1.exposureLevel, 'very_high');
    assert.ok(c1.notesFa.includes('بحرانی'));

    // High 50-150 mm/yr
    const c2 = classifySubsidenceExposure(85);
    assert.equal(c2.exposureLevel, 'high');

    // Stable < 10 mm/yr
    const c3 = classifySubsidenceExposure(4);
    assert.equal(c3.exposureLevel, 'low');
  });

  it('derives building vulnerability based on structural system, construction code and retrofits', async () => {
    const { service } = setup();

    // 1. Unreinforced masonry building
    const masonryProfile = await service.setBuildingVulnerability({
      propertyId: 'prop-old-masonry',
      structuralSystem: 'unreinforced_masonry',
      numberOfFloors: 3,
      hasBasement: false,
      seismicRetrofitCompleted: false,
      floodBarriersInstalled: false,
      fireResistantEnvelope: false,
      sourceProvenance: 'user_reported'
    });
    assert.equal(masonryProfile.vulnerabilityLevel, 'very_high');

    // 2. Modern reinforced concrete under code 2800 (1395) with retrofit
    const modernProfile = await service.setBuildingVulnerability({
      propertyId: 'prop-modern-rc',
      structuralSystem: 'reinforced_concrete',
      constructionYear: 1395,
      numberOfFloors: 7,
      hasBasement: true,
      seismicRetrofitCompleted: true,
      floodBarriersInstalled: true,
      fireResistantEnvelope: true,
      sourceProvenance: 'technical_inspection'
    });
    assert.equal(modernProfile.vulnerabilityLevel, 'low');
  });

  it('synthesizes property risk through explicit Exposure x Vulnerability matrix', async () => {
    const { service } = setup();

    // Property A: In high flood zone + unreinforced masonry with basement (critical risk)
    await service.registerHazardZone({
      zoneId: 'zone-flood-a',
      hazardCategory: 'river_flood',
      jurisdiction: 'IR',
      boundingBox: { minLat: 35.0, maxLat: 36.0, minLng: 51.0, maxLng: 52.0 },
      intensityLevel: 'very_high',
      sourceDatasetName: 'اطلس سیلاب',
      sourceAuthorityFa: 'آب منطقه‌ای',
      effectiveFromIso: new Date().toISOString(),
      spatialResolution: 'parcel_exact',
      isVerified: true
    });

    await service.assessPropertyExposure({
      propertyId: 'prop-risk-crit',
      hazardCategory: 'river_flood',
      coordinates: { lat: 35.5, lng: 51.5 }
    });

    await service.setBuildingVulnerability({
      propertyId: 'prop-risk-crit',
      structuralSystem: 'unreinforced_masonry',
      numberOfFloors: 2,
      hasBasement: true,
      seismicRetrofitCompleted: false,
      floodBarriersInstalled: false,
      fireResistantEnvelope: false,
      sourceProvenance: 'user_reported'
    });

    const riskA = await service.synthesizeRisk('prop-risk-crit', 'river_flood');
    assert.equal(riskA.exposureLevel, 'very_high');
    assert.equal(riskA.vulnerabilityLevel, 'high');
    assert.equal(riskA.overallRiskClass, 'critical');
    assert.ok(riskA.primaryRiskDriversFa.length >= 2);
    assert.ok(riskA.disclaimerFa.includes('صرفاً تحلیلی و مبتنی بر داده‌های محیطی'));

    // Property B: Outside documented hazard zone (minimal risk)
    const riskB = await service.synthesizeRisk('prop-no-hazard', 'river_flood');
    assert.equal(riskB.exposureLevel, 'no_documented_exposure');
    assert.equal(riskB.overallRiskClass, 'minimal');
  });

  it('records historical hazard events and filters by city and hazard category', async () => {
    const { service } = setup();

    await service.recordHistoricalEvent({
      eventId: 'eq-tehran-1396',
      hazardCategory: 'earthquake_shaking',
      officialIdentifier: 'IR-EQ-2017-MALARD',
      nameFa: 'زمین‌لرزه ملارد - تهران',
      eventDateIso: '2017-12-20T19:57:00.000Z',
      affectedCityId: 'tehran',
      observedMagnitudeOrIntensity: 'Mw 5.2',
      impactSummaryFa: 'تکان‌های شدید در غرب و شمال تهران، بدون خسارت کالبدی عمده در سازه‌های نوساز',
      sourceAuthorityFa: 'مرکز لرزه‌نگاری کشوری موسسه ژئوفیزیک دانشگاه تهران',
      verificationStatus: 'verified_official'
    });

    const events = await service.listHistoricalEvents('tehran', 'earthquake_shaking');
    assert.equal(events.length, 1);
    assert.equal(events[0].eventId, 'eq-tehran-1396');
    assert.equal(events[0].observedMagnitudeOrIntensity, 'Mw 5.2');
  });

  it('assesses property resilience and models hypothetical mitigation scenarios', async () => {
    const { service } = setup();

    // 1. Resilience assessment for earthquake
    const resilience = await service.assessResilience({
      propertyId: 'prop-resilience-demo',
      hazardCategory: 'earthquake_shaking',
      verifiedProtectiveSystems: ['automatic_gas_shutoff_valve']
    });

    assert.ok(resilience.resilienceScorePercent > 0);
    assert.ok(resilience.identifiedDeficienciesFa.length > 0);
    assert.ok(resilience.recommendationsFa.length > 0);

    // 2. Mitigation scenario modeling: Steel bracing retrofit reducing critical risk to moderate
    const scenario = await service.modelMitigation({
      propertyId: 'prop-resilience-demo',
      hazardCategory: 'earthquake_shaking',
      baselineRiskClass: 'critical',
      proposedInterventionKey: 'seismic_steel_bracing_retrofit',
      nameFa: 'اجرای مهاربندهای فولادی واگرا',
      descriptionFa: 'نصب مهاربندهای فولادی در دهانه‌های بیرونی جهت افزایش سختی جانبی'
    });

    assert.equal(scenario.baselineRiskClass, 'critical');
    assert.equal(scenario.projectedRiskClass, 'moderate');
    assert.ok(scenario.implementationPrerequisitesFa.length >= 2);
    assert.ok(scenario.disclaimerFa.includes('سناریوی تحلیلی و فرضی'));
  });
});
