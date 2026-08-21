import type { SiteBoundary } from '../types/site.js';
import type { DetectedConstraint, ExclusionZone } from '../types/constraints.js';
import { bufferAndClipGeometry } from '../utils/feature-geometry.js';

/**
 * Compute zones within a site boundary from configured screening exclusions.
 *
 * Each source feature is buffered in its real geometry, then clipped to the
 * site. Polygon holes and separate multipolygon parts remain separate zones.
 */
export function computeExclusionZones(
  boundary: SiteBoundary,
  hardConstraints: DetectedConstraint[],
): ExclusionZone[] {
  const zones: ExclusionZone[] = [];

  for (const constraint of hardConstraints) {
    const configuredSetbackM = constraint.definition.defaultSetbackM ?? 0;
    // A point has no area. Give zero-setback point constraints an explicit,
    // conservative screening footprint instead of silently excluding nothing.
    const effectiveSetbackM =
      configuredSetbackM === 0 && constraint.geometry.type === 'Point' ? 100 : configuredSetbackM;

    for (const clipped of bufferAndClipGeometry(constraint.geometry, boundary, effectiveSetbackM)) {
      zones.push({
        reason:
          configuredSetbackM > 0
            ? `${constraint.definition.name} (${configuredSetbackM}m setback)`
            : constraint.definition.name,
        polygon: clipped.polygon,
        holes: clipped.holes,
        areaSqKm: clipped.areaSqKm,
      });
    }
  }

  return zones;
}
