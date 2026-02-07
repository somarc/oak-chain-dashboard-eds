# Oak Chain Aeron Operations

API-first control plane observability for `oak-segment-consensus`, delivered through EDS blocks.

---

| Ops Sidebar Nav |
| --- |
| [Cluster Overview](/) |
| [TarMK Storage](/tarmk) |

---

## Live Cluster View

| Ops Metrics |
| --- |

## Proposal State Matrix

| Proposal State Matrix |
| --- |

## Proposal Epoch Flow

| Proposal Epoch Flow |
| --- |

## Event Flow

| Ops Feed |
| --- |

## Ops Signals

| Ops Signals |
| --- |

## Aeron Raft Cluster

| Aeron Raft Cluster |
| --- |

## Ethereum Epoch Finality Pipeline

| Ethereum Epoch Pipeline |
| --- |

## Runbook Hooks

- Validate cluster baseline with `/ops/v1/overview`, `/ops/v1/cluster`, and `/ops/v1/health`.
- Confirm write path pressure with `/ops/v1/queue`, `/ops/v1/signals`, and `/ops/v1/events/stats`.
- Track leader and lag movement with `/ops/v1/cluster` and `/ops/v1/replication`.
- Keep UI as a read model only; use API and CLI for operational actions.

## API Coverage

| Cards |
| --- |
| Consensus Status |
| Aeron Cluster State |
| Raft Metrics |
| Replication Lag |
| Queue Stats |
| Proposals |
| Health Deep |
| Events Recent |
| Events Stats |
| Ops Signals |
