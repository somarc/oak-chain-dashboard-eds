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

export default function decorate(block) {
  const runtime = getOpsRuntimeConfig();
  const apiBase = runtime.apiBase;
  const refreshSeconds = runtime.refreshSeconds.tarChain;
  const endpoint = runtime.endpoints.tarChain;

  const shell = document.createElement('div');
  shell.className = 'tar-chain-shell';

  const meta = document.createElement('p');
  meta.className = 'tar-chain-meta';
  meta.textContent = `Polling ${apiBase} every ${refreshSeconds}s`;

  const desc = document.createElement('p');
  desc.className = 'tar-chain-desc';
  desc.textContent = 'Sequential TAR generations sized proportionally by file size.';

  const list = document.createElement('div');
  list.className = 'tar-chain-list';

  const foot = document.createElement('p');
  foot.className = 'tar-chain-foot';

  shell.append(meta, desc, list, foot);
  block.replaceChildren(shell);

  async function refresh() {
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
    } catch (error) {
      foot.textContent = `TAR chain unavailable: ${error.message}`;
      foot.classList.add('is-error');
    }
  }

  refresh();
  window.setInterval(refresh, Math.max(1, refreshSeconds) * 1000);
}
