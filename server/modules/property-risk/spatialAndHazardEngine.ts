/**
 * Spatial Hazard Matching & Exposure Assessment Engine
 * (`server/modules/property-risk/spatialAndHazardEngine.ts`)
 * Exclusive ownership: `server/modules/property-risk/`
 */

import { randomUUID } from 'node:crypto';
import {
  ExposureLevel,
  HazardCategoryType,
  HazardIntensityLevel,
  HazardZoneRecord,
  PropertyExposureAssessment
} from './types.js';

export function mapIntensityToExposureLevel(intensity: HazardIntensityLevel): ExposureLevel {
  if (intensity === 'none_documented') {
    return 'no_documented_exposure';
  }
  return intensity;
}

export function isPointInsideBoundingBox(
  lat: number,
  lng: number,
  box: { minLat: number; maxLat: number; minLng: number; maxLng: number }
): boolean {
  return lat >= box.minLat && lat <= box.maxLat && lng >= box.minLng && lng <= box.maxLng;
}

export function classifyFaultProximityExposure(distanceMeters: number): {
  exposureLevel: ExposureLevel;
  notesFa: string;
} {
  if (distanceMeters < 500) {
    return {
      exposureLevel: 'very_high',
      notesFa: `فاصله ملک تا گسل فعال اصلی کمتر از ۵۰۰ متر (${Math.round(distanceMeters)} متر) بوده و در حریم حاد گسل قرار دارد.`
    };
  }
  if (distanceMeters < 2000) {
    return {
      exposureLevel: 'high',
      notesFa: `ملک در شعاع ۲ کیلومتری گسل فعال (${Math.round(distanceMeters)} متر) واقع شده است.`
    };
  }
  if (distanceMeters < 5000) {
    return {
      exposureLevel: 'moderate',
      notesFa: `فاصله ملک از گسل فعال ${Math.round(distanceMeters / 1000 * 10) / 10} کیلومتر (در محدوده پهنه میانی) است.`
    };
  }
  return {
    exposureLevel: 'low',
    notesFa: `فاصله ملک از گسل‌های لرزه‌زای اصلی شناخته‌شده بیش از ۵ کیلومتر (${Math.round(distanceMeters / 1000 * 10) / 10} کیلومتر) است.`
  };
}

export function classifySubsidenceExposure(subsidenceRateMmPerYear: number): {
  exposureLevel: ExposureLevel;
  notesFa: string;
} {
  if (subsidenceRateMmPerYear >= 150) {
    return {
      exposureLevel: 'very_high',
      notesFa: `نرخ فرونشست زمین بر اساس تصاویر تداخل‌سنجی راداری بیش از ۱۵ سانتی‌متر در سال (${subsidenceRateMmPerYear} mm/yr) بوده و در پهنه بحرانی قرار دارد.`
    };
  }
  if (subsidenceRateMmPerYear >= 50) {
    return {
      exposureLevel: 'high',
      notesFa: `نرخ فرونشست سالانه بین ۵ الی ۱۵ سانتی‌متر (${subsidenceRateMmPerYear} mm/yr) است.`
    };
  }
  if (subsidenceRateMmPerYear >= 10) {
    return {
      exposureLevel: 'moderate',
      notesFa: `نرخ فرونشست در محدوده متوسط (۱۰ الی ۵۰ میلیمتر در سال) ثبت شده است.`
    };
  }
  return {
    exposureLevel: 'low',
    notesFa: 'نرخ جابجایی سطحی زمین کمتر از ۱۰ میلیمتر در سال بوده و در محدوده پایدار قرار دارد.'
  };
}

export function matchPropertyToHazardZones(params: {
  propertyId: string;
  category: HazardCategoryType;
  coordinates?: { lat: number; lng: number };
  cityId?: string;
  hoodId?: number;
  availableZones: HazardZoneRecord[];
  nearestFaultDistanceMeters?: number;
}): PropertyExposureAssessment {
  const { propertyId, category, coordinates, cityId, hoodId, availableZones, nearestFaultDistanceMeters } = params;

  // 1. Fault line proximity match for fault rupture / shaking
  if (category === 'surface_fault_rupture' && nearestFaultDistanceMeters !== undefined) {
    const classification = classifyFaultProximityExposure(nearestFaultDistanceMeters);
    return {
      exposureId: randomUUID(),
      propertyId,
      hazardCategory: category,
      matchMethod: 'fault_buffer_distance',
      exposureLevel: classification.exposureLevel,
      distanceToHazardSourceMeters: nearestFaultDistanceMeters,
      sourceDatasetName: 'نقشه حریم گسل‌های مصوب شورای عالی شهرسازی و معماری',
      spatialResolution: 'بافر حریم دقیق گسل (دقت متری)',
      confidenceRating: 'high',
      assessmentDateIso: new Date().toISOString(),
      notesFa: classification.notesFa
    };
  }

  // 2. Coordinate-based bounding box match in active hazard zones
  if (coordinates) {
    for (const zone of availableZones) {
      if (zone.hazardCategory !== category) continue;
      if (zone.boundingBox && isPointInsideBoundingBox(coordinates.lat, coordinates.lng, zone.boundingBox)) {
        return {
          exposureId: randomUUID(),
          propertyId,
          hazardCategory: category,
          zoneId: zone.zoneId,
          matchMethod: 'exact_coordinates',
          exposureLevel: mapIntensityToExposureLevel(zone.intensityLevel),
          sourceDatasetName: zone.sourceDatasetName,
          spatialResolution: zone.spatialResolution,
          confidenceRating: 'high',
          assessmentDateIso: new Date().toISOString(),
          notesFa: `مختصات دقیق ملک در محدوده پهنه خطر «${zone.sourceAuthorityFa}» با شدت ${zone.intensityLevel} قرار دارد.`
        };
      }
    }
  }

  // 3. Neighborhood-level match
  if (hoodId) {
    const hoodZone = availableZones.find(z => z.hazardCategory === category && z.hoodId === hoodId);
    if (hoodZone) {
      return {
        exposureId: randomUUID(),
        propertyId,
        hazardCategory: category,
        zoneId: hoodZone.zoneId,
        matchMethod: 'neighborhood_centroid',
        exposureLevel: mapIntensityToExposureLevel(hoodZone.intensityLevel),
        sourceDatasetName: hoodZone.sourceDatasetName,
        spatialResolution: hoodZone.spatialResolution,
        confidenceRating: 'medium',
        assessmentDateIso: new Date().toISOString(),
        notesFa: `بر مبنای موقعیت محله، این محدوده تحت پهنه خطر ${category} با شدت ${hoodZone.intensityLevel} قرار دارد.`
      };
    }
  }

  // 4. Default: No documented exposure in currently indexed datasets
  return {
    exposureId: randomUUID(),
    propertyId,
    hazardCategory: category,
    matchMethod: 'regional_default',
    exposureLevel: 'no_documented_exposure',
    sourceDatasetName: 'اطلس ملی مخاطرات طبیعی ایران',
    spatialResolution: 'پایگاه داده استانی',
    confidenceRating: coordinates ? 'medium' : 'low',
    assessmentDateIso: new Date().toISOString(),
    notesFa: 'در لایه‌های مکانی و سوابق موجود، هیچ پهنه خطر مستندی برای این موقعیت ثبت نشده است (عدم وجود سابقه به منزله تضمین قطعی صفر بودن ریسک نیست).'
  };
}
