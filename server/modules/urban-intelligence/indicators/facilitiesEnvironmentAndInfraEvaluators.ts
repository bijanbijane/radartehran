import type {
  CanonicalUrbanGeographicEntity,
  RawEnvironmentalSourceRecord,
  RawInfrastructureAndDevelopmentRecord,
  RawUrbanFacilityRecord,
  SpatialCalculationAdapter,
} from '../contracts/externalAdapters';
import type {
  EnvironmentalIndicatorSection,
  FacilityAccessIndicatorSection,
  IndicatorValueEnvelope,
  InfrastructureAndDevelopmentSection,
  PublicAmenitiesSection,
  TransportationMobilitySection,
} from '../domain/types';
import { CURRENT_URBAN_METHODOLOGY_VERSION } from '../methodologies/methodologyRegistry';
import {
  deriveQualityStatusFromProvenance,
  makeUnavailableEnvelope,
  round2,
} from './demographicAndEconomicEvaluators';

export const defaultHaversineSpatialAdapter: SpatialCalculationAdapter = {
  crs: 'EPSG:4326',
  resolutionDescription: 'Point-to-point great-circle Haversine distance in kilometers (WGS84 / EPSG:4326).',
  capabilities: {
    centroidHaversineDistanceSupported: true,
    h3IndexingSupported: false,
    polygonIntersectionSupported: false,
    turnByTurnRoutingSupported: false,
    realTimeTransitSupported: false,
  },
  calculateHaversineDistanceKm(a, b): number {
    const R = 6371;
    const dLat = ((b.lat - a.lat) * Math.PI) / 180;
    const dLng = ((b.lng - a.lng) * Math.PI) / 180;
    const lat1 = (a.lat * Math.PI) / 180;
    const lat2 = (b.lat * Math.PI) / 180;
    const sinLat = Math.sin(dLat / 2);
    const sinLng = Math.sin(dLng / 2);
    const h = sinLat * sinLat + Math.cos(lat1) * Math.cos(lat2) * sinLng * sinLng;
    return round2(2 * R * Math.asin(Math.min(1, Math.sqrt(h))));
  },
};

