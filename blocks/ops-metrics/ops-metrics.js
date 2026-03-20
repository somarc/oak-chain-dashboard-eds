import { readBlockConfig } from '../../scripts/aem.js';
import { getOpsRuntimeConfig } from '../../scripts/ops-runtime-config.js';

function buildUrl(base, path) {
  if (!path) return null;
  const normalizedBase = (base || '').replace(/\/$/, '');
  const normalizedPath = path.startsWith('/') ? path : `/${path}`;
  return `${normalizedBase}${normalizedPath}`;
}

function normalizePayloadForTitle(payload, title = '') {
  const cardTitle = String(title).toLowerCase();
  if (!payload || typeof payload !== 'object') return payload;
  if (cardTitle.includes('cluster') && payload.cluster && typeof payload.cluster === 'object') {
    return payload.cluster;
  }
  if (cardTitle.includes('consensus') && payload.cluster && typeof payload.cluster === 'object') {
    const cluster = payload.cluster;
    return {
      status: cluster.clusterState || payload.status || 'unknown',
      role: cluster.role,
      term: cluster.currentTerm,
      leader: payload.identities && payload.identities.validatorWalletAddress
        ? { role: cluster.role, term: cluster.currentTerm, wallet: payload.identities.validatorWalletAddress }
        : undefined,
    };
  }
  return payload;
}

function readConfig(config, ...keys) {
  for (let i = 0; i < keys.length; i += 1) {
    const key = keys[i];
    if (config[key] !== undefined && config[key] !== null && config[key] !== '') {
      return config[key];
    }
  }
  return undefined;
}

function getByPath(payload, key) {
  if (!payload || typeof payload !== 'object' || !key) return undefined;
  if (!key.includes('.')) return payload[key];
  const parts = key.split('.');
  let current = payload;
  for (let i = 0; i < parts.length; i += 1) {
    const part = parts[i];
    if (!current || typeof current !== 'object' || !(part in current)) {
      return undefined;
    }
    current = current[part];
  }
  return current;
}

function pickValue(payload, keys, fallback) {
  if (!payload || typeof payload !== 'object') return fallback;
  for (let i = 0; i < keys.length; i += 1) {
    const value = getByPath(payload, keys[i]);
    if (value !== undefined && value !== null) {
      return value;
    }
  }
  return fallback;
}

function asNum(value, fallback = 0) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
}

function resolveConsensusRole(payload) {
  const directRole = pickValue(payload, ['currentRole', 'role', 'leaderRole'], null);
  if (directRole) return String(directRole).toUpperCase();
  const leader = pickValue(payload, ['leader'], null);
  if (leader && typeof leader === 'object' && leader.role) {
    return String(leader.role).toUpperCase();
  }
  const cluster = pickValue(payload, ['cluster'], null);
  if (cluster && typeof cluster === 'object' && cluster.role) {
    return String(cluster.role).toUpperCase();
  }
  return 'N/A';
}

function resolveConsensusTerm(payload) {
  const directTerm = pickValue(payload, ['term', 'currentTerm'], null);
  if (directTerm !== null && directTerm !== undefined) return String(directTerm);
  const leader = pickValue(payload, ['leader'], null);
  if (leader && typeof leader === 'object' && leader.term !== undefined && leader.term !== null) {
    return String(leader.term);
  }
  return 'n/a';
}

