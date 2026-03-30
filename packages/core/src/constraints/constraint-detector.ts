import type { LatLng } from '../types/analysis.js';
import type { SiteBoundary } from '../types/site.js';
import type {
  DetectedConstraint,
  SiteConstraintReport,
  NearestReceptorTable,
  ConstraintSummary,
} from '../types/constraints.js';
import type { ConstraintOverpassResponse, ConstraintElement } from './constraint-queries.js';
import { getElementCoordinate } from './constraint-queries.js';
import { getConstraintDefinition } from './constraint-definitions.js';
import { distanceKm } from '../utils/geo.js';
import { pointToPolygonEdgeDistanceM, isPointInPolygon } from '../utils/geometry.js';
import { computeExclusionZones } from './exclusion-geometry.js';

/**
 * Detect all constraints from Overpass data and produce a full constraint report.
 */
export function detectConstraints(
  boundary: SiteBoundary,
  osmData: ConstraintOverpassResponse,
): SiteConstraintReport {
  const hardConstraints: DetectedConstraint[] = [];
  const softConstraints: DetectedConstraint[] = [];
  const infoConstraints: DetectedConstraint[] = [];

  const receptors: NearestReceptorTable = {
    nearestDwellingM: null,
    nearestSettlementM: null,
    nearestProtectedAreaM: null,
    nearestSubstationM: null,
    nearestMajorRoadM: null,
    nearestExistingWindFarmM: null,
    nearestWaterbodyM: null,
    nearestRailwayM: null,
  };

  for (const element of osmData.elements) {
    const coord = getElementCoordinate(element);
    if (!coord) continue;

    const tags = element.tags ?? {};
    const distFromSiteM = pointToPolygonEdgeDistanceM(coord, boundary.polygon);
    const distFromCentroidM = distanceKm(coord, boundary.centroid) * 1000;
    const isInsideSite = isPointInPolygon(coord, boundary.polygon);

    // Categorize the element and detect constraints
    const detected = categorizeElement(
      element,
      tags,
      coord,
      distFromSiteM,
      distFromCentroidM,
      isInsideSite,
      boundary,
    );

    if (detected) {
      switch (detected.definition.severity) {
        case 'hard':
          hardConstraints.push(detected);
          break;
        case 'soft':
          softConstraints.push(detected);
          break;
        case 'info':
          infoConstraints.push(detected);
          break;
      }
    }

    // Update nearest receptor table
    updateReceptors(receptors, tags, distFromSiteM, isInsideSite);
  }

  // Compute exclusion zones from hard constraints
  const exclusionZones = computeExclusionZones(boundary, hardConstraints);

  const summary = buildSummary(hardConstraints, softConstraints, infoConstraints, boundary);

  return {
    hardConstraints,
    softConstraints,
    infoConstraints,
    exclusionZones,
    nearestReceptors: receptors,
    summary,
  };
}

