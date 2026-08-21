// Directional wake loss calculator
//
// Integrates wake models (Jensen or Bastankhah) with the full wind rose
// to compute directionally-weighted wake losses for a wind farm layout.

import type { TurbineModel, PowerCurvePoint } from '../types/turbines.js';
import type { WindDataSummary } from '../types/datasources.js';
import type {
  TurbinePosition,
  WakeModelType,
  WakeOptions,
  WakeLossResult,
  TurbineWakeResult,
  SectorWakeResult,
} from '../types/wake.js';
import type { LatLng } from '../types/analysis.js';
import {
  wakeDecayFromRoughness,
  computeJensenWakeField,
  generateThrustCurveFromPower,
} from './jensen-wake.js';
import { bastankhahExpansionFromRoughness, computeBastankhahWakeField } from './bastankhah-wake.js';

const HOURS_PER_YEAR = 8760;
const DEFAULT_SECTOR_COUNT = 36;

/**
 * Build directional wind frequency distribution from wind data.
 * Returns array of { directionDeg, frequency, meanSpeedMs } per sector.
 */
export function buildWindRose(
  windData: WindDataSummary,
  sectorCount: number = DEFAULT_SECTOR_COUNT,
): Array<{ directionDeg: number; frequency: number; meanSpeedMs: number }> {
  const sectorWidth = 360 / sectorCount;
  const sectors = Array.from({ length: sectorCount }, (_, i) => ({
    directionDeg: i * sectorWidth,
    frequency: 0,
    meanSpeedMs: 0,
    speedSum: 0,
    count: 0,
  }));

  // Distribute monthly data into directional sectors
  for (const monthly of windData.monthlyAverages) {
    const dir = ((monthly.averageDirectionDeg % 360) + 360) % 360;
    const sectorIdx = Math.floor(dir / sectorWidth) % sectorCount;
    const sector = sectors[sectorIdx]!;
    sector.speedSum += monthly.averageSpeedMs;
    sector.count += 1;
  }

  // If we have very few direction sectors populated (e.g., only 12 months of data),
  // distribute remaining frequency proportionally
  const totalCount = sectors.reduce((s, sec) => s + sec.count, 0);

  if (totalCount === 0) {
    // No directional data: assume uniform distribution
    const uniformFreq = 1 / sectorCount;
    return sectors.map((sec) => ({
      directionDeg: sec.directionDeg,
      frequency: uniformFreq,
      meanSpeedMs: windData.annualAverageSpeedMs,
    }));
  }

  for (const sector of sectors) {
    sector.frequency = sector.count / totalCount;
    sector.meanSpeedMs =
      sector.count > 0 ? sector.speedSum / sector.count : windData.annualAverageSpeedMs;
  }

  // Smooth out very sparse distributions by adding a small baseline
  // This prevents zero-frequency sectors from being unrealistically ignored
  const minFreq = 0.005;
  let redistributed = 0;
  for (const sector of sectors) {
    if (sector.frequency < minFreq && sector.frequency > 0) {
      redistributed += minFreq - sector.frequency;
      sector.frequency = minFreq;
    }
  }
  // Redistribute excess from largest sectors
  if (redistributed > 0) {
    const maxSectors = sectors.filter((s) => s.frequency > minFreq);
    const reduction = redistributed / maxSectors.length;
    for (const s of maxSectors) {
      s.frequency = Math.max(minFreq, s.frequency - reduction);
    }
  }

  // Normalise frequencies to sum to 1
  const totalFreq = sectors.reduce((s, sec) => s + sec.frequency, 0);
  if (totalFreq > 0) {
    for (const sector of sectors) {
      sector.frequency /= totalFreq;
    }
  }

  return sectors.map((sec) => ({
    directionDeg: sec.directionDeg,
    frequency: sec.frequency,
    meanSpeedMs: sec.meanSpeedMs,
  }));
}

/**
 * Interpolate power from a turbine's power curve at a given wind speed.
 */
