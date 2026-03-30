import type { TurbineModel, PowerCurvePoint } from '../types/turbines.js';

/**
 * Generate a realistic power curve for a turbine based on its specifications.
 * Uses a cubic relationship below rated speed with smooth transitions.
 */
function generatePowerCurve(
  cutInMs: number,
  ratedMs: number,
  cutOutMs: number,
  ratedKw: number,
): PowerCurvePoint[] {
  const curve: PowerCurvePoint[] = [];

  for (let speed = 0; speed <= 30; speed += 0.5) {
    let power: number;

    if (speed < cutInMs) {
      power = 0;
    } else if (speed <= ratedMs) {
      // Cubic relationship: P = Prated * ((v - vci) / (vr - vci))^3
      const fraction = (speed - cutInMs) / (ratedMs - cutInMs);
      power = ratedKw * fraction ** 3;
    } else if (speed <= cutOutMs) {
      power = ratedKw;
    } else {
      power = 0;
    }

    curve.push({ windSpeedMs: speed, powerKw: Math.round(power * 10) / 10 });
  }

  return curve;
}

const TURBINE_LIBRARY: TurbineModel[] = [
  // --- Small class (< 1 MW) ---
  {
    id: 'vestas-v47-660',
    manufacturer: 'Vestas',
    model: 'V47-660',
    ratedPowerKw: 660,
    rotorDiameterM: 47,
    hubHeightOptionsM: [55, 65],
    cutInSpeedMs: 4.0,
    ratedSpeedMs: 16.0,
    cutOutSpeedMs: 25.0,
    powerCurve: generatePowerCurve(4.0, 16.0, 25.0, 660),
  },
  {
    id: 'enercon-e44-900',
    manufacturer: 'Enercon',
    model: 'E-44',
    ratedPowerKw: 900,
    rotorDiameterM: 44,
    hubHeightOptionsM: [45, 55, 65],
    cutInSpeedMs: 3.0,
    ratedSpeedMs: 16.5,
    cutOutSpeedMs: 25.0,
    powerCurve: generatePowerCurve(3.0, 16.5, 25.0, 900),
  },

  // --- Medium class (2-3 MW) ---
  {
    id: 'vestas-v90-2000',
    manufacturer: 'Vestas',
    model: 'V90-2.0',
    ratedPowerKw: 2000,
    rotorDiameterM: 90,
    hubHeightOptionsM: [80, 95, 105],
    cutInSpeedMs: 4.0,
    ratedSpeedMs: 12.0,
    cutOutSpeedMs: 25.0,
    powerCurve: generatePowerCurve(4.0, 12.0, 25.0, 2000),
  },
  {
    id: 'vestas-v110-2000',
    manufacturer: 'Vestas',
    model: 'V110-2.0',
    ratedPowerKw: 2000,
    rotorDiameterM: 110,
    hubHeightOptionsM: [80, 95, 110, 125],
    cutInSpeedMs: 3.0,
    ratedSpeedMs: 11.5,
    cutOutSpeedMs: 25.0,
    powerCurve: generatePowerCurve(3.0, 11.5, 25.0, 2000),
  },
  {
    id: 'siemens-swt-2.3-108',
    manufacturer: 'Siemens',
    model: 'SWT-2.3-108',
    ratedPowerKw: 2300,
    rotorDiameterM: 108,
    hubHeightOptionsM: [80, 99.5],
    cutInSpeedMs: 3.5,
    ratedSpeedMs: 12.0,
    cutOutSpeedMs: 25.0,
    powerCurve: generatePowerCurve(3.5, 12.0, 25.0, 2300),
  },
  {
    id: 'nordex-n117-3000',
    manufacturer: 'Nordex',
    model: 'N117/3000',
    ratedPowerKw: 3000,
    rotorDiameterM: 117,
    hubHeightOptionsM: [91, 120, 141],
    cutInSpeedMs: 3.0,
    ratedSpeedMs: 12.5,
    cutOutSpeedMs: 25.0,
    powerCurve: generatePowerCurve(3.0, 12.5, 25.0, 3000),
  },

  // --- Large class (4-6 MW) ---
  {
    id: 'vestas-v150-4200',
    manufacturer: 'Vestas',
    model: 'V150-4.2',
    ratedPowerKw: 4200,
    rotorDiameterM: 150,
    hubHeightOptionsM: [105, 125, 148, 166],
    cutInSpeedMs: 3.0,
    ratedSpeedMs: 12.0,
    cutOutSpeedMs: 22.5,
    powerCurve: generatePowerCurve(3.0, 12.0, 22.5, 4200),
  },
  {
    id: 'siemens-gamesa-sg-5.8-170',
    manufacturer: 'Siemens Gamesa',
    model: 'SG 5.8-170',
    ratedPowerKw: 5800,
    rotorDiameterM: 170,
    hubHeightOptionsM: [115, 125, 135, 165],
    cutInSpeedMs: 3.0,
    ratedSpeedMs: 12.0,
    cutOutSpeedMs: 25.0,
    powerCurve: generatePowerCurve(3.0, 12.0, 25.0, 5800),
  },
  {
    id: 'ge-cypress-5.3-158',
    manufacturer: 'GE',
    model: 'Cypress 5.3-158',
    ratedPowerKw: 5300,
    rotorDiameterM: 158,
    hubHeightOptionsM: [101, 121, 161],
    cutInSpeedMs: 3.0,
    ratedSpeedMs: 12.5,
    cutOutSpeedMs: 25.0,
    powerCurve: generatePowerCurve(3.0, 12.5, 25.0, 5300),
  },
  {
    id: 'enercon-e138-4200',
    manufacturer: 'Enercon',
    model: 'E-138 EP3',
    ratedPowerKw: 4200,
    rotorDiameterM: 138,
    hubHeightOptionsM: [81, 111, 131, 160],
    cutInSpeedMs: 2.5,
    ratedSpeedMs: 13.0,
    cutOutSpeedMs: 25.0,
    powerCurve: generatePowerCurve(2.5, 13.0, 25.0, 4200),
  },

  // --- Extra large class (7+ MW) ---
  {
    id: 'vestas-v172-7200',
    manufacturer: 'Vestas',
    model: 'V172-7.2',
    ratedPowerKw: 7200,
    rotorDiameterM: 172,
    hubHeightOptionsM: [114, 132, 148, 166],
    cutInSpeedMs: 3.0,
    ratedSpeedMs: 11.0,
    cutOutSpeedMs: 25.0,
    powerCurve: generatePowerCurve(3.0, 11.0, 25.0, 7200),
  },
  {
    id: 'siemens-gamesa-sg-7.0-170',
    manufacturer: 'Siemens Gamesa',
    model: 'SG 7.0-170',
    ratedPowerKw: 7000,
    rotorDiameterM: 170,
    hubHeightOptionsM: [115, 135, 165],
    cutInSpeedMs: 3.0,
    ratedSpeedMs: 11.5,
    cutOutSpeedMs: 25.0,
    powerCurve: generatePowerCurve(3.0, 11.5, 25.0, 7000),
  },
];

/**
 * Get all turbine models in the library.
 */
export function getAllTurbines(): TurbineModel[] {
  return TURBINE_LIBRARY;
}

/**
 * Get a specific turbine model by ID.
 */
export function getTurbineById(id: string): TurbineModel | undefined {
  return TURBINE_LIBRARY.find((t) => t.id === id);
}

/**
 * Get turbines in a rated power range (kW).
 */
export function getTurbinesByPowerRange(minKw: number, maxKw: number): TurbineModel[] {
  return TURBINE_LIBRARY.filter((t) => t.ratedPowerKw >= minKw && t.ratedPowerKw <= maxKw);
}
