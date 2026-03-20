import { readBlockConfig } from '../../scripts/aem.js';
import { getOpsRuntimeConfig } from '../../scripts/ops-runtime-config.js';
import { markOpsPageRefreshed, markOpsPageRefreshError } from '../../scripts/ops-refresh-status.js';

function readConfig(config, ...keys) {
  for (let i = 0; i < keys.length; i += 1) {
    const key = keys[i];
    if (config[key] !== undefined && config[key] !== null && config[key] !== '') {
      return config[key];
    }
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

function extractErrorMessage(payload) {
  if (!payload || typeof payload !== 'object') return null;
  const envelopeData = payload.data && typeof payload.data === 'object' ? payload.data : null;
  const target = envelopeData || payload;
  if (target.error) {
    if (typeof target.error === 'string') return target.error;
    if (target.error.message) return String(target.error.message);
    if (target.error.body && target.error.body.error) return String(target.error.body.error);
    return JSON.stringify(target.error);
  }
  return null;
}

function prettyValue(value) {
  if (value === null || value === undefined) return 'n/a';
  if (typeof value === 'object') return JSON.stringify(value);
  return String(value);
}

function safeInt(value, fallback = 0) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
}

function createSummaryRow(label, value) {
  const row = document.createElement('div');
  row.className = 'ops-config-tuning-summary-row';
  row.innerHTML = `<span>${label}</span><strong>${prettyValue(value)}</strong>`;
  return row;
}

function createBlockchainTierCard(tierName, tierData) {
  const card = document.createElement('article');
  card.className = 'ops-config-tuning-tier';
  const maxDelay = tierData && tierData.maxDelay ? String(tierData.maxDelay) : 'n/a';
  const estimatedCost = tierData && tierData.estimatedCost ? String(tierData.estimatedCost) : 'n/a';
  const estimatedTotalWei = tierData && tierData.estimatedTotalWei ? String(tierData.estimatedTotalWei) : 'n/a';
  card.innerHTML = `
    <header>
      <h4>${tierName}</h4>
      <span>${maxDelay}</span>
    </header>
    <p>Estimated: <strong>${estimatedCost}</strong></p>
    <p>Wei: <code>${estimatedTotalWei}</code></p>
  `;
  return card;
}

function createChangeRow(change) {
  const row = document.createElement('article');
  row.className = 'ops-config-tuning-change';
  const justification = change.justification ? `<p class="ops-config-tuning-why">${change.justification}</p>` : '';
  row.innerHTML = `
    <header>
      <h4>${change.key}</h4>
      <span class="ops-config-tuning-risk is-${String(change.risk || 'safe')}">${change.risk || 'safe'}</span>
    </header>
    <p class="ops-config-tuning-values"><code>${String(change.default)}</code> → <code>${String(change.current)}</code></p>
    ${justification}
  `;
  return row;
}

function render(shell, payloads) {
  const delta = unwrapEnvelope(payloads.delta) || {};
  const coverage = unwrapEnvelope(payloads.coverage) || {};
  const sources = unwrapEnvelope(payloads.sources) || {};
  const blockchain = unwrapEnvelope(payloads.blockchain) || {};
  const summary = delta.summary || {};
  const changed = Array.isArray(delta.changed) ? delta.changed : [];

  const status = changed.length > 0 ? 'Tuned' : 'Baseline';
  const expertChanged = safeInt(summary.expertOnlyChanged, 0);
  const guardedChanged = safeInt(summary.guardedChanged, 0);
  const coveragePct = safeInt((coverage.summary || {}).coveragePercent, 0);
  const gasModel = blockchain && typeof blockchain.gasModel === 'object' ? blockchain.gasModel : {};
  const tierMap = blockchain && typeof blockchain.tiers === 'object' ? blockchain.tiers : {};
  const blockchainError = extractErrorMessage(payloads.blockchain);

  const topChanges = document.createElement('section');
  topChanges.className = 'ops-config-tuning-changes';

  if (!changed.length) {
    const empty = document.createElement('p');
    empty.className = 'ops-config-tuning-empty';
    empty.textContent = 'No config drift from defaults.';
    topChanges.append(empty);
  } else {
    changed.forEach((change) => topChanges.append(createChangeRow(change)));
  }

  const sourceRows = document.createElement('div');
  sourceRows.className = 'ops-config-tuning-sources';
  Object.entries(sources).forEach(([key, value]) => {
    sourceRows.append(createSummaryRow(key, value));
  });

  shell.innerHTML = '';
  const summaryPanel = document.createElement('section');
  summaryPanel.className = 'ops-config-tuning-summary';
  summaryPanel.append(
    createSummaryRow('Status', status),
    createSummaryRow('Changed Keys', safeInt(summary.changedKeys, 0)),
    createSummaryRow('Expert Drift', expertChanged),
    createSummaryRow('Guarded Drift', guardedChanged),
    createSummaryRow('Coverage', `${coveragePct}%`),
  );

  const blockchainPanel = document.createElement('section');
  blockchainPanel.className = 'ops-config-tuning-blockchain';
  blockchainPanel.append(
    createSummaryRow('Chain Mode', blockchain.mode || 'n/a'),
    createSummaryRow('Network', blockchain.network || 'n/a'),
    createSummaryRow('Config Source', blockchain.configSource || 'n/a'),
    createSummaryRow('Gas Price (Gwei)', gasModel.gasPriceGwei ?? 'n/a'),
    createSummaryRow('Write Gas Standard', gasModel.writeGasUnitsStandard ?? 'n/a'),
    createSummaryRow('Write Gas Express', gasModel.writeGasUnitsExpress ?? 'n/a'),
    createSummaryRow('Write Gas Priority', gasModel.writeGasUnitsPriority ?? 'n/a'),
  );

  const tiersPanel = document.createElement('section');
  tiersPanel.className = 'ops-config-tuning-tiers';
  const tierOrder = ['STANDARD', 'EXPRESS', 'PRIORITY'];
  const renderedTiers = tierOrder.filter((tier) => tierMap[tier]).map((tier) => createBlockchainTierCard(tier, tierMap[tier]));
  if (!renderedTiers.length) {
    const noTiers = document.createElement('p');
    noTiers.className = 'ops-config-tuning-empty';
    noTiers.textContent = blockchainError ? `Blockchain contract unavailable: ${blockchainError}` : 'Blockchain tier estimates unavailable.';
    tiersPanel.append(noTiers);
  } else {
    renderedTiers.forEach((tierCard) => tiersPanel.append(tierCard));
  }

  const left = document.createElement('div');
  left.className = 'ops-config-tuning-col';
  left.append(summaryPanel, blockchainPanel, tiersPanel);

  const right = document.createElement('div');
  right.className = 'ops-config-tuning-col';
  right.append(topChanges, sourceRows);

  shell.append(left, right);
}

export default async function decorate(block) {
  const runtime = getOpsRuntimeConfig();
  const config = readBlockConfig(block);

  const apiBase = readConfig(config, 'api-base', 'apiBase') || runtime.apiBase;
  const refreshSetting = readConfig(config, 'refresh-seconds', 'refreshSeconds') ?? runtime.refreshSeconds.configTuning ?? 0;
  const refreshSeconds = Number(refreshSetting);

  const endpoints = {
    effective: readConfig(config, 'config-endpoint', 'configEndpoint') || runtime.endpoints.configOsgi,
    coverage: readConfig(config, 'coverage-endpoint', 'coverageEndpoint') || runtime.endpoints.configOsgiCoverage,
    delta: readConfig(config, 'delta-endpoint', 'deltaEndpoint') || runtime.endpoints.configOsgiDelta,
    sources: readConfig(config, 'sources-endpoint', 'sourcesEndpoint') || runtime.endpoints.configOsgiSources,
    blockchain: readConfig(config, 'blockchain-endpoint', 'blockchainEndpoint')
      || runtime.endpoints.blockchainConfig
      || '/ops/v1/blockchain/config',
  };

  const shell = document.createElement('section');
  shell.className = 'ops-config-tuning-shell';
  const controls = document.createElement('div');
  controls.className = 'ops-config-tuning-controls';
  controls.innerHTML = `
    <button type="button" class="ops-config-tuning-refresh ops-refresh-button">Refresh now</button>
    <label class="ops-config-tuning-auto ops-refresh-toggle"><input type="checkbox" class="ops-refresh-checkbox"> Auto-refresh</label>
  `;
  block.replaceChildren(shell);
  block.prepend(controls);
  const refreshButton = controls.querySelector('.ops-config-tuning-refresh');
  const autoToggle = controls.querySelector('input[type="checkbox"]');
  let intervalId = null;

  const load = async () => {
    const fetchJson = async (url) => {
      const response = await fetch(url);
      let payload = null;
      try {
        payload = await response.json();
      } catch (e) {
        throw new Error(`${url} returned non-JSON response`);
      }
      if (!response.ok) {
        const apiError = extractErrorMessage(payload) || `HTTP ${response.status}`;
        throw new Error(`${url}: ${apiError}`);
      }
      const embeddedError = extractErrorMessage(payload);
      if (embeddedError) {
        throw new Error(`${url}: ${embeddedError}`);
      }
      return payload;
    };

    const fetchOptionalJson = async (url) => {
      if (!url) return {};
      try {
        return await fetchJson(url);
      } catch (e) {
        return {
          error: {
            message: e && e.message ? e.message : String(e),
          },
        };
      }
    };

    const [effective, coverage, delta, sources, blockchain] = await Promise.all([
      fetchJson(buildUrl(apiBase, endpoints.effective)),
      fetchJson(buildUrl(apiBase, endpoints.coverage)),
      fetchJson(buildUrl(apiBase, endpoints.delta)),
      fetchJson(buildUrl(apiBase, endpoints.sources)),
      fetchOptionalJson(buildUrl(apiBase, endpoints.blockchain)),
    ]);
    render(shell, {
      effective, coverage, delta, sources, blockchain,
    });
    markOpsPageRefreshed('config');
  };

  const setRefreshing = (isRefreshing) => {
    refreshButton.disabled = isRefreshing;
    refreshButton.classList.toggle('is-loading', isRefreshing);
    refreshButton.textContent = isRefreshing ? 'Refreshing...' : 'Refresh now';
  };

  try {
    await load();
  } catch (e) {
    const message = e && e.message ? e.message : String(e);
    shell.innerHTML = `<p class="ops-config-tuning-error">Config tuning unavailable: ${message}</p>`;
    markOpsPageRefreshError(message);
  }

  refreshButton.addEventListener('click', () => {
    setRefreshing(true);
    load()
      .catch((error) => {
        markOpsPageRefreshError(error?.message || String(error));
      })
      .finally(() => setRefreshing(false));
  });

  autoToggle.addEventListener('change', () => {
    if (intervalId) {
      window.clearInterval(intervalId);
      intervalId = null;
    }
    if (autoToggle.checked && refreshSeconds > 0) {
      intervalId = window.setInterval(() => {
        load().catch((error) => {
          markOpsPageRefreshError(error?.message || String(error));
        });
      }, refreshSeconds * 1000);
    }
  });
}