function interpolatePower(powerCurve: PowerCurvePoint[], windSpeedMs: number): number {
  if (powerCurve.length === 0) return 0;
  if (windSpeedMs <= powerCurve[0]!.windSpeedMs) return powerCurve[0]!.powerKw;

  const last = powerCurve[powerCurve.length - 1]!;
  if (windSpeedMs >= last.windSpeedMs) return last.powerKw;

  for (let i = 0; i < powerCurve.length - 1; i++) {
    const p0 = powerCurve[i]!;
    const p1 = powerCurve[i + 1]!;
    if (windSpeedMs >= p0.windSpeedMs && windSpeedMs <= p1.windSpeedMs) {
      const frac = (windSpeedMs - p0.windSpeedMs) / (p1.windSpeedMs - p0.windSpeedMs);
      return p0.powerKw + frac * (p1.powerKw - p0.powerKw);
    }
  }

  return 0;
}

/**
 * Calculate directional wake losses for a wind farm layout.
 *
 * For each wind direction sector:
 * 1. Compute wake field using the selected model
 * 2. Calculate power output at each turbine from effective wind speed
 * 3. Weight by sector frequency
 *
 * Sum across all sectors to get total wake-adjusted AEP.
 */
export function calculateDirectionalWakeLoss(
  layout: TurbinePosition[],
  turbine: TurbineModel,
  windData: WindDataSummary,
  model: WakeModelType = 'jensen',
  options: WakeOptions = {},
): WakeLossResult {
  if (layout.length === 0) {
    return emptyResult(model);
  }

  if (layout.length === 1) {
    return singleTurbineResult(layout[0]!, turbine, windData, model);
  }

  const sectorCount = options.sectorCount ?? DEFAULT_SECTOR_COUNT;
  const roughnessClass = options.roughnessClass ?? 1;

  // Get or generate thrust curve
  const thrustCurve =
    turbine.thrustCurve ?? generateThrustCurveFromPower(turbine.powerCurve, turbine.rotorDiameterM);

  // Determine model-specific decay/expansion parameter
  const decayConstant =
    model === 'bastankhah'
      ? (options.wakeDecayConstant ?? bastankhahExpansionFromRoughness(roughnessClass))
      : (options.wakeDecayConstant ?? wakeDecayFromRoughness(roughnessClass));

  // Build wind rose
  const windRose = buildWindRose(windData, sectorCount);

  // Per-turbine accumulators
  const n = layout.length;
  const freeStreamAep = new Array<number>(n).fill(0);
  const wakedAep = new Array<number>(n).fill(0);
  const sectorResults: SectorWakeResult[] = [];

  for (const sector of windRose) {
    if (sector.frequency <= 0) continue;

    const sectorSpeedMs = sector.meanSpeedMs;
    if (sectorSpeedMs <= 0) continue;

    // Compute wake field for this direction
    const wakeField =
      model === 'bastankhah'
        ? computeBastankhahWakeField(
            layout,
            sectorSpeedMs,
            sector.directionDeg,
            thrustCurve,
            decayConstant,
          )
        : computeJensenWakeField(
            layout,
            sectorSpeedMs,
            sector.directionDeg,
            thrustCurve,
            decayConstant,
          );

    // Calculate power at each turbine
    const powerOutputKw = wakeField.effectiveSpeedMs.map((speed) =>
      interpolatePower(turbine.powerCurve, speed),
    );

    const freeStreamPowerKw = interpolatePower(turbine.powerCurve, sectorSpeedMs);
    const sectorHours = HOURS_PER_YEAR * sector.frequency;

    // Accumulate AEP contributions
    for (let i = 0; i < n; i++) {
      freeStreamAep[i]! += (freeStreamPowerKw * sectorHours) / 1000; // MWh
      wakedAep[i]! += (powerOutputKw[i]! * sectorHours) / 1000; // MWh
    }

    sectorResults.push({
      directionDeg: sector.directionDeg,
      frequencyWeight: sector.frequency,
      effectiveSpeedMs: wakeField.effectiveSpeedMs,
      powerOutputKw,
      deficits: wakeField.deficits,
    });
  }

  // Build per-turbine results
  const perTurbineResults: TurbineWakeResult[] = layout.map((pos, i) => {
    const freeAep = freeStreamAep[i]!;
    const wakedAepVal = wakedAep[i]!;
    const lossPct = freeAep > 0 ? ((freeAep - wakedAepVal) / freeAep) * 100 : 0;

    return {
      turbineId: pos.id,
      location: pos.location,
      freeStreamAepMwh: round2(freeAep),
      wakeAdjustedAepMwh: round2(wakedAepVal),
      wakeLossPercent: round2(lossPct),
      efficiency: freeAep > 0 ? round4(wakedAepVal / freeAep) : 1,
    };
  });

  const grossFarmAepMwh = freeStreamAep.reduce((s, v) => s + v, 0);
  const wakeAdjustedFarmAepMwh = wakedAep.reduce((s, v) => s + v, 0);
  const wakeLossPercent =
    grossFarmAepMwh > 0 ? ((grossFarmAepMwh - wakeAdjustedFarmAepMwh) / grossFarmAepMwh) * 100 : 0;
  const farmEfficiency = grossFarmAepMwh > 0 ? wakeAdjustedFarmAepMwh / grossFarmAepMwh : 1;

  const modelName = model === 'bastankhah' ? 'Bastankhah Gaussian' : 'Jensen/Park';
  const summary = [
    `Wake analysis using ${modelName} model (decay constant: ${decayConstant.toFixed(3)}).`,
    `Farm efficiency: ${(farmEfficiency * 100).toFixed(1)}%.`,
    `Total wake loss: ${wakeLossPercent.toFixed(1)}% across ${n} turbines.`,
    `Gross farm AEP: ${round2(grossFarmAepMwh)} MWh.`,
    `Wake-adjusted farm AEP: ${round2(wakeAdjustedFarmAepMwh)} MWh.`,
  ].join(' ');

  return {
    model,
    grossFarmAepMwh: round2(grossFarmAepMwh),
    wakeAdjustedFarmAepMwh: round2(wakeAdjustedFarmAepMwh),
    wakeLossPercent: round2(wakeLossPercent),
    farmEfficiency: round4(farmEfficiency),
    perTurbineResults,
    sectorResults,
    wakeDecayConstant: decayConstant,
    summary,
  };
}

