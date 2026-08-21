import type { ConstraintDefinition } from '../types/constraints.js';

export const CONSTRAINT_DEFINITIONS: ConstraintDefinition[] = [
  // Environmental
  {
    id: 'nature_reserve',
    name: 'Nature Reserve (OSM screening)',
    severity: 'hard',
    category: 'environmental',
    defaultSetbackM: 0,
    description:
      'OpenStreetMap indicates a nature reserve overlap. Verify against the relevant statutory register before making a planning decision.',
  },
  {
    id: 'protected_area',
    name: 'Protected Area (OSM screening)',
    severity: 'hard',
    category: 'environmental',
    defaultSetbackM: 200,
    description:
      'OpenStreetMap indicates a protected-area feature. This does not establish SSSI, SAC, SPA, or other statutory status; the 200m buffer is a screening assumption.',
  },
  // Aviation
  {
    id: 'airport',
    name: 'Airport / Airfield',
    severity: 'hard',
    category: 'aviation',
    defaultSetbackM: 5000,
    description: 'Within 5km of an airport or airfield. Aviation safety constraint.',
  },
  {
    id: 'helipad',
    name: 'Helipad',
    severity: 'hard',
    category: 'aviation',
    defaultSetbackM: 2000,
    description: 'Within 2km of a helipad. Aviation safety constraint.',
  },
  // Military
  {
    id: 'military',
    name: 'Military Land',
    severity: 'hard',
    category: 'military',
    defaultSetbackM: 0,
    description: 'Site overlaps with military land. Access and development restricted.',
  },
  // Heritage
  {
    id: 'heritage',
    name: 'Listed Building / Heritage Site',
    severity: 'soft',
    category: 'heritage',
    defaultSetbackM: 1000,
    description:
      'Historic monument or heritage site within 1km. May affect planning approval due to setting impact.',
  },
  // Residential
  {
    id: 'dwelling',
    name: 'Residential Dwelling',
    severity: 'soft',
    category: 'residential',
    defaultSetbackM: 500,
    description: 'Residential dwelling within 500m setback. Noise and visual impact concern.',
  },
  {
    id: 'settlement',
    name: 'Settlement Boundary',
    severity: 'soft',
    category: 'residential',
    defaultSetbackM: 2000,
    description: 'Village, town or city within 2km. Visual impact and cumulative noise concern.',
  },
  // Infrastructure
  {
    id: 'railway',
    name: 'Railway',
    severity: 'soft',
    category: 'infrastructure',
    defaultSetbackM: 150,
    description: 'Railway within 150m (topple distance constraint).',
  },
  {
    id: 'motorway',
    name: 'Motorway / Trunk Road',
    severity: 'soft',
    category: 'infrastructure',
    defaultSetbackM: 150,
    description: 'Major road within 150m (topple distance constraint).',
  },
  {
    id: 'powerline',
    name: 'High-voltage Power Line',
    severity: 'soft',
    category: 'infrastructure',
    defaultSetbackM: 150,
    description: 'High-voltage line within 150m (crossing restriction).',
  },
  // Water
  {
    id: 'waterbody',
    name: 'Waterbody',
    severity: 'soft',
    category: 'water',
    defaultSetbackM: 50,
    description: 'River, lake or canal within 50m. Foundation risk.',
  },
  {
    id: 'flood_zone',
    name: 'Flood Zone',
    severity: 'hard',
    category: 'water',
    defaultSetbackM: 0,
    description:
      'Reserved for a verified flood-zone dataset. OpenStreetMap screening does not determine statutory flood risk.',
  },
  // Terrain
  {
    id: 'steep_slope',
    name: 'Steep Slope (>15%)',
    severity: 'hard',
    category: 'terrain',
    defaultSetbackM: 0,
    description:
      'Reserved for a validated terrain analysis. Point elevation samples do not establish construction suitability.',
  },
  // Info-level
  {
    id: 'existing_wind',
    name: 'Existing Wind Farm',
    severity: 'info',
    category: 'infrastructure',
    defaultSetbackM: 0,
    description:
      'Existing wind installation nearby. Provides planning precedent but may create wake interference.',
  },
];

/**
 * Look up a constraint definition by ID.
 */
export function getConstraintDefinition(id: string): ConstraintDefinition | undefined {
  return CONSTRAINT_DEFINITIONS.find((d) => d.id === id);
}

/**
 * Get the maximum setback distance across all constraint definitions.
 * Used to determine how far to expand the Overpass bounding box.
 */
export function getMaxSetbackKm(): number {
  let maxM = 0;
  for (const def of CONSTRAINT_DEFINITIONS) {
    if (def.defaultSetbackM && def.defaultSetbackM > maxM) {
      maxM = def.defaultSetbackM;
    }
  }
  return maxM / 1000;
}
