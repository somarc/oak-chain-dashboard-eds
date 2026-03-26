/* eslint-disable no-use-before-define */
import {
  initializeShellStatusPanel,
  syncShellStatusDetails,
} from '../shell.js';
import {
  getOpsRuntimeConfig,
  getRunnerRuntimeConfig,
} from '../../scripts/ops-runtime-config.js';

const EVENT_LIMIT = 10;
const GROUP_ORDER = ['runtime', 'phases', 'coverage', 'load', 'soak'];
const opsRuntime = getOpsRuntimeConfig();
const runnerRuntime = getRunnerRuntimeConfig();

const state = {
  suite: null,
  runs: [],
  selectedRunId: null,
  selectedRun: null,
  selectedInputs: null,
  selectedEvents: [],
  selectedArtifacts: null,
  formValues: {},
  attachArtifactRoot: runnerRuntime.defaults.attachArtifactRoot,
  opsSummary: null,
  opsSignals: null,
  opsErrors: [],
  timer: null,
  error: '',
  notice: null,
  isMutating: false,
};

function buildUrl(base, route) {
  if (!route) return null;
  const normalizedBase = String(base || '').replace(/\/$/, '');
  const normalizedRoute = route.startsWith('/') ? route : `/${route}`;
  return `${normalizedBase}${normalizedRoute}`;
}

function unwrapEnvelope(payload) {
  if (payload && typeof payload === 'object' && payload.data && typeof payload.data === 'object') {
    return payload.data;
  }
  return payload;
}

