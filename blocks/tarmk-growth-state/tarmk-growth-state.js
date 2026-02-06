import { getOpsRuntimeConfig } from '../../scripts/ops-runtime-config.js';

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

  const meta = document.createElement('p');
  meta.className = 'tarmk-growth-meta';
  meta.textContent = `Polling ${apiBase} every ${refreshSeconds}s`;

  const grid = document.createElement('div');
  grid.className = 'tarmk-growth-grid';

  const tarFiles = createMetricCard('TAR Files');
  const totalSize = createMetricCard('Total TAR Size');
  const avgSize = createMetricCard('Avg TAR Size');
  const packing = createMetricCard('Packing Efficiency');

  [tarFiles, totalSize, avgSize, packing].forEach((x) => grid.append(x.card));

  const foot = document.createElement('p');
  foot.className = 'tarmk-growth-foot';

  shell.append(meta, grid, foot);
  block.replaceChildren(shell);

  async function refresh() {
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
    } catch (error) {
      foot.textContent = `TarMK state unavailable: ${error.message}`;
      foot.classList.add('is-error');
    }
  }

  refresh();
  window.setInterval(refresh, Math.max(1, refreshSeconds) * 1000);
}
