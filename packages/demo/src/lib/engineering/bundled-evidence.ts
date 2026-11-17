import catalogue from '../../../../../engineering/catalogue.json';

/** Serve the checked-in public release when the engineering relay is unavailable. */
export async function bundledEvidence(params: URLSearchParams): Promise<unknown | null> {
  const { release, models, sources, passages } = catalogue;
  if (params.has('status')) return null;
  if (!params.has('blade') && !params.has('library')) {
    return { release, models, sources, bundled: true };
  }
  if (params.get('release') !== release) return null;
  if (params.has('library')) return passages;
  const model = models.find((entry) => entry.id === params.get('blade'));
  if (!model) return null;
  return (await import(`../../../../../engineering/geometry/${model.bladeAsset}.json`)).default;
}
