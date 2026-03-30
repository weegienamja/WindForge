export { CONSTRAINT_DEFINITIONS, getConstraintDefinition, getMaxSetbackKm } from './constraint-definitions.js';
export { detectConstraints } from './constraint-detector.js';
export { fetchConstraintData, clearConstraintCache, getElementCoordinate } from './constraint-queries.js';
export type { ConstraintOverpassResponse, ConstraintElement } from './constraint-queries.js';
export { computeExclusionZones } from './exclusion-geometry.js';
