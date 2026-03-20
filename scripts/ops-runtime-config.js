const DEFAULT_OPS_RUNTIME_CONFIG = Object.freeze({
  apiBase: 'http://127.0.0.1:8787',
  refreshSeconds: Object.freeze({
    header: 0,
    metrics: 0,
    feed: 0,
    proposals: 0,
    signals: 0,
    raftCluster: 0,
    finality: 0,
    queueStats: 0,
    tarmk: 0,
    tarChain: 0,
    configTuning: 0,
    gcStatus: 0,
  }),
  endpoints: Object.freeze({
    explorerSummary: '/ops/v1/explorer/summary',
    explorerReleaseFlow: '/ops/v1/explorer/release-flow',
    header: '/ops/v1/header',
    overview: '/ops/v1/overview',
    cluster: '/ops/v1/cluster',
    raft: '/ops/v1/raft',
    replication: '/ops/v1/replication',
    queue: '/ops/v1/queue',
    durability: '/ops/v1/durability',
    health: '/ops/v1/health',
    proposals: '/ops/v1/proposals',
    proposalsReleaseFlow: '/ops/v1/proposals/release-flow',
    proposalsQueueStats: '/ops/v1/proposals/queue/stats',
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
    blockchainConfig: '/ops/v1/blockchain/config',
    gcStatus: '/ops/v1/gc/status',
    gcEstimate: '/ops/v1/gc/estimate',
    gcAccount: '/ops/v1/gc/account/{walletAddress}',
    compactionProposals: '/ops/v1/compaction/proposals',
    fragmentationMetrics: '/ops/v1/fragmentation/metrics',
  }),
  defaults: Object.freeze({
    selfNodeId: 0,
    gcWallet: '0x742d35Cc6634C0532925a3b844Bc9e7595f0bEb0',
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
