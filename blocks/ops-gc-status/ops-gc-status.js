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

function buildWalletUrl(base, pathTemplate, walletAddress) {
  if (!pathTemplate || !walletAddress) return null;
  const encodedWallet = encodeURIComponent(walletAddress);
  const resolvedPath = pathTemplate.includes('{walletAddress}')
    ? pathTemplate.replace('{walletAddress}', encodedWallet)
    : `${pathTemplate.replace(/\/$/, '')}/${encodedWallet}`;
  return buildUrl(base, resolvedPath);
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

function asNumber(value, fallback = 0) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
}

function normalizeCompactionList(payload) {
  if (Array.isArray(payload)) return payload;
  if (payload && Array.isArray(payload.proposals)) return payload.proposals;
  if (payload && Array.isArray(payload.items)) return payload.items;
  return [];
}

function normalizeFragmentationEntities(payload) {
  if (payload && Array.isArray(payload.entities)) return payload.entities;
  if (payload && Array.isArray(payload.wallets)) return payload.wallets;
  if (payload && Array.isArray(payload.items)) return payload.items;
  return [];
}

function renderCard(card, state, main, detail) {
  card.dataset.state = state;
  card.querySelector('.ops-gc-status-main').textContent = main;
  card.querySelector('.ops-gc-status-detail').textContent = detail;
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
  const refreshSetting = readConfig(config, 'refresh-seconds', 'refreshSeconds') ?? runtime.refreshSeconds.gcStatus ?? 0;
  const refreshSeconds = Number(refreshSetting);
  const defaultWallet = readConfig(config, 'wallet-address', 'walletAddress', 'gc-wallet', 'gcWallet')
    || runtime.defaults.gcWallet
    || '0x742d35Cc6634C0532925a3b844Bc9e7595f0bEb0';

  const endpoints = {
    status: readConfig(config, 'gc-status-endpoint', 'gcStatusEndpoint') || runtime.endpoints.gcStatus,
    estimate: readConfig(config, 'gc-estimate-endpoint', 'gcEstimateEndpoint') || runtime.endpoints.gcEstimate,
    account: readConfig(config, 'gc-account-endpoint', 'gcAccountEndpoint') || runtime.endpoints.gcAccount,
    compaction: readConfig(config, 'compaction-endpoint', 'compactionEndpoint') || runtime.endpoints.compactionProposals,
    fragmentation: readConfig(config, 'fragmentation-endpoint', 'fragmentationEndpoint') || runtime.endpoints.fragmentationMetrics,
  };

  const shell = document.createElement('section');
  shell.className = 'ops-gc-status-shell';
  const controls = document.createElement('div');
  controls.className = 'ops-gc-status-controls';
  controls.innerHTML = `
    <label class="ops-gc-status-wallet">
      <span>Wallet</span>
      <input type="text" class="ops-gc-status-wallet-input" value="${defaultWallet}" placeholder="0x...">
    </label>
    <button type="button" class="ops-gc-status-refresh ops-refresh-button">Refresh now</button>
    <label class="ops-gc-status-auto ops-refresh-toggle"><input type="checkbox" class="ops-refresh-checkbox"> Auto-refresh</label>
  `;

  const grid = document.createElement('div');
  grid.className = 'ops-gc-status-grid';
  const cards = {
    status: makeCard('GC Status'),
    estimate: makeCard('GC Estimate /v1'),
    account: makeCard('GC Account'),
    tar: makeCard('Reclaimable Tar Files'),
    compaction: makeCard('Compaction Proposals'),
    fragmentation: makeCard('Fragmentation'),
  };
  grid.append(cards.status, cards.estimate, cards.account, cards.tar, cards.compaction, cards.fragmentation);
  const updated = document.createElement('p');
  updated.className = 'ops-gc-status-updated';
  updated.textContent = 'Updated --';

  shell.append(grid, updated);
  block.replaceChildren(shell);
  block.prepend(controls);
  const walletInput = controls.querySelector('.ops-gc-status-wallet-input');
  const refreshButton = controls.querySelector('.ops-gc-status-refresh');
  const autoToggle = controls.querySelector('input[type="checkbox"]');
  let intervalId = null;

  const fetchJsonSafe = async (url, label) => {
    if (!url) {
      return { ok: false, error: `${label}: endpoint missing` };
    }
    try {
      const response = await fetch(url, { headers: { Accept: 'application/json' } });
      const text = await response.text();
      let json = {};
      try {
        json = text ? JSON.parse(text) : {};
      } catch (_e) {
        json = {};
      }
      if (!response.ok) {
        const apiMessage = json?.error?.message || json?.message;
        return { ok: false, error: `${label}: HTTP ${response.status}${apiMessage ? ` (${apiMessage})` : ''}` };
      }
      return { ok: true, data: unwrapEnvelope(json) };
    } catch (e) {
      return { ok: false, error: `${label}: ${e?.message || String(e)}` };
    }
  };

  const refresh = async () => {
    const walletAddress = (walletInput?.value || '').trim();
    const urls = {
      status: buildUrl(apiBase, endpoints.status),
      estimate: buildUrl(apiBase, endpoints.estimate),
      account: buildWalletUrl(apiBase, endpoints.account, walletAddress),
      compaction: buildUrl(apiBase, endpoints.compaction),
      fragmentation: buildUrl(apiBase, endpoints.fragmentation),
    };

    const [statusRes, estimateRes, accountRes, compactionRes, fragmentationRes] = await Promise.all([
      fetchJsonSafe(urls.status, 'gc status'),
      fetchJsonSafe(urls.estimate, 'gc estimate'),
      walletAddress ? fetchJsonSafe(urls.account, 'gc account') : Promise.resolve({ ok: false, error: 'gc account: wallet missing' }),
      fetchJsonSafe(urls.compaction, 'compaction proposals'),
      fetchJsonSafe(urls.fragmentation, 'fragmentation metrics'),
    ]);

    if (statusRes.ok) {
      const status = statusRes.data || {};
      renderCard(
        cards.status,
        'ok',
        status.gcEnabled ? 'Enabled' : 'Disabled',
        `pending=${formatValue(status.pendingProposals)} consensusRequired=${formatValue(status.gcConsensusRequired)} lastRun=${formatValue(status.lastGcRun)}`,
      );
    } else {
      renderCard(cards.status, 'error', 'Unavailable', statusRes.error);
    }

    if (estimateRes.ok) {
      const estimate = estimateRes.data || {};
      const reclaimableMB = asNumber(
        estimate.reclaimableSizeMB !== undefined
          ? estimate.reclaimableSizeMB
          : (estimate.reclaimableMB !== undefined ? estimate.reclaimableMB : estimate.estimatedReclaimableSizeMB),
        0,
      );
      const reclaimablePct = estimate.reclaimablePercentage !== undefined ? estimate.reclaimablePercentage : '--';
      const reclaimableSegments = asNumber(
        estimate.reclaimableSegmentCount !== undefined ? estimate.reclaimableSegmentCount : estimate.reclaimableSegments,
        0,
      );
      renderCard(
        cards.estimate,
        'ok',
        `${formatValue(reclaimableMB)} MB`,
        `segments=${formatValue(reclaimableSegments)} reclaimable=${formatValue(reclaimablePct)}% cost=${formatValue(estimate.estimatedCostUSDC)} USDC`,
      );

      const byTar = estimate.reclaimableByTarFile && typeof estimate.reclaimableByTarFile === 'object'
        ? estimate.reclaimableByTarFile
        : {};
      const tarEntries = Object.entries(byTar)
        .sort((a, b) => asNumber(b[1], 0) - asNumber(a[1], 0))
        .slice(0, 3);
      renderCard(
        cards.tar,
        'ok',
        formatValue(tarEntries.length),
        tarEntries.length
          ? tarEntries.map(([name, bytes]) => `${name}: ${formatValue(bytes)} B`).join(' | ')
          : 'No reclaimable tar files',
      );
    } else {
      renderCard(cards.estimate, 'error', 'Unavailable', estimateRes.error);
      renderCard(cards.tar, 'error', 'Unavailable', 'Estimate data unavailable');
    }

    if (accountRes.ok) {
      const account = accountRes.data || {};
      renderCard(
        cards.account,
        'ok',
        walletAddress || '--',
        `pendingDebt=${formatValue(account.pendingDebt)} executedDebt=${formatValue(account.executedDebt)} blocked=${formatValue(account.writesBlocked)}`,
      );
    } else {
      renderCard(cards.account, walletAddress ? 'error' : 'warn', walletAddress || '--', accountRes.error);
    }

    if (compactionRes.ok) {
      const proposals = normalizeCompactionList(compactionRes.data || {});
      renderCard(
        cards.compaction,
        'ok',
        formatValue(proposals.length),
        proposals.length
          ? `top=${formatValue(proposals[0]?.proposalId || proposals[0]?.id || 'proposal')}`
          : 'No compaction proposals',
      );
    } else {
      renderCard(cards.compaction, 'error', 'Unavailable', compactionRes.error);
    }

    if (fragmentationRes.ok) {
      const fragmentation = fragmentationRes.data || {};
      const entities = normalizeFragmentationEntities(fragmentation);
      renderCard(
        cards.fragmentation,
        'ok',
        formatValue(fragmentation.totalEntities || entities.length),
        entities.length
          ? `top=${formatValue(entities[0]?.walletAddress || entities[0]?.wallet || entities[0]?.id || 'entity')}`
          : 'No fragmentation records',
      );
    } else {
      renderCard(cards.fragmentation, 'error', 'Unavailable', fragmentationRes.error);
    }

    updated.textContent = `Updated ${new Date().toLocaleTimeString()}`;

    const errors = [statusRes, estimateRes, accountRes, compactionRes, fragmentationRes].filter((r) => !r.ok);
    if (errors.length === 0) {
      markOpsPageRefreshed('gc');
    } else if (errors.length < 5) {
      markOpsPageRefreshed(`gc (partial: ${errors.length} degraded)`);
    } else {
      markOpsPageRefreshError(errors[0].error);
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
  walletInput.addEventListener('change', () => {
    refresh().catch(() => {});
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
