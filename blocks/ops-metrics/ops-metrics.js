import { readBlockConfig } from '../../scripts/aem.js';
import { getOpsRuntimeConfig } from '../../scripts/ops-runtime-config.js';

function buildUrl(base, path) {
  if (!path) return null;
  const normalizedBase = (base || '').replace(/\/$/, '');
  const normalizedPath = path.startsWith('/') ? path : `/${path}`;
  return `${normalizedBase}${normalizedPath}`;
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

function pickValue(payload, keys, fallback) {
  if (!payload || typeof payload !== 'object') return fallback;
  for (let i = 0; i < keys.length; i += 1) {
    const value = payload[keys[i]];
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
    const leader = pickValue(payload, ['leaderNodeId'], 'n/a');
    const nodes = pickValue(payload, ['nodes'], []);
    const nodeCount = Array.isArray(nodes) ? nodes.length : asNum(pickValue(payload, ['nodeCount'], 0), 0);
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
  const target = buildUrl(baseUrl, endpoint);
  if (!target) {
    card.dataset.state = 'error';
    metric.textContent = 'Missing endpoint';
    setCardKpis(kpis, []);
    detail.textContent = 'Configure endpoint in block content.';
    return;
  }

  try {
    const response = await fetch(target, { headers: { Accept: 'application/json' } });
    if (!response.ok) {
      throw new Error(`HTTP ${response.status}`);
    }

    const payload = unwrapEnvelope(await response.json());
    const model = buildCardViewModel(payload, cardElements.title);
    card.dataset.state = 'ok';
    metric.textContent = model.headline;
    setCardKpis(kpis, model.pills);
    detail.textContent = '';
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
    ['Consensus Status', readConfig(config, 'consensus-status', 'consensusStatus') || runtime.endpoints.overview],
    ['Cluster State', readConfig(config, 'cluster-state', 'clusterState') || runtime.endpoints.cluster],
    ['Raft Metrics', readConfig(config, 'raft-metrics', 'raftMetrics') || runtime.endpoints.raft],
    ['Replication Lag', readConfig(config, 'replication-lag', 'replicationLag') || runtime.endpoints.replication],
    ['Queue Stats', readConfig(config, 'queue-stats', 'queueStats') || runtime.endpoints.queue],
    ['Health Deep', readConfig(config, 'health-deep', 'healthDeep') || runtime.endpoints.health],
  ].filter(([, endpoint]) => Boolean(endpoint));

  const shell = document.createElement('div');
  shell.className = 'ops-metrics-shell';

  const heading = document.createElement('p');
  heading.className = 'ops-metrics-shell-meta';
  heading.textContent = `Polling ${baseUrl} every ${refreshSeconds}s`;

  const grid = document.createElement('div');
  grid.className = 'ops-metrics-grid';

  const updated = document.createElement('p');
  updated.className = 'ops-metrics-shell-updated';
  updated.textContent = 'Updated --';

  const cards = endpointPairs.map(([title, endpoint]) => {
    const card = createCard(title);
    grid.append(card.card);
    return { endpoint, ...card };
  });

  shell.append(heading, grid, updated);
  block.replaceChildren(shell);

  const tick = () => Promise.all(cards.map((entry) => updateCard(entry, baseUrl, entry.endpoint)))
    .finally(() => {
      updated.textContent = `Updated ${new Date().toLocaleTimeString()}`;
    });
  tick();
  window.setInterval(tick, Math.max(1, refreshSeconds) * 1000);
}
