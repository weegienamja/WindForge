# React components

`@jamieblair/windforge` renders WindForge domain results. The package exports the all-in-one `WindSiteScorer`, `SiteMap`, `ScoreCard`, scoring-weight controls, wind charts, scenario comparison, PDF export, boundary/constraint views, turbine selection, energy-yield views, and a combined `SiteAssessmentView`.

Use the TypeScript declarations for exact props. The main composition is:

```tsx
import { ScoreCard, EnergyYieldCard } from '@jamieblair/windforge';

export function Results({ analysis, energy }) {
  return (
    <>
      <ScoreCard analysis={analysis} />
      {energy ? <EnergyYieldCard result={energy} /> : null}
    </>
  );
}
```

`ScoreCard`, `ScenarioCompare`, and `SiteAssessmentView` render a withheld composite explicitly when `analysis.compositeScore` is `null`. `EnergyYieldCard` labels its central, 10% downside, and 20% downside outputs as deterministic screening sensitivities.

## Maps and geometry

`SiteMap` and `ConstraintMap` are presentation components. Domain geometry and spatial decisions belong in `@jamieblair/windforge-core`; do not infer intersections from rendered centres. Browser applications must provide OpenStreetMap attribution.

## Hooks and trust boundary

The package still exports `useSiteScore`, `useMapInteraction`, and `useWindData` for self-hosted compositions. `useSiteScore` executes the public-data core in the caller's environment; it does not and must not accept a private CDS credential. Hosted applications should follow the demo architecture and call a validated same-origin server endpoint instead of running provider orchestration in the browser.

## Styling

Components accept the props declared in their exported TypeScript types. Theme support is provided by `WindSiteTheme`, `DEFAULT_THEME`, and `themeToCSS`. Consumers should test focus order, contrast, labels, responsive layout, and reduced-motion behaviour in their own composition.