function categorizeElement(
  element: ConstraintElement,
  tags: Record<string, string>,
  coord: LatLng,
  distFromSiteM: number,
  distFromCentroidM: number,
  isInsideSite: boolean,
  _boundary: SiteBoundary,
): DetectedConstraint | null {
  // Environmental - nature reserve
  if (tags.leisure === 'nature_reserve') {
    const def = getConstraintDefinition('nature_reserve')!;
    if (isInsideSite || distFromSiteM < (def.defaultSetbackM ?? 0)) {
      return makeDetected(def, coord, distFromSiteM, distFromCentroidM, element,
        `Nature reserve ${isInsideSite ? 'overlaps with site' : `${Math.round(distFromSiteM)}m from site boundary`}`);
    }
  }

  // Environmental - protected area
  if (tags.boundary === 'protected_area') {
    const def = getConstraintDefinition('protected_area')!;
    if (isInsideSite || distFromSiteM < (def.defaultSetbackM ?? 0)) {
      return makeDetected(def, coord, distFromSiteM, distFromCentroidM, element,
        `Protected area ${isInsideSite ? 'overlaps with site' : `${Math.round(distFromSiteM)}m from site boundary (200m buffer required)`}`);
    }
  }

  // Aviation - airports and helipads
  if (tags.aeroway) {
    const isHelipad = tags.aeroway === 'helipad';
    const defId = isHelipad ? 'helipad' : 'airport';
    const def = getConstraintDefinition(defId)!;
    if (distFromSiteM < (def.defaultSetbackM ?? 0) || isInsideSite) {
      return makeDetected(def, coord, distFromSiteM, distFromCentroidM, element,
        `${tags.aeroway} ${Math.round(distFromSiteM)}m from site boundary (${(def.defaultSetbackM ?? 0) / 1000}km setback required)`);
    }
  }

  // Military
  if (tags.landuse === 'military') {
    const def = getConstraintDefinition('military')!;
    if (isInsideSite) {
      return makeDetected(def, coord, distFromSiteM, distFromCentroidM, element,
        'Military land overlaps with site');
    }
  }

  // Heritage
  if (tags.historic || tags.heritage) {
    const def = getConstraintDefinition('heritage')!;
    if (distFromSiteM < (def.defaultSetbackM ?? 0) || isInsideSite) {
      const name = tags.name ?? tags.historic ?? 'heritage site';
      return makeDetected(def, coord, distFromSiteM, distFromCentroidM, element,
        `${name} ${Math.round(distFromSiteM)}m from site boundary (1km setting impact zone)`);
    }
  }

  // Residential - dwellings
  if (tags.building === 'residential' || tags.building === 'house' || tags.building === 'detached') {
    const def = getConstraintDefinition('dwelling')!;
    if (distFromSiteM < (def.defaultSetbackM ?? 0) || isInsideSite) {
      return makeDetected(def, coord, distFromSiteM, distFromCentroidM, element,
        `Residential dwelling ${Math.round(distFromSiteM)}m from site boundary (500m setback required)`);
    }
  }

  // Residential - settlements
  if (tags.place && ['village', 'town', 'city', 'hamlet'].includes(tags.place)) {
    const def = getConstraintDefinition('settlement')!;
    if (distFromSiteM < (def.defaultSetbackM ?? 0) || isInsideSite) {
      const name = tags.name ?? tags.place;
      return makeDetected(def, coord, distFromSiteM, distFromCentroidM, element,
        `${name} (${tags.place}) ${Math.round(distFromSiteM)}m from site boundary (2km visual impact zone)`);
    }
  }

  // Infrastructure - railway
  if (tags.railway && (tags.railway === 'rail' || tags.railway === 'light_rail')) {
    const def = getConstraintDefinition('railway')!;
    if (distFromSiteM < (def.defaultSetbackM ?? 0) || isInsideSite) {
      return makeDetected(def, coord, distFromSiteM, distFromCentroidM, element,
        `Railway ${Math.round(distFromSiteM)}m from site boundary (150m topple distance)`);
    }
  }

  // Infrastructure - motorway/trunk
  if (tags.highway && (tags.highway === 'motorway' || tags.highway === 'trunk')) {
    const def = getConstraintDefinition('motorway')!;
    if (distFromSiteM < (def.defaultSetbackM ?? 0) || isInsideSite) {
      return makeDetected(def, coord, distFromSiteM, distFromCentroidM, element,
        `${tags.highway} ${Math.round(distFromSiteM)}m from site boundary (150m topple distance)`);
    }
  }

  // Infrastructure - power lines
  if (tags.power === 'line' && tags.voltage) {
    const def = getConstraintDefinition('powerline')!;
    if (distFromSiteM < (def.defaultSetbackM ?? 0) || isInsideSite) {
      return makeDetected(def, coord, distFromSiteM, distFromCentroidM, element,
        `High-voltage line (${tags.voltage}V) ${Math.round(distFromSiteM)}m from site boundary`);
    }
  }

  // Water
  if (tags.natural === 'water' || tags.waterway) {
    const def = getConstraintDefinition('waterbody')!;
    if (distFromSiteM < (def.defaultSetbackM ?? 0) || isInsideSite) {
      const waterType = tags.waterway ?? tags.natural ?? 'water feature';
      return makeDetected(def, coord, distFromSiteM, distFromCentroidM, element,
        `${waterType} ${Math.round(distFromSiteM)}m from site boundary`);
    }
  }

  // Existing wind farms (info only)
  if (tags['generator:source'] === 'wind') {
    const def = getConstraintDefinition('existing_wind')!;
    return makeDetected(def, coord, distFromSiteM, distFromCentroidM, element,
      `Existing wind turbine ${(distFromSiteM / 1000).toFixed(1)}km from site`);
  }

  return null;
}

function makeDetected(
  definition: ReturnType<typeof getConstraintDefinition>,
  location: LatLng,
  distFromSiteM: number,
  distFromCentroidM: number,
  element: ConstraintElement,
  detail: string,
): DetectedConstraint | null {
  if (!definition) return null;
  return {
    definition,
    location,
    distanceFromSiteM: distFromSiteM,
    distanceFromCentroidM: distFromCentroidM,
    osmFeatureId: `${element.type}/${element.id}`,
    detail,
  };
}

