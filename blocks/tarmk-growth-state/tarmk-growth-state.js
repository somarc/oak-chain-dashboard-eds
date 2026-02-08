import { getOpsRuntimeConfig } from '../../scripts/ops-runtime-config.js';
import { markOpsPageRefreshed, markOpsPageRefreshError } from '../../scripts/ops-refresh-status.js';

function unwrapEnvelope(payload) {
  if (payload && typeof payload === 'object' && payload.data && typeof payload.data === 'object') {
    return payload.data;
  }
  return payload;
}

function buildUrl(base, path) {
  const normalizedBase = (base || '').replace(/\/$/, '');
  const normalizedPath = path.startsWith('/') ? path : `/${path}`;
  return `${normalizedBase}${normalizedPath}`;
}

function createMetricCard(label) {
  const card = document.createElement('article');
  card.className = 'tarmk-growth-card';

  const l = document.createElement('p');
  l.className = 'tarmk-growth-label';
  l.textContent = label;

  const v = document.createElement('p');
  v.className = 'tarmk-growth-value';
  v.textContent = '--';

  const c = document.createElement('p');
  c.className = 'tarmk-growth-caption';
  c.textContent = '';

  card.append(l, v, c);
  return { card, value: v, caption: c };
}

export default function decorate(block) {
  const runtime = getOpsRuntimeConfig();
  const apiBase = runtime.apiBase;
  const refreshSeconds = runtime.refreshSeconds.tarmk;
  const endpoint = runtime.endpoints.tarmk;

  const shell = document.createElement('div');
  shell.className = 'tarmk-growth-shell';

  const controls = document.createElement('div');
  controls.className = 'tarmk-growth-controls';
  controls.innerHTML = `
    <button type="button" class="tarmk-growth-refresh ops-refresh-button">Refresh now</button>
    <label class="tarmk-growth-auto ops-refresh-toggle"><input type="checkbox" class="ops-refresh-checkbox"> Auto-refresh</label>
  `;

  const grid = document.createElement('div');
  grid.className = 'tarmk-growth-grid';

  const tarFiles = createMetricCard('TAR Files');
  const totalSize = createMetricCard('Total TAR Size');
  const avgSize = createMetricCard('Avg TAR Size');
  const packing = createMetricCard('Packing Efficiency');

  [tarFiles, totalSize, avgSize, packing].forEach((x) => grid.append(x.card));

  const foot = document.createElement('p');
  foot.className = 'tarmk-growth-foot';

  shell.append(controls, grid, foot);
  block.replaceChildren(shell);
  const refreshButton = controls.querySelector('.tarmk-growth-refresh');
  const autoToggle = controls.querySelector('input[type="checkbox"]');
  let intervalId = null;

  async function refresh() {
    foot.classList.remove('is-error');
    try {
      const response = await fetch(buildUrl(apiBase, endpoint), { headers: { Accept: 'application/json' } });
      if (!response.ok) throw new Error(`HTTP ${response.status}`);
      const data = unwrapEnvelope(await response.json());

      tarFiles.value.textContent = String(data.tarFileCount ?? 0);
      tarFiles.caption.textContent = `Segments: ${data.segmentCount ?? 0}`;

      totalSize.value.textContent = String(data.totalSizeFormatted ?? '0 B');
      totalSize.caption.textContent = `Range: ${data.minSizeFormatted ?? '0 B'} - ${data.maxSizeFormatted ?? '0 B'}`;

      avgSize.value.textContent = String(data.avgSizeFormatted ?? '0 B');
      avgSize.caption.textContent = `Target: ${data.targetTarSizeFormatted ?? '256 MB'}`;

      packing.value.textContent = `${data.packingEfficiencyPct ?? 0}%`;
      packing.caption.textContent = String(data.packingStatus || 'unknown');

      foot.textContent = `Latest head: ${data.latestHead || 'unknown'}`;
      markOpsPageRefreshed('tarmk');
    } catch (error) {
      foot.textContent = `TarMK state unavailable: ${error.message}`;
      foot.classList.add('is-error');
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