function buildCardViewModel(payload, title = '') {
  if (payload === null || payload === undefined) {
    return { headline: 'n/a', pills: [] };
  }

  if (typeof payload === 'string' || typeof payload === 'number' || typeof payload === 'boolean') {
    return { headline: String(payload), pills: [] };
  }

  if (Array.isArray(payload)) {
    return { headline: `${payload.length} item(s)`, pills: [] };
  }

  const cardTitle = title.toLowerCase();

  if (cardTitle.includes('overview') || cardTitle.includes('consensus')) {
    const status = String(pickValue(payload, ['status'], 'unknown')).toUpperCase();
    return {
      headline: status,
      pills: [
        { label: 'role', value: resolveConsensusRole(payload) },
        { label: 'term', value: resolveConsensusTerm(payload) },
      ],
    };
  }

  if (cardTitle.includes('cluster')) {
    const state = pickValue(payload, ['clusterState', 'state'], 'unknown');
    const leader = pickValue(payload, ['leaderNodeId', 'currentLeader', 'leader'], 'n/a');
    const nodes = getByPath(payload, 'nodes');
    const nodeCount = Array.isArray(nodes)
      ? nodes.length
      : asNum(pickValue(payload, ['nodeCount', 'reachableValidators'], 0), 0);
    return {
      headline: String(state).toUpperCase(),
      pills: [
        { label: 'leader', value: String(leader) },
        { label: 'nodes', value: String(nodeCount) },
      ],
    };
  }

  if (cardTitle.includes('raft')) {
    const term = pickValue(payload, ['term', 'currentTerm'], 'n/a');
    const commit = pickValue(payload, ['commitIndex'], 'n/a');
    const epoch = pickValue(payload, ['currentEpoch', 'epoch'], 'n/a');
    return {
      headline: `TERM ${term}`,
      pills: [
        { label: 'commit', value: String(commit) },
        { label: 'epoch', value: String(epoch) },
      ],
    };
  }

  if (cardTitle.includes('replication')) {
    const lag = pickValue(payload, ['maxLagMs', 'replicationLag'], 'n/a');
    const status = pickValue(payload, ['status'], 'unknown');
    const p95 = pickValue(payload, ['p95LagMs'], 'n/a');
    return {
      headline: `${lag} ms`,
      pills: [
        { label: 'status', value: String(status).toUpperCase() },
        { label: 'p95', value: `${p95} ms` },
      ],
    };
  }

  if (cardTitle.includes('queue')) {
    const queuePending = pickValue(payload, ['queuePendingCount', 'pendingCount', 'pending', 'batchQueueSize'], 0);
    const mempool = pickValue(payload, ['mempoolCount', 'mempool', 'mempoolPendingCount'], 0);
    const backpressure = pickValue(payload, ['backpressurePendingCount'], 0);
    return {
      headline: `${queuePending}`,
      pills: [
        { label: 'queue', value: String(queuePending) },
        { label: 'mempool', value: String(mempool) },
        { label: 'backpressure', value: String(backpressure) },
      ],
    };
  }

  if (cardTitle.includes('finality')) {
    const currentEpoch = pickValue(payload, ['currentEpoch', 'headEpoch'], 'n/a');
    const finalizedEpoch = pickValue(payload, ['finalizedEpoch', 'safeEpoch'], 'n/a');
    const epochsUntil = pickValue(payload, ['epochsUntilFinality', 'epochLag'], 'n/a');
    return {
      headline: `E${currentEpoch}`,
      pills: [
        { label: 'finalized', value: `E${finalizedEpoch}` },
        { label: 'until finality', value: String(epochsUntil) },
      ],
    };
  }

  if (cardTitle.includes('proposals')) {
    const pending = pickValue(
      payload,
      ['queuePressure.pending', 'queuePressure.queuePending', 'states.unverified', 'pendingCount'],
      0,
    );
    const verified = pickValue(payload, ['states.verified', 'verifiedCount', 'statesLifetime.verified'], 0);
    const finalized = pickValue(
      payload,
      ['states.finalized', 'totalFinalizedCount', 'statesLifetime.finalized', 'processedCount'],
      0,
    );
    return {
      headline: `${pending}`,
      pills: [
        { label: 'pending', value: String(pending) },
        { label: 'verified', value: String(verified) },
        { label: 'finalized', value: String(finalized) },
      ],
    };
  }

  if (cardTitle.includes('signals')) {
    const summary = pickValue(payload, ['summary'], {});
    const critical = pickValue(summary, ['critical'], 0);
    const warn = pickValue(summary, ['warn'], 0);
    const ok = pickValue(summary, ['ok'], 0);
    return {
      headline: `${critical} critical`,
      pills: [
        { label: 'warn', value: String(warn) },
        { label: 'ok', value: String(ok) },
      ],
    };
  }

  if (cardTitle.includes('config')) {
    const drift = pickValue(payload, ['summary.changedKeys', 'driftSummary.total', 'summary.totalDrifted'], 0);
    const coverage = pickValue(payload, ['coverage.percent', 'summary.coveragePercent'], 'n/a');
    const totalKeys = pickValue(payload, ['summary.totalKeys'], 'n/a');
    return {
      headline: `${drift} drift`,
      pills: [
        { label: 'coverage', value: String(coverage) },
        { label: 'keys', value: String(totalKeys) },
      ],
    };
  }

  if (cardTitle.includes('gc')) {
    const gcEnabled = pickValue(payload, ['gcEnabled'], null);
    const pendingDebt = pickValue(payload, ['pendingProposals', 'pendingDebt', 'debt.pending'], 0);
    const executable = pickValue(payload, ['gcConsensusRequired', 'executableDebt', 'debt.executable'], 0);
    const status = gcEnabled === false
      ? 'disabled'
      : (asNum(pendingDebt, 0) > 0 ? 'pending' : 'idle');
    return {
      headline: String(status).toUpperCase(),
      pills: [
        { label: 'pending', value: String(pendingDebt) },
        { label: 'consensus', value: String(executable) },
      ],
    };
  }

  if (cardTitle.includes('health')) {
    const status = String(pickValue(payload, ['status', 'health'], 'unknown'));
    const deep = payload.deep || {};
    const clusterReachable = pickValue(deep.cluster || {}, ['reachableCount'], 'n/a');
    const clusterTotal = pickValue(deep.cluster || {}, ['totalMembers'], 'n/a');
    const diskUsage = pickValue(deep.diskSpace || {}, ['usagePercent'], null);
    const ipfs = String(pickValue(deep.blobStore || {}, ['status'], 'unknown'));
    const diskLabel = diskUsage === null || diskUsage === undefined ? 'n/a' : `${diskUsage}%`;
    return {
      headline: status.toUpperCase(),
      pills: [
        { label: 'cluster', value: `${clusterReachable}/${clusterTotal}` },
        { label: 'disk', value: diskLabel },
        { label: 'ipfs', value: ipfs.toUpperCase() },
      ],
    };
  }

  const priorityKeys = [
    'status',
    'state',
    'leader',
    'clusterState',
    'currentEpoch',
    'term',
    'commitIndex',
    'mempoolCount',
    'pendingCount',
    'maxLagMs',
    'queueDepth',
    'lag',
    'healthy',
  ];

  for (let i = 0; i < priorityKeys.length; i += 1) {
    const key = priorityKeys[i];
    if (payload[key] !== undefined) {
      return { headline: String(payload[key]), pills: [{ label: key, value: String(payload[key]) }] };
    }
  }

  return { headline: `${Object.keys(payload).length} field(s)`, pills: [] };
}