/**
 * Convert turbine layout positions to TurbinePosition format.
 */
export function layoutToTurbinePositions(
  positions: LatLng[],
  turbine: TurbineModel,
  hubHeightM?: number,
): TurbinePosition[] {
  const height = hubHeightM ?? turbine.hubHeightOptionsM[0] ?? 80;
  return positions.map((location, i) => ({
    id: i,
    location,
    hubHeightM: height,
    rotorDiameterM: turbine.rotorDiameterM,
  }));
}

function emptyResult(model: WakeModelType): WakeLossResult {
  return {
    model,
    grossFarmAepMwh: 0,
    wakeAdjustedFarmAepMwh: 0,
    wakeLossPercent: 0,
    farmEfficiency: 1,
    perTurbineResults: [],
    sectorResults: [],
    wakeDecayConstant: 0,
    summary: 'No turbines in layout.',
  };
}

function singleTurbineResult(
  position: TurbinePosition,
  turbine: TurbineModel,
  windData: WindDataSummary,
  model: WakeModelType,
): WakeLossResult {
  // Single turbine has no wake losses
  let totalAepMwh = 0;
  for (const monthly of windData.monthlyAverages) {
    const power = interpolatePower(turbine.powerCurve, monthly.averageSpeedMs);
    const daysInMonth = [31, 28.25, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31];
    const monthIdx = monthly.month - 1;
    const hours = (daysInMonth[monthIdx] ?? 30) * 24;
    totalAepMwh += (power * hours) / 1000;
  }

  return {
    model,
    grossFarmAepMwh: round2(totalAepMwh),
    wakeAdjustedFarmAepMwh: round2(totalAepMwh),
    wakeLossPercent: 0,
    farmEfficiency: 1,
    perTurbineResults: [
      {
        turbineId: position.id,
        location: position.location,
        freeStreamAepMwh: round2(totalAepMwh),
        wakeAdjustedAepMwh: round2(totalAepMwh),
        wakeLossPercent: 0,
        efficiency: 1,
      },
    ],
    sectorResults: [],
    wakeDecayConstant: 0,
    summary: `Single turbine - no wake losses. AEP: ${round2(totalAepMwh)} MWh.`,
  };
}

function round2(n: number): number {
  return Math.round(n * 100) / 100;
}

function round4(n: number): number {
  return Math.round(n * 10000) / 10000;
}
