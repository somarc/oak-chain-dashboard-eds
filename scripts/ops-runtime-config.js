const DIRECT_ENDPOINTS = Object.freeze({
  apiIndex: '/ops/v1/index',
  explorerSummary: '/ops/v1/explorer/summary',
  explorerProposal: '/ops/v1/explorer/proposals/{proposalId}',
  explorerWallet: '/ops/v1/explorer/wallets/{walletAddress}',
  explorerReleaseFlow: '/ops/v1/explorer/release-flow',
  explorerContentNav: '/ops/v1/explorer/content/nav',
  explorerContentTree: '/ops/v1/explorer/content/clusters/{clusterId}/tree',
  explorerContentNode: '/ops/v1/explorer/content/clusters/{clusterId}/node',
  explorerContentProvenance: '/ops/v1/explorer/content/clusters/{clusterId}/provenance',
  header: '/ops/v1/header',
  overview: '/ops/v1/overview',
  cluster: '/ops/v1/cluster',
  network: '/ops/v1/network',
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
  runtimeAeron: '/ops/v1/runtime/aeron',
  runtimeMediaDriver: '/ops/v1/runtime/media-driver',
  runtimeStorage: '/ops/v1/runtime/storage',
  runtimeBlobStore: '/ops/v1/runtime/blobstore',
  runtimeMetrics: '/ops/v1/runtime/metrics',
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
});

const EDGE_WORKER_ENDPOINTS = Object.freeze({
  apiIndex: '/oak-chain-action?route=index',
  explorerSummary: '/oak-chain-action?route=explorer/summary',
  explorerProposal: '/oak-chain-action?route=explorer/proposals/{proposalId}',
  explorerWallet: '/oak-chain-action?route=explorer/wallets/{walletAddress}',
  header: '/oak-chain-action?route=header',
  overview: '/oak-chain-action?route=overview',
  cluster: '/oak-chain-action?route=cluster',
  network: '/oak-chain-action?route=network',
  raft: '/oak-chain-action?route=raft',
  replication: '/oak-chain-action?route=replication',
  queue: '/oak-chain-action?route=queue',
  durability: '/oak-chain-action?route=durability',
  health: '/oak-chain-action?route=health',
  proposals: '/oak-chain-action?route=proposals',
  explorerReleaseFlow: '/oak-chain-action?route=explorer/release-flow',
  explorerContentNav: '/oak-chain-action?route=explorer/content/nav',
  explorerContentTree: '/oak-chain-action?route=explorer/content/clusters/{clusterId}/tree',
  explorerContentNode: '/oak-chain-action?route=explorer/content/clusters/{clusterId}/node',
  explorerContentProvenance: '/oak-chain-action?route=explorer/content/clusters/{clusterId}/provenance',
  proposalsReleaseFlow: '/oak-chain-action?route=proposals/release-flow',
  proposalsQueueStats: '/oak-chain-action?route=proposals/queue/stats',
  signals: '/oak-chain-action?route=signals',
  proposalsEpochs: '/oak-chain-action?route=proposals/epochs',
  eventsRecent: '/oak-chain-action?route=events/recent',
  eventsStats: '/oak-chain-action?route=events/stats',
  finality: '/oak-chain-action?route=finality',
  tarmk: '/oak-chain-action?route=tarmk',
  tarChain: '/oak-chain-action?route=tar-chain',
  runtimeAeron: '/oak-chain-action?route=runtime/aeron',
  runtimeMediaDriver: '/oak-chain-action?route=runtime/media-driver',
  runtimeStorage: '/oak-chain-action?route=runtime/storage',
  runtimeBlobStore: '/oak-chain-action?route=runtime/blobstore',
  runtimeMetrics: '/oak-chain-action?route=runtime/metrics',
  configOsgi: '/oak-chain-action?route=config/osgi',
  configOsgiSchema: '/oak-chain-action?route=config/osgi/schema',
  configOsgiSources: '/oak-chain-action?route=config/osgi/sources',
  configOsgiCoverage: '/oak-chain-action?route=config/osgi/coverage',
  configOsgiDelta: '/oak-chain-action?route=config/osgi/delta',
  gcStatus: '/oak-chain-action?route=gc/status',
  gcEstimate: '/oak-chain-action?route=gc/estimate',
  gcAccount: '/oak-chain-action?route=gc/account/{walletAddress}',
  compactionProposals: '/oak-chain-action?route=compaction/proposals',
  fragmentationMetrics: '/oak-chain-action?route=fragmentation/metrics',
});

const POLLING_REFRESH_SECONDS = Object.freeze({
  header: 30,
  metrics: 30,
  feed: 30,
  proposals: 30,
  signals: 30,
  raftCluster: 30,
  finality: 30,
  queueStats: 30,
  tarmk: 30,
  tarChain: 30,
  configTuning: 30,
  gcStatus: 30,
});

