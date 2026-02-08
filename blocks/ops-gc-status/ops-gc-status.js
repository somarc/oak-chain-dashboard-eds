import { readBlockConfig } from '../../scripts/aem.js';
import { getOpsRuntimeConfig } from '../../scripts/ops-runtime-config.js';
import { markOpsPageRefreshed, markOpsPageRefreshError } from '../../scripts/ops-refresh-status.js';

function readConfig(config, ...keys) {
  for (let i = 0; i < keys.length; i += 1) {
    const key = keys[i];
    if (config[key] !== undefined && config[key] !== null && config[key] !== '') return config[key];
  }
  return undefined;
}

function buildUrl(base, path) {
  if (!path) return null;
  const normalizedBase = (base || '').replace(/\/$/, '');
  const normalizedPath = path.startsWith('/') ? path : `/${path}`;
  return `${normalizedBase}${normalizedPath}`;
}

function unwrapEnvelope(payload) {
  if (payload && typeof payload === 'object' && payload.data && typeof payload.data === 'object') {
    return payload.data;
  }
  return payload;
}

function formatValue(value) {
  if (value === null || value === undefined) return '--';
  if (typeof value === 'number' && Number.isFinite(value)) return value.toLocaleString();
  if (typeof value === 'object') return JSON.stringify(value);
  return String(value);
}

function makeCard(title) {
  const card = document.createElement('article');
  card.className = 'ops-gc-status-card';
  card.innerHTML = `<h4>${title}</h4><p class="ops-gc-status-main">--</p><p class="ops-gc-status-detail"></p>`;
  return card;
}

export default function decorate(block) {
  const runtime = getOpsRuntimeConfig();
  const config = readBlockConfig(block);
  const apiBase = readConfig(config, 'api-base', 'apiBase') || runtime.apiBase;
  const refreshSeconds = Number(readConfig(config, 'refresh-seconds', 'refreshSeconds') || runtime.refreshSeconds.gcStatus || 30);

  const endpoints = {
    status: readConfig(config, 'gc-status-endpoint', 'gcStatusEndpoint') || runtime.endpoints.gcStatus,
    estimate: readConfig(config, 'gc-estimate-endpoint', 'gcEstimateEndpoint') || runtime.endpoints.gcEstimate,
    compaction: readConfig(config, 'compaction-endpoint', 'compactionEndpoint') || runtime.endpoints.compactionProposals,
    fragmentation: readConfig(config, 'fragmentation-endpoint', 'fragmentationEndpoint') || runtime.endpoints.fragmentationMetrics,
  };

  const shell = document.createElement('section');
  shell.className = 'ops-gc-status-shell';
  const controls = document.createElement('div');
  controls.className = 'ops-gc-status-controls';
  controls.innerHTML = `
    <button type="button" class="ops-gc-status-refresh ops-refresh-button">Refresh now</button>
    <label class="ops-gc-status-auto ops-refresh-toggle"><input type="checkbox" class="ops-refresh-checkbox"> Auto-refresh</label>
  `;

  const grid = document.createElement('div');
  grid.className = 'ops-gc-status-grid';
  const cards = {
    status: makeCard('GC Status'),
    estimate: makeCard('GC Estimate'),
    compaction: makeCard('Compaction Proposals'),
    fragmentation: makeCard('Fragmentation'),
  };
  grid.append(cards.status, cards.estimate, cards.compaction, cards.fragmentation);

  shell.append(grid);
  block.replaceChildren(shell);
  block.prepend(controls);
  const refreshButton = controls.querySelector('.ops-gc-status-refresh');
  const autoToggle = controls.querySelector('input[type="checkbox"]');
  let intervalId = null;

  const fetchJson = async (url) => {
    const response = await fetch(url, { headers: { Accept: 'application/json' } });
    const json = await response.json();
    if (!response.ok) {
      throw new Error(`${url}: HTTP ${response.status}`);
    }
    return unwrapEnvelope(json);
  };

  const renderError = (card, message) => {
    card.dataset.state = 'error';
    card.querySelector('.ops-gc-status-main').textContent = 'Unavailable';
    card.querySelector('.ops-gc-status-detail').textContent = message;
  };

  const refresh = async () => {
    const urls = {
      status: buildUrl(apiBase, endpoints.status),
      estimate: buildUrl(apiBase, endpoints.estimate),
      compaction: buildUrl(apiBase, endpoints.compaction),
      fragmentation: buildUrl(apiBase, endpoints.fragmentation),
    };

    try {
      const [status, estimate, compaction, fragmentation] = await Promise.all([
        fetchJson(urls.status),
        fetchJson(urls.estimate),
        fetchJson(urls.compaction),
        fetchJson(urls.fragmentation),
      ]);

      cards.status.dataset.state = 'ok';
      cards.status.querySelector('.ops-gc-status-main').textContent = (status.gcEnabled ? 'Enabled' : 'Disabled');
      cards.status.querySelector('.ops-gc-status-detail').textContent =
        `pending=${formatValue(status.pendingProposals)} consensusRequired=${formatValue(status.gcConsensusRequired)}`;

      cards.estimate.dataset.state = 'ok';
      cards.estimate.querySelector('.ops-gc-status-main').textContent = `${formatValue(estimate.reclaimableMB)} MB`;
      cards.estimate.querySelector('.ops-gc-status-detail').textContent =
        `cost=${formatValue(estimate.estimatedCostUSDC)} USDC`;

      const proposals = Array.isArray(compaction.proposals) ? compaction.proposals : [];
      cards.compaction.dataset.state = 'ok';
      cards.compaction.querySelector('.ops-gc-status-main').textContent = formatValue(proposals.length);
      cards.compaction.querySelector('.ops-gc-status-detail').textContent = proposals.length
        ? `top=${formatValue(proposals[0]?.proposalId || proposals[0]?.id || 'proposal')}`
        : 'No compaction proposals';

      const entities = Array.isArray(fragmentation.entities) ? fragmentation.entities : [];
      cards.fragmentation.dataset.state = 'ok';
      cards.fragmentation.querySelector('.ops-gc-status-main').textContent = formatValue(fragmentation.totalEntities || entities.length);
      cards.fragmentation.querySelector('.ops-gc-status-detail').textContent = entities.length
        ? `top=${formatValue(entities[0]?.walletAddress || entities[0]?.wallet || 'entity')}`
        : 'No fragmentation records';

      markOpsPageRefreshed('gc');
    } catch (e) {
      const message = e && e.message ? e.message : String(e);
      Object.values(cards).forEach((card) => renderError(card, message));
      markOpsPageRefreshError(message);
    }
  };

  const setRefreshing = (isRefreshing) => {
    refreshButton.disabled = isRefreshing;
    refreshButton.classList.toggle('is-loading', isRefreshing);
    refreshButton.textContent = isRefreshing ? 'Refreshing...' : 'Refresh now';
  };

  refresh().catch(() => {});
  refreshButton.addEventListener('click', () => {
    setRefreshing(true);
    refresh().catch(() => {}).finally(() => setRefreshing(false));
  });
  autoToggle.addEventListener('change', () => {
    if (intervalId) {
      window.clearInterval(intervalId);
      intervalId = null;
    }
    if (autoToggle.checked && refreshSeconds > 0) {
      intervalId = window.setInterval(() => {
        refresh().catch(() => {});
      }, refreshSeconds * 1000);
    }
  });
}
