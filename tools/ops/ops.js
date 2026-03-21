import {
  runtime,
  fetchOptionalEndpoints,
  initDashboardShell,
  renderShellStatus,
} from '/tools/shell.js';

const PANELS = ['overview', 'cluster', 'release', 'signals', 'config', 'gc', 'debug'];
const app = {
  panel: 'overview',
  timer: null,
};

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

function formatStatus(value, fallback = 'unknown') {
  return String(value || fallback).toUpperCase();
}

function formatJson(value) {
  return JSON.stringify(value, null, 2);
}

function formatTimestamp(value) {
  if (!value) return '--';
  const timestamp = new Date(value);
  if (Number.isNaN(timestamp.getTime())) return String(value);
  return timestamp.toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' });
}

function formatNodeId(value) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? `Node ${parsed}` : 'Node --';
}

function isOperationalStatus(value) {
  const normalized = String(value || '').toLowerCase();
  return normalized === 'ready' || normalized === 'active' || normalized === 'healthy';
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

function normalizePanel(panel) {
  return PANELS.includes(panel) ? panel : 'overview';
}

function readPanelFromLocation() {
  const rawHash = String(window.location.hash || '').replace(/^#/, '').trim().toLowerCase();
  if (!rawHash) return null;
  const panel = rawHash.startsWith('panel-') ? rawHash.slice(6) : rawHash;
  return PANELS.includes(panel) ? panel : null;
}

function writePanelToLocation(panel, replace = false) {
  const target = normalizePanel(panel);
  const url = new URL(window.location.href);
  url.hash = target;
  if (url.hash === window.location.hash) return;
  window.history[replace ? 'replaceState' : 'pushState']({ panel: target }, '', url);
}

function createMetricCard(label, value, detail, tone = 'neutral', description = '') {
  const card = document.createElement('article');
  card.className = `metric-card is-${tone}`;
  card.innerHTML = `
    <p class="metric-label">${label}</p>
    <p class="metric-value">${value}</p>
    ${description ? `<p class="metric-description">${description}</p>` : ''}
    <p class="metric-detail">${detail}</p>
  `;
  return card;
}

function createStageCard(label, value, detail, tone = 'idle', description = '') {
  const card = document.createElement('article');
  card.className = `stage-card is-${tone}`;
  card.innerHTML = `
    <p class="stage-label">${label}</p>
    <p class="stage-value">${value}</p>
    ${description ? `<p class="stage-description">${description}</p>` : ''}
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

function createValidatorCard(node, cluster) {
  const card = document.createElement('article');
  const isLeader = Number(node?.nodeId) === Number(cluster?.leaderNodeId);
  const reachable = node?.reachable === true;
  const status = String(node?.status || 'unknown').toUpperCase();
  const tone = !reachable
    ? 'unknown'
    : isOperationalStatus(status)
      ? 'ok'
      : status === 'DEGRADED'
        ? 'warn'
        : 'neutral';
  const reachabilityText = reachable ? 'reachable' : 'unreachable';
  card.className = `validator-card is-${tone}`;
  card.innerHTML = `
    <div class="validator-head">
      <div>
        <p class="validator-node">${formatNodeId(node?.nodeId)}</p>
        <p class="validator-wallet">${node?.wallet || '--'}</p>
      </div>
      <span class="validator-status is-${tone}">${status}</span>
    </div>
    <div class="validator-meta">
      <span class="validator-chip ${isLeader ? 'is-leader' : ''}">${isLeader ? 'LEADER' : (node?.role || 'FOLLOWER')}</span>
      <span class="validator-chip ${reachable ? 'is-reachable' : 'is-unreachable'}">${reachabilityText}</span>
    </div>
    <dl class="validator-facts">
      <div>
        <dt>Role</dt>
        <dd>${node?.role || '--'}</dd>
      </div>
      <div>
        <dt>Last Seen</dt>
        <dd>${formatTimestamp(node?.lastSeenAt)}</dd>
      </div>
    </dl>
  `;
  return card;
}

function setText(id, value) {
  const element = document.getElementById(id);
  if (element) element.textContent = value;
}

function activatePanel(panel) {
  const target = normalizePanel(panel);
  app.panel = target;
  document.querySelectorAll('.panel-tab').forEach((tab) => {
    const isActive = tab.dataset.panel === target;
    tab.classList.toggle('is-active', isActive);
    tab.setAttribute('aria-selected', String(isActive));
    tab.setAttribute('tabindex', isActive ? '0' : '-1');
  });
  document.querySelectorAll('.panel-section').forEach((section) => {
    const isActive = section.id === `panel-${target}`;
    section.classList.toggle('is-active', isActive);
    section.hidden = !isActive;
  });
}

function setPanel(panel, { syncUrl = false, replaceUrl = false } = {}) {
  const target = normalizePanel(panel);
  activatePanel(target);
  if (syncUrl) {
    writePanelToLocation(target, replaceUrl);
  }
}

function syncPanelFromLocation({ canonicalize = false } = {}) {
  const panel = readPanelFromLocation();
  if (!panel) {
    activatePanel('overview');
    return;
  }
  setPanel(panel, {
    syncUrl: canonicalize && window.location.hash !== `#${panel}`,
    replaceUrl: true,
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
    createMetricCard('Leader', cluster.currentLeader || 'n/a', `role=${cluster.role || 'n/a'} • term=${cluster.currentTerm ?? 'n/a'}`, 'neutral', 'Current node acting as the observed cluster coordinator.'),
    createMetricCard('Nodes', formatNumber(cluster.nodeCount || 0), `quorum=${cluster.quorum ?? 'n/a'} • reachable=${cluster.reachableValidators ?? 'n/a'}`, 'neutral', 'Validator membership size and quorum posture in the current cluster view.'),
    createMetricCard('Queue Pending', formatNumber(queue.queuePending || 0), `mempool=${formatNumber(queue.mempoolPendingCount || 0)} • backpressure=${formatNumber(queue.backpressurePending || 0)}`, 'neutral', 'Outstanding proposals still waiting somewhere in the queueing path.'),
    createMetricCard('Verified Resident', formatNumber(releaseFlow?.releaseStages?.verifiedResidentProposalCount || 0), `ready=${formatNumber(releaseFlow?.releaseStages?.releaseReadyProposalCount || 0)} • overflow=${formatNumber(releaseFlow?.releaseStages?.backpressureOverflowProposalCount || 0)}`, 'neutral', 'Verified proposals still resident in release memory before finalization or overflow.'),
    createMetricCard('Signals', `${signalSummary.critical ?? 0} critical`, `warn=${signalSummary.warn ?? 0} • ok=${signalSummary.ok ?? 0}`, signalSummary.critical > 0 ? 'critical' : 'ok', 'Count of active operator health findings grouped by severity.'),
    createMetricCard('Config Drift', formatNumber(config?.summary?.changedKeys || 0), `guarded=${config?.summary?.guardedChanged || 0} • expert=${config?.summary?.expertOnlyChanged || 0}`, 'neutral', 'Runtime-visible keys deviating from the shipped blockchain defaults.'),
    createMetricCard('GC Status', gc?.gcEnabled ? 'enabled' : 'disabled', `pending=${formatNumber(gc?.pendingProposals || 0)} • consensus=${formatBoolean(gc?.gcConsensusRequired)}`, 'neutral', 'Whether distributed garbage collection can run and how much GC work is still queued.'),
    createMetricCard('Epoch Overlay', `${releaseFlow?.currentEpoch ?? 'n/a'} / ${releaseFlow?.finalizedEpoch ?? 'n/a'}`, `gap=${releaseFlow?.epochsUntilFinality ?? 'n/a'} • overlay-only`, 'neutral', 'Observed head epoch versus finalized epoch; informational overlay, not canonical release truth.'),
  );
}

function renderCluster(cluster) {
  const summaryGrid = document.getElementById('cluster-summary');
  const validatorGrid = document.getElementById('validator-grid');
  if (!summaryGrid || !validatorGrid) return;

  const nodes = Array.isArray(cluster?.nodes) ? cluster.nodes : [];
  const reachableCount = nodes.filter((node) => node?.reachable === true).length;
  const operationalCount = nodes.filter((node) => isOperationalStatus(node?.status)).length;
  const leaderNode = nodes.find((node) => Number(node?.nodeId) === Number(cluster?.leaderNodeId));
  const quorumTarget = nodes.length > 0 ? Math.floor(nodes.length / 2) + 1 : 0;
  const clusterStateTone = ['active', 'healthy'].includes(String(cluster?.clusterState || '').toLowerCase()) ? 'ok' : 'neutral';
  const orderedNodes = [...nodes].sort((left, right) => {
    const leftLeader = Number(left?.nodeId) === Number(cluster?.leaderNodeId) ? 0 : 1;
    const rightLeader = Number(right?.nodeId) === Number(cluster?.leaderNodeId) ? 0 : 1;
    if (leftLeader !== rightLeader) return leftLeader - rightLeader;
    return asNum(left?.nodeId, 999) - asNum(right?.nodeId, 999);
  });

  summaryGrid.replaceChildren(
    createMetricCard('Cluster State', formatStatus(cluster?.clusterState), `term=${cluster?.term ?? 'n/a'} • nodes=${formatNumber(nodes.length)}`, clusterStateTone, 'Current validator-cluster status and observed term.'),
    createMetricCard('Leader Node', leaderNode ? formatNodeId(leaderNode.nodeId) : 'n/a', leaderNode?.wallet || 'leader not resolved', 'neutral', 'The validator currently believed to lead consensus for this term.'),
    createMetricCard('Reachable', formatNumber(reachableCount), `quorum=${quorumTarget} • unreachable=${formatNumber(nodes.length - reachableCount)}`, reachableCount === nodes.length && nodes.length > 0 ? 'ok' : 'warn', 'Validators currently reachable from the observed node.'),
    createMetricCard('Operational Validators', formatNumber(operationalCount), `non-operational=${formatNumber(nodes.length - operationalCount)} • leaderId=${cluster?.leaderNodeId ?? 'n/a'}`, operationalCount === nodes.length && nodes.length > 0 ? 'ok' : 'warn', 'Validators currently reporting an active, healthy, or ready operating state.'),
  );

  validatorGrid.replaceChildren(...orderedNodes.map((node) => createValidatorCard(node, cluster)));
  setText(
    'cluster-note',
    nodes.length > 0
      ? `Validator roster shows wallet identity, role, readiness, and reachability for all ${nodes.length} observed nodes.`
      : 'No validator roster returned by /ops/v1/cluster.',
  );
}

function renderReleaseFlow(releaseFlow) {
  const stages = releaseFlow?.releaseStages || {};
  const stageGrid = document.getElementById('release-stage-grid');
  const summaryGrid = document.getElementById('release-summary');
  if (!stageGrid || !summaryGrid) return;

  stageGrid.replaceChildren(
    createStageCard('Unverified Mempool', formatNumber(stages.unverifiedMempoolCount || 0), `confirmations=${releaseFlow?.requiredConfirmations ?? 'n/a'}`, stageTone(stages.unverifiedMempoolCount, 'mempool'), 'Inbound proposals still waiting for enough confirmations to become verified.'),
    createStageCard('Verified Packing Buffer', formatNumber(stages.verifiedPackingBufferCount || 0), `wallets=${formatNumber(releaseFlow?.packing?.walletCount || 0)}`, stageTone(stages.verifiedPackingBufferCount, 'packing'), 'Verified proposals currently held for batching into release-ready packs.'),
    createStageCard('Release Ready', formatNumber(stages.releaseReadyProposalCount || 0), `batches=${formatNumber(stages.releaseReadyBatchCount || 0)}`, stageTone(stages.releaseReadyProposalCount, 'ready'), 'Proposals already cleared to ship on the next governor-approved release step.'),
    createStageCard('Backpressure Overflow', formatNumber(stages.backpressureOverflowProposalCount || 0), `batches=${formatNumber(stages.backpressureOverflowBatchCount || 0)}`, stageTone(stages.backpressureOverflowProposalCount, 'overflow'), 'Work diverted out of the main release lane to protect throughput under pressure.'),
  );

  summaryGrid.replaceChildren(
    createMetricCard('Governor', `${releaseFlow?.governor?.state || 'unknown'} / ${releaseFlow?.governor?.action || 'n/a'}`, `reasons=${(releaseFlow?.governor?.reasonCodes || []).join(', ') || 'none'}`, 'neutral', 'Decision state of the adaptive controller throttling or advancing release flow.'),
    createMetricCard('Release Sends', formatNumber(releaseFlow?.throughput?.totalProposalsSent || 0), `batched=${formatNumber(releaseFlow?.throughput?.batchedProposalsSent || 0)} • priority=${formatNumber(releaseFlow?.throughput?.priorityProposalsSent || 0)}`, 'neutral', 'Lifetime proposals emitted by the release system across both batched and direct-priority paths.'),
    createMetricCard('Packer Input', formatNumber(releaseFlow?.packing?.queuedProposalCountTotal || 0), `drained=${formatNumber(releaseFlow?.packing?.drainedProposalCountTotal || 0)} • batches=${formatNumber(releaseFlow?.packing?.createdBatchCountTotal || 0)}`, 'neutral', 'Lifetime proposals that entered adaptive packing before becoming release-ready batches.'),
    createMetricCard('Overflow', formatNumber(releaseFlow?.overflow?.bufferedProposalCountTotal || 0), `promoted=${formatNumber(releaseFlow?.overflow?.promotedProposalCountTotal || 0)} • separate=${formatBoolean(releaseFlow?.overflow?.separateBufferEnabled)}`, 'neutral', 'Lifetime spillover handled by the overflow buffer when backpressure engages.'),
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
    createMetricCard('Critical', formatNumber(summary.critical || 0), 'Immediate operator attention', summary.critical > 0 ? 'critical' : 'neutral', 'Signals demanding direct intervention right now.'),
    createMetricCard('Warn', formatNumber(summary.warn || 0), 'Degraded or trending hot', summary.warn > 0 ? 'warn' : 'neutral', 'Signals that are degraded, noisy, or moving toward a critical state.'),
    createMetricCard('OK', formatNumber(summary.ok || 0), 'Healthy observed signals', 'ok', 'Signals currently reporting healthy operating conditions.'),
    createMetricCard('Unknown', formatNumber(summary.unknown || 0), 'Telemetry gaps or unavailable counters', summary.unknown > 0 ? 'unknown' : 'neutral', 'Signals missing telemetry or upstream counters, so health cannot be classified.'),
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
    createMetricCard('Changed Keys', formatNumber(summary.changedKeys || 0), `total=${formatNumber(summary.totalKeys || 0)}`, 'neutral', 'Total runtime-visible keys diverging from the default config set.'),
    createMetricCard('Guarded Drift', formatNumber(summary.guardedChanged || 0), 'Runtime or startup settings with operational risk', summary.guardedChanged > 0 ? 'warn' : 'neutral', 'Sensitive operational settings that changed from their expected defaults.'),
    createMetricCard('Expert Drift', formatNumber(summary.expertOnlyChanged || 0), 'Needs deliberate owner review', summary.expertOnlyChanged > 0 ? 'warn' : 'neutral', 'Expert-only settings changed and worth explicit owner review.'),
    createMetricCard('Unchanged', formatNumber(summary.unchangedKeys || 0), 'Defaults still intact', 'neutral', 'Keys that still match the shipped defaults with no runtime drift.'),
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
    createMetricCard('GC Enabled', gc?.gcEnabled ? 'yes' : 'no', `consensus=${formatBoolean(gc?.gcConsensusRequired)}`, 'neutral', 'Whether garbage collection is currently allowed to execute in this cluster.'),
    createMetricCard('Pending GC Proposals', formatNumber(gc?.pendingProposals || 0), `lastRun=${gc?.lastGcRun || '--'}`, 'neutral', 'GC proposals still waiting for enough consensus or scheduling to run.'),
    createMetricCard('Finalized Lifetime', formatNumber(queueStats?.totalFinalizedCountLifetime || 0), 'Queue lifetime finalized count', 'neutral', 'Total finalized proposals seen by queue stats over the observed node lifetime.'),
    createMetricCard('Rejected Lifetime', formatNumber(queueStats?.totalRejectedCountLifetime || 0), 'Queue lifetime rejected count', 'neutral', 'Total proposals rejected across the observed queue lifetime.'),
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
    setText('runtime-base', runtime.apiBase);
    if (refreshButton) {
      refreshButton.disabled = true;
      refreshButton.textContent = 'Refreshing...';
    }

    const { data, errors } = await fetchOptionalEndpoints({
      summary: runtime.endpoints.explorerSummary,
      overview: runtime.endpoints.overview,
      cluster: runtime.endpoints.cluster,
      signals: runtime.endpoints.signals,
      releaseFlow: runtime.endpoints.proposalsReleaseFlow,
      config: runtime.endpoints.configOsgiDelta,
      gc: runtime.endpoints.gcStatus,
      queueStats: runtime.endpoints.proposalsQueueStats,
    });

    if (Object.keys(data).length === 0) {
      throw new Error(errors[0] || 'No ops endpoints available');
    }

    renderHero(data.summary, data.releaseFlow, data.signals);
    renderOverview(data.summary, data.releaseFlow, data.signals, data.config, data.gc);
    renderCluster(data.cluster);
    renderReleaseFlow(data.releaseFlow);
    renderSignals(data.signals);
    renderConfig(data.config);
    renderGc(data.gc, data.queueStats);
    renderDebug(data.queueStats, data.releaseFlow, data.signals);
    renderShellStatus(data.summary, data.signals, errors);

    const refreshedAt = `Updated ${new Date().toLocaleTimeString()}`;
    setText(
      'last-updated',
      errors.length > 0
        ? `${refreshedAt} • degraded (${errors[0]})`
        : refreshedAt,
    );
  } catch (error) {
    renderShellStatus({}, {}, [error.message]);
    setText('last-updated', `Refresh failed: ${error.message}`);
  } finally {
    if (refreshButton) {
      refreshButton.disabled = false;
      refreshButton.textContent = 'Refresh';
    }
  }
}

function initTabs() {
  const tabs = [...document.querySelectorAll('.panel-tab')];
  tabs.forEach((tab, index) => {
    tab.addEventListener('click', () => setPanel(tab.dataset.panel, { syncUrl: true }));
    tab.addEventListener('keydown', (event) => {
      if (!['ArrowLeft', 'ArrowRight', 'Home', 'End'].includes(event.key)) return;
      event.preventDefault();
      let nextIndex = index;
      if (event.key === 'ArrowRight') nextIndex = (index + 1) % tabs.length;
      if (event.key === 'ArrowLeft') nextIndex = (index - 1 + tabs.length) % tabs.length;
      if (event.key === 'Home') nextIndex = 0;
      if (event.key === 'End') nextIndex = tabs.length - 1;
      const nextTab = tabs[nextIndex];
      nextTab.focus();
      setPanel(nextTab.dataset.panel, { syncUrl: true });
    });
  });
  window.addEventListener('popstate', () => syncPanelFromLocation());
  window.addEventListener('hashchange', () => syncPanelFromLocation());
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
  syncPanelFromLocation({ canonicalize: true });
  initDashboardShell({ activeNav: 'ops', fetchStatus: false });
  refresh();
}

init();
