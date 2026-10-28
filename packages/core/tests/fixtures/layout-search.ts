import type { LatLng } from '../../src/types/analysis.js';
import type { WindDataSummary } from '../../src/types/datasources.js';
import type { SiteBoundary } from '../../src/types/site.js';
import type { TurbineLayoutEstimate, TurbineModel } from '../../src/types/turbines.js';

export const boundary: SiteBoundary = {
  id: 'synthetic-layout-site',
  name: 'Synthetic layout benchmark',
  areaSqKm: 25,
  centroid: { lat: 55.825, lng: -4.26 },
  boundingBox: { south: 55.8, north: 55.85, west: -4.3, east: -4.22 },
  polygon: [
    { lat: 55.8, lng: -4.3 },
    { lat: 55.85, lng: -4.3 },
    { lat: 55.85, lng: -4.22 },
    { lat: 55.8, lng: -4.22 },
  ],
};

export const turbine: TurbineModel = {
  id: 'synthetic-3000',
  manufacturer: 'Synthetic',
  model: '3000',
  ratedPowerKw: 3000,
  rotorDiameterM: 100,
  hubHeightOptionsM: [80],
  cutInSpeedMs: 3,
  ratedSpeedMs: 12,
  cutOutSpeedMs: 25,
  powerCurve: [
    { windSpeedMs: 0, powerKw: 0 },
    { windSpeedMs: 3, powerKw: 0 },
    { windSpeedMs: 5, powerKw: 200 },
    { windSpeedMs: 8, powerKw: 900 },
    { windSpeedMs: 10, powerKw: 1800 },
    { windSpeedMs: 12, powerKw: 3000 },
    { windSpeedMs: 25, powerKw: 3000 },
    { windSpeedMs: 25.1, powerKw: 0 },
  ],
};

export const windData: WindDataSummary = {
  coordinate: boundary.centroid,
  annualAverageSpeedMs: 8,
  speedStdDevMs: 4,
  directionalConsistency: 1,
  prevailingDirectionDeg: 270,
  dataYears: 1,
  referenceHeightM: 80,
  monthlyAverages: Array.from({ length: 12 }, (_, i) => ({
    month: i + 1,
    averageSpeedMs: 8,
    averageDirectionDeg: 270,
  })),
};

export function makeLayout(positions: LatLng[]): TurbineLayoutEstimate {
  return {
    positions,
    turbineCount: positions.length,
    spacingCrosswindM: 400,
    spacingDownwindM: 700,
    prevailingWindDeg: 270,
    viableAreaSqKm: 25,
    estimatedInstalledCapacityMw: positions.length * 3,
  };
}

export function candidateGrid(count: number): LatLng[] {
  const columns = Math.ceil(Math.sqrt(count));
  return Array.from({ length: count }, (_, i) => ({
    lat: 55.805 + Math.floor(i / columns) * 0.003,
    lng: -4.295 + (i % columns) * 0.005,
  }));
}

export const inlineLayout = makeLayout([
  { lat: 55.825, lng: -4.27 },
  { lat: 55.825, lng: -4.264 },
]);
