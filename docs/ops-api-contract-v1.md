# Ops API Contract v1 (EDS Dashboard)

Status: Draft (day-one baseline)
Last Updated: 2026-02-06
Owner: Oak Chain Dashboard + Oak Segment Consensus

## Purpose

Define a stable, dashboard-facing API contract for `oak-chain-dashboard-eds` from day one.

This contract is the UI read model and is intentionally separate from raw internal endpoint shapes in `oak-segment-consensus`.

## Scope

- Consumer: EDS dashboard UI (`oak-chain-dashboard-eds`)
- Producer: edge/gateway BFF (backed by `oak-segment-consensus` APIs)
- Versioning base path: `/ops/v1`

## Non-goals

- No direct consensus write operations in this contract
- No server-rendered HTML coupling
- No dependence on in-process dashboard templates

## Transport and Security

- Protocol: HTTPS
- Auth: bearer token or secure session cookie at gateway
- CORS: enforced at gateway, allowlisted dashboard origins only
- Cache: short-lived edge caching allowed for read endpoints

## Contract Rules

- All timestamps are ISO-8601 UTC strings.
- All numeric durations/ages are in milliseconds unless named otherwise.
- Unknown fields must be ignored by clients.
- New optional fields are non-breaking.
- Removing fields or changing field types requires `/ops/v2`.

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

Purpose: authoritative cluster topology + node readiness.

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

Purpose: consolidated health signal for dashboard and runbooks.

`data` shape:

```json
{
  "status": "healthy",
  "checks": {
    "cluster": "pass",
    "storage": "pass",
    "network": "pass",
    "api": "pass"
  }
}
```

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

### 15) `GET /ops/v1/proposals`

Purpose: proposal queue pressure + state lifecycle counts + type breakdown for matrix view.

`data` shape:

```json
{
  "queuePressure": {
    "pending": 2488,
    "mempool": 217,
    "backpressurePending": 92,
    "backpressureMax": 10000,
    "backpressureActive": false,
    "backpressureSent": 9402,
    "backpressureAcked": 9310
  },
  "states": {
    "unverified": 2488,
    "verified": 9698,
    "finalized": 9440,
    "rejected": 24
  },
  "types": {
    "write": 12186,
    "delete": 88,
    "total": 12274
  },
  "stateByType": {
    "write": {
      "unverified": null,
      "verified": null,
      "finalized": null,
      "rejected": null
    },
    "delete": {
      "unverified": null,
      "verified": null,
      "finalized": null,
      "rejected": null
    },
    "availability": "needs_upstream_counters"
  },
  "epochs": {
    "currentEpoch": 1057,
    "finalizedEpoch": 1055,
    "epochsUntilFinality": 2,
    "pendingEpochs": 3,
    "totalQueued": 12186
  }
}
```

### 16) `GET /ops/v1/proposals/epochs`

Purpose: authoritative epoch residency and priority-lane flow for proposal lifecycle.

This endpoint is the primary control-plane view for understanding:

- How much load is currently on the Aeron fast path (`priority`)
- How much is buffered in epoch windows (`express`, `standard`)
- Whether epoch staging is reducing TarMK DAG fanout by packing writes before finality

`data` shape:

```json
{
  "currentEpoch": 1057,
  "finalizedEpoch": 1055,
  "pendingEpochs": 3,
  "epochsUntilFinality": 2,
  "source": "upstream-epoch-counters",
  "note": "All counters are epoch-resident and priority-aware.",
  "blocks": [
    {
      "label": "Finalized",
      "epoch": 1055,
      "status": "finalized",
      "byPriority": {
        "standard": { "unverified": 0, "verified": 0, "finalized": 6040, "rejected": 4 },
        "express": { "unverified": 0, "verified": 0, "finalized": 3020, "rejected": 2 },
        "priority": { "unverified": 0, "verified": 0, "finalized": 380, "rejected": 0 }
      },
      "totals": { "unverified": 0, "verified": 0, "finalized": 9440, "rejected": 6 },
      "flowToNext": 258
    },
    {
      "label": "Next to be Finalized",
      "epoch": 1056,
      "status": "next",
      "byPriority": {
        "standard": { "unverified": 0, "verified": 150, "finalized": 0, "rejected": 0 },
        "express": { "unverified": 0, "verified": 80, "finalized": 0, "rejected": 0 },
        "priority": { "unverified": 0, "verified": 28, "finalized": 0, "rejected": 0 }
      },
      "totals": { "unverified": 0, "verified": 258, "finalized": 0, "rejected": 0 },
      "flowToNext": 2488
    },
    {
      "label": "Current",
      "epoch": 1057,
      "status": "current",
      "byPriority": {
        "standard": { "unverified": 1900, "verified": 0, "finalized": 0, "rejected": 0 },
        "express": { "unverified": 420, "verified": 0, "finalized": 0, "rejected": 0 },
        "priority": { "unverified": 168, "verified": 0, "finalized": 0, "rejected": 0 }
      },
      "totals": { "unverified": 2488, "verified": 0, "finalized": 0, "rejected": 0 },
      "flowToNext": 0
    }
  ],
  "aeronLoad": {
    "priorityIngressRatePerSec": 132,
    "priorityPendingAcks": 14,
    "priorityAckLatencyP95Ms": 18,
    "priorityBackpressurePending": 9
  },
  "packing": {
    "writesBufferedCurrentEpoch": 2320,
    "writesReleasedAtFinality": 9440,
    "estimatedFanoutReductionPct": 41.2
  }
}
```

Required upstream semantics:

- Every proposal is assigned immutable metadata at ingest:
  - `priorityClass`: `standard | express | priority`
  - `ingestEpoch`
  - `targetFinalityEpoch` (`+2`, `+1`, or immediate)
- Counters are maintained by `(epoch, priorityClass, state)` and rolled forward by epoch transitions.
- Dashboard adapters must not infer epoch residency from global aggregate counters when first-class epoch counters are available.

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

## Source Mapping (`oak-segment-consensus` -> `/ops/v1`)

- `/v1/consensus/status` -> `/ops/v1/overview`, `/ops/v1/transactions/*`
- `/v1/aeron/cluster-state` -> `/ops/v1/cluster`
- `/v1/aeron/raft-metrics` -> `/ops/v1/raft`
- `/v1/aeron/replication-lag` -> `/ops/v1/replication`
- `/v1/proposals/queue/stats` -> `/ops/v1/queue`
- `/v1/proposals/queue/stats` -> `/ops/v1/proposals`
- `/v1/proposals/queue/stats` + `/v1/consensus/status` (+ epoch/priority counters when available) -> `/ops/v1/proposals/epochs`
- `/health/deep` -> `/ops/v1/health`
- `/v1/events/recent` -> `/ops/v1/events/recent`
- `/v1/events/stats` -> `/ops/v1/events/stats`
- `/v1/consensus/status` + `/v1/proposals/queue/stats` -> `/ops/v1/finality`
- `/api/segments/tars` (+ `/health/deep` for head metadata) -> `/ops/v1/tarmk`
- `/api/segments/tars` -> `/ops/v1/tar-chain`

## Backward and Forward Compatibility

- UI must not depend on undocumented fields.
- Gateway may compose from multiple upstream endpoints.
- Upstream shape drift is absorbed by gateway adapters, not dashboard blocks.

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
- Live proxy mode:
  - `OPS_MOCK_MODE=proxy OPS_UPSTREAM_BASE=http://127.0.0.1:8090 npm run mock:ops`
  - Adapts `oak-segment-consensus` endpoint shapes into this contract envelope.
