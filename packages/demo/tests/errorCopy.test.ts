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

  it('maps CONFIGURATION to the CDS_API_KEY hint', () => {
    expect(errorCopyFor('CONFIGURATION', '')).toMatch(/CDS_API_KEY/);
  });

  it('falls back to the underlying message for unknown codes', () => {
    expect(errorCopyFor('something_weird', 'underlying')).toBe('underlying');
  });

  it('never surfaces the raw enum code in the sentence', () => {
    const copy = errorCopyFor('DATA_FETCH_FAILED', 'NASA POWER 500');
    expect(copy).not.toContain('DATA_FETCH_FAILED');
  });
});
