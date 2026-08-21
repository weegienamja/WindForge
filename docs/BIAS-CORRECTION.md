# Reanalysis reconciliation

WindForge can reconcile a NASA POWER monthly wind series against an explicitly supplied reanalysis series. This is an advanced, opt-in screening operation—not an automatic feature of the public point analysis and not a replacement for measure-correlate-predict work using on-site observations.

## Runtime contract

`analyseSite` first obtains the NASA POWER summary used as the canonical raw resource. If the caller supplies a validated ERA5 or CERRA summary/history through `options.reanalysis`, the engine calls `reconcileWindData` and records both the raw and resolved resources:

```text
windResource.raw        unmodified NASA POWER summary
windResource.resolved   the summary used for both scoring and downstream AEP
windResource.correction status, reference, and explanation
```

The default web API does not fetch reanalysis. A `CDS_API_KEY` is never sent to the browser. The legacy `cdsApiKey` analysis option is deprecated and does not trigger hidden network work.

## Methods

Automatic method selection uses overlap length:

| Common overlap | Method |
| ---: | --- |
| 24+ monthly records | Empirical quantile mapping |
| 12–23 monthly records | Variance scaling |
| Fewer than 12 | No correction |

Quantile mapping maps the empirical rank of each source value onto the reference distribution. Values outside the observed overlap are clamped to the nearest observed quantile. Variance scaling aligns the source mean and standard deviation with the reference. The caller can explicitly select a supported method.

These transformations establish internally testable statistical behaviour. They do not prove that the reference represents the candidate parcel or that the corrected output is scientifically validated.

## Diagnostics and acceptance

The result records overlap months, before/after bias, before/after RMSE, R², a KS statistic, chosen method, reference source, and a screening confidence. These metrics describe agreement between two gridded series over their overlap. They are not an uncertainty budget or validation against observations.

A caller should reject or investigate a correction when overlap is short, the coordinate/time axes are uncertain, before/after diagnostics worsen, or the dataset request does not match the intended temporal aggregation.

## Source status

- ERA5 monthly retrieval uses the current CDS retrieve-v1 asynchronous job API and remains explicit/opt-in.
- Automated CERRA correction is disabled until WindForge has a reproducible request that aggregates enough sub-daily observations into defensible monthly means.
- When no correction is supplied, raw and resolved NASA POWER values are identical and the output states that reanalysis was not configured.
