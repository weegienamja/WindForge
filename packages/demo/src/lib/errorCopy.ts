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

  switch (code) {
    case 'DATA_FETCH_FAILED':
    case 'DATA_UNAVAILABLE':
      return `Could not reach ${source}. Try again, or run without it.`;
    case 'TIMEOUT':
      return 'Reanalysis fetch from Copernicus timed out. The CDS service can take 1 to 5 minutes; try again.';
    case 'CONFIGURATION':
      return 'Reanalysis bias correction is unavailable. Set CDS_API_KEY to enable.';
    case 'INVALID_COORDINATE':
    case 'OUT_OF_RANGE':
      return 'The coordinate is outside the supported range. Latitude is bounded -90 to 90; longitude -180 to 180.';
    case 'INSUFFICIENT_DATA':
      return 'The data source returned too few records to score this site.';
    case 'INVALID_WEIGHTS':
      return 'Scoring weights must be between 0 and 1 and sum to 1.';
    case 'PARSE_ERROR':
      return `Received an unexpected response from ${source}. Try again.`;
    default:
      return fallback || 'An unexpected error occurred during analysis.';
  }
}