function unwrapEnvelope(payload) {
  if (payload && typeof payload === 'object' && payload.data && typeof payload.data === 'object') {
    return payload.data;
  }
  return payload;
}

function createCard(title) {
  const card = document.createElement('article');
  card.className = 'ops-metrics-card';

  const heading = document.createElement('h3');
  heading.className = 'ops-metrics-card-title';
  heading.textContent = title;

  const metric = document.createElement('p');
  metric.className = 'ops-metrics-card-metric';
  metric.textContent = 'Loading...';

  const kpis = document.createElement('ul');
  kpis.className = 'ops-metrics-card-kpis';

  const detail = document.createElement('p');
  detail.className = 'ops-metrics-card-detail';
  detail.textContent = 'Awaiting first sample';

  card.append(heading, metric, kpis, detail);
  return { card, metric, kpis, detail, title };
}

function setCardKpis(kpisEl, pills) {
  if (!Array.isArray(pills) || pills.length === 0) {
    kpisEl.replaceChildren();
    return;
  }
  const rows = pills.slice(0, 4).map((pill) => {
    const li = document.createElement('li');
    li.className = 'ops-metrics-kpi-pill';
    const label = document.createElement('span');
    label.className = 'ops-metrics-kpi-label';
    label.textContent = pill.label;
    const value = document.createElement('strong');
    value.className = 'ops-metrics-kpi-value';
    value.textContent = pill.value;
    li.append(label, value);
    return li;
  });
  kpisEl.replaceChildren(...rows);
}

