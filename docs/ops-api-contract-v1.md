# Ops API Contract v1 (EDS Dashboard)

Status: Draft (day-one baseline)
Last Updated: 2026-03-24
Owner: Oak Chain Dashboard + Oak Segment Consensus

## Purpose

Define a stable, dashboard-facing API contract for `oak-chain-dashboard-eds` from day one.

This contract is the UI read model and is intentionally separate from raw internal endpoint shapes in `oak-segment-consensus`.

Browser code must consume `/ops/v1/*`. Raw validator `/v1/*` endpoints are upstream source APIs for gateways, CLIs, and operator automation, not a stable UI contract.

## Scope

- Consumer: EDS dashboard UI (`oak-chain-dashboard-eds`)
- Producer: edge/gateway BFF (backed by `oak-segment-consensus` APIs)
- Upstream sources: validator-native `/v1/*` endpoints behind the gateway
- Versioning base path: `/ops/v1`

## Non-goals

- No direct consensus write operations in this contract
- No server-rendered HTML coupling
- No dependence on in-process dashboard templates
- No direct browser dependence on raw validator `/v1/*` routes

## Transport and Security

- Protocol: HTTPS
- Auth: bearer token or secure session cookie at gateway
- CORS: enforced at gateway, allowlisted dashboard origins only
- Cache: short-lived edge caching allowed for read endpoints
- `/ops/v1/runtime/*` uses the same auth system with stronger operator-only authorization than general dashboard reads.

## Contract Rules

- All timestamps are ISO-8601 UTC strings.
- All numeric durations/ages are in milliseconds unless named otherwise.
- Unknown fields must be ignored by clients.
- New optional fields are non-breaking.
- Removing fields or changing field types requires `/ops/v2`.
- Canonical operator lifecycle views use `/release-flow` endpoints.
- `/epochs` endpoints are compatibility overlays only and are deprecated for new operator workflows.
- Cluster authority is local to one Aeron cluster. Cross-cluster mounts and
  discovery are separate concerns and must not be modeled as shared consensus.
- Canonical `/ops/v1/*` handlers may compose only governed validator source contracts.
- Raw validator diagnostics such as `/v1/aeron/*`, `/health/deep`, `/api/metrics`, and `/api/segments/tars` are not upstream dependencies.

## Standard Response Envelope

All responses (except health probe text/Prometheus passthroughs, if any) must use:

```json
{
  "version": "v1",
  "generatedAt": "2026-02-06T16:20:00Z",
  "clusterId": "oak-local-a",
  "data": {}
}
```

Errors use:

```json
{
  "version": "v1",
  "generatedAt": "2026-02-06T16:20:00Z",
  "error": {
    "code": "UPSTREAM_UNAVAILABLE",
    "message": "Consensus status unavailable",
    "retryable": true
  }
}
```

## Endpoint Set

### 1) `GET /ops/v1/overview`

Purpose: single-call summary for top-of-dashboard cards.

`data` shape:

```json
{
  "status": "healthy",
  "leader": {
    "nodeId": 1,
    "wallet": "0xabc...",
    "term": 42,
    "since": "2026-02-06T16:10:00Z"
  },
  "cluster": {
    "nodeCount": 3,
    "quorum": 2,
    "reachableNodes": 3
  },
  "queue": {
    "pending": 4,
    "mempool": 11,
    "oldestPendingAgeMs": 820
  },
  "replication": {
    "maxLagMs": 55,
    "maxLagNodeId": 2,
    "status": "ok"
  },
  "durability": {
    "pendingAcks": 2,
    "ackTimeouts": 0,
    "status": "ok"
  }
}
```

### 2) `GET /ops/v1/cluster`

Purpose: authoritative local Aeron cluster topology + node readiness.

This endpoint describes the current writable fiefdom only. It must not imply
that cross-cluster read mounts participate in local consensus.

`data` shape:

```json
{
  "clusterState": "ACTIVE",
  "term": 42,
  "leaderNodeId": 1,
  "nodes": [
    {
      "nodeId": 0,
      "wallet": "0x111...",
      "role": "FOLLOWER",
      "status": "ready",
      "reachable": true,
      "lastSeenAt": "2026-02-06T16:19:59Z"
    }
  ]
}
```

