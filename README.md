# oak-chain-dashboard-eds (retired)

Retired on 2026-10-30.

This was an AEM Edge Delivery Services site for read-only Oak Chain operator dashboards.
It read the `/ops/v1/*` contract from `oak-chain-edge-worker`.

Operator tooling now lives in the validator itself (`/dashboard`, `/explorer`, `/console/configMgr`, `/api-browser` in `somarc/jackrabbit-oak`).
The site's pages, DA source, and code-bus files were removed on the retirement date.

The last working tree is commit `24a93b9` (2026-03-27); everything before this commit is intact in Git history.
