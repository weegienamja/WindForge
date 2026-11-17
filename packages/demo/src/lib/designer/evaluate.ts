import {
  calculateAep,
  calculateNoiseAtReceptor,
  calculateShadowFlicker,
  distanceKm,
  generateCashflow,
  calculateLcoe,
  createBoundary,
  isValidPosition,
  isPointInPolygon,
} from '@jamieblair/windforge-core';
import { designerTurbine } from './turbines';
import type { Layout, Project } from './project';

export function evaluateLayout(project: Project, layout: Layout) {
  const { positions, hub } = layout;
  const turbine = designerTurbine(layout.turbineId)!;
  const count = positions.length;
  const messages: string[] = [];
  let spacing = Infinity;
  const parcel = createBoundary(project.boundary);
  positions.forEach((p, i) => {
    if (!isPointInPolygon(p, project.boundary))
      messages.push('T' + (i + 1) + ' is outside the parcel.');
    else if (project.screen && !isValidPosition(p, parcel, project.screen.zones))
      messages.push('T' + (i + 1) + ' lies in a mapped parcel exclusion.');
    for (const other of positions.slice(0, i))
      spacing = Math.min(spacing, distanceKm(p, other) * 1000);
  });
  if (spacing < turbine.rotorDiameterM) messages.push('Rotor discs overlap at the closest pair.');
  if (!count) messages.push('Place a turbine to calculate this layout.');
  const valid = count > 0 && !messages.length;
  const receptor = project.receptor;
  const towers = positions.map((location, id) => ({
    location,
    id,
    hubHeightM: hub,
    rotorDiameterM: turbine.rotorDiameterM,
  }));
  const noise =
    valid && receptor && turbine.soundPowerLevelDba !== undefined
      ? calculateNoiseAtReceptor(towers, receptor, turbine.soundPowerLevelDba, hub)
          .predictedLevelDba
      : null;
  if (valid && receptor && turbine.soundPowerLevelDba === undefined)
    messages.push('Reference design has no published acoustic input. Receptor sound withheld.');
  const shadow =
    valid && receptor
      ? (calculateShadowFlicker(towers, [receptor], { year: 2025, receptorHeightM: 2 }).receptors[0]
          ?.hoursPerYear ?? null)
      : null;
  const evidence = project.evidence;
  const result =
    valid && evidence?.wind
      ? calculateAep(evidence.wind, turbine, {
          hubHeightM: hub,
          turbineCount: count,
          windShearAlpha: evidence.shear,
          wakeModel: 'jensen',
          layoutPositions: positions,
        })
      : null;
  if (result && !result.ok) messages.push(result.error.message);
  if (valid && !evidence?.wind) messages.push('Wind evidence is needed for yield and finance.');
  if (valid && !receptor) messages.push('Place a receptor to assess sound and shadow.');
  const energy = result?.ok ? result.value : null;
  const params = {
    capexPerMw: layout.capex,
    opexPerMwPerYear: layout.opex,
    energyPricePerMwh: project.price,
  };
  const cash = energy && generateCashflow(energy, params);
  return {
    id: layout.id,
    count,
    capacity: (count * turbine.ratedPowerKw) / 1000,
    spacing: Number.isFinite(spacing) ? spacing : null,
    energy: energy?.netTotalAepMwh ?? null,
    wake: energy?.losses.wakeLossPct ?? null,
    capacityFactor: energy ? energy.netCapacityFactor * 100 : null,
    noise,
    shadow,
    lcoe: energy && energy.netTotalAepMwh > 0 ? calculateLcoe(energy, params).lcoePerMwh : null,
    npv: cash?.npvGbp ?? null,
    capital: cash?.totalCapexGbp ?? null,
    messages,
  };
}
export type LayoutResult = ReturnType<typeof evaluateLayout>;