### 2a) `GET /ops/v1/network`

Purpose: present the local writable Aeron cluster in the center and the rest of
the Oak Chain as a read/discovery abstraction, not as shared consensus.

`data` shape:

```json
{
  "topologyModel": "Aeron fiefdoms + lazy read fabric",
  "networkStatus": "observable",
  "localCluster": {
    "clusterId": "oak-local-a",
    "displayName": "Oak Local A",
    "roleLabel": "Authoritative local write scope",
    "authority": "This Aeron cluster is the local writable authority plane.",
    "consensusPlane": "Aeron consensus",
    "writeRule": "Local wallets write here; foreign wallets redirect before queueing.",
    "ownedPrefixes": "00-7f",
    "nodeCount": 3,
    "leaderLabel": "Node 1 leads",
    "status": "ACTIVE"
  },
  "mountedNeighbors": [
    {
      "clusterId": "oak-local-b",
      "displayName": "Oak Local B",
      "relation": "Lazy read-only remote cluster",
      "ownedPrefixes": "80-ff",
      "observedNodeCount": 3,
      "status": "visible",
      "transport": "HTTP segment transfer",
      "note": "Cluster B remains outside local consensus and is visible through lazy read-only mounts."
    }
  ],
  "outerNetwork": {
    "label": "Oak Chain beyond the local mount horizon",
    "status": "observable",
    "summary": "The wider Oak Chain is shown as a federation of Aeron fiefdoms with a separate discovery plane and a lazy read fabric between them.",
    "discoveryPlane": "Separate control plane",
    "readFabric": "Lazy read-only mounts over HTTP segment transfer",
    "writeAuthority": "Each cluster writes only its owned prefixes.",
    "observedClusterCount": 2,
    "mountedClusterCount": 1,
    "principles": [
      "Aeron governs the local writable repository only.",
      "Cross-cluster reads are lazy and read-only.",
      "Discovery stays separate from consensus."
    ]
  }
}
```

This endpoint is intentionally cartographic and operator-facing:

- `localCluster` is the home fiefdom the dashboard sees directly
- `mountedNeighbors` are remote clusters or remote-cluster abstractions visible
  through lazy read mounts
- `outerNetwork` is a bounded abstraction of the wider Oak Chain, never a claim
  that the whole network shares one consensus plane

### 3) `GET /ops/v1/raft`

Purpose: Raft/Aeron runtime metrics normalized for charts.

`data` shape:

```json
{
  "term": 42,
  "commitIndex": 12502,
  "appendRatePerSec": 138,
  "electionCount24h": 1,
  "lastElectionAt": "2026-02-06T02:31:12Z"
}
```

### 4) `GET /ops/v1/replication`

Purpose: replication lag and outlier nodes.

`data` shape:

```json
{
  "status": "ok",
  "maxLagMs": 55,
  "p95LagMs": 31,
  "nodes": [
    {
      "nodeId": 2,
      "lagMs": 55,
      "status": "ok"
    }
  ]
}
```

### 5) `GET /ops/v1/queue`

Purpose: proposal pipeline pressure and backlog.

`data` shape:

```json
{
  "pendingCount": 4,
  "mempoolCount": 11,
  "epochQueueDepth": 2,
  "oldestPendingAgeMs": 820,
  "ingressRatePerSec": 24,
  "egressRatePerSec": 22
}
```

### 6) `GET /ops/v1/durability`

Purpose: ack flow health and failure indicators.

`data` shape:

```json
{
  "status": "ok",
  "pendingAcks": 2,
  "ackTimeouts1h": 0,
  "lastAckAt": "2026-02-06T16:19:59Z"
}
```

### 7) `GET /ops/v1/health`

Purpose: consolidated health signal for dashboard and runbooks, including
cross-cluster sharding posture.

`data` shape:

```json
{
  "status": "healthy",
  "checks": {
    "cluster": "pass",
    "storage": "pass",
    "network": "pass",
    "api": "pass"
  },
  "sharding": {
    "enabled": true,
    "proofHarness": "3x2-local",
    "clusterName": "oak-local-a",
    "runtimeRoot": "~/oak-chain/3x2/cluster-a",
    "httpBasePort": 8090,
    "aeronClusterBasePort": 9000,
    "mediaDriverDirBase": "~/oak-chain/3x2/cluster-a/aeron-media",
    "localPrefixes": "00-7f",
    "remoteMountCount": 1,
    "authoritativeStoreSeparated": true,
    "crossClusterMountsReadOnly": true,
    "crossClusterMountsOutsideAeron": true
  }
}
```