const BASE_OPS_RUNTIME_CONFIG = Object.freeze({
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
  endpoints: DIRECT_ENDPOINTS,
  defaults: Object.freeze({
    selfNodeId: 0,
    gcWallet: '0x742d35Cc6634C0532925a3b844Bc9e7595f0bEb0',
  }),
});

const LOCAL_OPS_RUNTIME_CONFIG = Object.freeze({
  ...BASE_OPS_RUNTIME_CONFIG,
  apiBase: 'http://127.0.0.1:8787',
});

const HOSTED_EDGE_OPS_RUNTIME_CONFIG = Object.freeze({
  ...BASE_OPS_RUNTIME_CONFIG,
  apiBase: 'https://316182-blocknarration-stage.adobeio-static.net/api/v1/web/oak-chain-edge-worker',
  refreshSeconds: POLLING_REFRESH_SECONDS,
  endpoints: EDGE_WORKER_ENDPOINTS,
});

const OAKCHAIN_OPS_RUNTIME_CONFIG = Object.freeze({
  ...BASE_OPS_RUNTIME_CONFIG,
  apiBase: 'https://ops.oakchain.net',
  refreshSeconds: POLLING_REFRESH_SECONDS,
});

const DIRECT_RUNNER_ENDPOINTS = Object.freeze({
  suites: '/runner/v1/suites',
  suite: '/runner/v1/suites/{suiteId}',
  testRuns: '/runner/v1/test-runs',
  run: '/runner/v1/test-runs/{runId}',
  inputs: '/runner/v1/test-runs/{runId}/inputs',
  events: '/runner/v1/test-runs/{runId}/events',
  artifacts: '/runner/v1/test-runs/{runId}/artifacts',
  cancel: '/runner/v1/test-runs/{runId}/cancel',
});

const BASE_RUNNER_RUNTIME_CONFIG = Object.freeze({
  refreshSeconds: Object.freeze({
    runs: 15,
    run: 10,
    events: 6,
    artifacts: 20,
  }),
  endpoints: DIRECT_RUNNER_ENDPOINTS,
  defaults: Object.freeze({
    suiteId: 'mock-scale-staircase',
    attachArtifactRoot: '/tmp/oak-mock-scale-staircase-artifacts',
  }),
});

const LOCAL_RUNNER_RUNTIME_CONFIG = Object.freeze({
  ...BASE_RUNNER_RUNTIME_CONFIG,
  apiBase: 'http://127.0.0.1:8795',
});

const PENDING_RUNNER_RUNTIME_CONFIG = Object.freeze({
  ...BASE_RUNNER_RUNTIME_CONFIG,
  apiBase: '',
});

function isLocalHostname(hostname) {
  return hostname === 'localhost' || hostname === '127.0.0.1';
}

function isOakchainHostname(hostname) {
  return hostname === 'oakchain.net' || hostname.endsWith('.oakchain.net');
}

function resolveDefaultOpsRuntimeConfig() {
  const hostname = String(window.location.hostname || '').toLowerCase();
  if (isLocalHostname(hostname)) {
    return LOCAL_OPS_RUNTIME_CONFIG;
  }
  if (isOakchainHostname(hostname)) {
    return OAKCHAIN_OPS_RUNTIME_CONFIG;
  }
  return HOSTED_EDGE_OPS_RUNTIME_CONFIG;
}

function resolveDefaultRunnerRuntimeConfig() {
  const hostname = String(window.location.hostname || '').toLowerCase();
  if (isLocalHostname(hostname)) {
    return LOCAL_RUNNER_RUNTIME_CONFIG;
  }
  return PENDING_RUNNER_RUNTIME_CONFIG;
}

export function getOpsRuntimeConfig() {
  const defaults = resolveDefaultOpsRuntimeConfig();
  const override = window.OAK_OPS_RUNTIME_CONFIG || {};
  return {
    ...defaults,
    ...override,
    refreshSeconds: {
      ...defaults.refreshSeconds,
      ...(override.refreshSeconds || {}),
    },
    endpoints: {
      ...defaults.endpoints,
      ...(override.endpoints || {}),
    },
    defaults: {
      ...defaults.defaults,
      ...(override.defaults || {}),
    },
  };
}

export function getRunnerRuntimeConfig() {
  const defaults = resolveDefaultRunnerRuntimeConfig();
  const override = window.OAK_RUNNER_RUNTIME_CONFIG || {};
  return {
    ...defaults,
    ...override,
    refreshSeconds: {
      ...defaults.refreshSeconds,
      ...(override.refreshSeconds || {}),
    },
    endpoints: {
      ...defaults.endpoints,
      ...(override.endpoints || {}),
    },
    defaults: {
      ...defaults.defaults,
      ...(override.defaults || {}),
    },
  };
}
