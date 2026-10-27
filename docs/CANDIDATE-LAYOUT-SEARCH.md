# Candidate layout search

`optimiseLayoutWithCandidates` is an opt-in core SDK experiment for improving a
fixed-count turbine layout. It constructs a spacing-conflict graph over a finite
pool of locations, searches for feasible subsets, and refines several of them with
WindForge's existing greedy optimizer. The refined original layout is always a
contender, so a successful result has at least its modelled AEP.

The demo and MCP tools continue to use their existing flows. This API runs
synchronously; use a worker when integrating it into an interactive application.

## Use the optimizer

Given an existing `TurbineLayoutEstimate`, `SiteBoundary`, `TurbineModel`,
`WindDataSummary` and an array of `ExclusionZone` values:

```ts
import { optimiseLayoutWithCandidates } from '@jamieblair/windforge-core';

const result = optimiseLayoutWithCandidates(
  initialLayout,
  boundary,
  turbine,
  windData,
  exclusionZones,
  {
    wakeModel: 'jensen', // or 'bastankhah'
    minSpacingDiameters: 3,
    maxIterations: 20, // per start, including the baseline
    maxSearchNodes: 20_000,
    maxLayouts: 8,
    seed: 42,
    // Optional: candidatePositions: [{ lat: 55.825, lng: -4.27 }, ...]
  },
);

if (result.ok) {
  const { best, baseline, search, improvementOverBaselinePercent } = result.value;
  console.log(best.optimisedPositions);
  console.log(baseline.optimisedAepMwh, best.optimisedAepMwh);
  console.log(improvementOverBaselinePercent);
  console.log(search.feasibleLayoutCount, search.countIsExact, search.status);
} else {
  console.error(result.error.message);
}
```

Both the original layout and every retained candidate use identical wake-model,
roughness, spacing and hill-climbing settings. Total refinement work grows with
the number of starts. `startsEvaluated` includes the baseline and skips duplicate
starting layouts. Ties keep the baseline or the first best candidate.

`improvementOverBaselinePercent` compares the selected result with the **refined
baseline**. The nested `best.initialAepMwh`, `best.improvementPercent` and
`best.convergenceHistory` describe refinement of the selected starting layout.
As in the existing optimizer, a zero-AEP denominator yields a reported percentage
of zero; inspect the absolute AEP values in that case.

## Candidate pool and constraints

When `candidatePositions` is omitted, the pool contains the original positions
plus a coarse latitude/longitude grid over the site's bounding box, with
`max(64, turbineCount)` input points. At 64 or more turbines this default adds no
new points; supply a suitable explicit pool to explore alternatives. Locations
outside the site or inside exclusion polygons are filtered. Exclusion holes
remain usable. Exact duplicate coordinates are merged, with separate counters
for duplicates and excluded points.

The candidate pool can contain at most 128 input points, including duplicates
and filtered points. An explicit pool is used in full or rejected; it is never
silently truncated. An empty or infeasible pool still returns the valid refined
baseline. The initial layout itself must match its declared turbine count and
satisfy the boundary, exclusions and spacing constraints, or the call returns a
configuration error.

Every layout keeps the initial turbine count. Spacing is the same radial minimum
used by `optimiseLayout`: by default three rotor diameters. This is distinct from
the directional grid-spacing assumptions used by `estimateTurbineCapacity`.
All turbines use the supplied single turbine model. Refinement can move positions
away from the discrete pool while retaining the same constraints.

Coordinate ranges and polygon rings with at least three distinct vertices are
checked. Callers remain responsible for valid polygon topology and meaningful
wind/turbine data, as with the existing models. Non-finite resulting AEP returns
an insufficient-data error.

## Work limits and counting semantics

| Setting | Default | Accepted range |
| --- | ---: | ---: |
| Input candidate points | 64, or the initial count if larger | 0–128 |
| `maxSearchNodes` | 20,000 | 1–1,000,000 |
| `maxLayouts` | 8 | 1–16 |
| `maxIterations` per refinement | 50 | 0–100 |
| `seed` | 1 | Unsigned 32-bit integer |

