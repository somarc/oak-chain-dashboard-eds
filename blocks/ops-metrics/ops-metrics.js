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

function resolvePrimaryMetric(payload, title = '') {
  if (payload === null || payload === undefined) return 'n/a';
  if (typeof payload === 'string' || typeof payload === 'number' || typeof payload === 'boolean') {
    return String(payload);
  }

  if (Array.isArray(payload)) {
    return `${payload.length} item(s)`;
  }

  const cardTitle = title.toLowerCase();

  if (cardTitle.includes('overview') || cardTitle.includes('consensus')) {
    return `status: ${String(pickValue(payload, ['status'], 'unknown'))}`;
  }

  if (cardTitle.includes('cluster')) {
    const state = pickValue(payload, ['clusterState', 'state'], 'unknown');
    const leader = pickValue(payload, ['leaderNodeId'], 'n/a');
    return `state: ${state}, leader: ${leader}`;
  }

  if (cardTitle.includes('raft')) {
    const term = pickValue(payload, ['term', 'currentTerm'], 'n/a');
    const commit = pickValue(payload, ['commitIndex'], 'n/a');
    return `term: ${term}, commit: ${commit}`;
  }

  if (cardTitle.includes('replication')) {
    const lag = pickValue(payload, ['maxLagMs', 'replicationLag'], 'n/a');
    const status = pickValue(payload, ['status'], 'unknown');
    return `maxLagMs: ${lag}, ${status}`;
  }

  if (cardTitle.includes('queue')) {
    const pending = pickValue(payload, ['pendingCount', 'pending', 'batchQueueSize'], 0);
    const mempool = pickValue(payload, ['mempoolCount', 'mempool', 'mempoolPendingCount'], 0);
    return `pending: ${pending}, mempool: ${mempool}`;
  }

  if (cardTitle.includes('health')) {
    const status = String(pickValue(payload, ['status', 'health'], 'unknown'));
    const deep = payload.deep || {};
    const clusterReachable = pickValue(deep.cluster || {}, ['reachableCount'], 'n/a');
    const clusterTotal = pickValue(deep.cluster || {}, ['totalMembers'], 'n/a');
    const diskUsage = pickValue(deep.diskSpace || {}, ['usagePercent'], null);
    const ipfs = String(pickValue(deep.blobStore || {}, ['status'], 'unknown'));
    const diskLabel = diskUsage === null || diskUsage === undefined ? 'n/a' : `${diskUsage}%`;
    return `status: ${status}, cluster: ${clusterReachable}/${clusterTotal}, disk: ${diskLabel}, ipfs: ${ipfs}`;
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
      return `${key}: ${String(payload[key])}`;
    }
  }

  return `${Object.keys(payload).length} field(s)`;
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

  const detail = document.createElement('p');
  detail.className = 'ops-metrics-card-detail';
  detail.textContent = 'Awaiting first sample';

  card.append(heading, metric, detail);
  return { card, metric, detail, title };
}

async function updateCard(cardElements, baseUrl, endpoint) {
  const { card, metric, detail } = cardElements;
  const target = buildUrl(baseUrl, endpoint);
  if (!target) {
    card.dataset.state = 'error';
    metric.textContent = 'Missing endpoint';
    detail.textContent = 'Configure endpoint in block content.';
    return;
  }

  try {
    const response = await fetch(target, { headers: { Accept: 'application/json' } });
    if (!response.ok) {
      throw new Error(`HTTP ${response.status}`);
    }

    const payload = unwrapEnvelope(await response.json());
    card.dataset.state = 'ok';
    metric.textContent = resolvePrimaryMetric(payload, cardElements.title);
    detail.textContent = `Updated ${new Date().toLocaleTimeString()}`;
  } catch (error) {
    card.dataset.state = 'error';
    metric.textContent = 'Unavailable';
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

  const cards = endpointPairs.map(([title, endpoint]) => {
    const card = createCard(title);
    grid.append(card.card);
    return { endpoint, ...card };
  });

  shell.append(heading, grid);
  block.replaceChildren(shell);

  const tick = () => Promise.all(cards.map((entry) => updateCard(entry, baseUrl, entry.endpoint)));
  tick();
  window.setInterval(tick, Math.max(1, refreshSeconds) * 1000);
}
