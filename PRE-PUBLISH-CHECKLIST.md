# Pre-publish checklist

## Deterministic gate

- [ ] Use Node.js 22–24 and the pinned pnpm version.
- [ ] Start from a clean checkout and run `pnpm install --frozen-lockfile`.
- [ ] Run `pnpm check` successfully (format, lint, typecheck, tests, builds, MCP package validation).
- [ ] Run `pnpm audit --prod --audit-level high` successfully.
- [ ] Run a current-tree and full-history secret scan with redaction enabled.
- [ ] Confirm package versions, repository URLs, changelog, and tag agree.

## Live/deployed verification

- [ ] Probe `/api/health`; record healthy and degraded providers without exposing environment values.
- [ ] Exercise landing, valid analysis, invalid analysis input, geocoding, partial/provider failure presentation, map, navigation, and a mobile viewport.
- [ ] Confirm required provider failure withholds the composite rather than displaying a neutral score.
- [ ] Confirm the static map identifies itself as partial and shows timestamp/resolution/source limitations.
- [ ] Inspect browser console, network responses, Vercel build/runtime logs, HTML, and delivered JavaScript for errors or secret leakage.
- [ ] Verify the preview deployment before merge and the canonical production URL after merge/promotion.

## Scientific and public claims

- [ ] Downside AEP outputs are not labelled P50/P75/P90.
- [ ] Noise, turbulence, extreme wind, terrain flow, finance, and reports say screening/pre-feasibility and do not imply certification/compliance.
- [ ] OSM evidence is not presented as an authoritative statutory search.
- [ ] Reanalysis wording matches the real default runtime; CERRA automatic correction remains visibly disabled.
- [ ] Test fixtures/mocks are not described as scientific validation.

## Release

- [ ] CI passes on the release PR.
- [ ] Review dependency, licence, provenance, and generated-artifact changes.
- [ ] Publish only the intended packages and verify their tarballs.
- [ ] Tag only the exact verified main commit.
