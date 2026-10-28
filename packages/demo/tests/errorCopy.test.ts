import { describe, expect, it } from 'vitest';
import { errorCopyFor } from '../src/lib/errorCopy';

describe('errorCopyFor', () => {
  it('maps DATA_FETCH_FAILED to a source-aware sentence', () => {
    const copy = errorCopyFor('DATA_FETCH_FAILED', 'NASA POWER returned 503');
    expect(copy).toContain('NASA POWER');
    expect(copy).toMatch(/Try again/);
  });

  it('maps TIMEOUT to a Copernicus-specific message', () => {
    expect(errorCopyFor('TIMEOUT', 'cerra timeout')).toMatch(/Copernicus/);
  });

  it('maps CONFIGURATION without exposing server configuration names', () => {
    const message = errorCopyFor('CONFIGURATION', 'CDS_API_KEY missing');
    expect(message).toContain('Optional reanalysis is not configured');
    expect(message).not.toContain('CDS_API_KEY');
  });

  it('does not attribute ordinary analysis failures to Copernicus', () => {
    expect(errorCopyFor('TIMEOUT', 'Analysis did not complete within 45 seconds.')).toBe(
      'Analysis did not complete within 45 seconds.',
    );
    expect(errorCopyFor('CONFIGURATION', 'Invalid turbine dimensions.')).toBe(
      'Invalid turbine dimensions.',
    );
    expect(errorCopyFor('CONFIGURATION', '')).not.toContain('reanalysis');
  });

  it('preserves specific range and insufficient-data errors', () => {
    expect(errorCopyFor('OUT_OF_RANGE', 'Unknown turbine model.')).toBe('Unknown turbine model.');
    expect(errorCopyFor('INSUFFICIENT_DATA', 'Wind statistics must be finite.')).toBe(
      'Wind statistics must be finite.',
    );
  });

  it('falls back to the underlying message for unknown codes', () => {
    expect(errorCopyFor('something_weird', 'underlying')).toBe('underlying');
  });

  it('never surfaces the raw enum code in the sentence', () => {
    const copy = errorCopyFor('DATA_FETCH_FAILED', 'NASA POWER 500');
    expect(copy).not.toContain('DATA_FETCH_FAILED');
  });
});
