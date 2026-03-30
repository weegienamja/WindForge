import type { LatLng } from '../types/analysis.js';
import type { SiteBoundary } from '../types/site.js';
import type { TurbineModel, TurbineLayoutEstimate } from '../types/turbines.js';
import type { ExclusionZone } from '../types/constraints.js';
import type { WindDataSummary } from '../types/datasources.js';
import {
  rotateGrid,
  isPointInPolygon,
  polygonCentroid,
} from '../utils/geometry.js';

/**
 * Estimate how many turbines can fit within a site boundary.
 *
 * Layout rules:
 * - 4D crosswind spacing (4 x rotor diameter)
 * - 7D downwind spacing (7 x rotor diameter)
 * - Grid aligned to prevailing wind direction
 * - Positions inside exclusion zones are removed
 * - Positions must be inside the site boundary polygon
 */
export function estimateTurbineCapacity(
  boundary: SiteBoundary,
  turbine: TurbineModel,
  windData: WindDataSummary,
  exclusionZones: ExclusionZone[] = [],
): TurbineLayoutEstimate {
  const rotorD = turbine.rotorDiameterM;

  // Spacing in metres
  const spacingCrosswindM = 4 * rotorD;
  const spacingDownwindM = 7 * rotorD;

  // Convert spacing to km for grid generation
  const spacingCrosswindKm = spacingCrosswindM / 1000;
  const spacingDownwindKm = spacingDownwindM / 1000;

  // Prevailing wind direction
  const prevailingWindDeg = windData.prevailingDirectionDeg ?? 270;

  // Generate grid with downwind spacing in the N-S direction, crosswind in E-W
  // Then rotate to align with prevailing wind
  const rawGrid = generateRectangularGrid(boundary.polygon, spacingCrosswindKm, spacingDownwindKm);

  // Rotate grid so downwind direction aligns with prevailing wind
  const center = polygonCentroid(boundary.polygon);
  const rotatedGrid = rotateGrid(rawGrid, center, prevailingWindDeg - 180);

  // Filter: keep only points inside the boundary and not in exclusion zones
  const validPositions = rotatedGrid.filter((pos) => {
    if (!isPointInPolygon(pos, boundary.polygon)) return false;

    for (const zone of exclusionZones) {
      if (isPointInPolygon(pos, zone.polygon)) return false;
    }

    return true;
  });

  // Compute viable area (total area minus exclusion zones)
  let excludedAreaSqKm = 0;
  for (const zone of exclusionZones) {
    excludedAreaSqKm += zone.areaSqKm;
  }
  const viableAreaSqKm = Math.max(0, boundary.areaSqKm - excludedAreaSqKm);

  const turbineCount = validPositions.length;
  const estimatedInstalledCapacityMw = (turbineCount * turbine.ratedPowerKw) / 1000;

  return {
    positions: validPositions,
    turbineCount,
    spacingCrosswindM,
    spacingDownwindM,
    prevailingWindDeg,
    viableAreaSqKm,
    estimatedInstalledCapacityMw,
  };
}

/**
 * Generate a rectangular grid within a polygon with different X/Y spacing.
 * X = crosswind spacing, Y = downwind spacing.
 */
function generateRectangularGrid(
  polygon: LatLng[],
  spacingXKm: number,
  spacingYKm: number,
): LatLng[] {
  if (polygon.length < 3) return [];

  // Compute bounding box
  let north = -90;
  let south = 90;
  let east = -180;
  let west = 180;

  for (const p of polygon) {
    if (p.lat > north) north = p.lat;
    if (p.lat < south) south = p.lat;
    if (p.lng > east) east = p.lng;
    if (p.lng < west) west = p.lng;
  }

  const midLat = (north + south) / 2;
  const cosLat = Math.cos((midLat * Math.PI) / 180);

  const latStepDeg = spacingYKm / 111.32;
  const lngStepDeg = spacingXKm / (111.32 * cosLat);

  const points: LatLng[] = [];

  for (let lat = south + latStepDeg / 2; lat < north; lat += latStepDeg) {
    for (let lng = west + lngStepDeg / 2; lng < east; lng += lngStepDeg) {
      const point: LatLng = { lat, lng };
      if (isPointInPolygon(point, polygon)) {
        points.push(point);
      }
    }
  }

  return points;
}
