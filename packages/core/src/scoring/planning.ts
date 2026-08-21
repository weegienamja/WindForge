import type { FactorScore, Confidence } from '../types/analysis.js';
import { ScoringFactor } from '../types/analysis.js';
import type { ScoringError } from '../types/errors.js';
import type { Result } from '../types/result.js';
import { ok } from '../types/result.js';
import { clamp } from '../utils/geo.js';
import type { NearbyWindFarm } from '../datasources/osm-overpass.js';
import type { ReverseGeocodeResult } from '../datasources/nominatim.js';

// Countries with generally favourable wind energy planning frameworks
const FAVOURABLE_COUNTRIES = new Set([
  'GB',
  'DE',
  'DK',
  'NL',
  'SE',
  'NO',
  'IE',
  'ES',
  'PT',
  'US',
  'CA',
  'AU',
  'FR',
  'BE',
  'AT',
  'FI',
  'EE',
  'LT',
  'LV',
  'PL',
  'IT',
  'GR',
]);

export interface PlanningInputs {
  geocode: ReverseGeocodeResult | null;
  nearbyWindFarms: NearbyWindFarm[];
  residentialDensityProxy: number; // count of residential/commercial land use tags within 5km
}

export function scorePlanning(
  inputs: PlanningInputs,
  weight: number,
): Result<FactorScore, ScoringError> {
  let score = 50; // base neutral score
  let confidence: Confidence = 'low';
  const signals: string[] = [];

  // Country context
  if (inputs.geocode) {
    confidence = 'medium';
    if (FAVOURABLE_COUNTRIES.has(inputs.geocode.countryCode)) {
      score += 10;
      signals.push(`${inputs.geocode.country} has a generally favourable wind energy framework`);
    } else if (inputs.geocode.countryCode) {
      signals.push(`Planning context for ${inputs.geocode.country} not specifically assessed`);
    }
  }

  // Existing wind farms (planning precedent)
  if (inputs.nearbyWindFarms.length > 0) {
    const nearest = inputs.nearbyWindFarms[0]!;
    if (nearest.distanceKm < 5) {
      score += 20;
      signals.push(`Wind farm ${nearest.distanceKm.toFixed(1)}km away (strong planning precedent)`);
    } else if (nearest.distanceKm < 10) {
      score += 15;
      signals.push(`Wind farm ${nearest.distanceKm.toFixed(1)}km away (planning precedent exists)`);
    } else {
      score += 8;
      signals.push(`Wind farm ${nearest.distanceKm.toFixed(1)}km away`);
    }
    if (inputs.nearbyWindFarms.length > 3) {
      score += 5;
      signals.push(`${inputs.nearbyWindFarms.length} wind installations within 20km`);
    }
  } else {
    signals.push('No existing wind installations found within 20km');
  }

  // Population density proxy
  if (inputs.residentialDensityProxy > 20) {
    score -= 15;
    signals.push('High density area (many residential/commercial areas nearby)');
  } else if (inputs.residentialDensityProxy > 5) {
    score -= 5;
    signals.push('Moderate density area');
  } else {
    score += 5;
    signals.push('Low density area (favourable for planning)');
  }

  score = Math.round(clamp(score, 0, 100));

  const detail =
    `Estimated planning feasibility based on proximity to existing wind installations, population density, and regional context. ` +
    signals.join('. ') +
    '. ' +
    'This is not a substitute for formal planning assessment.';

  return ok({
    factor: ScoringFactor.PlanningFeasibility,
    score,
    weight,
    weightedScore: score * weight,
    detail,
    dataSource: 'OSM Nominatim, Overpass API (wind farms, land use density)',
    confidence,
  });
}
