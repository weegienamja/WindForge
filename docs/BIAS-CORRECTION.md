# Bias correction methodology

How WindForge corrects NASA POWER wind speeds against higher-resolution
reanalysis, why it does so, and how to read the diagnostics that come out the
other side.

## Why

NASA POWER provides global wind data at roughly 50 km resolution. At that
grid spacing the model cannot resolve sub-grid orography, mesoscale
channelling, coastal effects, or anything that depends on terrain features
finer than a couple of grid cells. The result is a systematic bias against
genuine site conditions: open coastlines tend to be overstated, complex
inland terrain tends to be understated, and the bias is locally consistent
enough that it can be removed with a small amount of statistics.

The wind industry handles this with a measure-correlate-predict (MCP) loop:
deploy a temporary anemometer mast for six to twelve months, regress the
short on-site record against a long reference, and use the relationship to
project the on-site climate from the reference's full record. WindForge
applies the same idea but substitutes higher-resolution reanalysis (ERA5 at
about 31 km, CERRA at about 5.5 km in Europe) for the on-site mast. The
correction is not as good as a real mast campaign, but it is materially
better than uncorrected NASA POWER.

## Method selection

The library picks a correction method automatically based on how many months
of overlap exist between the NASA POWER series and the chosen reference.

| Overlap months | Method |
| --- | --- |
| 24 or more | Quantile mapping |
| 12 to 23 | Variance scaling |
| Fewer than 12 | None (NASA series returned unchanged) |

When both ERA5 and CERRA are available CERRA is preferred. CERRA's higher
resolution and explicit treatment of European topography produces a more
trustworthy reference where it covers.

The caller can override with an explicit `method: 'quantile' | 'variance' |
'none' | 'auto'` in the reconciliation input. Auto is the default.

## Quantile mapping

Quantile mapping aligns the empirical cumulative distribution function (CDF)
of the source series to that of the reference. For each value `x` in the
NASA POWER series the corrected value is

$$x_{\text{corrected}} = F_{\text{ref}}^{-1}(F_{\text{src}}(x))$$

where `F_src` is the empirical CDF of NASA POWER over the overlap window and
`F_ref` is the empirical CDF of the reanalysis reference over the same
window. The transformation preserves rank order, so the calmest month stays
the calmest month, but rescales every quantile to match the reference
climatology.

WindForge constructs both CDFs from the overlap window only, then applies
the resulting transfer function to the full NASA series. The CDFs are built
empirically (no parametric distribution is assumed). For values outside the
overlap range the implementation clamps to the nearest observed quantile
rather than extrapolating; this is conservative and avoids the well-known
quantile-mapping failure mode where extreme tails are amplified into
unphysical values.

The strength of quantile mapping is that it corrects bias at every quantile
independently. If the reference shows the source overstates the median by
0.5 m/s but understates the 95th percentile by 1.0 m/s, both corrections
land in the right place. The cost is sample size: a reliable empirical CDF
needs roughly 24 monthly values, which is why the auto selector requires
that overlap before using this method.

## Variance scaling

When the overlap is shorter than 24 months the empirical CDFs are too noisy
to trust at the tails. Variance scaling falls back to a two-parameter
linear correction:

$$x_{\text{corrected}} = \mu_{\text{ref}} + \frac{\sigma_{\text{ref}}}{\sigma_{\text{src}}} (x - \mu_{\text{src}})$$

Means and standard deviations are computed over the overlap window. The
correction shifts the mean to match the reference and rescales the variance
so the spread of the corrected series matches the reference spread. It
preserves the shape of the source distribution; only the first two moments
move.

Variance scaling is the right call when the overlap is short because two
parameters can be estimated reliably from twelve to twenty-three values,
where a full empirical CDF cannot.

## Confidence assignment

Every reconciled result carries a `Confidence` of `high`, `medium`, or
`low`. The rules, taken directly from the implementation in
`reanalysis-reconciliation.ts`:

- **High.** `overlapMonths >= 24` AND RMSE strictly improved by the correction AND absolute bias strictly improved by the correction.
- **Medium.** A correction was applied but at least one of the high criteria is not met.
- **Low.** No correction was applied (no reference, insufficient overlap, or `method: 'none'`), OR the correction made RMSE worse and the corrector fell back to the uncorrected NASA series.

The fallback behaviour matters: if quantile mapping or variance scaling
produces a higher RMSE than the uncorrected series, WindForge ships the
uncorrected series and marks confidence `low`. A correction that makes
things worse is never quietly applied.

## Diagnostics

Each reconciliation result carries a diagnostic block. What the fields mean
and how to read them:

- `biasBefore`. Mean error of NASA POWER versus the reference over the overlap window. Positive means NASA overstates. Units: m/s.
- `biasAfter`. Mean error of the corrected series versus the reference. A successful correction has `|biasAfter| < |biasBefore|`.
- `rmseBefore`. Root-mean-square error of NASA versus the reference. Captures both bias and noise.
- `rmseAfter`. RMSE of the corrected series versus the reference. A successful correction has `rmseAfter < rmseBefore`.
- `rSquared`. Coefficient of determination between NASA and the reference over the overlap. Higher is better; below about 0.5 the correlation is too weak to extrapolate confidently.
- `ksStatistic`. Kolmogorov-Smirnov statistic between the corrected and reference distributions. Smaller is better; quantile mapping should drive this close to zero, variance scaling will leave it nonzero if the source distribution shape differs from the reference.

Read them as a set, not individually. A small bias with high RMSE means a
noisy series with no systematic offset. A high R-squared with a high RMSE
means strong correlation but a scale mismatch that variance scaling will
fix. A low R-squared with a low overlap should be treated as "the
correction did what it could; treat the result as advisory."

## Validation

The `bias-correction.test.ts` suite validates the correction maths against
synthetic series with known bias and variance properties. Quantile mapping
recovers the reference distribution to within numerical tolerance when the
overlap is sufficient. Variance scaling recovers mean and variance exactly.
The auto selector picks the correct method at every overlap-length
threshold.

What is not yet validated: end-to-end accuracy against real on-site mast
data. The synthetic tests show the maths is correct; they do not show that
ERA5 or CERRA are reliable references at every location. Real-data
validation against met-mast records is in the "considered, not committed"
section of [ROADMAP.md](../ROADMAP.md).

## References

- Cannon, A. J. (2018). Multivariate quantile mapping bias correction. *Climate Dynamics*, 50, 31-49. [doi:10.1007/s00382-017-3580-6](https://doi.org/10.1007/s00382-017-3580-6).
- Maraun, D. (2016). Bias correcting climate change simulations: a critical review. *Current Climate Change Reports*, 2, 211-220. [doi:10.1007/s40641-016-0050-x](https://doi.org/10.1007/s40641-016-0050-x).
- Gudmundsson, L., Bremnes, J. B., Haugen, J. E., and Engen-Skaugen, T. (2012). Technical Note: Downscaling RCM precipitation to the station scale using statistical transformations: a comparison of methods. *Hydrology and Earth System Sciences*, 16, 3383-3390. [doi:10.5194/hess-16-3383-2012](https://doi.org/10.5194/hess-16-3383-2012).
