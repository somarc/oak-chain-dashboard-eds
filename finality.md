# Finality Operations

Track adaptive release posture alongside the Ethereum finality overlay and finalized counters from the control-plane API.

---

| Ops Sidebar Nav |
| --- |
| [Cluster Overview](/) |
| [Queue Stats](/queue) |
| [Finality](/finality) |
| [TarMK Storage](/tarmk) |
| [Config & Tuning](/config) |
| [GC & Compaction](/gc) |

---

## Finality Status

| Ops Finality Status |
| --- |

## Adaptive Release Flow

| Proposal Epoch Flow |
| --- |

## Proposal State Matrix

| Proposal State Matrix |
| --- |

## Notes

- Reads `/ops/v1/finality`, `/ops/v1/proposals`, and canonical `/ops/v1/proposals/release-flow`.
- `Proposal Epoch Flow` now visualizes adaptive packing, release-ready, and overflow stages. Deprecated `/ops/v1/proposals/epochs` data is compatibility-only.
- This page is read-only by design; use API/CLI flows for write-path control actions.
