import type { LatLng } from '../types/analysis.js';
import type { ExclusionZone } from '../types/constraints.js';
import { ScoringErrorCode, scoringError, type ScoringError } from '../types/errors.js';
import { err, ok, type Result } from '../types/result.js';
import type { SiteBoundary } from '../types/site.js';
import { distanceKm } from '../utils/geo.js';
import {
  integerInRange,
  isValidPosition,
  validCoordinate,
  validLayoutGeometry,
} from './layout-constraints.js';

export interface CandidateLayoutSearchOptions {
  /** Search states, including terminal states. Default 20,000; maximum 1,000,000. */
  maxSearchNodes?: number;
  /** Maximum number of retained starting layouts. Default 8; maximum 16. */
  maxLayouts?: number;
  /** Unsigned 32-bit seed for traversal and reservoir selection. Default 1. */
  seed?: number;
}

export interface CandidateLayoutSearchResult {
  layouts: LatLng[][];
  inputCandidateCount: number;
  candidateCount: number;
  excludedCandidateCount: number;
  duplicateCandidateCount: number;
  conflictCount: number;
  searchNodes: number;
  /** Exact only when countIsExact is true; otherwise a lower bound. */
  feasibleLayoutCount: number;
  countIsExact: boolean;
  status: 'complete' | 'search-limit';
}

/**
 * Enumerate fixed-cardinality independent sets in the candidate spacing graph.
 * Input is capped at 128 points. Duplicate coordinates count as one location.
 * Retains a reproducible reservoir of visited solutions, not a guaranteed uniform
 * sample of all feasible layouts. No AEP objective or subexponential claim.
 */
export function findCandidateLayouts(
  candidatePositions: LatLng[],
  boundary: SiteBoundary,
  turbineCount: number,
  minSpacingM: number,
  exclusionZones: ExclusionZone[] = [],
  options: CandidateLayoutSearchOptions = {},
): Result<CandidateLayoutSearchResult, ScoringError> {
  const maxSearchNodes = options.maxSearchNodes ?? 20_000;
  const maxLayouts = options.maxLayouts ?? 8;
  const seed = options.seed ?? 1;
  if (
    candidatePositions.length > 128 ||
    !candidatePositions.every(validCoordinate) ||
    !validLayoutGeometry(boundary, exclusionZones) ||
    !integerInRange(turbineCount, 0, 128) ||
    !Number.isFinite(minSpacingM) ||
    minSpacingM <= 0 ||
    !integerInRange(maxSearchNodes, 1, 1_000_000) ||
    !integerInRange(maxLayouts, 1, 16) ||
    !integerInRange(seed, 0, 0xffff_ffff)
  ) {
    return err(
      scoringError(
        ScoringErrorCode.Configuration,
        'Use at most 128 valid candidate coordinates, valid polygon rings, 0-128 turbines, positive finite spacing, 1-1,000,000 search nodes, 1-16 layouts and an unsigned 32-bit seed.',
      ),
    );
  }

  const candidates: LatLng[] = [];
  const seen = new Set<string>();
  let excludedCandidateCount = 0;
  let duplicateCandidateCount = 0;
  for (const position of candidatePositions) {
    const key = `${position.lat},${position.lng}`;
    if (seen.has(key)) {
      duplicateCandidateCount++;
      continue;
    }
    seen.add(key);
    if (!isValidPosition(position, boundary, exclusionZones)) {
      excludedCandidateCount++;
      continue;
    }
    candidates.push({ ...position });
  }

  const conflicts = candidates.map(() => new Set<number>());
  let conflictCount = 0;
  for (let i = 0; i < candidates.length; i++) {
    for (let j = i + 1; j < candidates.length; j++) {
      if (distanceKm(candidates[i]!, candidates[j]!) < minSpacingM / 1000) {
        conflicts[i]!.add(j);
        conflicts[j]!.add(i);
        conflictCount++;
      }
    }
  }

  // Mulberry32: deterministic local state, never touches Math.random.
  let state = seed;
  const random = () => {
    state = (state + 0x6d2b79f5) >>> 0;
    let value = Math.imul(state ^ (state >>> 15), state | 1);
    value ^= value + Math.imul(value ^ (value >>> 7), value | 61);
    return ((value ^ (value >>> 14)) >>> 0) / 0x1_0000_0000;
  };
  const order = candidates.map((_, index) => index);
  for (let i = order.length - 1; i > 0; i--) {
    const j = Math.floor(random() * (i + 1));
    [order[i], order[j]] = [order[j]!, order[i]!];
  }

  let searchNodes = 0;
  let feasibleLayoutCount = 0;
  let limited = false;
  const retained: number[][] = [];
  const selected: number[] = [];
  const visit = (available: number[]) => {
    if (searchNodes >= maxSearchNodes) {
      limited = true;
      return;
    }
    searchNodes++;
    if (selected.length === turbineCount) {
      feasibleLayoutCount++;
      const slot =
        retained.length < maxLayouts ? retained.length : Math.floor(random() * feasibleLayoutCount);
      if (slot < maxLayouts) retained[slot] = [...selected].sort((a, b) => a - b);
      return;
    }
    const needed = turbineCount - selected.length;
    for (let i = 0; i <= available.length - needed; i++) {
      const candidate = available[i]!;
      const rest = available.slice(i + 1).filter((other) => !conflicts[candidate]!.has(other));
      if (rest.length < needed - 1) continue;
      selected.push(candidate);
      visit(rest);
      selected.pop();
      if (limited) return;
    }
  };
  visit(order);

  return ok({
    layouts: retained.map((indices) => indices.map((index) => ({ ...candidates[index]! }))),
    inputCandidateCount: candidatePositions.length,
    candidateCount: candidates.length,
    excludedCandidateCount,
    duplicateCandidateCount,
    conflictCount,
    searchNodes,
    feasibleLayoutCount,
    countIsExact: !limited,
    status: limited ? 'search-limit' : 'complete',
  });
}
