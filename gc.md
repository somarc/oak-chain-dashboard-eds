# GC & Compaction

Observe garbage collection pressure, reclaim estimates, and fragmentation posture.

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

## GC Operations State

| Ops GC Status |
| --- |
| wallet-address | 0x742d35Cc6634C0532925a3b844Bc9e7595f0bEb0 |

## Notes

- Read-only signals from `/ops/v1/gc/status`, `/ops/v1/gc/estimate`, `/ops/v1/gc/account/{walletAddress}`, `/ops/v1/compaction/proposals`, `/ops/v1/fragmentation/metrics`.
- Execute GC actions via API/CLI control plane flows only.
