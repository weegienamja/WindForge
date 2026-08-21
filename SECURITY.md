# Security policy

## Supported version

Security fixes are applied to the current `main` branch. This project does not promise security maintenance for older tags.

## Reporting a vulnerability

Please use GitHub's private vulnerability-reporting flow from the repository Security tab when it is available. If that is unavailable, contact the maintainer using the email in the root `package.json`. Do not include credentials or exploit details in a public issue.

Include the affected revision, impact, reproduction steps, and any suggested mitigation. Please allow time for investigation before public disclosure.

## Secrets

WindForge does not need credentials for its default public-data analysis. `CDS_API_KEY`, deployment tokens, and any future provider credentials are server-only configuration. Never commit `.env` files, paste real tokens into examples, or expose secrets through `NEXT_PUBLIC_*` variables.