async function updateCard(cardElements, baseUrl, endpoint) {
  const { card, metric, kpis, detail } = cardElements;
  const endpointCandidates = Array.isArray(endpoint) ? endpoint.filter(Boolean) : [endpoint].filter(Boolean);
  if (!endpointCandidates.length) {
    card.dataset.state = 'error';
    metric.textContent = 'Missing endpoint';
    setCardKpis(kpis, []);
    detail.textContent = 'Configure endpoint in block content.';
    return;
  }

  let lastError = null;
  try {
    for (let i = 0; i < endpointCandidates.length; i += 1) {
      const target = buildUrl(baseUrl, endpointCandidates[i]);
      if (!target) continue;
      const response = await fetch(target, { headers: { Accept: 'application/json' } });
      if (!response.ok) {
        lastError = new Error(`HTTP ${response.status}`);
        continue;
      }
      const payload = normalizePayloadForTitle(unwrapEnvelope(await response.json()), cardElements.title);
      const model = buildCardViewModel(payload, cardElements.title);
      card.dataset.state = 'ok';
      metric.textContent = model.headline;
      setCardKpis(kpis, model.pills);
      detail.textContent = '';
      return;
    }
    throw lastError || new Error('No endpoint candidates succeeded');
  } catch (error) {
    card.dataset.state = 'error';
    metric.textContent = 'Unavailable';
    setCardKpis(kpis, []);
    detail.textContent = error.message;
  }
}

export default function decorate(block) {
  const runtime = getOpsRuntimeConfig();
  const config = readBlockConfig(block);
  const baseUrl = readConfig(config, 'api-base', 'apiBase') || runtime.apiBase;
  const refreshSeconds = Number(readConfig(config, 'refresh-seconds', 'refreshSeconds') || runtime.refreshSeconds.metrics);

  const endpointPairs = [
    ['Consensus Status', readConfig(config, 'consensus-status', 'consensusStatus') || [runtime.endpoints.explorerSummary, runtime.endpoints.overview]],
    ['Cluster State', readConfig(config, 'cluster-state', 'clusterState') || [runtime.endpoints.explorerSummary, runtime.endpoints.cluster]],
    ['Raft Metrics', readConfig(config, 'raft-metrics', 'raftMetrics') || runtime.endpoints.raft],
    ['Replication Lag', readConfig(config, 'replication-lag', 'replicationLag') || runtime.endpoints.replication],
    ['Queue Stats', readConfig(config, 'queue-stats', 'queueStats') || runtime.endpoints.queue],
    ['Finality', readConfig(config, 'finality', 'finalityEndpoint') || runtime.endpoints.finality],
    ['Proposals', readConfig(config, 'proposals', 'proposalsEndpoint') || runtime.endpoints.proposals],
    ['Ops Signals', readConfig(config, 'signals', 'signalsEndpoint') || runtime.endpoints.signals],
    ['Config Drift', readConfig(config, 'config-drift', 'configDrift') || runtime.endpoints.configOsgiDelta],
    ['GC Status', readConfig(config, 'gc-status', 'gcStatus') || runtime.endpoints.gcStatus],
    ['Health Deep', readConfig(config, 'health-deep', 'healthDeep') || runtime.endpoints.health],
  ].filter(([, endpoint]) => Boolean(endpoint));

  const shell = document.createElement('div');
  shell.className = 'ops-metrics-shell';

  const grid = document.createElement('div');
  grid.className = 'ops-metrics-grid';


  const cards = endpointPairs.map(([title, endpoint]) => {
    const card = createCard(title);
    grid.append(card.card);
    return { endpoint, ...card };
  });

  shell.append(grid);
  block.replaceChildren(shell);

  const tick = () => Promise.all(cards.map((entry) => updateCard(entry, baseUrl, entry.endpoint)));
  tick();
  const path = (window.location && window.location.pathname) || '/';
  const isOverviewPage = path === '/' || path === '/index' || path === '/index.html';
  if (isOverviewPage && refreshSeconds > 0) {
    window.setInterval(tick, Math.max(1, refreshSeconds) * 1000);
  }
}
