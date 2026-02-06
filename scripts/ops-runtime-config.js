const DEFAULT_OPS_RUNTIME_CONFIG = Object.freeze({
  apiBase: 'http://127.0.0.1:8787',
  refreshSeconds: Object.freeze({
    header: 5,
    metrics: 3,
    feed: 4,
    proposals: 4,
    raftCluster: 4,
    finality: 5,
    tarmk: 8,
    tarChain: 8,
  }),
  endpoints: Object.freeze({
    header: '/ops/v1/header',
    overview: '/ops/v1/overview',
    cluster: '/ops/v1/cluster',
    raft: '/ops/v1/raft',
    replication: '/ops/v1/replication',
    queue: '/ops/v1/queue',
    durability: '/ops/v1/durability',
    health: '/ops/v1/health',
    proposals: '/ops/v1/proposals',
    eventsRecent: '/ops/v1/events/recent',
    eventsStats: '/ops/v1/events/stats',
    finality: '/ops/v1/finality',
    tarmk: '/ops/v1/tarmk',
    tarChain: '/ops/v1/tar-chain',
  }),
  defaults: Object.freeze({
    selfNodeId: 0,
  }),
});

export function getOpsRuntimeConfig() {
  const override = window.OAK_OPS_RUNTIME_CONFIG || {};
  return {
    ...DEFAULT_OPS_RUNTIME_CONFIG,
    ...override,
    refreshSeconds: {
      ...DEFAULT_OPS_RUNTIME_CONFIG.refreshSeconds,
      ...(override.refreshSeconds || {}),
    },
    endpoints: {
      ...DEFAULT_OPS_RUNTIME_CONFIG.endpoints,
      ...(override.endpoints || {}),
    },
    defaults: {
      ...DEFAULT_OPS_RUNTIME_CONFIG.defaults,
      ...(override.defaults || {}),
    },
  };
}
