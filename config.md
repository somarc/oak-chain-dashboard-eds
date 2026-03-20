# Config & Tuning

Read-only OSGi/runtime tuning visibility for Oak Chain operations.

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

## Runtime Config Drift

| Ops Config Tuning |
| --- |

## Notes

- Uses `/ops/v1/config/osgi`, `/ops/v1/config/osgi/sources`, `/ops/v1/config/osgi/coverage`, `/ops/v1/config/osgi/delta`, and `/ops/v1/blockchain/config`.
- Blockchain section explicitly consumes `configSource`, `gasModel`, and `tiers` for display-only operator awareness.
- UI remains read-only; tune knobs via startup flags / OSGi config flow.
