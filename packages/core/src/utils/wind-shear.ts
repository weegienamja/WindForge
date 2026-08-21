// Wind shear extrapolation using the power law wind profile:
//   v_hub = v_ref * (h_hub / h_ref) ^ alpha
//
// Where alpha depends on terrain roughness:
//   Class 0 (water/flat): 0.10
//   Class 1 (open terrain): 0.14
//   Class 2 (agricultural): 0.20
//   Class 3 (suburban/forest): 0.25

const ALPHA_BY_ROUGHNESS_CLASS: Record<number, number> = {
  0: 0.1,
  1: 0.14,
  2: 0.2,
  3: 0.25,
};

const DEFAULT_ALPHA = 0.14;

/** Default reference height for 2m sensors */
const REFERENCE_HEIGHT_M = 2;

/** Reference height when 50m data is available */
const REFERENCE_HEIGHT_50M = 50;

export function roughnessClassToAlpha(roughnessClass: number): number {
  return ALPHA_BY_ROUGHNESS_CLASS[roughnessClass] ?? DEFAULT_ALPHA;
}

export function extrapolateWindSpeed(
  referenceSpeedMs: number,
  referenceHeightM: number,
  hubHeightM: number,
  alpha: number,
): number {
  if (referenceHeightM <= 0 || hubHeightM <= 0) return referenceSpeedMs;
  if (referenceHeightM === hubHeightM) return referenceSpeedMs;
  return referenceSpeedMs * (hubHeightM / referenceHeightM) ** alpha;
}

export { REFERENCE_HEIGHT_M, REFERENCE_HEIGHT_50M };