### 7a) `GET /ops/v1/runtime/*`

Purpose: authenticated operator/dev-ops lane for deep runtime visibility without exposing raw validator diagnostics as the public browser contract.

Endpoints:

- `GET /ops/v1/runtime/aeron`
- `GET /ops/v1/runtime/media-driver`
- `GET /ops/v1/runtime/storage`
- `GET /ops/v1/runtime/blobstore`
- `GET /ops/v1/runtime/metrics`

Source policy:

- These endpoints are still edge-owned `/ops/v1/*` surfaces.
- They are composed only from governed validator source routes, primarily `/v1/ops/snapshots/runtime` and `/v1/ops/snapshots/storage`.
- They require stronger operator-only auth than general dashboard reads.

`sharding` is the contract surface that tells operators whether the node is
running with:

- a separate authoritative local store
- remote read-only shard mounts
- explicit local ownership prefixes
- a visible proof-harness identity and port separation

### 8) `GET /ops/v1/events/recent?limit=50`

Purpose: recent operational events for timeline/feed.

`data` shape:

```json
{
  "events": [
    {
      "id": "evt-abc123",
      "timestamp": "2026-02-06T16:19:58Z",
      "type": "LEADERSHIP_CHANGE",
      "severity": "info",
      "message": "Leader changed to node 1",
      "attributes": {
        "previousLeader": 0,
        "newLeader": 1
      }
    }
  ]
}
```

### 9) `GET /ops/v1/events/stats`

Purpose: aggregate event counts for cards/charts.

`data` shape:

```json
{
  "total24h": 211,
  "bySeverity": {
    "info": 192,
    "warn": 17,
    "error": 2
  },
  "byType": {
    "LEADERSHIP_CHANGE": 2,
    "QUEUE_BACKPRESSURE": 9
  }
}
```

### 10) `GET /ops/v1/transactions/summary`

Purpose: canonical lifecycle counts from ADR 063.

`data` shape:

```json
{
  "states": {
    "STARTED": 3,
    "COMMITTED": 1201,
    "ABORTED": 8,
    "TIMED_OUT": 1
  },
  "windowMinutes": 60
}
```

### 11) `GET /ops/v1/transactions/:transactionId`

Purpose: lifecycle drill-down with correlation metadata.

`data` shape:

```json
{
  "transactionId": "tx-001",
  "correlationId": "corr-123",
  "status": "COMMITTED",
  "startedAt": "2026-02-06T16:12:00Z",
  "updatedAt": "2026-02-06T16:12:01Z",
  "timeoutMs": 30000,
  "reason": null
}
```

### 12) `GET /ops/v1/finality`

Purpose: normalized Ethereum epoch/finality pipeline for dashboard visualization.

`data` shape:

```json
{
  "currentEpoch": 1057,
  "ethereumEpoch": 1055,
  "finalizedEpoch": 1055,
  "epochsUntilFinality": 2,
  "pendingProposals": 2488,
  "pendingEpochs": 3,
  "totalQueued": 12186,
  "totalFinalized": 9698
}
```

### 13) `GET /ops/v1/tarmk`

Purpose: TarMK growth state summary for dashboard cards.

`data` shape:

```json
{
  "tarFileCount": 3,
  "segmentCount": 1617,
  "totalSizeBytes": 31628800,
  "totalSizeFormatted": "30.2 MB",
  "avgSizeBytes": 10542933,
  "avgSizeFormatted": "10.1 MB",
  "minSizeBytes": 11264,
  "minSizeFormatted": "11.0 KB",
  "maxSizeBytes": 31597056,
  "maxSizeFormatted": "30.1 MB",
  "targetTarSizeBytes": 268435456,
  "targetTarSizeFormatted": "256.0 MB",
  "packingEfficiencyPct": 3.9,
  "packingStatus": "Low packing efficiency",
  "latestHead": "c4d4d2b6-d4b8-4ab2-ae49-7c1e2d89633d:464"
}
```

