/**
 * Maps `ScoringError.code` (or any sentinel string) onto a single direct
 * sentence shown to the user. Never surfaces enum values, never shows a
 * stack trace. Falls back to the underlying message if the code is not
 * recognised so we never silently swallow useful detail.
 */
const SOURCE_HINT: Record<string, string> = {
  'nasa-power': 'NASA POWER',
  'nasa power': 'NASA POWER',
  cerra: 'CERRA',
  era5: 'ERA5',
  'open-elevation': 'Open-Elevation',
  'open elevation': 'Open-Elevation',
  overpass: 'OpenStreetMap Overpass',
  openstreetmap: 'OpenStreetMap',
  nominatim: 'OpenStreetMap Nominatim',
};

export function errorCopyFor(code: string, fallback: string): string {
  // Heuristic source detection from the trailing message so we can
  // namedrop the actual upstream API in the copy.
  const lower = (fallback ?? '').toLowerCase();
  const matchedSource = Object.entries(SOURCE_HINT).find(([k]) => lower.includes(k));
  const source = matchedSource ? matchedSource[1] : 'the data source';
  const isReanalysis = /copernicus|cerra|era5|cds|reanalysis/.test(lower);

  switch (code) {
    case 'DATA_FETCH_FAILED':
    case 'DATA_UNAVAILABLE':
      return `Could not reach ${source}. Try again, or run without it.`;
    case 'TIMEOUT':
      return isReanalysis
        ? 'An explicitly requested Copernicus reanalysis job timed out; the CDS queue may be busy. Try again later.'
        : fallback || 'The analysis timed out. Try again.';
    case 'CONFIGURATION':
      return isReanalysis
        ? 'Optional reanalysis is not configured on this server; the default analysis uses raw NASA POWER evidence.'
        : fallback || 'The analysis settings are invalid. Check the inputs and try again.';
    case 'INVALID_COORDINATE':
    case 'OUT_OF_RANGE':
      return (
        fallback ||
        'An input is outside its supported range. Check the coordinate and analysis settings.'
      );
    case 'INSUFFICIENT_DATA':
      return fallback || 'There is not enough valid evidence to complete this calculation.';
    case 'INVALID_WEIGHTS':
      return (
        fallback || 'Scoring weights must be between 0 and 1, with at least one positive weight.'
      );
    case 'PARSE_ERROR':
      return `Received an unexpected response from ${source}. Try again.`;
    default:
      return fallback || 'An unexpected error occurred during analysis.';
  }
}