function updateReceptors(
  receptors: NearestReceptorTable,
  tags: Record<string, string>,
  distM: number,
  isInside: boolean,
): void {
  const effectiveDistM = isInside ? 0 : distM;

  if (tags.building === 'residential' || tags.building === 'house' || tags.building === 'detached') {
    if (receptors.nearestDwellingM === null || effectiveDistM < receptors.nearestDwellingM) {
      receptors.nearestDwellingM = effectiveDistM;
    }
  }

  if (tags.place && ['village', 'town', 'city', 'hamlet'].includes(tags.place)) {
    if (receptors.nearestSettlementM === null || effectiveDistM < receptors.nearestSettlementM) {
      receptors.nearestSettlementM = effectiveDistM;
    }
  }

  if (tags.leisure === 'nature_reserve' || tags.boundary === 'protected_area') {
    if (receptors.nearestProtectedAreaM === null || effectiveDistM < receptors.nearestProtectedAreaM) {
      receptors.nearestProtectedAreaM = effectiveDistM;
    }
  }

  if (tags.power === 'substation') {
    if (receptors.nearestSubstationM === null || effectiveDistM < receptors.nearestSubstationM) {
      receptors.nearestSubstationM = effectiveDistM;
    }
  }

  if (tags.highway && (tags.highway === 'motorway' || tags.highway === 'trunk' || tags.highway === 'primary')) {
    if (receptors.nearestMajorRoadM === null || effectiveDistM < receptors.nearestMajorRoadM) {
      receptors.nearestMajorRoadM = effectiveDistM;
    }
  }

  if (tags['generator:source'] === 'wind') {
    if (receptors.nearestExistingWindFarmM === null || effectiveDistM < receptors.nearestExistingWindFarmM) {
      receptors.nearestExistingWindFarmM = effectiveDistM;
    }
  }

  if (tags.natural === 'water' || tags.waterway) {
    if (receptors.nearestWaterbodyM === null || effectiveDistM < receptors.nearestWaterbodyM) {
      receptors.nearestWaterbodyM = effectiveDistM;
    }
  }

  if (tags.railway && (tags.railway === 'rail' || tags.railway === 'light_rail')) {
    if (receptors.nearestRailwayM === null || effectiveDistM < receptors.nearestRailwayM) {
      receptors.nearestRailwayM = effectiveDistM;
    }
  }
}

function buildSummary(
  hard: DetectedConstraint[],
  soft: DetectedConstraint[],
  info: DetectedConstraint[],
  _boundary: SiteBoundary,
): ConstraintSummary {
  const totalHard = hard.length;
  const totalSoft = soft.length;
  const totalInfo = info.length;

  let recommendation: ConstraintSummary['recommendation'];
  let topBlocker: string | null = null;
  const reasoningParts: string[] = [];

  if (totalHard > 0) {
    topBlocker = hard[0]!.detail;
    if (totalHard >= 3) {
      recommendation = 'likely_unviable';
      reasoningParts.push(`${totalHard} hard constraints detected, including ${topBlocker}.`);
      reasoningParts.push('Multiple blocking constraints make this site likely unviable for wind development.');
    } else {
      recommendation = 'significant_concerns';
      reasoningParts.push(`${totalHard} hard constraint(s) detected: ${topBlocker}.`);
      reasoningParts.push('These issues require resolution before development can proceed.');
    }
  } else if (totalSoft > 5) {
    recommendation = 'proceed_with_caution';
    reasoningParts.push(`No hard constraints, but ${totalSoft} soft constraints detected.`);
    reasoningParts.push('Significant mitigation measures may be required.');
  } else if (totalSoft > 0) {
    recommendation = 'proceed_with_caution';
    reasoningParts.push(`No hard constraints. ${totalSoft} soft constraint(s) to consider during planning.`);
  } else {
    recommendation = 'proceed';
    reasoningParts.push('No significant constraints detected. Site appears suitable for further assessment.');
  }

  if (totalInfo > 0) {
    reasoningParts.push(`${totalInfo} informational item(s) noted.`);
  }

  return {
    totalHard,
    totalSoft,
    totalInfo,
    viableAreaPercent: 100, // Updated by site-assessment after exclusion calculation
    topBlocker,
    recommendation,
    reasoning: reasoningParts.join(' '),
  };
}
