import { readBlockConfig } from '../../scripts/aem.js';
import { getOpsRuntimeConfig } from '../../scripts/ops-runtime-config.js';

function readConfig(config, ...keys) {
  for (let i = 0; i < keys.length; i += 1) {
    const key = keys[i];
    if (config[key] !== undefined && config[key] !== null && config[key] !== '') {
      return config[key];
    }
  }
  return undefined;
}

function unwrapEnvelope(payload) {
  if (payload && typeof payload === 'object' && payload.data && typeof payload.data === 'object') {
    return payload.data;
  }
  return payload;
}

function buildUrl(base, path) {
  if (!path) return null;
  const normalizedBase = (base || '').replace(/\/$/, '');
  const normalizedPath = path.startsWith('/') ? path : `/${path}`;
  return `${normalizedBase}${normalizedPath}`;
}

function stageCard(label, value, detail, className) {
  const card = document.createElement('article');
  card.className = `epoch-pipeline-stage ${className}`;

  const l = document.createElement('p');
  l.className = 'epoch-stage-label';
  l.textContent = label;

  const v = document.createElement('p');
  v.className = 'epoch-stage-value';
  v.textContent = String(value);

  const d = document.createElement('p');
  d.className = 'epoch-stage-detail';
  d.textContent = detail;

  card.append(l, v, d);
  return card;
}

export default function decorate(block) {
  const runtime = getOpsRuntimeConfig();
  const config = readBlockConfig(block);
  const apiBase = readConfig(config, 'api-base', 'apiBase') || runtime.apiBase;
  const refreshSeconds = Number(readConfig(config, 'refresh-seconds', 'refreshSeconds') || runtime.refreshSeconds.finality);
  const finalityEndpoint = readConfig(config, 'finality-endpoint', 'finalityEndpoint') || runtime.endpoints.finality;

  const shell = document.createElement('div');
  shell.className = 'epoch-pipeline-shell';

  const meta = document.createElement('p');
  meta.className = 'epoch-pipeline-meta';
  meta.textContent = `Polling ${apiBase} every ${refreshSeconds}s`;

  const subtitle = document.createElement('p');
  subtitle.className = 'epoch-pipeline-subtitle';
  subtitle.textContent = 'Proposals flow through finality stages using Ethereum epoch semantics.';

  const stages = document.createElement('div');
  stages.className = 'epoch-pipeline-stages';

  const footer = document.createElement('p');
  footer.className = 'epoch-pipeline-footer';

  shell.append(meta, subtitle, stages, footer);
  block.replaceChildren(shell);

  async function refresh() {
    try {
      const response = await fetch(buildUrl(apiBase, finalityEndpoint), { headers: { Accept: 'application/json' } });
      if (!response.ok) {
        throw new Error(`HTTP ${response.status}`);
      }
      const data = unwrapEnvelope(await response.json());
      const gap = Number(data.epochsUntilFinality || 0);

      stages.innerHTML = '';
      stages.append(
        stageCard('Pending Proposals', data.pendingProposals ?? 0, `Across ${data.pendingEpochs ?? 0} pending epochs`, 'stage-ingest'),
        stageCard('Current Epoch', data.currentEpoch ?? 0, `Ethereum epoch ${data.ethereumEpoch ?? 0}`, 'stage-current'),
        stageCard('Finalized Epoch', data.finalizedEpoch ?? 0, `${gap} epoch(s) until finality`, 'stage-finalized'),
      );

      footer.textContent = `Total queued: ${data.totalQueued ?? 0} • Total finalized: ${data.totalFinalized ?? 0} • Finality gap: ${gap}`;
    } catch (error) {
      stages.innerHTML = '';
      footer.textContent = `Finality pipeline unavailable: ${error.message}`;
      footer.classList.add('is-error');
    }
  }

  refresh();
  window.setInterval(refresh, Math.max(1, refreshSeconds) * 1000);
}