function escapeHtml(value) {
  return String(value ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

function isRunnerConfigured() {
  return Boolean(runnerRuntime.apiBase);
}

function setText(id, value) {
  const element = document.getElementById(id);
  if (element) element.textContent = value;
}

function setToneText(id, tone = '') {
  const element = document.getElementById(id);
  if (!element) return;
  element.className = 'tile-value';
  if (tone && tone !== 'neutral') {
    element.classList.add(`is-${tone}`);
  }
}

function setBadge(id, value, tone = 'neutral') {
  const element = document.getElementById(id);
  if (!element) return;
  element.textContent = value;
  const interactive = element.dataset.shellStatusKey ? ' is-interactive' : '';
  element.className = `status-badge is-${tone}${interactive}`;
  if (element.dataset.shellStatusLabel) {
    element.setAttribute('aria-label', `${element.dataset.shellStatusLabel} status ${value}`);
  }
}

function setStatusDot(tone = 'neutral') {
  const element = document.getElementById('status-dot');
  if (!element) return;
  element.className = `status-dot is-${tone}`;
}

function formatRelativeTime(value) {
  if (!value) return 'unknown';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return String(value);
  return date.toLocaleString();
}

function formatStatus(status, fallback = 'unknown') {
  return String(status || fallback).replace(/[-_]+/g, ' ').trim().toUpperCase();
}

function humanize(value, fallback = 'unknown') {
  const text = String(value || fallback).replace(/[-_]+/g, ' ').trim();
  if (!text) return fallback;
  return text.charAt(0).toUpperCase() + text.slice(1);
}

function shorten(value) {
  const text = String(value || '');
  if (!text) return '--';
  if (text.length <= 16) return text;
  return `${text.slice(0, 8)}...${text.slice(-6)}`;
}

function truncateMiddle(value, max = 28) {
  const text = String(value || '');
  if (!text) return '--';
  if (text.length <= max) return text;
  const edge = Math.max(6, Math.floor((max - 3) / 2));
  return `${text.slice(0, edge)}...${text.slice(-edge)}`;
}

function truncateText(value, max = 180) {
  const text = String(value || '').trim();
  if (!text) return '';
  if (text.length <= max) return text;
  return `${text.slice(0, Math.max(0, max - 1)).trimEnd()}…`;
}

function toneForStatus(status) {
  const normalized = String(status || '').toLowerCase();
  if (['running', 'starting', 'cancelling'].includes(normalized)) return 'is-running';
  if (normalized === 'succeeded') return 'is-succeeded';
  if (normalized === 'failed') return 'is-failed';
  if (['attached', 'cancelled', 'pending'].includes(normalized)) return 'is-attached';
  return 'is-pending';
}

function toneForEvent(event) {
  return String(event?.level || '').toLowerCase() === 'error' ? 'is-error' : 'is-info';
}

function toneForClusterState(value) {
  const normalized = String(value || '').toLowerCase();
  if (normalized === 'healthy') return 'success';
  if (normalized === 'degraded') return 'warn';
  if (normalized === 'critical' || normalized === 'unavailable') return 'danger';
  return 'neutral';
}

function toneForSignalState(value) {
  const normalized = String(value || '').toLowerCase();
  if (normalized === 'ok' || normalized === 'healthy') return 'success';
  if (normalized === 'warn') return 'warn';
  if (normalized === 'critical' || normalized === 'unavailable') return 'danger';
  return 'neutral';
}

function toneForRunState(value) {
  const normalized = String(value || '').toLowerCase();
  if (['running', 'starting', 'cancelling'].includes(normalized)) return 'info';
  if (normalized === 'succeeded') return 'success';
  if (normalized === 'failed') return 'danger';
  if (['attached', 'cancelled', 'pending'].includes(normalized)) return 'warn';
  return 'neutral';
}

function accentClassForTone(tone) {
  return tone && tone !== 'neutral' ? `accent-${tone}` : '';
}

function runtimeModePresentation() {
  const apiBase = String(opsRuntime.apiBase || '').toLowerCase();
  if (!apiBase) return { label: 'PENDING', tone: 'warn' };
  if (apiBase.includes('127.0.0.1') || apiBase.includes('localhost')) {
    return { label: 'MOCK', tone: 'info' };
  }
  return { label: 'LIVE', tone: 'success' };
}

function currentHostKind() {
  const hostname = String(window.location.hostname || '').toLowerCase();
  if (hostname === 'localhost' || hostname === '127.0.0.1') return 'local';
  if (hostname === 'oakchain.net' || hostname.endsWith('.oakchain.net')) return 'oakchain';
  return 'hosted';
}

function updateLastUpdated(value) {
  setText('last-updated', value);
  syncShellStatusDetails({ lastSync: value });
}

function setNotice(label, detail, noticeClass = 'is-info') {
  state.notice = { label, detail, noticeClass };
}

function clearNotice() {
  state.notice = null;
}

function runnerPresentation() {
  if (!isRunnerConfigured()) {
    return {
      state: 'Pending',
      detail: 'Runner worker is not configured for this host.',
      noticeClass: 'is-info',
    };
  }

  if (state.error) {
    return {
      state: 'Unavailable',
      detail: state.error,
      noticeClass: 'is-danger',
    };
  }

  if (state.notice?.detail) {
    return {
      state: state.notice.label || 'Ready',
      detail: state.notice.detail,
      noticeClass: state.notice.noticeClass || 'is-info',
    };
  }

  return {
    state: 'Ready',
    detail: `Runner worker at ${runnerRuntime.apiBase}`,
    noticeClass: 'is-ok',
  };
}

function clusterPresentation() {
  if (!opsRuntime.apiBase) {
    return { state: 'Pending', detail: 'Ops runtime is not configured.' };
  }

  if (state.opsSummary?.cluster) {
    const { cluster } = state.opsSummary;
    const role = cluster.role ? humanize(cluster.role) : 'Role unknown';
    const leader = Number.isFinite(Number(cluster.leaderNodeId))
      ? `leader ${cluster.leaderNodeId}`
      : 'leader unresolved';
    return {
      state: formatStatus(cluster.clusterState, 'healthy'),
      detail: `${role} - ${leader}`,
    };
  }

  if (state.opsErrors.length > 0) {
    return {
      state: 'Unavailable',
      detail: state.opsErrors.join(' / '),
    };
  }

  return {
    state: 'Pending',
    detail: 'Awaiting ops summary.',
  };
}

function signalsPresentation() {
  if (!opsRuntime.apiBase) {
    return { state: 'Pending', detail: 'Ops runtime is not configured.' };
  }

  if (state.opsSignals) {
    const signalCount = Array.isArray(state.opsSignals.signals)
      ? `${state.opsSignals.signals.length} signals`
      : 'Signals available';
    return {
      state: formatStatus(state.opsSignals.status, 'ok'),
      detail: signalCount,
    };
  }

  if (state.opsErrors.length > 0) {
    return {
      state: 'Unavailable',
      detail: state.opsErrors.join(' / '),
    };
  }

  return {
    state: 'Pending',
    detail: 'Awaiting ops signals.',
  };
}

function endpoint(runtimeConfig, key, params = {}) {
  const template = runtimeConfig.endpoints?.[key];
  if (!template) return null;
  return Object.entries(params).reduce(
    (value, [name, replacement]) => value.replace(`{${name}}`, encodeURIComponent(replacement)),
    template,
  );
}

async function fetchJson(base, route, options = {}) {
  const url = buildUrl(base, route);
  if (!url) throw new Error(`Missing endpoint for ${route}`);

  const headers = { Accept: 'application/json' };
  if (options.body) headers['Content-Type'] = 'application/json';

  const response = await fetch(url, {
    method: options.method || 'GET',
    headers,
    body: options.body ? JSON.stringify(options.body) : undefined,
  });

  const payload = await response.json().catch(() => ({}));
  if (!response.ok) {
    const message = payload?.error?.message || `${route}: HTTP ${response.status}`;
    throw new Error(message);
  }

  return unwrapEnvelope(payload);
}

async function fetchRunner(route, options = {}) {
  if (!isRunnerConfigured()) {
    throw new Error('Runner worker is not configured for this host');
  }
  return fetchJson(runnerRuntime.apiBase, route, options);
}

async function refreshOpsStatus() {
  if (!opsRuntime.apiBase) {
    state.opsSummary = null;
    state.opsSignals = null;
    state.opsErrors = [];
    return;
  }

  const overviewRoute = endpoint(opsRuntime, 'overview');
  const signalsRoute = endpoint(opsRuntime, 'signals');
  const results = await Promise.allSettled([
    fetchJson(opsRuntime.apiBase, overviewRoute),
    fetchJson(opsRuntime.apiBase, signalsRoute),
  ]);

  state.opsSummary = results[0].status === 'fulfilled' ? results[0].value : null;
  state.opsSignals = results[1].status === 'fulfilled' ? results[1].value : null;
  state.opsErrors = results
    .filter((result) => result.status === 'rejected')
    .map((result) => result.reason?.message || 'ops request failed');
}

function groupSuiteInputs(suite) {
  if (!suite?.inputs) return [];

  const groups = new Map();
  Object.entries(suite.inputs).forEach(([key, definition]) => {
    const group = definition.group || 'general';
    if (!groups.has(group)) groups.set(group, []);
    groups.get(group).push({ key, ...definition });
  });

  return Array.from(groups.entries())
    .sort((a, b) => {
      const aIndex = GROUP_ORDER.indexOf(a[0]);
      const bIndex = GROUP_ORDER.indexOf(b[0]);
      return (aIndex === -1 ? 99 : aIndex) - (bIndex === -1 ? 99 : bIndex);
    })
    .map(([group, inputs]) => ({
      group,
      label: humanize(group),
      inputs,
    }));
}

function initializeFormValues(suite) {
  if (!suite?.inputs) return;

  Object.entries(suite.inputs).forEach(([key, definition]) => {
    if (state.formValues[key] !== undefined) return;
    state.formValues[key] = definition.defaultValue;
  });
}

function selectedRunIsCancellable() {
  return ['running', 'starting', 'cancelling'].includes(
    String(state.selectedRun?.status || '').toLowerCase(),
  );
}

function formatIntegerValue(value) {
  const parsed = Number(value);
  return Number.isInteger(parsed) ? String(parsed) : '';
}

function setActionEnabled(id, enabled) {
  const element = document.getElementById(id);
  if (element) element.disabled = !enabled;
}

function renderStatusStrip() {
  const runner = runnerPresentation();
  const cluster = clusterPresentation();
  const signals = signalsPresentation();
  const clusterTone = toneForClusterState(cluster.state);
  const signalTone = toneForSignalState(signals.state);
  const selectedRunTone = toneForRunState(state.selectedRun?.status);
  const runCount = state.runs.length;
  const activeCount = state.runs.filter((run) => (
    ['running', 'starting', 'attached', 'cancelling'].includes(
      String(run.status || '').toLowerCase(),
    )
  )).length;

  setText('runner-base', runnerRuntime.apiBase || 'Pending');
  setText('ops-base', opsRuntime.apiBase || 'Pending');
  setText('suite-name', state.suite?.label || 'Pending');
  setText('runner-state', runner.state);
  setText('runner-detail', runner.detail);
  setText('cluster-state', cluster.state);
  setText('cluster-detail', cluster.detail);
  setText('signals-state', signals.state);
  setText('signals-detail', signals.detail);
  setText('active-runs', String(activeCount));
  setToneText('runner-state');
  setToneText('cluster-state', clusterTone);
  setToneText('signals-state', signalTone);
  setToneText('active-runs');
  setText(
    'active-runs-detail',
    runCount > 0
      ? `${runCount} persisted run record${runCount === 1 ? '' : 's'}`
      : 'No run records yet.',
  );

  if (state.selectedRun) {
    setText('selected-run-state', formatStatus(state.selectedRun.status));
    setToneText('selected-run-state', selectedRunTone);
    const selectedRunIdElement = document.getElementById('selected-run-detail-id');
    if (selectedRunIdElement) {
      selectedRunIdElement.textContent = truncateMiddle(state.selectedRun.runId, 34);
      selectedRunIdElement.title = state.selectedRun.runId;
    }
    setText(
      'selected-run-detail-meta',
      `${String(state.selectedRun.mode || 'run').toLowerCase()} · ${formatRelativeTime(state.selectedRun.updatedAt)}`,
    );
  } else {
    setText('selected-run-state', 'None');
    setToneText('selected-run-state');
    const selectedRunIdElement = document.getElementById('selected-run-detail-id');
    if (selectedRunIdElement) {
      selectedRunIdElement.textContent = 'Select or launch a run.';
      selectedRunIdElement.removeAttribute('title');
    }
    setText('selected-run-detail-meta', '');
  }

  const notice = document.getElementById('runner-notice');
  if (notice) {
    notice.textContent = runner.detail;
    notice.className = `notice-bar ${runner.noticeClass}`;
  }

  renderSidebarStatus(cluster, signals);

  const canMutate = isRunnerConfigured() && !state.isMutating;
  setActionEnabled('refresh-btn', canMutate);
  setActionEnabled('attach-btn', canMutate);
  setActionEnabled('launch-btn', canMutate);
  setActionEnabled('cancel-btn', canMutate && selectedRunIsCancellable());

  const attachInput = document.getElementById('attach-artifact-root');
  if (attachInput) attachInput.disabled = !canMutate;
}

function renderSidebarStatus(cluster, signals) {
  const clusterTone = toneForClusterState(cluster.state);
  const signalTone = toneForSignalState(signals.state);
  const validatorRole = state.opsSummary?.cluster?.role
    ? formatStatus(state.opsSummary.cluster.role)
    : 'WAITING';
  const validatorTone = state.opsSummary?.cluster?.role ? clusterTone : 'neutral';
  const mode = runtimeModePresentation();
  const wallet = opsRuntime.defaults?.gcWallet || '--';
  const walletElement = document.getElementById('status-wallet');
  const sidebarErrors = state.error ? [state.error, ...state.opsErrors] : state.opsErrors;

  setBadge('status-validator', validatorRole, validatorTone);
  setBadge('status-cluster', cluster.state, clusterTone);
  setBadge('status-signals', signals.state, signalTone);
  setBadge('status-mode', mode.label, mode.tone);
  setText('status-wallet', shorten(wallet));
  if (walletElement) walletElement.title = wallet;
  syncShellStatusDetails({
    summary: state.opsSummary,
    signals: state.opsSignals,
    errors: sidebarErrors,
    wallet,
    runtimeBase: opsRuntime.apiBase || 'Pending',
    mode: mode.label.toLowerCase(),
    model: 'Staircase sidebar runtime',
    hostKind: currentHostKind(),
    disconnected: !opsRuntime.apiBase
      || (!state.opsSummary && !state.opsSignals && sidebarErrors.length > 0),
  });

  if (state.error) {
    setStatusDot('danger');
    return;
  }

  if (signalTone !== 'neutral') {
    setStatusDot(signalTone);
    return;
  }

  setStatusDot(clusterTone);
}

function renderSuiteGroups() {
  const container = document.getElementById('suite-groups');
  if (!container) return;

  if (!state.suite) {
    container.innerHTML = '<p class="empty-state">Waiting for suite definition.</p>';
    return;
  }

  const groups = groupSuiteInputs(state.suite);
  container.innerHTML = groups.map((group) => `
    <section class="group-card">
      <div class="group-summary">
        <h3>${escapeHtml(group.label)}</h3>
        <span class="group-count">${group.inputs.length} input${group.inputs.length === 1 ? '' : 's'}</span>
      </div>
      <div class="group-fields">
        ${group.inputs.map((input) => `
          <label class="group-field" for="field-${escapeHtml(input.key)}">
            <div class="group-field-top">
              <div>
                <p class="group-field-label">${escapeHtml(input.label)}</p>
                <p class="group-field-note">${escapeHtml(input.description)}</p>
              </div>
              <span class="env-chip">${escapeHtml(input.envKey)}</span>
            </div>
            ${input.type === 'boolean' ? `
              <span class="toggle">
                <input
                  id="field-${escapeHtml(input.key)}"
                  data-input-key="${escapeHtml(input.key)}"
                  type="checkbox"
                  ${state.formValues[input.key] ? 'checked' : ''}
                />
                <span>${state.formValues[input.key] ? 'Enabled' : 'Disabled'}</span>
              </span>
            ` : `
              <input
                id="field-${escapeHtml(input.key)}"
                class="number-input"
                data-input-key="${escapeHtml(input.key)}"
                min="0"
                step="1"
                type="number"
                value="${escapeHtml(formatIntegerValue(state.formValues[input.key]))}"
              />
            `}
          </label>
        `).join('')}
      </div>
    </section>
  `).join('');

  container.querySelectorAll('[data-input-key]').forEach((field) => {
    field.addEventListener('change', (event) => {
      const target = event.currentTarget;
      if (!(target instanceof HTMLInputElement)) return;

      const { inputKey } = target.dataset;
      if (!inputKey) return;

      state.formValues[inputKey] = target.type === 'checkbox'
        ? target.checked
        : target.value;
      renderSuiteGroups();
    });
  });
}

function renderRuns() {
  const container = document.getElementById('runs-list');
  if (!container) return;

  if (state.runs.length === 0) {
    container.innerHTML = '<p class="empty-state">No runs have been persisted yet.</p>';
    return;
  }

  container.innerHTML = state.runs.map((run) => `
    <button
      class="run-row ${run.runId === state.selectedRunId ? 'is-selected' : ''} ${accentClassForTone(toneForRunState(run.status))}"
      data-run-id="${escapeHtml(run.runId)}"
      type="button"
    >
      <div class="run-row-head">
        <span class="status-chip ${toneForStatus(run.status)}">${escapeHtml(formatStatus(run.status))}</span>
        <span class="status-chip is-attached">${escapeHtml(formatStatus(run.mode))}</span>
        <span class="run-row-phase">${escapeHtml(run.summary?.phase?.name || 'No phase')}</span>
      </div>
      <p class="run-row-id" title="${escapeHtml(run.runId)}">${escapeHtml(truncateMiddle(run.runId, 30))}</p>
      <div class="run-row-meta">
        <span>${escapeHtml(run.suiteId)}</span>
        <span>${escapeHtml(formatRelativeTime(run.updatedAt))}</span>
      </div>
    </button>
  `).join('');

  container.querySelectorAll('[data-run-id]').forEach((button) => {
    button.addEventListener('click', () => {
      state.selectedRunId = button.dataset.runId;
      runTask(() => refreshSelectedRun());
    });
  });
}

function renderSummary() {
  const container = document.getElementById('summary-grid');
  const writeContainer = document.getElementById('write-progress');
  const inputsContainer = document.getElementById('inputs-summary');
  if (!container || !writeContainer || !inputsContainer) return;

  if (!state.selectedRun) {
    container.innerHTML = '<p class="empty-state">Select a run to inspect its summary.</p>';
    writeContainer.innerHTML = '';
    inputsContainer.innerHTML = (
      '<p class="empty-state">Run inputs appear here after a run is selected.</p>'
    );
    return;
  }

  const summary = state.selectedRun.summary || {};
  const phaseValue = `${summary.phase?.current || '--'}/${summary.phase?.total || '--'}`;
  const stepValue = `${summary.step?.current || '--'}/${summary.step?.total || '--'}`;

  container.innerHTML = `
    <article class="summary-card">
      <p>Status</p>
      <h3>${escapeHtml(formatStatus(state.selectedRun.status))}</h3>
      <p class="summary-note">${escapeHtml(humanize(state.selectedRun.mode))} run</p>
    </article>
    <article class="summary-card">
      <p>Phase</p>
      <p class="summary-value">${escapeHtml(phaseValue)}</p>
      <p class="summary-note">${escapeHtml(summary.phase?.name || 'No active phase')}</p>
    </article>
    <article class="summary-card">
      <p>Step</p>
      <p class="summary-value">${escapeHtml(stepValue)}</p>
      <p class="summary-note">${escapeHtml(summary.step?.name || 'No active step')}</p>
    </article>
    <article class="summary-card">
      <p>Failures</p>
      <p class="summary-value">${escapeHtml(summary.failures || 0)}</p>
      <p class="summary-note">
        ${escapeHtml(summary.lastLogAt ? `Last log ${formatRelativeTime(summary.lastLogAt)}` : 'No log yet')}
      </p>
    </article>
  `;

  const writes = Array.isArray(summary.writeProgress) ? summary.writeProgress : [];
  writeContainer.innerHTML = writes.length > 0
    ? writes.map((write) => {
      const parsedTotal = Number(write.total);
      const parsedCurrent = Number(write.current);
      const progress = parsedTotal > 0
        ? Math.min(100, Math.round((parsedCurrent / parsedTotal) * 100))
        : 0;
      const statusTone = write.status === 'completed' ? 'is-succeeded' : 'is-running';

      return `
        <article class="write-card">
          <span class="status-chip ${statusTone}">${escapeHtml(write.status)}</span>
          <h3>${escapeHtml(write.label)}</h3>
          <p>${escapeHtml(`${write.current}/${write.total}`)}</p>
          <div class="progress-track">
            <span class="progress-fill" style="width: ${progress}%;"></span>
          </div>
        </article>
      `;
    }).join('')
    : '<p class="empty-state">No write batches have been parsed for this run yet.</p>';

  const inputs = state.selectedInputs?.inputs;
  if (!inputs) {
    inputsContainer.innerHTML = '<p class="empty-state">Run inputs are unavailable.</p>';
    return;
  }

  if (inputs.mode === 'attach') {
    inputsContainer.innerHTML = `
      <article class="input-row">
        <div>
          <strong>Attach Mode</strong>
          <span>Artifact Root</span>
        </div>
        <code>${escapeHtml(inputs.artifactRoot)}</code>
      </article>
    `;
    return;
  }

  const resolved = Array.isArray(inputs.resolved) ? inputs.resolved : [];
  inputsContainer.innerHTML = resolved.map((input) => `
    <article class="input-row">
      <div>
        <strong>${escapeHtml(input.label)}</strong>
        <span>${escapeHtml(input.envKey)}</span>
      </div>
      <code>${escapeHtml(String(input.value))}</code>
    </article>
  `).join('');
}

function renderEvents() {
  const container = document.getElementById('events-list');
  if (!container) return;

  if (!state.selectedRun) {
    container.innerHTML = '<p class="empty-state">Select a run to see recent events.</p>';
    return;
  }

  if (state.selectedEvents.length === 0) {
    container.innerHTML = '<p class="empty-state">No events have been indexed yet.</p>';
    return;
  }

  container.innerHTML = state.selectedEvents.map((event) => {
    const accentTone = String(event?.level || '').toLowerCase() === 'error' ? 'danger' : 'info';
    const rawText = event.raw ? String(event.raw) : '';
    const rawPreview = rawText ? truncateText(rawText, 180) : '';
    return `
    <article class="event-row ${accentClassForTone(accentTone)}">
      <div class="event-row-head">
        <span class="event-chip ${toneForEvent(event)}">${escapeHtml(event.level || 'info')}</span>
        <span class="status-chip is-attached">${escapeHtml(event.type || 'event')}</span>
        <span class="event-meta">${escapeHtml(formatRelativeTime(event.timestamp))}</span>
      </div>
      <p class="event-title">${escapeHtml(event.title || event.type || 'Event')}</p>
      ${rawPreview ? `<code class="event-raw" title="${escapeHtml(rawText)}">${escapeHtml(rawPreview)}</code>` : ''}
    </article>
  `;
  }).join('');
}

function fileListMarkup(items) {
  if (!Array.isArray(items) || items.length === 0) {
    return '<p class="empty-state">No files indexed in this category yet.</p>';
  }

  return `
    <div class="artifact-files">
      ${items.map((item) => `
        <article class="artifact-file-row">
          <p class="artifact-path">${escapeHtml(item.relativePath)}</p>
          <p class="artifact-meta">
            ${escapeHtml(item.kind)} - ${escapeHtml(item.sizeBytes || 0)} bytes -
            ${escapeHtml(formatRelativeTime(item.modifiedAt))}
          </p>
        </article>
      `).join('')}
    </div>
  `;
}

function renderArtifacts() {
  const container = document.getElementById('artifacts-list');
  if (!container) return;

  if (!state.selectedRun) {
    container.innerHTML = '<p class="empty-state">Select a run to inspect artifact indexes.</p>';
    return;
  }

  const artifacts = state.selectedArtifacts?.artifacts;
  if (!artifacts) {
    container.innerHTML = '<p class="empty-state">Artifacts are unavailable for the selected run.</p>';
    return;
  }

  const countsText = artifacts.exists
    ? `${artifacts.counts.files} files - ${artifacts.counts.directories} directories`
    : 'Root not found';

  container.innerHTML = `
    <article class="artifact-card">
      <h3>Artifact Root</h3>
      <p class="artifact-path">${escapeHtml(artifacts.artifactRoot)}</p>
      <p class="artifact-meta">${escapeHtml(countsText)}</p>
    </article>
    <div class="artifact-groups">
      <article class="artifact-card">
        <h3>Run Log</h3>
        ${artifacts.highlights?.runLog ? `
          <p class="artifact-path">${escapeHtml(artifacts.highlights.runLog.relativePath)}</p>
          <p class="artifact-meta">
            ${escapeHtml(artifacts.highlights.runLog.sizeBytes)} bytes -
            ${escapeHtml(formatRelativeTime(artifacts.highlights.runLog.modifiedAt))}
          </p>
        ` : '<p class="artifact-meta">No run log indexed.</p>'}
      </article>
      <article class="artifact-card">
        <h3>Phase Logs</h3>
        ${fileListMarkup(artifacts.highlights?.phaseLogs || [])}
      </article>
      <article class="artifact-card">
        <h3>Path Sets</h3>
        ${fileListMarkup(artifacts.highlights?.pathSets || [])}
      </article>
    </div>
  `;
}

function renderAll() {
  renderStatusStrip();
  renderSuiteGroups();
  renderRuns();
  renderSummary();
  renderEvents();
  renderArtifacts();
}

async function loadSelectedRun() {
  if (!state.selectedRunId) {
    state.selectedRun = null;
    state.selectedInputs = null;
    state.selectedEvents = [];
    state.selectedArtifacts = null;
    return;
  }

  const eventsRoute = `${endpoint(runnerRuntime, 'events', { runId: state.selectedRunId })}?limit=${EVENT_LIMIT}`;
  const [runData, inputsData, eventsData, artifactsData] = await Promise.all([
    fetchRunner(endpoint(runnerRuntime, 'run', { runId: state.selectedRunId })),
    fetchRunner(endpoint(runnerRuntime, 'inputs', { runId: state.selectedRunId })),
    fetchRunner(eventsRoute),
    fetchRunner(endpoint(runnerRuntime, 'artifacts', { runId: state.selectedRunId })),
  ]);

  state.selectedRun = runData.run;
  state.selectedInputs = inputsData;
  state.selectedEvents = eventsData.events || [];
  state.selectedArtifacts = artifactsData;
}

function syncSelectedRun(resetSelection) {
  const nextRunId = state.runs[0]?.runId || null;

  if (resetSelection || !state.selectedRunId) {
    state.selectedRunId = nextRunId;
    return;
  }

  if (!state.runs.some((run) => run.runId === state.selectedRunId)) {
    state.selectedRunId = nextRunId;
  }
}

async function refreshSelectedRun() {
  state.error = '';
  await loadSelectedRun();
  renderAll();
  updateLastUpdated(`Updated ${new Date().toLocaleTimeString()}`);
}

async function refreshData(resetSelection = true) {
  state.error = '';

  if (!isRunnerConfigured()) {
    await refreshOpsStatus();
    renderAll();
    updateLastUpdated('Runner pending');
    return;
  }

  const [suiteData, runsData] = await Promise.all([
    fetchRunner(endpoint(runnerRuntime, 'suite', { suiteId: runnerRuntime.defaults.suiteId })),
    fetchRunner(endpoint(runnerRuntime, 'testRuns')),
    refreshOpsStatus(),
  ]);

  state.suite = suiteData.suite;
  initializeFormValues(state.suite);
  state.runs = runsData.runs || [];
  syncSelectedRun(resetSelection);
  await loadSelectedRun();
  renderAll();
  updateLastUpdated(`Updated ${new Date().toLocaleTimeString()}`);
}

function normalizedIntegerInput(key, definition) {
  const raw = state.formValues[key];
  const parsed = Number(raw);
  if (!Number.isInteger(parsed) || parsed < 0) {
    throw new Error(`${definition.label} must be a non-negative integer.`);
  }
  return parsed;
}

function buildLaunchInputs() {
  if (!state.suite?.inputs) {
    throw new Error('Suite definition is not loaded yet.');
  }

  return Object.entries(state.suite.inputs).reduce((inputs, [key, definition]) => {
    if (definition.type === 'boolean') {
      inputs[key] = state.formValues[key] === true;
      return inputs;
    }

    if (definition.type === 'integer') {
      inputs[key] = normalizedIntegerInput(key, definition);
      return inputs;
    }

    inputs[key] = state.formValues[key];
    return inputs;
  }, {});
}

function buildAttachPayload() {
  const artifactRoot = String(state.attachArtifactRoot || '').trim();
  if (!artifactRoot) {
    throw new Error('Attach mode requires a non-empty artifact root.');
  }

  return {
    suiteId: state.suite.id,
    mode: 'attach',
    artifactRoot,
  };
}

function handleAsyncError(error) {
  const message = error instanceof Error ? error.message : String(error);
  state.error = message;
  state.isMutating = false;
  clearNotice();
  renderAll();
  updateLastUpdated(`Unavailable - ${message}`);
}

function runTask(task) {
  task().catch(handleAsyncError);
}

async function createRun(mode) {
  if (!state.suite) {
    throw new Error('Suite definition is not loaded yet.');
  }

  const isAttach = mode === 'attach';
  const payload = isAttach
    ? buildAttachPayload()
    : {
      suiteId: state.suite.id,
      mode: 'launch',
      inputs: buildLaunchInputs(),
    };

  state.error = '';
  state.isMutating = true;
  setNotice(
    'Working',
    isAttach
      ? 'Attaching dashboard state to the requested artifact root.'
      : 'Launching a managed staircase run with a governed input snapshot.',
  );
  renderAll();

  const created = await fetchRunner(endpoint(runnerRuntime, 'testRuns'), {
    method: 'POST',
    body: payload,
  });

  state.selectedRunId = created.run?.runId || state.selectedRunId;
  state.isMutating = false;
  setNotice(
    'Ready',
    isAttach
      ? 'Attach request succeeded. Reloading the persisted run.'
      : 'Managed run created. Reloading the persisted run.',
    'is-ok',
  );
  await refreshData(false);
}

async function cancelSelectedRun() {
  if (!state.selectedRunId || !selectedRunIsCancellable()) return;

  state.error = '';
  state.isMutating = true;
  setNotice('Working', `Cancelling ${state.selectedRunId}.`);
  renderAll();

  await fetchRunner(endpoint(runnerRuntime, 'cancel', { runId: state.selectedRunId }), {
    method: 'POST',
  });

  state.isMutating = false;
  setNotice('Ready', `Cancel request accepted for ${state.selectedRunId}.`, 'is-ok');
  await refreshData(false);
}

function bindActions() {
  const refreshButton = document.getElementById('refresh-btn');
  const attachButton = document.getElementById('attach-btn');
  const launchButton = document.getElementById('launch-btn');
  const cancelButton = document.getElementById('cancel-btn');
  const attachInput = document.getElementById('attach-artifact-root');

  refreshButton?.addEventListener('click', () => {
    runTask(() => refreshData(false));
  });

  attachButton?.addEventListener('click', () => {
    runTask(() => createRun('attach'));
  });

  launchButton?.addEventListener('click', () => {
    runTask(() => createRun('launch'));
  });

  cancelButton?.addEventListener('click', () => {
    runTask(cancelSelectedRun);
  });

  attachInput?.addEventListener('change', (event) => {
    const target = event.currentTarget;
    if (!(target instanceof HTMLInputElement)) return;
    state.attachArtifactRoot = target.value.trim();
  });
}

async function init() {
  try {
    initializeShellStatusPanel({
      runtimeBase: opsRuntime.apiBase || 'Pending',
      wallet: opsRuntime.defaults?.gcWallet || '--',
      mode: runtimeModePresentation().label.toLowerCase(),
      model: 'Staircase sidebar runtime',
      hostKind: currentHostKind(),
      disconnected: !opsRuntime.apiBase,
    });
    setText('runner-base', runnerRuntime.apiBase || 'Pending');
    setText('ops-base', opsRuntime.apiBase || 'Pending');
    bindActions();
    await refreshData(true);

    if (state.timer) window.clearInterval(state.timer);
    const refreshMs = Math.max(5, Number(runnerRuntime.refreshSeconds?.run || 10)) * 1000;
    state.timer = window.setInterval(() => {
      runTask(() => refreshData(false));
    }, refreshMs);
  } catch (error) {
    handleAsyncError(error);
  }
}

if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', () => {
    runTask(init);
  }, { once: true });
} else {
  runTask(init);
}
