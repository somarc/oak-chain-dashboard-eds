# Oak Chain Dashboard (EDS)
Edge Delivery Services frontend for Oak Chain Aeron operations dashboards, backed by API/CLI control plane data from `oak-segment-consensus`.

## Environments
- Preview: https://main--{repo}--{owner}.aem.page/
- Live: https://main--{repo}--{owner}.aem.live/

## Documentation

Before using the aem-boilerplate, we recommand you to go through the documentation on https://www.aem.live/docs/ and more specifically:
1. [Developer Tutorial](https://www.aem.live/developer/tutorial)
2. [The Anatomy of a Project](https://www.aem.live/developer/anatomy-of-a-project)
3. [Web Performance](https://www.aem.live/developer/keeping-it-100)
4. [Markup, Sections, Blocks, and Auto Blocking](https://www.aem.live/developer/markup-sections-blocks)

Project-specific docs:
- `docs/ops-api-contract-v1.md` (dashboard-facing API schema contract)
- `scripts/ops-runtime-config.js` (single source of truth for ops API base/endpoints/refresh defaults)

Mock adapter (local contract server):
- `npm run mock:ops`
- Serves `/ops/v1/*` on `http://localhost:8787`
- Use this for block development before live gateway wiring

Proxy mode (map live `oak-segment-consensus` data into `/ops/v1/*`):
- `OPS_MOCK_MODE=proxy OPS_UPSTREAM_BASE=http://127.0.0.1:8090 npm run mock:ops`

Authoring model:
- Dashboard blocks are marker-style in DA (no endpoint rows required).
- API/runtime wiring is controlled in `scripts/ops-runtime-config.js` and adapter code.

## Installation

```sh
npm i
```

## Linting

```sh
npm run lint
```

## Local development

1. Create a new repository based on the `aem-boilerplate` template
1. Add the [AEM Code Sync GitHub App](https://github.com/apps/aem-code-sync) to the repository
1. Install the [AEM CLI](https://github.com/adobe/helix-cli): `npm install -g @adobe/aem-cli`
1. Start AEM Proxy: `aem up` (opens your browser at `http://localhost:3000`)
1. Open the `{repo}` directory in your favorite IDE and start coding :)
