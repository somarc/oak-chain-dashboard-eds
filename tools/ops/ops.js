import { getOpsRuntimeConfig } from '/scripts/ops-runtime-config.js';

const runtime = getOpsRuntimeConfig();
const app = {
  panel: 'overview',
  timer: null,
};

function buildUrl(base, path) {
  if (!path) return null;
  const normalizedBase = String(base || '').replace(/\/$/, '');
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

function formatNumber(value) {
  return asNum(value, 0).toLocaleString();
}

function formatBoolean(value) {
  return value === true ? 'yes' : 'no';
}

function formatJson(value) {
  return JSON.stringify(value, null, 2);
}

function signalTone(severity) {
  if (severity === 'critical') return 'critical';
  if (severity === 'warn') return 'warn';
  if (severity === 'unknown') return 'unknown';
  return 'ok';
}

function stageTone(count, fallback = 'idle') {
  return asNum(count, 0) > 0 ? fallback : 'idle';
}

function createMetricCard(label, value, detail, tone = 'neutral') {
  const card = document.createElement('article');
  card.className = `metric-card is-${tone}`;
  card.innerHTML = `
    <p class="metric-label">${label}</p>
    <p class="metric-value">${value}</p>
    <p class="metric-detail">${detail}</p>
  `;
  return card;
}

function createStageCard(label, value, detail, tone = 'idle') {
  const card = document.createElement('article');
  card.className = `stage-card is-${tone}`;
  card.innerHTML = `
    <p class="stage-label">${label}</p>
    <p class="stage-value">${value}</p>
    <p class="stage-detail">${detail}</p>
  `;
  return card;
}

function createSignalCard(signal) {
  const card = document.createElement('article');
  const tone = signalTone(signal.severity);
  card.className = `signal-card is-${tone}`;
  card.innerHTML = `
    <div class="signal-head">
      <h3>${signal.label}</h3>
      <span class="signal-badge is-${tone}">${String(signal.severity || 'ok').toUpperCase()}</span>
    </div>
    <p class="signal-value">${signal.value === null ? 'unavailable' : `${signal.value}${signal.unit === 'count' ? '' : ` ${signal.unit || ''}`}`.trim()}</p>
    <p class="signal-detail">${signal.description || 'No description'}</p>
    <p class="signal-source">${signal.source || 'unknown source'}</p>
  `;
  return card;
}

async function fetchEndpoint(path) {
  const url = buildUrl(runtime.apiBase, path);
  if (!url) throw new Error(`Missing endpoint for ${path}`);
  const response = await fetch(url, { headers: { Accept: 'application/json' } });
  if (!response.ok) {
    throw new Error(`${path}: HTTP ${response.status}`);
  }
  return unwrapEnvelope(await response.json());
}

function setText(id, value) {
  const element = document.getElementById(id);
  if (element) element.textContent = value;
}

function activatePanel(panel) {
  app.panel = panel;
  document.querySelectorAll('.panel-tab').forEach((tab) => {
    tab.classList.toggle('is-active', tab.dataset.panel === panel);
  });
  document.querySelectorAll('.panel-section').forEach((section) => {
    section.classList.toggle('is-active', section.id === `panel-${panel}`);
  });
}

function renderHero(summary, releaseFlow, signals) {
  const cluster = summary?.cluster || {};
  const signalSummary = signals?.summary || {};
  setText('cluster-state', String(cluster.clusterState || 'unknown').toUpperCase());
  setText(
    'cluster-detail',
    `role=${cluster.role || 'n/a'} • term=${cluster.currentTerm ?? 'n/a'} • validators=${cluster.reachableValidators ?? 'n/a'}`,
  );

  setText('governor-state', String(releaseFlow?.governor?.state || 'unknown').toUpperCase());
  setText(
    'governor-detail',
    `${releaseFlow?.governor?.action || 'n/a'} • pending=${formatNumber(releaseFlow?.governor?.backpressurePendingCount || 0)}`,
  );

  setText('signal-status', String(signals?.status || 'unknown').toUpperCase());
  setText(
    'signal-detail',
    `critical=${signalSummary.critical ?? 0} • warn=${signalSummary.warn ?? 0} • unknown=${signalSummary.unknown ?? 0}`,
  );

  setText('release-mode', String(releaseFlow?.releaseMode || 'unknown'));
  setText(
    'release-detail',
    `${releaseFlow?.schedulerModel || 'n/a'} • confirmations=${releaseFlow?.requiredConfirmations ?? 'n/a'}`,
  );
}

function renderOverview(summary, releaseFlow, signals, config, gc) {
  const cluster = summary?.cluster || {};
  const queue = summary?.queue?.compact || {};
  const signalSummary = signals?.summary || {};
  const grid = document.getElementById('overview-grid');
  if (!grid) return;
  grid.replaceChildren(
    createMetricCard('Leader', cluster.currentLeader || 'n/a', `role=${cluster.role || 'n/a'} • term=${cluster.currentTerm ?? 'n/a'}`),
    createMetricCard('Nodes', formatNumber(cluster.nodeCount || 0), `quorum=${cluster.quorum ?? 'n/a'} • reachable=${cluster.reachableValidators ?? 'n/a'}`),
    createMetricCard('Queue Pending', formatNumber(queue.queuePending || 0), `mempool=${formatNumber(queue.mempoolPendingCount || 0)} • backpressure=${formatNumber(queue.backpressurePending || 0)}`),
    createMetricCard('Verified Resident', formatNumber(releaseFlow?.releaseStages?.verifiedResidentProposalCount || 0), `ready=${formatNumber(releaseFlow?.releaseStages?.releaseReadyProposalCount || 0)} • overflow=${formatNumber(releaseFlow?.releaseStages?.backpressureOverflowProposalCount || 0)}`),
    createMetricCard('Signals', `${signalSummary.critical ?? 0} critical`, `warn=${signalSummary.warn ?? 0} • ok=${signalSummary.ok ?? 0}`, signalSummary.critical > 0 ? 'critical' : 'ok'),
    createMetricCard('Config Drift', formatNumber(config?.summary?.changedKeys || 0), `guarded=${config?.summary?.guardedChanged || 0} • expert=${config?.summary?.expertOnlyChanged || 0}`),
    createMetricCard('GC Status', gc?.gcEnabled ? 'enabled' : 'disabled', `pending=${formatNumber(gc?.pendingProposals || 0)} • consensus=${formatBoolean(gc?.gcConsensusRequired)}`),
    createMetricCard('Epoch Overlay', `${releaseFlow?.currentEpoch ?? 'n/a'} / ${releaseFlow?.finalizedEpoch ?? 'n/a'}`, `gap=${releaseFlow?.epochsUntilFinality ?? 'n/a'} • overlay-only`),
  );
}

function renderReleaseFlow(releaseFlow) {
  const stages = releaseFlow?.releaseStages || {};
  const stageGrid = document.getElementById('release-stage-grid');
  const summaryGrid = document.getElementById('release-summary');
  if (!stageGrid || !summaryGrid) return;

  stageGrid.replaceChildren(
    createStageCard('Unverified Mempool', formatNumber(stages.unverifiedMempoolCount || 0), `confirmations=${releaseFlow?.requiredConfirmations ?? 'n/a'}`, stageTone(stages.unverifiedMempoolCount, 'mempool')),
    createStageCard('Verified Packing Buffer', formatNumber(stages.verifiedPackingBufferCount || 0), `wallets=${formatNumber(releaseFlow?.packing?.walletCount || 0)}`, stageTone(stages.verifiedPackingBufferCount, 'packing')),
    createStageCard('Release Ready', formatNumber(stages.releaseReadyProposalCount || 0), `batches=${formatNumber(stages.releaseReadyBatchCount || 0)}`, stageTone(stages.releaseReadyProposalCount, 'ready')),
    createStageCard('Backpressure Overflow', formatNumber(stages.backpressureOverflowProposalCount || 0), `batches=${formatNumber(stages.backpressureOverflowBatchCount || 0)}`, stageTone(stages.backpressureOverflowProposalCount, 'overflow')),
  );

  summaryGrid.replaceChildren(
    createMetricCard('Governor', `${releaseFlow?.governor?.state || 'unknown'} / ${releaseFlow?.governor?.action || 'n/a'}`, `reasons=${(releaseFlow?.governor?.reasonCodes || []).join(', ') || 'none'}`),
    createMetricCard('Throughput', formatNumber(releaseFlow?.throughput?.totalProposalsSent || 0), `finalized=${formatNumber(releaseFlow?.throughput?.totalFinalizedCount || 0)} • rejected=${formatNumber(releaseFlow?.throughput?.totalRejectedCount || 0)}`),
    createMetricCard('Packing', formatNumber(releaseFlow?.packing?.queuedProposalCountTotal || 0), `drained=${formatNumber(releaseFlow?.packing?.drainedProposalCountTotal || 0)} • batches=${formatNumber(releaseFlow?.packing?.createdBatchCountTotal || 0)}`),
    createMetricCard('Overflow', formatNumber(releaseFlow?.overflow?.bufferedProposalCountTotal || 0), `promoted=${formatNumber(releaseFlow?.overflow?.promotedProposalCountTotal || 0)} • separate=${formatBoolean(releaseFlow?.overflow?.separateBufferEnabled)}`),
  );

  setText('release-note', releaseFlow?.note || 'No release note available.');
}

function renderSignals(signals) {
  const summary = signals?.summary || {};
  const signalList = Array.isArray(signals?.signals) ? signals.signals : [];
  const summaryGrid = document.getElementById('signals-summary');
  const grid = document.getElementById('signals-grid');
  if (!summaryGrid || !grid) return;

  summaryGrid.replaceChildren(
    createMetricCard('Critical', formatNumber(summary.critical || 0), 'Immediate operator attention'),
    createMetricCard('Warn', formatNumber(summary.warn || 0), 'Degraded or trending hot', summary.warn > 0 ? 'warn' : 'neutral'),
    createMetricCard('OK', formatNumber(summary.ok || 0), 'Healthy observed signals'),
    createMetricCard('Unknown', formatNumber(summary.unknown || 0), 'Telemetry gaps or unavailable counters', summary.unknown > 0 ? 'unknown' : 'neutral'),
  );

  const prioritized = [...signalList]
    .sort((a, b) => {
      const weight = { critical: 0, warn: 1, unknown: 2, ok: 3 };
      return (weight[a.severity] ?? 4) - (weight[b.severity] ?? 4);
    })
    .slice(0, 10);

  grid.replaceChildren(...prioritized.map((signal) => createSignalCard(signal)));
}

function renderConfig(config) {
  const summary = config?.summary || {};
  const changed = Array.isArray(config?.changed) ? config.changed.slice(0, 8) : [];
  const summaryGrid = document.getElementById('config-summary');
  const changes = document.getElementById('config-changes');
  if (!summaryGrid || !changes) return;

  summaryGrid.replaceChildren(
    createMetricCard('Changed Keys', formatNumber(summary.changedKeys || 0), `total=${formatNumber(summary.totalKeys || 0)}`),
    createMetricCard('Guarded Drift', formatNumber(summary.guardedChanged || 0), 'Runtime or startup settings with operational risk', summary.guardedChanged > 0 ? 'warn' : 'neutral'),
    createMetricCard('Expert Drift', formatNumber(summary.expertOnlyChanged || 0), 'Needs deliberate owner review', summary.expertOnlyChanged > 0 ? 'warn' : 'neutral'),
    createMetricCard('Unchanged', formatNumber(summary.unchangedKeys || 0), 'Defaults still intact'),
  );

  changes.replaceChildren(...changed.map((change) => {
    const item = document.createElement('article');
    item.className = `stack-item is-${String(change.risk || 'safe')}`;
    item.innerHTML = `
      <div class="stack-head">
        <h3>${change.key}</h3>
        <span>${change.risk || 'safe'}</span>
      </div>
      <p>${String(change.default)} -> ${String(change.current)}</p>
      <p>${change.justification || 'No justification provided.'}</p>
    `;
    return item;
  }));
}

function renderGc(gc, queueStats) {
  const grid = document.getElementById('gc-grid');
  if (!grid) return;
  grid.replaceChildren(
    createMetricCard('GC Enabled', gc?.gcEnabled ? 'yes' : 'no', `consensus=${formatBoolean(gc?.gcConsensusRequired)}`),
    createMetricCard('Pending GC Proposals', formatNumber(gc?.pendingProposals || 0), `lastRun=${gc?.lastGcRun || '--'}`),
    createMetricCard('Finalized Lifetime', formatNumber(queueStats?.totalFinalizedCountLifetime || 0), 'Queue lifetime finalized count'),
    createMetricCard('Rejected Lifetime', formatNumber(queueStats?.totalRejectedCountLifetime || 0), 'Queue lifetime rejected count'),
  );
}

function renderDebug(queueStats, releaseFlow, signals) {
  setText('debug-queue', formatJson(queueStats));
  setText('debug-release', formatJson(releaseFlow));
  setText('debug-signals', formatJson(signals));
}

async function refresh() {
  const refreshButton = document.getElementById('refresh-btn');
  try {
    if (refreshButton) {
      refreshButton.disabled = true;
      refreshButton.textContent = 'Refreshing...';
    }

    const [summary, overview, signals, releaseFlow, config, gc, queueStats] = await Promise.all([
      fetchEndpoint(runtime.endpoints.explorerSummary),
      fetchEndpoint(runtime.endpoints.overview),
      fetchEndpoint(runtime.endpoints.signals),
      fetchEndpoint(runtime.endpoints.proposalsReleaseFlow),
      fetchEndpoint(runtime.endpoints.configOsgiDelta),
      fetchEndpoint(runtime.endpoints.gcStatus),
      fetchEndpoint(runtime.endpoints.proposalsQueueStats),
    ]);

    renderHero(summary, releaseFlow, signals);
    renderOverview(summary, releaseFlow, signals, config, gc);
    renderReleaseFlow(releaseFlow);
    renderSignals(signals);
    renderConfig(config);
    renderGc(gc, queueStats);
    renderDebug(queueStats, releaseFlow, signals);

    setText('runtime-base', runtime.apiBase);
    setText('last-updated', `Updated ${new Date().toLocaleTimeString()}`);
  } catch (error) {
    setText('last-updated', `Refresh failed: ${error.message}`);
  } finally {
    if (refreshButton) {
      refreshButton.disabled = false;
      refreshButton.textContent = 'Refresh';
    }
  }
}

function initTabs() {
  document.querySelectorAll('.panel-tab').forEach((tab) => {
    tab.addEventListener('click', () => activatePanel(tab.dataset.panel));
  });
}

function initRefresh() {
  const refreshButton = document.getElementById('refresh-btn');
  if (refreshButton) {
    refreshButton.addEventListener('click', refresh);
  }
  const refreshSeconds = asNum(runtime.refreshSeconds.metrics || 30, 30);
  if (refreshSeconds > 0) {
    app.timer = window.setInterval(refresh, Math.max(5, refreshSeconds) * 1000);
  }
}

function init() {
  initTabs();
  initRefresh();
  activatePanel('overview');
  refresh();
}

init();
