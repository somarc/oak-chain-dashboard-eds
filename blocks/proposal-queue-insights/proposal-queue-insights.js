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

function asBool(value) {
  return value === true;
}

function formatInt(value) {
  return asNum(value, 0).toLocaleString();
}

function formatMs(value) {
  return `${asNum(value, 0).toFixed(1)} ms`;
}

function formatPct(value) {
  return `${asNum(value, 0).toFixed(1)}%`;
}

function ratio(numerator, denominator) {
  const d = asNum(denominator, 0);
  if (d <= 0) return 0;
  return (asNum(numerator, 0) / d) * 100;
}

function parseBackpressureStats(text) {
  if (!text || typeof text !== 'string') return {};
  const match = text.match(/sent=(\d+), acked=(\d+), pending=(\d+), max=(\d+), active=(true|false)/i);
  if (!match) return {};
  return {
    sent: asNum(match[1], 0),
    acked: asNum(match[2], 0),
    pending: asNum(match[3], 0),
    max: asNum(match[4], 0),
    active: match[5] === 'true',
  };
}

function makeCard(title) {
  const card = document.createElement('article');
  card.className = 'proposal-queue-insights-card';
  card.innerHTML = `
    <div class="proposal-queue-insights-card-head">
      <h3 class="proposal-queue-insights-card-title">${title}</h3>
      <span class="proposal-queue-insights-badge is-unknown">UNKNOWN</span>
    </div>
    <p class="proposal-queue-insights-card-value">--</p>
    <p class="proposal-queue-insights-card-desc"></p>
    <p class="proposal-queue-insights-card-meta"></p>
  `;
  return card;
}

function setCard(card, { severity = 'unknown', value = '--', desc = '', meta = '' }) {
  card.className = `proposal-queue-insights-card is-${severity}`;
  const badge = card.querySelector('.proposal-queue-insights-badge');
  badge.className = `proposal-queue-insights-badge is-${severity}`;
  badge.textContent = severity.toUpperCase();
  card.querySelector('.proposal-queue-insights-card-value').textContent = value;
  card.querySelector('.proposal-queue-insights-card-desc').textContent = desc;
  card.querySelector('.proposal-queue-insights-card-meta').textContent = meta;
}

function renderSummary(summaryEl, data) {
  const pendingRaw = asNum(data.backpressurePendingRawCount, asNum(data.backpressurePendingCount, 0));
  const pendingMax = asNum(data.backpressureMaxPending, 0);
  const pendingStalledMs = asNum(data.backpressurePendingStalledMs, 0);
  const noInflight = asNum(data.pendingCount, 0) === 0
    && asNum(data.unverifiedQueueSize, 0) === 0
    && asNum(data.batchQueueSize, 0) === 0
    && asNum(data.verifiedCount, 0) === 0
    && pendingRaw === 0
    && !asBool(data.backpressureActive);
  const staleBackpressureAccounting = !asBool(data.backpressureActive)
    && asNum(data.pendingCount, 0) === 0
    && asNum(data.unverifiedQueueSize, 0) === 0
    && asNum(data.batchQueueSize, 0) === 0
    && asNum(data.verifiedCount, 0) === 0
    && asNum(data.persistencePendingChanges, 0) === 0
    && pendingRaw > 0
    && pendingStalledMs > 60_000;
  const processedPct = ratio(data.processedCount, data.writeProposals);
  const verifyPct = ratio(data.verifierSuccessCount, data.verifierAttemptCount);
  const drift = Math.max(0, asNum(data.currentEpoch, 0) - asNum(data.finalizedEpoch, 0));

  const pills = [
    {
      label: 'Cluster Pressure',
      value: staleBackpressureAccounting
        ? 'IDLE (STALE COUNTER)'
        : (noInflight ? 'IDLE' : (pendingRaw > 0 ? 'ACTIVE' : 'LIGHT')),
      state: staleBackpressureAccounting
        ? 'unknown'
        : (noInflight ? 'ok' : (pendingRaw > pendingMax ? 'critical' : 'warn')),
    },
    {
      label: 'Backpressure',
      value: asBool(data.backpressureActive) ? 'ON' : 'OFF',
      state: asBool(data.backpressureActive) ? 'warn' : 'ok',
    },
    {
      label: 'Finality Gap',
      value: `${drift} epochs`,
      state: drift > Math.max(2, asNum(data.epochsUntilFinality, 2)) ? 'warn' : 'ok',
    },
    {
      label: 'Processed',
      value: noInflight ? 'IDLE' : formatPct(processedPct),
      state: noInflight || processedPct >= 99.9 ? 'ok' : 'warn',
    },
    {
      label: 'Verifier',
      value: formatPct(verifyPct),
      state: asNum(data.verifierErrorCount, 0) > 0 ? 'critical' : (verifyPct >= 99.9 ? 'ok' : 'warn'),
    },
  ];

  summaryEl.replaceChildren(...pills.map((pill) => {
    const li = document.createElement('li');
    li.className = `proposal-queue-insights-pill is-${pill.state}`;
    li.innerHTML = `<span>${pill.label}</span><strong>${pill.value}</strong>`;
    return li;
  }));
}