### 14) `GET /ops/v1/tar-chain`

Purpose: sequential TAR generation chain visualization payload.

`data` shape:

```json
{
  "maxTarSizeBytes": 268435456,
  "maxTarSizeFormatted": "256.0 MB",
  "tarFiles": [
    {
      "id": 0,
      "name": "data00000a.tar",
      "sizeBytes": 31597056,
      "sizeFormatted": "30.1 MB",
      "segmentCount": 1616,
      "efficiencyPct": 11.8,
      "widthPct": 11.8,
      "created": "2026-02-05T04:28:17Z"
    }
  ]
}
```

### 15) `GET /ops/v1/proposals/release-flow`

Purpose: canonical proposal release-flow pressure + state lifecycle counts + type breakdown for matrix view.

`data` shape:

```json
{
  "contractVersion": "proposal.release-flow.v1",
  "source": "worker-fallback-aggregate-counters",
  "schedulerModel": "adaptive-capacity",
  "releaseMode": "adaptive-active",
  "requiredConfirmations": 1,
  "priorityDirectReleaseEnabled": false,
  "currentEpoch": 1057,
  "finalizedEpoch": 1055,
  "epochsUntilFinality": 2,
  "releaseStages": {
    "unverifiedMempoolCount": 2488,
    "verifiedPackingBufferCount": 0,
    "releaseReadyProposalCount": 0,
    "releaseReadyBatchCount": 0,
    "backpressureOverflowProposalCount": 0,
    "backpressureOverflowBatchCount": 0,
    "verifiedResidentProposalCount": 0
  },
  "governor": {
    "state": "UNKNOWN",
    "action": "UNKNOWN",
    "reasonCodes": [],
    "backpressureActive": false,
    "backpressurePendingCount": 0,
    "backpressureMaxPending": 0,
    "pendingOldestMs": 0,
    "pendingStalledMs": 0
  },
  "packing": {
    "walletCount": 0,
    "queuedProposalCountTotal": 0,
    "drainedProposalCountTotal": 0,
    "createdBatchCountTotal": 0
  },
  "overflow": {
    "separateBufferEnabled": true,
    "bufferedBatchCountTotal": 0,
    "bufferedProposalCountTotal": 0,
    "promotedBatchCountTotal": 0,
    "promotedProposalCountTotal": 0
  },
  "throughput": {
    "priorityProposalsSent": 0,
    "batchedProposalsSent": 0,
    "totalProposalsSent": 0,
    "totalFinalizedCount": 0,
    "totalRejectedCount": 0
  },
  "epochCompatibility": {
    "source": "compatibility-epoch-overlay",
    "pendingEpochs": 3,
    "pendingEpochStats": null,
    "replacementEndpoint": "/ops/v1/proposals/release-flow"
  },
  "note": "Adaptive verified-release view derived from queue stats fallback."
}
```

Compatibility note: legacy epoch counters remain available only as an overlay for older consumers. New operator workflows should use this endpoint directly.

### 16) `GET /ops/v1/proposals/epochs` (compatibility/deprecated)

Purpose: compatibility/deprecated epoch residency overlay for proposal lifecycle.

This endpoint is retained only for older consumers that still need epoch residency details. New operator workflows should prefer `/ops/v1/proposals/release-flow`.

This overlay is useful only for transition-era operators who still want epoch-position context alongside the adaptive scheduler. It should not be treated as scheduler truth.

`data` shape:

```json
{
  "currentEpoch": 1057,
  "finalizedEpoch": 1055,
  "pendingEpochs": 3,
  "epochsUntilFinality": 2,
  "source": "aggregate-counters",
  "note": "Epoch blocks are derived from aggregate counters until first-class epoch overlays are retired.",
  "blocks": [
    {
      "epoch": 1055,
      "status": "finalized",
      "label": "Finalized",
      "counts": { "unverified": 0, "verified": 0, "finalized": 9440, "rejected": 24 },
      "flowToNext": 258
    },
    {
      "epoch": 1056,
      "status": "next",
      "label": "Next to be Finalized",
      "counts": { "unverified": 0, "verified": 258, "finalized": 0, "rejected": 0 },
      "flowToNext": 148
    },
    {
      "epoch": 1057,
      "status": "current",
      "label": "Current",
      "counts": { "unverified": 148, "verified": 0, "finalized": 0, "rejected": 0 },
      "flowToNext": 0
    }
  ]
}
```