export function evaluateFacilityAccessSection(params: {
  domain: 'EDUCATION' | 'HEALTHCARE';
  geo: CanonicalUrbanGeographicEntity;
  facilities: RawUrbanFacilityRecord[];
  availablePopulation: number | null;
  spatialAdapter: SpatialCalculationAdapter;
  referenceEpochMs: number;
  methodologyVersion?: string;
}): FacilityAccessIndicatorSection {
  const mVer = params.methodologyVersion ?? CURRENT_URBAN_METHODOLOGY_VERSION;
  const prefix = params.domain === 'EDUCATION' ? 'EDUCATION_' : 'HEALTHCARE_';
  const idPrefix = params.domain === 'EDUCATION' ? 'urb.edu' : 'urb.health';
  const matched = params.facilities.filter((f) => f.category.startsWith(prefix));

  const disclaimer =
    'FACILITY_ACCESS_BOUNDARY: Distinguishes recorded mapped presence from verified currently operating status. Straight-line Haversine proximity does not guarantee road travel time, appointment availability, or service capacity.';

  const operating = matched.filter((f) => f.operationalStatus === 'VERIFIED_CURRENTLY_OPERATING');
  const provIds = Array.from(new Set(matched.map((m) => m.provenance.datasetId)));

  const breakdown: Record<string, { mapped: number; verifiedOperating: number }> = {};
  for (const f of matched) {
    const bucket = breakdown[f.category] ?? { mapped: 0, verifiedOperating: 0 };
    bucket.mapped++;
    if (f.operationalStatus === 'VERIFIED_CURRENTLY_OPERATING') bucket.verifiedOperating++;
    breakdown[f.category] = bucket;
  }

  const withCapacity = operating.filter((f) => typeof f.verifiedCapacityCount === 'number');
  const totalCap =
    withCapacity.length > 0
      ? withCapacity.reduce((acc, f) => acc + (f.verifiedCapacityCount ?? 0), 0)
      : null;

  let minDistanceKm: number | null = null;
  if (params.geo.centroid && operating.length > 0) {
    for (const fac of operating) {
      if (!fac.coords) continue;
      const dist = params.spatialAdapter.calculateHaversineDistanceKm(
        params.geo.centroid,
        fac.coords,
      );
      if (minDistanceKm === null || dist < minDistanceKm) {
        minDistanceKm = dist;
      }
    }
  }

  const firstProv = matched[0]?.provenance;
  const { qualityStatus, isStale } = firstProv
    ? deriveQualityStatusFromProvenance(firstProv, params.referenceEpochMs)
    : { qualityStatus: 'INSUFFICIENT_DATA' as const, isStale: false };

  return {
    domain: params.domain,
    sectionAvailable: matched.length > 0,
    recordedMappedFacilityCount: {
      indicatorId: `${idPrefix}.mapped_facilities_count`,
      availability: 'AVAILABLE',
      value: matched.length,
      unit: 'COUNT',
      dataNature: 'RAW_SOURCE_VALUE',
      evidenceClass: 'DIRECT_MEASUREMENT',
      methodologyVersion: mVer,
      qualityStatus,
      isStale,
      provenanceRefs: provIds,
    },
    verifiedOperatingFacilityCount: {
      indicatorId: `${idPrefix}.operating_facilities_count`,
      availability: 'AVAILABLE',
      value: operating.length,
      unit: 'COUNT',
      dataNature: 'RAW_SOURCE_VALUE',
      evidenceClass: 'DIRECT_MEASUREMENT',
      methodologyVersion: mVer,
      qualityStatus,
      isStale,
      provenanceRefs: provIds,
    },
    verifiedTotalCapacity:
      totalCap !== null
        ? {
            indicatorId: `${idPrefix}.verified_capacity_total`,
            availability: 'AVAILABLE',
            value: totalCap,
            unit: 'COUNT',
            dataNature: 'DERIVED_ANALYTICAL_VALUE',
            evidenceClass: 'DIRECT_MEASUREMENT',
            methodologyVersion: mVer,
            qualityStatus,
            isStale,
            provenanceRefs: provIds,
          }
        : makeUnavailableEnvelope(`${idPrefix}.verified_capacity_total`, 'COUNT', 'DIRECT_MEASUREMENT', 'Facility capacity metadata not supplied by source.', mVer),
    operatingFacilityDensityPerSqKm:
      params.geo.areaSqKm !== null && params.geo.areaSqKm > 0
        ? {
            indicatorId: `${idPrefix}.operating_density_sqkm`,
            availability: 'AVAILABLE',
            value: round2(operating.length / params.geo.areaSqKm),
            unit: 'FACILITIES_PER_SQ_KM',
            dataNature: 'DERIVED_ANALYTICAL_VALUE',
            evidenceClass: 'DIRECT_MEASUREMENT',
            methodologyVersion: mVer,
            qualityStatus,
            isStale,
            provenanceRefs: provIds,
          }
        : makeUnavailableEnvelope(`${idPrefix}.operating_density_sqkm`, 'FACILITIES_PER_SQ_KM', 'DIRECT_MEASUREMENT', 'Verified areaSqKm unavailable.', mVer),
    operatingFacilitiesPer10kResidents:
      params.availablePopulation !== null && params.availablePopulation >= 50
        ? {
            indicatorId: `${idPrefix}.operating_facilities_per_10k`,
            availability: 'AVAILABLE',
            value: round2((operating.length / params.availablePopulation) * 10000),
            unit: 'FACILITIES_PER_10K_RESIDENTS',
            dataNature: 'DERIVED_ANALYTICAL_VALUE',
            evidenceClass: 'DIRECT_MEASUREMENT',
            methodologyVersion: mVer,
            qualityStatus,
            isStale,
            provenanceRefs: provIds,
          }
        : makeUnavailableEnvelope(`${idPrefix}.operating_facilities_per_10k`, 'FACILITIES_PER_10K_RESIDENTS', 'DIRECT_MEASUREMENT', 'Requires non-suppressed resident population >= 50.', mVer),
    nearestVerifiedFacilityDistanceKm:
      minDistanceKm !== null
        ? {
            indicatorId: `${idPrefix}.nearest_facility_km`,
            availability: 'AVAILABLE',
            value: minDistanceKm,
            unit: 'KILOMETERS',
            dataNature: 'DERIVED_ANALYTICAL_VALUE',
            evidenceClass: 'DIRECT_MEASUREMENT',
            methodologyVersion: mVer,
            qualityStatus,
            isStale,
            provenanceRefs: provIds,
          }
        : makeUnavailableEnvelope(`${idPrefix}.nearest_facility_km`, 'KILOMETERS', 'DIRECT_MEASUREMENT', 'Requires area centroid and operating facility coordinates.', mVer),
    coverageGapDetected: operating.length === 0 || (minDistanceKm !== null && minDistanceKm > 3.5),
    categoryBreakdownCounts: breakdown,
    calculationMethodNote: params.spatialAdapter.resolutionDescription,
    proximityVsServiceAvailabilityDisclaimer: disclaimer,
  };
}

