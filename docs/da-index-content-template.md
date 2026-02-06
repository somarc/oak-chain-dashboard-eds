# Oak Chain Aeron Operations

API-first control plane observability for `oak-segment-consensus`, delivered through EDS blocks.

Note: blocks below are marker-only by design. API base/endpoints/refresh behavior are controlled in code (`scripts/ops-runtime-config.js`), not DA content.

## Live Cluster View

| Ops Metrics |
| --- |

## Proposal State Matrix

| Proposal State Matrix |
| --- |

## Event Flow

| Ops Feed |
| --- |

## Aeron Raft Cluster

| Aeron Raft Cluster |
| --- |

## Ethereum Epoch Finality Pipeline

| Ethereum Epoch Pipeline |
| --- |

## TarMK Growth State

| TarMK Growth State |
| --- |

## TAR File Chain

| TAR File Chain |
| --- |

## Runbook Hooks

- Validate cluster baseline with `/ops/v1/health`, `/ops/v1/cluster`, and `/ops/v1/overview`.
- Confirm write path pressure with `/ops/v1/queue` and `/ops/v1/events/stats`.
- Track leader and lag movement with `/ops/v1/cluster` and `/ops/v1/replication`.
- Keep UI as a read model only; use API and CLI for operational actions.

## API Coverage

| Cards |
| --- |
| Overview |
| Cluster |
| Raft |
| Replication |
| Queue |
| Proposals |
| Durability |
| Health |
| Events Recent |
| Events Stats |
| Transactions Summary |
| TarMK Growth State |
| TAR File Chain |

## Metadata

| Metadata | Value |
| --- | --- |
| nav | /nav |
| footer | /footer |
| template | default |
