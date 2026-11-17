import { describe, it, expect } from 'vitest';
import catalogue from '../../../engineering/catalogue.json';
import { bundledEvidence } from '../src/lib/engineering/bundled-evidence';

describe('bundled public reference data', () => {
  it('serves the catalogue, passages and each model’s geometry at its published revision', async () => {
    expect(await bundledEvidence(new URLSearchParams())).toMatchObject({
      release: catalogue.release,
      bundled: true,
    });
    expect(
      await bundledEvidence(new URLSearchParams({ library: '1', release: catalogue.release })),
    ).toEqual(catalogue.passages);
    for (const model of catalogue.models) {
      const geometry = await bundledEvidence(
        new URLSearchParams({ blade: model.id, release: catalogue.release }),
      );
      expect(geometry).toMatchObject({ revision: model.revision, stations: expect.any(Array) });
    }
  });
  it('keeps unknown releases and live service status distinct from the snapshot', async () => {
    expect(
      await bundledEvidence(new URLSearchParams('library=1&release=0000000000000000')),
    ).toBeNull();
    expect(await bundledEvidence(new URLSearchParams('status'))).toBeNull();
  });
});