Compatibility semantics:

- Gateway adapters may derive this overlay from aggregate queue counters when first-class epoch residency is no longer maintained upstream.
- Consumers must treat `/ops/v1/proposals/release-flow` as canonical for scheduling, pressure, and release-stage state.
- `/ops/v1/proposals/epochs` exists only to preserve older cards and runbooks during the migration.

### 17) `GET /ops/v1/signals`

Purpose: generalized operational telemetry surface for dashboard alerting, independent of individual card payloads.

Design goals:

- Keep payload lightweight and cache-friendly.
- Expose severity-normalized signals (`ok|warn|critical|unknown`).
- Preserve source attribution and explicit gaps (`available=false`) for missing upstream counters.

`data` shape:

```json
{
  "status": "warn",
  "summary": {
    "critical": 1,
    "warn": 2,
    "ok": 9,
    "unknown": 2
  },
  "categories": [
    "cluster",
    "queue",
    "durability",
    "replication",
    "aeron",
    "storage",
    "api"
  ],
  "signals": [
    {
      "id": "queue.pending",
      "label": "Queue Pending",
      "category": "queue",
      "value": 2488,
      "unit": "count",
      "severity": "warn",
      "source": "/v1/proposals/queue/stats",
      "description": "Queued proposals waiting for processing.",
      "available": true,
      "thresholds": { "warn": 2000, "critical": 8000 },
      "updatedAt": "2026-02-06T23:18:12Z"
    },
    {
      "id": "api.rate_limit_exceeded_total",
      "label": "Rate Limit Exceeded",
      "category": "api",
      "value": null,
      "unit": "count",
      "severity": "unknown",
      "source": "missing-upstream-counter",
      "description": "Add first-class rate-limit counters upstream to enable this signal.",
      "available": false,
      "thresholds": { "warn": null, "critical": null },
      "updatedAt": "2026-02-06T23:18:12Z"
    }
  ],
  "generatedAt": "2026-02-06T23:18:12Z",
  "cacheTtlMs": 2500
}
```

Required semantics:

- `signals[].id` is stable across releases.
- `signals[].severity` is edge-worker computed using explicit thresholds.
- `signals[].available=false` means the telemetry gap is known and intentionally surfaced.
- Endpoint should be served from short-lived cache to avoid excessive upstream polling.

Verifier pressure signals (for queue bottleneck triage):

- `verifier.queue_wait_avg_ms`
- `verifier.queue_wait_max_ms`
- `verifier.error_count`

### 18) `GET /ops/v1/blockchain/config`

Purpose: canonical blockchain runtime/tuning payload for Config & Tuning dashboard surfaces.

`data` shape:

```json
{
  "mode": "sepolia",
  "network": "Sepolia Testnet",
  "chainId": 11155111,
  "contractAddress": "0x742d35Cc6634C0532925a3b844Bc9e7595f0bEb0",
  "rpcUrl": "https://sepolia.infura.io/v3/***",
  "requiresMetaMask": true,
  "useTestnet": true,
  "displayName": "✅ SEPOLIA TESTNET",
  "badgeColor": "#10b981",
  "configSource": "osgi-config-admin",
  "gasModel": {
    "source": "measured-sepolia-baseline",
    "gasPriceGwei": 3,
    "writeGasUnitsStandard": 74534,
    "writeGasUnitsExpress": 74534,
    "writeGasUnitsPriority": 74534
  },
  "tiers": {
    "STANDARD": {
      "tier": 0,
      "maxDelay": "13 min",
      "baseFeeWei": "5000000000000000",
      "gasUnits": 74534,
      "gasPriceGwei": 3,
      "estimatedGasFeeWei": "223602000000000",
      "estimatedTotalWei": "5223602000000000",
      "estimatedCost": "~0.005224 ETH"
    }
  }
}
```

## State Semantics (Canonical)

Allowed states:

- `STARTED`
- `COMMITTED`
- `ABORTED`
- `TIMED_OUT`