export function evaluateTransportationAndAmenities(params: {
  geo: CanonicalUrbanGeographicEntity;
  facilities: RawUrbanFacilityRecord[];
  infra: RawInfrastructureAndDevelopmentRecord | null;
  availablePopulation: number | null;
  spatialAdapter: SpatialCalculationAdapter;
  referenceEpochMs: number;
  methodologyVersion?: string;
}): {
  transportation: TransportationMobilitySection;
  publicAmenities: PublicAmenitiesSection;
} {
  const mVer = params.methodologyVersion ?? CURRENT_URBAN_METHODOLOGY_VERSION;
  const transitFacilities = params.facilities.filter((f) => f.category.startsWith('TRANSIT_'));
  const operatingTransit = transitFacilities.filter(
    (f) => f.operationalStatus === 'VERIFIED_CURRENTLY_OPERATING',
  );
  const metroOperating = operatingTransit.filter((f) => f.category === 'TRANSIT_METRO_STATION');
  const busOperating = operatingTransit.filter((f) => f.category === 'TRANSIT_BUS_STOP');
  const hubsOperating = operatingTransit.filter((f) => f.category === 'TRANSIT_HUB');

  let nearestHubKm: number | null = null;
  if (params.geo.centroid && hubsOperating.length > 0) {
    for (const h of hubsOperating) {
      if (!h.coords) continue;
      const d = params.spatialAdapter.calculateHaversineDistanceKm(params.geo.centroid, h.coords);
      if (nearestHubKm === null || d < nearestHubKm) nearestHubKm = d;
    }
  }

  const transitProvIds = Array.from(new Set(transitFacilities.map((f) => f.provenance.datasetId)));
  const firstTransitProv = transitFacilities[0]?.provenance;
  const tQual = firstTransitProv
    ? deriveQualityStatusFromProvenance(firstTransitProv, params.referenceEpochMs)
    : { qualityStatus: 'INSUFFICIENT_DATA' as const, isStale: false };

  const transportation: TransportationMobilitySection = {
    sectionAvailable: transitFacilities.length > 0 || params.infra !== null,
    recordedTransitStopCount: {
      indicatorId: 'urb.transit.mapped_stops_count',
      availability: 'AVAILABLE',
      value: transitFacilities.length,
      unit: 'COUNT',
      dataNature: 'RAW_SOURCE_VALUE',
      evidenceClass: 'DIRECT_MEASUREMENT',
      methodologyVersion: mVer,
      qualityStatus: tQual.qualityStatus,
      isStale: tQual.isStale,
      provenanceRefs: transitProvIds,
    },
    verifiedOperatingTransitStopCount: {
      indicatorId: 'urb.transit.operating_stops_count',
      availability: 'AVAILABLE',
      value: operatingTransit.length,
      unit: 'COUNT',
      dataNature: 'RAW_SOURCE_VALUE',
      evidenceClass: 'DIRECT_MEASUREMENT',
      methodologyVersion: mVer,
      qualityStatus: tQual.qualityStatus,
      isStale: tQual.isStale,
      provenanceRefs: transitProvIds,
    },
    transitStopDensityPerSqKm:
      params.geo.areaSqKm !== null && params.geo.areaSqKm > 0
        ? {
            indicatorId: 'urb.transit.stop_density_sqkm',
            availability: 'AVAILABLE',
            value: round2(operatingTransit.length / params.geo.areaSqKm),
            unit: 'FACILITIES_PER_SQ_KM',
            dataNature: 'DERIVED_ANALYTICAL_VALUE',
            evidenceClass: 'DIRECT_MEASUREMENT',
            methodologyVersion: mVer,
            qualityStatus: tQual.qualityStatus,
            isStale: tQual.isStale,
            provenanceRefs: transitProvIds,
          }
        : makeUnavailableEnvelope('urb.transit.stop_density_sqkm', 'FACILITIES_PER_SQ_KM', 'DIRECT_MEASUREMENT', 'Verified areaSqKm unavailable.', mVer),
    metroStationCount: {
      indicatorId: 'urb.transit.metro_station_count',
      availability: 'AVAILABLE',
      value: metroOperating.length,
      unit: 'COUNT',
      dataNature: 'RAW_SOURCE_VALUE',
      evidenceClass: 'DIRECT_MEASUREMENT',
      methodologyVersion: mVer,
      qualityStatus: tQual.qualityStatus,
      isStale: tQual.isStale,
      provenanceRefs: transitProvIds,
    },
    busStopCount: {
      indicatorId: 'urb.transit.bus_stop_count',
      availability: 'AVAILABLE',
      value: busOperating.length,
      unit: 'COUNT',
      dataNature: 'RAW_SOURCE_VALUE',
      evidenceClass: 'DIRECT_MEASUREMENT',
      methodologyVersion: mVer,
      qualityStatus: tQual.qualityStatus,
      isStale: tQual.isStale,
      provenanceRefs: transitProvIds,
    },
    transportHubAccessDistanceKm:
      nearestHubKm !== null
        ? {
            indicatorId: 'urb.transit.nearest_hub_km',
            availability: 'AVAILABLE',
            value: nearestHubKm,
            unit: 'KILOMETERS',
            dataNature: 'DERIVED_ANALYTICAL_VALUE',
            evidenceClass: 'DIRECT_MEASUREMENT',
            methodologyVersion: mVer,
            qualityStatus: tQual.qualityStatus,
            isStale: tQual.isStale,
            provenanceRefs: transitProvIds,
          }
        : makeUnavailableEnvelope('urb.transit.nearest_hub_km', 'KILOMETERS', 'DIRECT_MEASUREMENT', 'No operating transit hub coordinates available.', mVer),
    majorRoadConnectivityRef:
      params.infra?.networkPresenceRefs.majorRoadConnectivityScoreRef !== null &&
      params.infra?.networkPresenceRefs.majorRoadConnectivityScoreRef !== undefined
        ? {
            indicatorId: 'urb.transit.road_connectivity_ref',
            availability: 'AVAILABLE',
            value: params.infra.networkPresenceRefs.majorRoadConnectivityScoreRef,
            unit: 'SCORE_1_TO_10',
            dataNature: 'RAW_SOURCE_VALUE',
            evidenceClass: 'INFRASTRUCTURE_REFERENCE',
            methodologyVersion: mVer,
            qualityStatus: 'VERIFIED_SOURCE',
            isStale: false,
            provenanceRefs: [params.infra.provenance.datasetId],
          }
        : makeUnavailableEnvelope('urb.transit.road_connectivity_ref', 'SCORE_1_TO_10', 'INFRASTRUCTURE_REFERENCE', 'Road connectivity reference unavailable.', mVer),
    realTimeAndRoutingDisclaimer:
      'STATIC_TRANSIT_INFRASTRUCTURE_ONLY: Reflects verified transit stop locations; does not claim real-time vehicle arrivals, dynamic travel times, or turn-by-turn routing.',
  };

  const amenityFacilities = params.facilities.filter((f) => f.category.startsWith('AMENITY_'));
  const operatingAmenities = amenityFacilities.filter(
    (f) => f.operationalStatus === 'VERIFIED_CURRENTLY_OPERATING',
  );
  const parks = operatingAmenities.filter((f) => f.category === 'AMENITY_PARK_GREEN_SPACE');
  const totalGreenSqm = parks.reduce((acc, p) => acc + (p.greenSpaceAreaSqMeters ?? 0), 0);

  const amenityCats: Record<
    string,
    { mappedCount: number; verifiedOperatingCount: number; verifiedCapacity: number | null }
  > = {};
  for (const a of amenityFacilities) {
    const entry = amenityCats[a.category] ?? {
      mappedCount: 0,
      verifiedOperatingCount: 0,
      verifiedCapacity: null,
    };
    entry.mappedCount++;
    if (a.operationalStatus === 'VERIFIED_CURRENTLY_OPERATING') {
      entry.verifiedOperatingCount++;
      if (typeof a.verifiedCapacityCount === 'number') {
        entry.verifiedCapacity = (entry.verifiedCapacity ?? 0) + a.verifiedCapacityCount;
      }
    }
    amenityCats[a.category] = entry;
  }

  const amenityProvIds = Array.from(new Set(amenityFacilities.map((f) => f.provenance.datasetId)));
  const publicAmenities: PublicAmenitiesSection = {
    sectionAvailable: amenityFacilities.length > 0,
    parksAndGreenSpacesCount: {
      indicatorId: 'urb.amenity.parks_count',
      availability: 'AVAILABLE',
      value: parks.length,
      unit: 'COUNT',
      dataNature: 'RAW_SOURCE_VALUE',
      evidenceClass: 'DIRECT_MEASUREMENT',
      methodologyVersion: mVer,
      qualityStatus: tQual.qualityStatus,
      isStale: tQual.isStale,
      provenanceRefs: amenityProvIds,
    },
    verifiedOperatingAmenitiesCount: {
      indicatorId: 'urb.amenity.operating_total_count',
      availability: 'AVAILABLE',
      value: operatingAmenities.length,
      unit: 'COUNT',
      dataNature: 'RAW_SOURCE_VALUE',
      evidenceClass: 'DIRECT_MEASUREMENT',
      methodologyVersion: mVer,
      qualityStatus: tQual.qualityStatus,
      isStale: tQual.isStale,
      provenanceRefs: amenityProvIds,
    },
    greenSpaceSqMetersPerResident:
      totalGreenSqm > 0 && params.availablePopulation !== null && params.availablePopulation >= 50
        ? {
            indicatorId: 'urb.amenity.green_sqm_per_resident',
            availability: 'AVAILABLE',
            value: round2(totalGreenSqm / params.availablePopulation),
            unit: 'SQ_METERS_PER_RESIDENT',
            dataNature: 'DERIVED_ANALYTICAL_VALUE',
            evidenceClass: 'DIRECT_MEASUREMENT',
            methodologyVersion: mVer,
            qualityStatus: tQual.qualityStatus,
            isStale: tQual.isStale,
            provenanceRefs: amenityProvIds,
          }
        : makeUnavailableEnvelope('urb.amenity.green_sqm_per_resident', 'SQ_METERS_PER_RESIDENT', 'DIRECT_MEASUREMENT', 'Requires park area in sq meters and population >= 50.', mVer),
    categoryCounts: amenityCats,
    nonQualityEquivalenceDisclaimer:
      'AMENITY_INTERPRETATION_NOTICE: Distinguishes mapped count from operating count and capacity. Higher facility count does not automatically imply superior neighborhood quality.',
  };

  return { transportation, publicAmenities };
}

