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

export default function decorate(block) {
  const runtime = getOpsRuntimeConfig();
  const apiBase = runtime.apiBase;
  const refreshSeconds = runtime.refreshSeconds.tarChain;
  const endpoint = runtime.endpoints.tarChain;

  const shell = document.createElement('div');
  shell.className = 'tar-chain-shell';

  const controls = document.createElement('div');
  controls.className = 'tar-chain-controls';
  controls.innerHTML = `
    <button type="button" class="tar-chain-refresh ops-refresh-button">Refresh now</button>
    <label class="tar-chain-auto ops-refresh-toggle"><input type="checkbox" class="ops-refresh-checkbox"> Auto-refresh</label>
  `;

  const desc = document.createElement('p');
  desc.className = 'tar-chain-desc';
  desc.textContent = 'Sequential TAR generations sized proportionally by file size.';

  const list = document.createElement('div');
  list.className = 'tar-chain-list';

  const foot = document.createElement('p');
  foot.className = 'tar-chain-foot';

  shell.append(controls, desc, list, foot);
  block.replaceChildren(shell);
  const refreshButton = controls.querySelector('.tar-chain-refresh');
  const autoToggle = controls.querySelector('input[type="checkbox"]');
  let intervalId = null;

  async function refresh() {
    foot.classList.remove('is-error');
    try {
      const response = await fetch(buildUrl(apiBase, endpoint), { headers: { Accept: 'application/json' } });
      if (!response.ok) throw new Error(`HTTP ${response.status}`);
      const data = unwrapEnvelope(await response.json());
      const files = Array.isArray(data.tarFiles) ? data.tarFiles : [];

      list.innerHTML = '';
      if (!files.length) {
        const empty = document.createElement('p');
        empty.className = 'tar-chain-empty';
        empty.textContent = 'No TAR files reported.';
        list.append(empty);
      } else {
        files.forEach((file) => {
          const row = document.createElement('div');
          row.className = 'tar-chain-row';

          const name = document.createElement('p');
          name.className = 'tar-chain-name';
          name.textContent = file.name;

          const bar = document.createElement('div');
          bar.className = 'tar-chain-bar';

          const fill = document.createElement('div');
          fill.className = 'tar-chain-fill';
          fill.style.width = `${Math.max(4, Number(file.widthPct || 0))}%`;

          const label = document.createElement('span');
          label.className = 'tar-chain-fill-label';
          label.textContent = `${file.sizeFormatted} - ${file.segmentCount} segs - ${file.efficiencyPct}%`;

          fill.append(label);
          bar.append(fill);
          row.append(name, bar);
          list.append(row);
        });
      }

      foot.textContent = `TAR generations: ${files.length} • Target TAR size: ${data.maxTarSizeFormatted || '256 MB'}`;
      markOpsPageRefreshed('tarmk');
    } catch (error) {
      foot.textContent = `TAR chain unavailable: ${error.message}`;
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
