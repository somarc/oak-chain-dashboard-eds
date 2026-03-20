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

function fieldType(value) {
  if (value === null || value === undefined) return 'NULL';
  if (Array.isArray(value)) return 'ARRAY';
  return typeof value === 'object' ? 'OBJECT' : typeof value === 'number' ? 'NUMBER' : typeof value === 'boolean' ? 'BOOLEAN' : 'STRING';
}

function formatValue(value) {
  if (value === null || value === undefined) return '--';
  if (typeof value === 'number' && Number.isFinite(value)) return value.toLocaleString();
  if (typeof value === 'boolean') return value ? 'true' : 'false';
  if (typeof value === 'string') return value;
  return JSON.stringify(value, null, 2);
}

function renderSummary(summaryEl, payload) {
  const isObject = payload && typeof payload === 'object' && !Array.isArray(payload);
  const fieldCount = isObject ? Object.keys(payload).length : 1;

  const fields = document.createElement('li');
  fields.className = 'proposal-queue-stats-pill';
  fields.innerHTML = `<span>Fields</span><strong>${fieldCount}</strong>`;

  const source = document.createElement('li');
  source.className = 'proposal-queue-stats-pill';
  source.innerHTML = '<span>Mode</span><strong>RAW</strong>';

  summaryEl.replaceChildren(fields, source);
}

function makeCard(name, value) {
  const type = fieldType(value);
  const rendered = formatValue(value);
  const card = document.createElement('article');
  card.className = 'proposal-queue-stats-card is-neutral';

  const head = document.createElement('div');
  head.className = 'proposal-queue-stats-card-head';

  const title = document.createElement('h3');
  title.className = 'proposal-queue-stats-card-title';
  title.textContent = name;

  const badge = document.createElement('span');
  badge.className = 'proposal-queue-stats-badge is-unknown';
  badge.textContent = type;

  head.append(title, badge);

  const body = document.createElement(type === 'OBJECT' || type === 'ARRAY' ? 'pre' : 'p');
  body.className = 'proposal-queue-stats-card-value';
  body.textContent = rendered;

  const meta = document.createElement('p');
  meta.className = 'proposal-queue-stats-card-meta';
  meta.textContent = `raw field • ${type.toLowerCase()}`;

  card.append(head, body, meta);
  return card;
}

function renderCards(grid, payload) {
  if (!payload || typeof payload !== 'object' || Array.isArray(payload)) {
    grid.replaceChildren(makeCard('response', payload));
    return;
  }

  const cards = Object.entries(payload).map(([key, value]) => makeCard(key, value));
  grid.replaceChildren(...cards);
}

export default function decorate(block) {
  const runtime = getOpsRuntimeConfig();
  const config = readBlockConfig(block);
  const baseUrl = readConfig(config, 'api-base', 'apiBase') || runtime.apiBase;
  const refreshSetting = readConfig(config, 'refresh-seconds', 'refreshSeconds') ?? runtime.refreshSeconds.queueStats ?? 0;
  const refreshSeconds = Number(refreshSetting);
  const endpoint = readConfig(config, 'queue-stats-endpoint', 'queueStatsEndpoint')
    || runtime.endpoints.proposalsQueueStats
    || '/ops/v1/proposals/queue/stats';

  const shell = document.createElement('div');
  shell.className = 'proposal-queue-stats-shell';

  const controls = document.createElement('div');
  controls.className = 'proposal-queue-stats-controls';
  controls.innerHTML = `
    <button type="button" class="proposal-queue-stats-refresh ops-refresh-button">Refresh now</button>
    <label class="proposal-queue-stats-auto ops-refresh-toggle"><input type="checkbox" class="ops-refresh-checkbox"> Auto-refresh</label>
  `;

  const summary = document.createElement('ul');
  summary.className = 'proposal-queue-stats-summary';

  const grid = document.createElement('div');
  grid.className = 'proposal-queue-stats-grid';

  shell.append(controls, summary, grid);
  block.replaceChildren(shell);

  const refreshButton = controls.querySelector('.proposal-queue-stats-refresh');
  const autoToggle = controls.querySelector('input[type="checkbox"]');
  let intervalId = null;

  async function refresh() {
    const target = buildUrl(baseUrl, endpoint);
    if (!target) {
      markOpsPageRefreshError('Queue stats endpoint missing');
      return;
    }

    try {
      const response = await fetch(target, { headers: { Accept: 'application/json' } });
      if (!response.ok) throw new Error(`HTTP ${response.status}`);
      const payload = unwrapEnvelope(await response.json());
      renderSummary(summary, payload);
      renderCards(grid, payload);
      markOpsPageRefreshed('queue-stats');
    } catch (error) {
      summary.replaceChildren();
      grid.replaceChildren(makeCard('error', `Queue stats unavailable: ${error.message}`));
      markOpsPageRefreshError(error.message);
    }
  }

  function setRefreshing(isRefreshing) {
    refreshButton.disabled = isRefreshing;
    refreshButton.classList.toggle('is-loading', isRefreshing);
    refreshButton.textContent = isRefreshing ? 'Refreshing...' : 'Refresh now';
  }

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
      }, Math.max(1, refreshSeconds) * 1000);
    }
  });
}