Search states include terminal states. The node budget bounds enumeration work;
it is not a wall-clock deadline or a limit on wake-model evaluations. Graph
construction and refinement incur additional work. There are at most
`maxLayouts + 1` refinements. Candidate enumeration remains exponential in the
worst case.

`findCandidateLayouts(candidatePositions, boundary, turbineCount, minSpacingM,
exclusionZones, options)` exposes the same search without evaluating AEP. Its
`Result` contains:

- `feasibleLayoutCount`: the number of distinct fixed-count subsets found in the
  filtered, deduplicated pool.
- `countIsExact: true` and `status: 'complete'`: every such subset was considered.
- `countIsExact: false` and `status: 'search-limit'`: the count is only a lower
  bound. Zero does **not** establish infeasibility.
- `layouts`: at most `maxLayouts` feasible subsets retained by a seeded reservoir.
  Traversal and selection are reproducible for identical input order and options.
  This is not a guarantee of a uniform sample over all feasible layouts.

Even an exact count does not establish the best AEP: only the retained starts are
refined, and the grid does not represent all continuous locations. Counts do not
measure planning approval probability, robustness or energy uncertainty.

## Reproduce the comparison

```bash
pnpm benchmark:layouts
```

The benchmark compares the original optimizer with the wrapper at equal turbine
count and identical per-start settings: 20 iterations, 100 m initial steps, 10 m
minimum steps, seed 42, 20,000 search nodes and up to eight retained layouts.
It asserts baseline equivalence, non-decreasing AEP, preserved turbine count,
and zero boundary/exclusion/spacing violations. It prints timing, search counts,
retained-start counts and net heap change; net heap change is affected by garbage
collection and is **not peak memory**.

Illustrative run on Node 24.13.0, Windows x64, after warm-up:

| Synthetic case | Wake model | Baseline AEP (MWh) | Best AEP (MWh) | Gain | Baseline / multi-start (ms) |
| --- | --- | ---: | ---: | ---: | ---: |
| 12 open candidates, 3 turbines | Jensen | 23,652 | 23,652 | 0% | 1.48 / 9.52 |
| 64 open candidates, 4 turbines | Jensen | 31,536 | 31,536 | 0% | 1.49 / 13.95 |
| 128 open candidates, 4 turbines | Jensen | 31,536 | 31,536 | 0% | 1.16 / 21.27 |
| Separated usable areas, 2 turbines | Jensen | 15,661.86 | 15,768 | 0.678% | 1.46 / 4.39 |
| Separated usable areas, 2 turbines | Bastankhah | 15,584.10 | 15,768 | 1.180% | 0.57 / 2.99 |

Open cases also showed zero AEP gain with Bastankhah. The 12-candidate count was
exact (220 layouts); the 64- and 128-candidate searches reached the budget and
reported lower bounds of 19,309 and 19,706 respectively. The separated-area case
had 15 feasible layouts and a complete count. Timings are single-run observations,
not performance guarantees. These synthetic results show where additional starts
can help a local search; they do not establish a real-site energy gain.

Focused tests independently compare small searches with exhaustive enumeration,
exercise search limits, holes, reproducibility and input validation, and compare
both wake models with the original optimizer. Run `pnpm check` for the full gate.

## Connection to the paper

The motivating [October 25, 2026 preprint](https://github.com/openai/math/blob/main/preprints/The-Exponential-Time-Hypothesis-is-False-October-25-2026/paper.pdf)
prompted this finite constraint formulation. Each candidate is a Boolean choice;
each too-close pair forbids choosing both; a cardinality constraint fixes the
turbine count. Feasible layouts are independent sets of that size in the spacing
graph.

This implementation uses a conventional bounded branch search in TypeScript.
It does not implement the preprint's algorithm or claim its asymptotic bound.
The small input cap keeps the experiment dependency-free within the existing
browser-compatible SDK. A solver adapter can be evaluated separately if larger
candidate pools justify it. Wake-aware AEP remains the existing engineering
approximation, with the same screening limitations.