export function evaluateEnvironmentalAndInfrastructure(params: {
  envSource: RawEnvironmentalSourceRecord | null;
  infraSource: RawInfrastructureAndDevelopmentRecord | null;
  referenceEpochMs: number;
  methodologyVersion?: string;
}): {
  environmental: EnvironmentalIndicatorSection;
  infrastructure: InfrastructureAndDevelopmentSection;
} {
  const mVer = params.methodologyVersion ?? CURRENT_URBAN_METHODOLOGY_VERSION;
  const envDisclaimer =
    'ENVIRONMENTAL_METHODOLOGY_BOUNDARY: Single monitoring-station point readings are never extrapolated to an entire neighborhood without a documented spatial interpolation methodology. Stale readings are flagged and never presented as current conditions.';

  let environmental: EnvironmentalIndicatorSection;
  if (!params.envSource) {
    environmental = {
      sectionAvailable: false,
      measurementScope: 'UNAVAILABLE',
      airQualityIndexAqi: makeUnavailableEnvelope('urb.env.air_quality_index', 'AQI_INDEX', 'DIRECT_MEASUREMENT', 'No environmental source record.', mVer),
      pm25Concentration: makeUnavailableEnvelope('urb.env.pm25_ug_m3', 'UG_PER_M3', 'DIRECT_MEASUREMENT', 'No environmental source record.', mVer),
      daytimeNoiseExposureDb: makeUnavailableEnvelope('urb.env.noise_db', 'DECIBELS_DB', 'DIRECT_MEASUREMENT', 'No environmental source record.', mVer),
      greenSpaceCoveragePct: makeUnavailableEnvelope('urb.env.green_coverage_pct', 'PERCENTAGE', 'DIRECT_MEASUREMENT', 'No environmental source record.', mVer),
      treeCanopyCoveragePct: makeUnavailableEnvelope('urb.env.tree_canopy_pct', 'PERCENTAGE', 'DIRECT_MEASUREMENT', 'No environmental source record.', mVer),
      surfaceTemperatureCelsius: makeUnavailableEnvelope('urb.env.surface_temp_c', 'CELSIUS', 'DIRECT_MEASUREMENT', 'No environmental source record.', mVer),
      floodRiskClassification: null,
      environmentalHealthAndExtrapolationDisclaimer: envDisclaimer,
    };
  } else {
    const src = params.envSource;
    const { qualityStatus, isStale } = deriveQualityStatusFromProvenance(
      src.provenance,
      params.referenceEpochMs,
    );
    const provId = src.provenance.datasetId;
    const evClass =
      src.measurementScope === 'MONITORING_STATION_POINT_READING'
        ? 'DIRECT_MEASUREMENT'
        : 'MODELED_INDICATOR';

    // Section 12: Do not extrapolate a single station measurement to an entire neighborhood without a documented spatial methodology
    const unextrapolatedPointStation =
      src.measurementScope === 'MONITORING_STATION_POINT_READING' &&
      !src.spatialExtrapolationMethodologyRef;

    const buildEnvMetric = (
      id: string,
      val: number | null,
      unit: IndicatorValueEnvelope<number>['unit'],
    ): IndicatorValueEnvelope<number> => {
      if (unextrapolatedPointStation) {
        return {
          indicatorId: id,
          availability: 'REJECTED_QUALITY_OR_EXTRAPOLATION',
          value: null,
          unit,
          dataNature: 'RAW_SOURCE_VALUE',
          evidenceClass: evClass,
          methodologyVersion: mVer,
          qualityStatus: 'REJECTED',
          isStale,
          suppressionOrUnavailableReason:
            'Single monitoring-station reading rejected for neighborhood-wide claim because spatialExtrapolationMethodologyRef is missing.',
          provenanceRefs: [provId],
        };
      }
      if (val === null) {
        return makeUnavailableEnvelope(id, unit, evClass, 'Value is null in environmental source.', mVer);
      }
      return {
        indicatorId: id,
        availability: 'AVAILABLE',
        value: val,
        unit,
        dataNature: 'RAW_SOURCE_VALUE',
        evidenceClass: evClass,
        methodologyVersion: mVer,
        qualityStatus,
        isStale,
        provenanceRefs: [provId],
      };
    };

    environmental = {
      sectionAvailable: true,
      measurementScope: src.measurementScope,
      airQualityIndexAqi: buildEnvMetric('urb.env.air_quality_index', src.airQualityIndexAqi, 'AQI_INDEX'),
      pm25Concentration: buildEnvMetric('urb.env.pm25_ug_m3', src.pm25MicrogramsPerCubicMeter, 'UG_PER_M3'),
      daytimeNoiseExposureDb: buildEnvMetric('urb.env.noise_db', src.daytimeNoiseDecibelsDb, 'DECIBELS_DB'),
      greenSpaceCoveragePct: buildEnvMetric('urb.env.green_coverage_pct', src.greenSpaceCoveragePct, 'PERCENTAGE'),
      treeCanopyCoveragePct: buildEnvMetric('urb.env.tree_canopy_pct', src.treeCanopyCoveragePct, 'PERCENTAGE'),
      surfaceTemperatureCelsius: buildEnvMetric('urb.env.surface_temp_c', src.surfaceTemperatureCelsius, 'CELSIUS'),
      floodRiskClassification: src.floodRiskClassification ?? null,
      environmentalHealthAndExtrapolationDisclaimer: envDisclaimer,
    };
  }

  const infraDisclaimer =
    'INFRASTRUCTURE_PRESENCE_DISCLAIMER: Neighborhood network references do not guarantee individual property hookup, utility capacity, or uninterrupted service. Proposed projects are distinct from approved or completed projects.';

  const infrastructure: InfrastructureAndDevelopmentSection = params.infraSource
    ? {
        sectionAvailable: true,
        networkPresenceReferences: {
          water: params.infraSource.networkPresenceRefs.waterNetworkPresence,
          electricity: params.infraSource.networkPresenceRefs.electricityNetworkPresence,
          gas: params.infraSource.networkPresenceRefs.gasNetworkPresence,
          telecomFiber: params.infraSource.networkPresenceRefs.telecomFiberPresence,
          sewer: params.infraSource.networkPresenceRefs.sewerNetworkPresence,
        },
        developmentProjectsByStage: {
          proposedCount: params.infraSource.developmentProjects.filter(
            (p) => p.lifecycleStage === 'PROPOSED',
          ).length,
          approvedCount: params.infraSource.developmentProjects.filter(
            (p) => p.lifecycleStage === 'APPROVED',
          ).length,
          completedCount: params.infraSource.developmentProjects.filter(
            (p) => p.lifecycleStage === 'COMPLETED',
          ).length,
          projects: params.infraSource.developmentProjects,
        },
        dominantLandUseClassification:
          params.infraSource.dominantLandUseClassification ?? null,
        utilityConnectionAndCapacityDisclaimer: infraDisclaimer,
      }
    : {
        sectionAvailable: false,
        networkPresenceReferences: {
          water: 'UNAVAILABLE_DATA',
          electricity: 'UNAVAILABLE_DATA',
          gas: 'UNAVAILABLE_DATA',
          telecomFiber: 'UNAVAILABLE_DATA',
          sewer: 'UNAVAILABLE_DATA',
        },
        developmentProjectsByStage: {
          proposedCount: 0,
          approvedCount: 0,
          completedCount: 0,
          projects: [],
        },
        dominantLandUseClassification: null,
        utilityConnectionAndCapacityDisclaimer: infraDisclaimer,
      };

  return { environmental, infrastructure };
}
