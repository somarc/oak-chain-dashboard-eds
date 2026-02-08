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

function asNum(value, fallback = 0) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
}

function createCard(label) {
  const card = document.createElement('article');
  card.className = 'ops-finality-status-card';
  card.innerHTML = `
    <p class="ops-finality-status-label">${label}</p>
    <p class="ops-finality-status-value">--</p>
    <p class="ops-finality-status-detail">--</p>
  `;
  return card;
}

function setCard(card, value, detail) {
  const valueEl = card.querySelector('.ops-finality-status-value');
  const detailEl = card.querySelector('.ops-finality-status-detail');
  valueEl.textContent = value;
  detailEl.textContent = detail;
}

export default function decorate(block) {
  const runtime = getOpsRuntimeConfig();
  const config = readBlockConfig(block);
  const apiBase = readConfig(config, 'api-base', 'apiBase') || runtime.apiBase;
  const refreshSeconds = Number(readConfig(config, 'refresh-seconds', 'refreshSeconds') || runtime.refreshSeconds.finality || 15);

  const endpoints = {
    finality: readConfig(config, 'finality-endpoint', 'finalityEndpoint') || runtime.endpoints.finality,
    proposals: readConfig(config, 'proposals-endpoint', 'proposalsEndpoint') || runtime.endpoints.proposals,
  };

  const shell = document.createElement('section');
  shell.className = 'ops-finality-status-shell';

  const controls = document.createElement('div');
  controls.className = 'ops-finality-status-controls';
  controls.innerHTML = `
    <button type="button" class="ops-finality-status-refresh">Refresh now</button>
    <label class="ops-finality-status-auto"><input type="checkbox"> Auto-refresh</label>
  `;

  const summary = document.createElement('p');
  summary.className = 'ops-finality-status-summary';
  summary.textContent = 'Awaiting finality data.';

  const grid = document.createElement('div');
  grid.className = 'ops-finality-status-grid';

  const cards = {
    gap: createCard('Epoch Gap'),
    epochs: createCard('Pending Epochs'),
    pending: createCard('Pending Proposals'),
    finalizedWindow: createCard('Finalized (Window)'),
    finalizedLifetime: createCard('Finalized (Lifetime)'),
    finalizedState: createCard('Finality State'),
  };
  grid.append(
    cards.gap,
    cards.epochs,
    cards.pending,
    cards.finalizedWindow,
    cards.finalizedLifetime,
    cards.finalizedState,
  );

  shell.append(controls, summary, grid);
  block.replaceChildren(shell);

  const refreshButton = controls.querySelector('.ops-finality-status-refresh');
  const autoToggle = controls.querySelector('input[type="checkbox"]');
  let intervalId = null;

  const fetchJson = async (url) => {
    const response = await fetch(url, { headers: { Accept: 'application/json' } });
    let json = {};
    try {
      json = await response.json();
    } catch (e) {
      throw new Error(`Non-JSON from ${url}`);
    }
    if (!response.ok) {
      throw new Error(`HTTP ${response.status} from ${url}`);
    }
    return unwrapEnvelope(json);
  };

  const refresh = async () => {
    const finalityUrl = buildUrl(apiBase, endpoints.finality);
    const proposalsUrl = buildUrl(apiBase, endpoints.proposals);
    if (!finalityUrl || !proposalsUrl) throw new Error('Missing finality/proposals endpoint config');

    const [finality, proposals] = await Promise.all([
      fetchJson(finalityUrl),
      fetchJson(proposalsUrl),
    ]);

    const epochsUntilFinality = asNum(finality.epochsUntilFinality, 0);
    const pendingEpochs = asNum(finality.pendingEpochs, 0);
    const pendingProposals = asNum(finality.pendingProposals, 0);
    const totalQueued = asNum(finality.totalQueued, 0);
    const totalFinalized = asNum(finality.totalFinalized, 0);
    const totalFinalizedLifetime = asNum(finality.totalFinalizedLifetime, totalFinalized);
    const states = proposals.states || {};
    const verified = asNum(states.verified, 0);
    const finalized = asNum(states.finalized, 0);

    const stateLabel = epochsUntilFinality === 0 && pendingProposals === 0 ? 'STEADY' : 'DRIFTING';
    const stateDetail = `verified=${verified} • finalized=${finalized}`;

    setCard(cards.gap, `${epochsUntilFinality}`, epochsUntilFinality <= 2 ? 'Within configured target' : 'Beyond target gap');
    setCard(cards.epochs, `${pendingEpochs}`, `Current epoch: ${asNum(finality.currentEpoch, 0)}`);
    setCard(cards.pending, `${pendingProposals}`, `Queued scope: ${totalQueued}`);
    setCard(cards.finalizedWindow, `${totalFinalized}`, 'Current counter window');
    setCard(cards.finalizedLifetime, `${totalFinalizedLifetime}`, 'Lifetime counter');
    setCard(cards.finalizedState, stateLabel, stateDetail);

    summary.textContent = `Finality gap ${epochsUntilFinality} epoch(s), pending proposals ${pendingProposals}, total finalized ${totalFinalized}.`;
    markOpsPageRefreshed('finality');
  };

  const handleRefresh = () => {
    refresh().catch((error) => {
      summary.textContent = `Finality unavailable: ${error.message}`;
      markOpsPageRefreshError(error.message);
    });
  };

  handleRefresh();

  refreshButton.addEventListener('click', handleRefresh);
  autoToggle.addEventListener('change', () => {
    if (intervalId) {
      window.clearInterval(intervalId);
      intervalId = null;
    }
    if (autoToggle.checked && refreshSeconds > 0) {
      intervalId = window.setInterval(handleRefresh, Math.max(1, refreshSeconds) * 1000);
    }
  });
}