Allowed transitions:

- `STARTED -> COMMITTED`
- `STARTED -> ABORTED`
- `STARTED -> TIMED_OUT`

Compatibility notes:

- Duplicate terminal updates are idempotent.
- `COMMITTED -> ABORTED` is invalid and must be surfaced as an integrity issue.

## Polling and Refresh Guidance

- Overview/health/queue: 2-5 seconds
- Cluster/raft/replication/durability: 3-10 seconds
- Events recent: 3-5 seconds or SSE equivalent
- Transaction detail: on-demand + manual refresh

## Source Mapping (validator-native `/v1/*` -> `/ops/v1`)

This mapping is gateway-owned. Browser code must not call the left-hand routes directly.

- `/v1/consensus/leader` + `/v1/consensus/status` -> `/ops/v1/overview`
- `/v1/consensus/leader` + `/v1/ops/snapshots/cluster` -> `/ops/v1/cluster`
- `/v1/ops/snapshots/runtime` -> `/ops/v1/raft`
- `/v1/ops/snapshots/replication` -> `/ops/v1/replication`
- `/v1/ops/snapshots/queue` -> `/ops/v1/queue`
- `/v1/proposals/release-flow` -> `/ops/v1/proposals/release-flow`
- `/v1/explorer/release-flow` -> `/ops/v1/explorer/release-flow`
- `/v1/proposals/epochs` -> `/ops/v1/proposals/epochs` (compatibility overlay; deprecated)
- `/v1/explorer/epochs` -> `/ops/v1/explorer/epochs` (compatibility overlay; deprecated)
- `/v1/ops/snapshots/health` + `/v1/ops/snapshots/runtime` + `/v1/ops/snapshots/storage` -> `/ops/v1/health`
- `/v1/events/recent` -> `/ops/v1/events/recent`
- `/v1/events/stats` -> `/ops/v1/events/stats`
- `/v1/consensus/status` + `/v1/ops/snapshots/queue` -> `/ops/v1/finality`
- `/v1/ops/snapshots/storage` -> `/ops/v1/tarmk`
- `/v1/ops/snapshots/storage` -> `/ops/v1/tar-chain`
- `/v1/blockchain/config` -> `/ops/v1/blockchain/config`
- `/v1/ops/snapshots/runtime` -> `/ops/v1/runtime/{aeron,media-driver,metrics}`
- `/v1/ops/snapshots/storage` -> `/ops/v1/runtime/{storage,blobstore}`

## Backward and Forward Compatibility

- UI must not depend on undocumented fields.
- Dashboard/browser code must not bypass the gateway to call raw validator `/v1/*` routes directly.
- Gateway may compose from multiple upstream endpoints.
- Upstream shape drift is absorbed by gateway adapters, not dashboard blocks.
- Runtime/operator diagnostics are still served from `/ops/v1/*`, not from raw validator endpoints.
- Canonical operator surfaces are `/ops/v1/proposals/release-flow` and `/ops/v1/explorer/release-flow`.
- `/ops/v1/proposals/epochs` and `/ops/v1/explorer/epochs` remain compatibility/deprecated overlays only.

## Initial Test Matrix

- Single-node local mode
- 3-node cluster with stable leader
- leader rotation event
- temporary follower unreachable
- queue pressure spike
- durability ack timeout path

## Related References

- `Blockchain-AEM/adr/063-dashboard-extraction-api-first-control-plane.md`
- `Blockchain-AEM/adr/064-dashboard-extraction-rollout-and-cutover.md`
- `Blockchain-AEM/adr/066-eds-operations-dashboard-for-aeron-control-plane.md`

## Local Mock Adapter

- Script: `scripts/ops-api-mock.mjs`
- Run: `npm run mock:ops`
- Default URL: `http://127.0.0.1:8787`
- Serves the `/ops/v1/*` contract for dashboard block development.
- Mirrors the browser contract rather than exposing validator-native routes directly.
- Live proxy mode:
  - `OPS_MOCK_MODE=proxy OPS_UPSTREAM_BASE=http://127.0.0.1:8090 npm run mock:ops`
  - Adapts `oak-segment-consensus` endpoint shapes into this contract envelope.
