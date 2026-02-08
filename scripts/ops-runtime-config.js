const DEFAULT_OPS_RUNTIME_CONFIG = Object.freeze({
  apiBase: 'http://127.0.0.1:8787',
  refreshSeconds: Object.freeze({
    header: 5,
    metrics: 3,
    feed: 4,
    proposals: 4,
    signals: 4,
    raftCluster: 4,
    finality: 5,
    tarmk: 8,
    tarChain: 8,
    configTuning: 30,
    gcStatus: 30,
  }),
  endpoints: Object.freeze({
    explorerSummary: '/ops/v1/explorer/summary',
    header: '/ops/v1/header',
    overview: '/ops/v1/overview',
    cluster: '/ops/v1/cluster',
    raft: '/ops/v1/raft',
    replication: '/ops/v1/replication',
    queue: '/ops/v1/queue',
    durability: '/ops/v1/durability',
    health: '/ops/v1/health',
    proposals: '/ops/v1/proposals',
    signals: '/ops/v1/signals',
    proposalsEpochs: '/ops/v1/proposals/epochs',
    eventsRecent: '/ops/v1/events/recent',
    eventsStats: '/ops/v1/events/stats',
    finality: '/ops/v1/finality',
    tarmk: '/ops/v1/tarmk',
    tarChain: '/ops/v1/tar-chain',
    configOsgi: '/ops/v1/config/osgi',
    configOsgiSchema: '/ops/v1/config/osgi/schema',
    configOsgiSources: '/ops/v1/config/osgi/sources',
    configOsgiCoverage: '/ops/v1/config/osgi/coverage',
    configOsgiDelta: '/ops/v1/config/osgi/delta',
    gcStatus: '/ops/v1/gc/status',
    gcEstimate: '/ops/v1/gc/estimate',
    compactionProposals: '/ops/v1/compaction/proposals',
    fragmentationMetrics: '/ops/v1/fragmentation/metrics',
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