function renderCards(cards, data) {
  const pendingRaw = asNum(data.backpressurePendingRawCount, asNum(data.backpressurePendingCount, 0));
  const pendingMax = asNum(data.backpressureMaxPending, 0);
  const pendingStalledMs = asNum(data.backpressurePendingStalledMs, 0);
  const bp = parseBackpressureStats(data.backpressureStats);
  const noInflight = asNum(data.pendingCount, 0) === 0
    && asNum(data.unverifiedQueueSize, 0) === 0
    && asNum(data.batchQueueSize, 0) === 0
    && asNum(data.verifiedCount, 0) === 0
    && pendingRaw === 0
    && !asBool(data.backpressureActive);
  const staleBackpressureAccounting = !asBool(data.backpressureActive)
    && asNum(data.pendingCount, 0) === 0
    && asNum(data.unverifiedQueueSize, 0) === 0
    && asNum(data.batchQueueSize, 0) === 0
    && asNum(data.verifiedCount, 0) === 0
    && asNum(data.persistencePendingChanges, 0) === 0
    && pendingRaw > 0
    && pendingStalledMs > 60_000;
  const processedPct = ratio(data.processedCount, data.writeProposals);
  const verifyPct = ratio(data.verifierSuccessCount, data.verifierAttemptCount);
  const retryCount = asNum(data.maxRetryCount, 0);
  const retryLimit = asNum(data.maxRetryLimit, 0);

  setCard(cards.backpressure, {
    severity: staleBackpressureAccounting
      ? 'unknown'
      : (pendingRaw > pendingMax ? 'critical' : (asBool(data.backpressureActive) ? 'warn' : 'ok')),
    value: `${formatInt(pendingRaw)} / ${formatInt(pendingMax)}`,
    desc: staleBackpressureAccounting
      ? `stale leader accounting suspected (active=false, queue idle, rawPending=${formatInt(pendingRaw)})`
      : `active=${asBool(data.backpressureActive)} pendingCount=${formatInt(data.backpressurePendingCount)}`,
    meta: staleBackpressureAccounting
      ? `stalledMs=${formatInt(pendingStalledMs)} sent=${formatInt(bp.sent)} acked=${formatInt(bp.acked)}`
      : `sent=${formatInt(bp.sent)} acked=${formatInt(bp.acked)} pending=${formatInt(bp.pending)}`,
  });

  setCard(cards.processing, {
    severity: noInflight || processedPct >= 99.9 ? 'ok' : 'warn',
    value: noInflight ? 'IDLE / drained' : `${formatPct(processedPct)} processed`,
    desc: `processed=${formatInt(data.processedCount)} write=${formatInt(data.writeProposals)} finalized=${formatInt(data.totalFinalizedCount)}`,
    meta: `verified=${formatInt(data.verifiedCount)} rejected=${formatInt(data.rejectedCount)}`,
  });

  setCard(cards.epoch, {
    severity: Math.max(0, asNum(data.currentEpoch, 0) - asNum(data.finalizedEpoch, 0)) > Math.max(2, asNum(data.epochsUntilFinality, 2)) ? 'warn' : 'ok',
    value: `E${formatInt(data.finalizedEpoch)} → E${formatInt(data.currentEpoch)}`,
    desc: `compatibility gap target=${formatInt(data.epochsUntilFinality)} epochs`,
    meta: data.pendingEpochStats || 'No compatibility overlay stats',
  });

  setCard(cards.verifier, {
    severity: asNum(data.verifierErrorCount, 0) > 0 ? 'critical' : (verifyPct >= 99.9 ? 'ok' : 'warn'),
    value: `${formatPct(verifyPct)} success`,
    desc: `attempt=${formatInt(data.verifierAttemptCount)} success=${formatInt(data.verifierSuccessCount)} rejected=${formatInt(data.verifierRejectedCount)}`,
    meta: `error=${formatInt(data.verifierErrorCount)} queueWaitMax=${formatInt(data.verifierQueueWaitMaxMs)}ms`,
  });

  setCard(cards.persistence, {
    severity: asNum(data.persistencePendingChanges, 0) > 0 ? 'warn' : 'ok',
    value: formatMs(data.persistenceFlushAvgMs),
    desc: `pending=${formatInt(data.persistencePendingChanges)} flushCount=${formatInt(data.persistenceFlushCount)} async=${asBool(data.persistenceAsyncEnabled)}`,
    meta: `lastFlush=${formatInt(data.persistenceFlushLastMs)}ms enqueueAvg=${formatMs(data.enqueuePersistAvgMs)}`,
  });

  setCard(cards.retry, {
    severity: retryLimit > 0 && retryCount >= retryLimit ? 'critical' : (retryCount > 0 ? 'warn' : 'ok'),
    value: `retry=${formatInt(data.maxRetryCount)}/${formatInt(data.maxRetryLimit)}`,
    desc: `proposalsWithRetries=${formatInt(data.proposalsWithRetries)} maxRetryObserved=${formatInt(data.maxRetryCount)}`,
    meta: `counterRotationMs=${formatInt(data.counterRotationIntervalMs)} windowStart=${formatInt(data.counterWindowStartMs)}`,
  });
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
  shell.className = 'proposal-queue-insights-shell';

  const controls = document.createElement('div');
  controls.className = 'proposal-queue-insights-controls';
  controls.innerHTML = `
    <button type="button" class="proposal-queue-insights-refresh ops-refresh-button">Refresh now</button>
    <label class="proposal-queue-insights-auto ops-refresh-toggle"><input type="checkbox" class="ops-refresh-checkbox"> Auto-refresh</label>
  `;

  const summary = document.createElement('ul');
  summary.className = 'proposal-queue-insights-summary';

  const grid = document.createElement('div');
  grid.className = 'proposal-queue-insights-grid';

  const cards = {
    backpressure: makeCard('Backpressure'),
    processing: makeCard('Processing'),
    epoch: makeCard('Finality Overlay'),
    verifier: makeCard('Verifier'),
    persistence: makeCard('Persistence'),
    retry: makeCard('Retry Pressure'),
  };
  grid.append(
    cards.backpressure,
    cards.processing,
    cards.epoch,
    cards.verifier,
    cards.persistence,
    cards.retry,
  );

  shell.append(controls, summary, grid);
  block.replaceChildren(shell);

  const refreshButton = controls.querySelector('.proposal-queue-insights-refresh');
  const autoToggle = controls.querySelector('input[type="checkbox"]');
  let intervalId = null;

  async function refresh() {
    const target = buildUrl(baseUrl, endpoint);
    if (!target) {
      markOpsPageRefreshError('Queue insights endpoint missing');
      return;
    }

    try {
      const response = await fetch(target, { headers: { Accept: 'application/json' } });
      if (!response.ok) throw new Error(`HTTP ${response.status}`);
      const payload = unwrapEnvelope(await response.json()) || {};
      renderSummary(summary, payload);
      renderCards(cards, payload);
      markOpsPageRefreshed('queue-insights');
    } catch (error) {
      Object.values(cards).forEach((card) => {
        setCard(card, {
          severity: 'critical',
          value: 'Unavailable',
          desc: `Queue insights unavailable: ${error.message}`,
          meta: 'Check endpoint and API gateway route.',
        });
      });
      summary.replaceChildren();
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
