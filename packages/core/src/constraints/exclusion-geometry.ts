import type { SiteBoundary } from '../types/site.js';
import type { DetectedConstraint, ExclusionZone } from '../types/constraints.js';
import { circleBufferPolygon, isPointInPolygon, polygonOverlapAreaSqKm } from '../utils/geometry.js';

/**
 * Compute exclusion zones within a site boundary based on detected hard constraints.
 *
 * For each hard constraint with a setback distance, creates a buffer circle
 * around the constraint feature and intersects it with the site boundary
 * to determine the excluded area within the site.
 */
export function computeExclusionZones(
  boundary: SiteBoundary,
  hardConstraints: DetectedConstraint[],
): ExclusionZone[] {
  const zones: ExclusionZone[] = [];

  for (const constraint of hardConstraints) {
    const setbackM = constraint.definition.defaultSetbackM ?? 0;

    // For features inside the site with no setback, the feature itself is the exclusion
    if (setbackM === 0 && isPointInPolygon(constraint.location, boundary.polygon)) {
      // Create a small exclusion zone around the point (100m radius for point features)
      const bufferPoly = circleBufferPolygon(constraint.location, 100, 16);
      const overlapArea = polygonOverlapAreaSqKm(boundary.polygon, bufferPoly);

      if (overlapArea > 0) {
        zones.push({
          reason: constraint.definition.name,
          polygon: bufferPoly,
          areaSqKm: overlapArea,
        });
      }
      continue;
    }

    // For features with a setback, create a buffer circle and intersect with site
    if (setbackM > 0) {
      const bufferPoly = circleBufferPolygon(constraint.location, setbackM, 32);
      const overlapArea = polygonOverlapAreaSqKm(boundary.polygon, bufferPoly);

      if (overlapArea > 0) {
        zones.push({
          reason: `${constraint.definition.name} (${setbackM}m setback)`,
          polygon: bufferPoly,
          areaSqKm: overlapArea,
        });
      }
    }
  }

  return zones;
}
