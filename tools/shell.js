import { getOpsRuntimeConfig } from '/scripts/ops-runtime-config.js';

export const runtime = getOpsRuntimeConfig();

function currentHostname() {
  return String(window.location.hostname || '').toLowerCase();
}

function isLocalHostname(hostname = currentHostname()) {
  return hostname === 'localhost' || hostname === '127.0.0.1';
}

function isOakchainHostname(hostname = currentHostname()) {
  return hostname === 'oakchain.net' || hostname.endsWith('.oakchain.net');
}

function isLocalApiBase(apiBase = runtime.apiBase) {
  const base = String(apiBase || '').toLowerCase();
  return base.includes('127.0.0.1') || base.includes('localhost');
}

function isOakchainApiBase(apiBase = runtime.apiBase) {
  return String(apiBase || '').toLowerCase().includes('ops.oakchain.net');
}

function isCloudflareWorkersApiBase(apiBase = runtime.apiBase) {
  return String(apiBase || '').toLowerCase().includes('.workers.dev');
}

export function getRuntimePresentation() {
  let hostKind = 'hosted';
  if (isLocalHostname()) {
    hostKind = 'local';
  } else if (isOakchainHostname()) {
    hostKind = 'oakchain';
  }

  if (hostKind !== 'local' && isLocalApiBase()) {
    return {
      hostKind,
      mode: 'pending',
      model: 'Hosted backend pending',
      displayBase: 'Hosted backend pending',
      shouldFetch: false,
      disconnected: true,
    };
  }

  if (hostKind === 'local' && isLocalApiBase()) {
    return {
      hostKind,
      mode: 'mock',
      model: 'Local direct mock',
      displayBase: runtime.apiBase || 'http://127.0.0.1:8787',
      shouldFetch: true,
      disconnected: false,
    };
  }

  if (isOakchainApiBase()) {
    return {
      hostKind,
      mode: 'live',
      model: 'Oak Chain edge domain',
      displayBase: 'ops.oakchain.net',
      shouldFetch: true,
      disconnected: false,
    };
  }

  if (isCloudflareWorkersApiBase()) {
    return {
      hostKind,
      mode: 'live',
      model: 'Cloudflare edge worker',
      displayBase: runtime.apiBase || 'Cloudflare edge worker',
      shouldFetch: true,
      disconnected: false,
    };
  }

  return {
    hostKind,
    mode: hostKind === 'local' ? 'mock' : 'live',
    model: 'Custom gateway runtime',
    displayBase: runtime.apiBase || '--',
    shouldFetch: Boolean(runtime.apiBase),
    disconnected: false,
  };
}

export const runtimePresentation = getRuntimePresentation();

const SHELL_STATUS_BADGES = {
  validator: { id: 'status-validator', label: 'Validator 0' },
  cluster: { id: 'status-cluster', label: 'Cluster' },
  signals: { id: 'status-signals', label: 'Signals' },
  mode: { id: 'status-mode', label: 'Mode' },
};

const shellStatusDetails = {
  summary: null,
  signals: null,
  errors: [],
  wallet: runtime.defaults.gcWallet || '--',
  runtimeBase: runtimePresentation.displayBase || runtime.apiBase || '--',
  mode: runtimePresentation.mode,
  model: runtimePresentation.model,
  hostKind: runtimePresentation.hostKind,
  disconnected: runtimePresentation.disconnected,
  lastSync: '',
};

let shellStatusModal = null;
let shellStatusModalKey = '';
let shellStatusModalFocus = null;

export function buildUrl(base, path) {
  if (!path) return null;
  const normalizedBase = String(base || '').replace(/\/$/, '');
  const normalizedPath = path.startsWith('/') ? path : `/${path}`;
  return `${normalizedBase}${normalizedPath}`;
}

export function unwrapEnvelope(payload) {
  if (payload && typeof payload === 'object' && payload.data && typeof payload.data === 'object') {
    return payload.data;
  }
  return payload;
}

function shorten(value) {
  const input = String(value || '');
  if (input.length <= 16) return input || '--';
  return `${input.slice(0, 8)}...${input.slice(-6)}`;
}

function escapeHtml(value) {
  return String(value ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

function setText(id, value) {
  const element = document.getElementById(id);
  if (element) element.textContent = value;
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
  const dot = document.getElementById('status-dot');
  if (!dot) return;
  dot.className = `status-dot is-${tone}`;
}

function toneForSignals(status) {
  const normalized = String(status || '').toLowerCase();
  if (normalized === 'critical') return 'danger';
  if (normalized === 'warn') return 'warn';
  if (normalized === 'ok' || normalized === 'healthy') return 'success';
  return 'neutral';
}

function toneForCluster(state) {
  const normalized = String(state || '').toLowerCase();
  if (normalized === 'healthy') return 'success';
  if (normalized === 'degraded') return 'warn';
  if (normalized === 'critical') return 'danger';
  return 'neutral';
}

function toneForMode(mode) {
  const normalized = String(mode || '').toLowerCase();
  if (normalized === 'mock') return 'info';
  if (normalized === 'live') return 'success';
  if (normalized === 'pending') return 'warn';
  return 'neutral';
}

function severityRank(value) {
  const normalized = String(value || '').toLowerCase();
  if (normalized === 'critical') return 0;
  if (normalized === 'warn') return 1;
  if (normalized === 'ok' || normalized === 'healthy') return 2;
  return 3;
}

function displayValue(value, fallback = '--') {
  if (value === null || value === undefined || value === '') return fallback;
  if (typeof value === 'boolean') return value ? 'Yes' : 'No';
  return String(value);
}

function numericDisplay(value, fallback = '--') {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? String(parsed) : fallback;
}

function normalizedErrors(errors = []) {
  if (!Array.isArray(errors)) {
    return errors ? [String(errors)] : [];
  }
  return errors
    .map((error) => String(error || '').trim())
    .filter(Boolean);
}

function normalizeSignalBreakdown(signals) {
  if (signals?.summary && typeof signals.summary === 'object') {
    return {
      critical: Number(signals.summary.critical || 0),
      warn: Number(signals.summary.warn || 0),
      ok: Number(signals.summary.ok || 0),
      unknown: Number(signals.summary.unknown || 0),
    };
  }

  const entries = Array.isArray(signals?.signals) ? signals.signals : [];
  return entries.reduce((acc, signal) => {
    const key = String(signal?.severity || 'unknown').toLowerCase();
    if (key === 'critical' || key === 'warn' || key === 'ok' || key === 'unknown') {
      acc[key] += 1;
    } else {
      acc.unknown += 1;
    }
    return acc;
  }, {
    critical: 0,
    warn: 0,
    ok: 0,
    unknown: 0,
  });
}

function hostKindLabel(hostKind = shellStatusDetails.hostKind) {
  if (hostKind === 'local') return 'Local host';
  if (hostKind === 'oakchain') return 'Oak Chain domain';
  if (hostKind === 'hosted') return 'Hosted environment';
  return displayValue(hostKind, 'Unknown host');
}

function modalAccentForTone(tone) {
  if (tone === 'success') return 'var(--dash-success)';
  if (tone === 'warn') return 'var(--dash-warning)';
  if (tone === 'danger') return 'var(--dash-danger)';
  if (tone === 'info') return 'var(--dash-info)';
  return 'var(--dash-teal)';
}

function buildFactsMarkup(facts = []) {
  const normalized = facts.filter((fact) => fact && fact.value !== undefined && fact.value !== null && fact.value !== '');
  if (normalized.length === 0) return '';
  return `
    <div class="shell-status-modal-grid">
      ${normalized.map((fact) => `
        <article class="shell-status-modal-fact">
          <p class="shell-status-modal-fact-label">${escapeHtml(fact.label)}</p>
          <p class="shell-status-modal-fact-value${fact.mono ? ' is-mono' : ''}">${escapeHtml(fact.value)}</p>
        </article>
      `).join('')}
    </div>
  `;
}

function buildNotesMarkup(notes = []) {
  const normalized = notes.filter(Boolean);
  if (normalized.length === 0) return '';
  return normalized.map((note) => `
    <article class="shell-status-modal-note">${escapeHtml(note)}</article>
  `).join('');
}

function buildListMarkup(items = []) {
  const normalized = items.filter((item) => item && (item.label || item.value || item.meta));
  if (normalized.length === 0) return '';
  return `
    <div class="shell-status-modal-list">
      ${normalized.map((item) => `
        <article class="shell-status-modal-fact">
          <p class="shell-status-modal-fact-label">${escapeHtml(item.label || 'Signal')}</p>
          <p class="shell-status-modal-fact-value">${escapeHtml(item.value || '--')}</p>
          ${item.meta ? `
            <p class="shell-status-modal-fact-label" style="margin-top: 8px;">${escapeHtml(item.meta)}</p>
          ` : ''}
        </article>
      `).join('')}
    </div>
  `;
}

function buildSectionsMarkup(sections = []) {
  return sections
    .filter((section) => (
      section
      && (section.facts?.length || section.notes?.length || section.items?.length)
    ))
    .map((section) => `
      <section class="shell-status-modal-section">
        <h3 class="shell-status-modal-section-title">${escapeHtml(section.title)}</h3>
        ${buildFactsMarkup(section.facts)}
        ${buildListMarkup(section.items)}
        ${buildNotesMarkup(section.notes)}
      </section>
    `)
    .join('');
}

function buildStatusModalSpec(key) {
  const summary = shellStatusDetails.summary || {};
  const cluster = summary.cluster || {};
  const queue = summary.queue?.compact || {};
  const identities = summary.identities || {};
  const signals = shellStatusDetails.signals || {};
  const signalEntries = Array.isArray(signals.signals) ? signals.signals : [];
  const signalBreakdown = normalizeSignalBreakdown(signals);
  const { errors } = shellStatusDetails;

  if (key === 'validator') {
    return {
      accent: modalAccentForTone(toneForCluster(cluster.clusterState)),
      kicker: 'System Status',
      title: 'Validator 0',
      subtitle: 'Observed role, leadership posture, and local validator identity for the currently connected cluster participant.',
      sections: [
        {
          title: 'Observed Posture',
          facts: [
            { label: 'Role', value: displayValue(String(cluster.role || 'waiting').toUpperCase(), 'WAITING') },
            { label: 'Cluster State', value: displayValue(String(cluster.clusterState || 'unknown').toUpperCase(), 'UNKNOWN') },
            { label: 'Consensus', value: displayValue(cluster.consensusType) },
            { label: 'Current Term', value: numericDisplay(cluster.currentTerm ?? cluster.term) },
            {
              label: 'Reachability',
              value: `${numericDisplay(cluster.reachableValidators)}/${numericDisplay(cluster.nodeCount)} validators`,
            },
            {
              label: 'Validator Wallet',
              value: displayValue(identities.validatorWalletAddress || shellStatusDetails.wallet),
              mono: true,
            },
          ],
        },
        {
          title: 'Identity',
          facts: [
            {
              label: 'Cluster Wallet',
              value: displayValue(identities.clusterWalletAddress),
              mono: true,
            },
            { label: 'Registered Validators', value: numericDisplay(identities.registeredValidators) },
            { label: 'Registered Clients', value: numericDisplay(identities.registeredClients) },
            { label: 'Leader Endpoint', value: displayValue(cluster.currentLeader) },
          ],
          notes: errors.length > 0 ? [`Errors: ${errors.join(' / ')}`] : [],
        },
      ],
    };
  }

  if (key === 'cluster') {
    return {
      accent: modalAccentForTone(toneForCluster(cluster.clusterState)),
      kicker: 'System Status',
      title: 'Cluster',
      subtitle: 'Consensus posture, cluster membership, and queue pressure visible from the current ops runtime.',
      sections: [
        {
          title: 'Consensus',
          facts: [
            { label: 'State', value: displayValue(String(cluster.clusterState || 'unknown').toUpperCase(), 'UNKNOWN') },
            { label: 'Leader', value: displayValue(cluster.currentLeader) },
            { label: 'Quorum', value: numericDisplay(cluster.quorum) },
            { label: 'Node Count', value: numericDisplay(cluster.nodeCount) },
            { label: 'Reachable Validators', value: numericDisplay(cluster.reachableValidators) },
            { label: 'Current Epoch', value: numericDisplay(cluster.currentEpoch ?? queue.currentEpoch) },
          ],
        },
        {
          title: 'Queue Posture',
          facts: [
            { label: 'Queue Pending', value: numericDisplay(queue.queuePending) },
            { label: 'Mempool Pending', value: numericDisplay(queue.mempoolPendingCount) },
            { label: 'Backpressure Pending', value: numericDisplay(queue.backpressurePending) },
            { label: 'Release Mode', value: displayValue(queue.releaseMode) },
            { label: 'Governor', value: displayValue(queue.adaptiveReleaseGovernorState) },
            { label: 'Release Action', value: displayValue(queue.adaptiveReleaseAction) },
          ],
          notes: errors.length > 0 ? [`Errors: ${errors.join(' / ')}`] : [],
        },
      ],
    };
  }

  if (key === 'signals') {
    const highlightedSignals = signalEntries
      .slice()
      .sort((left, right) => severityRank(left?.severity) - severityRank(right?.severity))
      .slice(0, 6)
      .map((signal) => ({
        label: signal.label || signal.id || 'Signal',
        value: `${displayValue(signal.value)}${signal.unit ? ` ${signal.unit}` : ''}`,
        meta: `${displayValue(String(signal.severity || 'unknown').toUpperCase(), 'UNKNOWN')} • ${displayValue(signal.category, 'uncategorized')}`,
      }));

    return {
      accent: modalAccentForTone(toneForSignals(signals.status)),
      kicker: 'System Status',
      title: 'Signals',
      subtitle: 'Live health telemetry across cluster, queue, durability, replication, Aeron, and storage categories.',
      sections: [
        {
          title: 'Signal Summary',
          facts: [
            { label: 'Overall', value: displayValue(String(signals.status || 'unknown').toUpperCase(), 'UNKNOWN') },
            { label: 'Critical', value: numericDisplay(signalBreakdown.critical) },
            { label: 'Warnings', value: numericDisplay(signalBreakdown.warn) },
            { label: 'OK', value: numericDisplay(signalBreakdown.ok) },
            { label: 'Unknown', value: numericDisplay(signalBreakdown.unknown) },
            {
              label: 'Categories',
              value: String(Array.isArray(signals.categories) ? signals.categories.length : 0),
            },
          ],
          notes: errors.length > 0 ? [`Errors: ${errors.join(' / ')}`] : [],
        },
        {
          title: 'Highlighted Signals',
          items: highlightedSignals,
          notes: highlightedSignals.length === 0 ? ['No signal entries are currently available from the ops runtime.'] : [],
        },
      ],
    };
  }

  return {
    accent: modalAccentForTone(toneForMode(shellStatusDetails.mode)),
    kicker: 'System Status',
    title: 'Mode',
    subtitle: 'Runtime detection for the current dashboard host, including gateway shape, fetch posture, and shell identity.',
    sections: [
      {
        title: 'Runtime',
        facts: [
          { label: 'Mode', value: displayValue(String(shellStatusDetails.mode || 'unknown').toUpperCase(), 'UNKNOWN') },
          { label: 'Host', value: hostKindLabel(shellStatusDetails.hostKind) },
          { label: 'Runtime Model', value: displayValue(shellStatusDetails.model) },
          { label: 'API Base', value: displayValue(shellStatusDetails.runtimeBase), mono: true },
          { label: 'Fetch Posture', value: shellStatusDetails.disconnected ? 'Disconnected' : 'Connected' },
          { label: 'Last Sync', value: displayValue(shellStatusDetails.lastSync, 'Awaiting first sync') },
        ],
      },
      {
        title: 'Identity',
        facts: [
          { label: 'Wallet', value: displayValue(shellStatusDetails.wallet), mono: true },
        ],
        notes: errors.length > 0 ? [`Errors: ${errors.join(' / ')}`] : [],
      },
    ],
  };
}

function closeShellStatusModal() {
  if (!shellStatusModal) return;
  shellStatusModal.classList.remove('is-open');
  shellStatusModal.setAttribute('aria-hidden', 'true');
  document.body.style.overflow = '';
  if (shellStatusModalFocus instanceof HTMLElement) {
    shellStatusModalFocus.focus();
  }
  shellStatusModalFocus = null;
}

function ensureShellStatusModal() {
  if (shellStatusModal) return shellStatusModal;

  shellStatusModal = document.createElement('div');
  shellStatusModal.id = 'shell-status-modal';
  shellStatusModal.className = 'shell-status-modal';
  shellStatusModal.setAttribute('aria-hidden', 'true');
  shellStatusModal.innerHTML = `
    <div class="shell-status-modal-backdrop" data-shell-status-close="true"></div>
    <div class="shell-status-modal-dialog" role="dialog" aria-modal="true" aria-labelledby="shell-status-modal-title">
      <div class="shell-status-modal-head">
        <div>
          <p class="shell-status-modal-kicker" data-shell-status-kicker></p>
          <h2 id="shell-status-modal-title" class="shell-status-modal-title"></h2>
          <p class="shell-status-modal-subtitle" data-shell-status-subtitle></p>
        </div>
        <button class="shell-status-modal-close" type="button" aria-label="Close status detail" data-shell-status-close="true">Close</button>
      </div>
      <div class="shell-status-modal-body" data-shell-status-body></div>
      <div class="shell-status-modal-foot">
        <button class="btn btn-secondary shell-status-modal-dismiss" type="button" data-shell-status-close="true">Dismiss</button>
      </div>
    </div>
  `;
  document.body.append(shellStatusModal);

  shellStatusModal.addEventListener('click', (event) => {
    const { target } = event;
    if (target instanceof HTMLElement && target.dataset.shellStatusClose === 'true') {
      closeShellStatusModal();
    }
  });

  document.addEventListener('keydown', (event) => {
    if (event.key === 'Escape' && shellStatusModal?.classList.contains('is-open')) {
      closeShellStatusModal();
    }
  });

  return shellStatusModal;
}

function renderShellStatusModal(key) {
  const modal = ensureShellStatusModal();
  const spec = buildStatusModalSpec(key);

  modal.style.setProperty('--shell-modal-accent', spec.accent || 'var(--dash-teal)');
  modal.querySelector('[data-shell-status-kicker]').textContent = spec.kicker;
  modal.querySelector('#shell-status-modal-title').textContent = spec.title;
  modal.querySelector('[data-shell-status-subtitle]').textContent = spec.subtitle;
  modal.querySelector('[data-shell-status-body]').innerHTML = buildSectionsMarkup(spec.sections);
}

function openShellStatusModal(key) {
  if (!SHELL_STATUS_BADGES[key]) return;
  shellStatusModalFocus = document.activeElement instanceof HTMLElement
    ? document.activeElement
    : null;
  shellStatusModalKey = key;
  renderShellStatusModal(key);
  const modal = ensureShellStatusModal();
  modal.classList.add('is-open');
  modal.setAttribute('aria-hidden', 'false');
  document.body.style.overflow = 'hidden';
  const closeButton = modal.querySelector('.shell-status-modal-close');
  if (closeButton instanceof HTMLButtonElement) closeButton.focus();
}

function bindShellStatusPills() {
  Object.entries(SHELL_STATUS_BADGES).forEach(([key, config]) => {
    const badge = document.getElementById(config.id);
    if (!badge || badge.dataset.shellStatusBound === 'true') return;
    badge.dataset.shellStatusBound = 'true';
    badge.dataset.shellStatusKey = key;
    badge.dataset.shellStatusLabel = config.label;
    badge.classList.add('is-interactive');
    badge.tabIndex = 0;
    badge.setAttribute('role', 'button');
    badge.setAttribute('aria-haspopup', 'dialog');
    badge.setAttribute('aria-controls', 'shell-status-modal');
    badge.addEventListener('click', () => openShellStatusModal(key));
    badge.addEventListener('keydown', (event) => {
      if (event.key === 'Enter' || event.key === ' ') {
        event.preventDefault();
        openShellStatusModal(key);
      }
    });
  });
}

export function syncShellStatusDetails(partial = {}) {
  if ('summary' in partial) shellStatusDetails.summary = partial.summary || null;
  if ('signals' in partial) shellStatusDetails.signals = partial.signals || null;
  if ('errors' in partial) shellStatusDetails.errors = normalizedErrors(partial.errors);
  if ('wallet' in partial) shellStatusDetails.wallet = partial.wallet || '--';
  if ('runtimeBase' in partial) shellStatusDetails.runtimeBase = partial.runtimeBase || '--';
  if ('mode' in partial) shellStatusDetails.mode = partial.mode || runtimePresentation.mode;
  if ('model' in partial) shellStatusDetails.model = partial.model || runtimePresentation.model;
  if ('hostKind' in partial) shellStatusDetails.hostKind = partial.hostKind || runtimePresentation.hostKind;
  if ('disconnected' in partial) shellStatusDetails.disconnected = Boolean(partial.disconnected);
  if ('lastSync' in partial) shellStatusDetails.lastSync = partial.lastSync || '';

  if (shellStatusModal?.classList.contains('is-open') && shellStatusModalKey) {
    renderShellStatusModal(shellStatusModalKey);
  }
}

export function initializeShellStatusPanel(seed = {}) {
  syncShellStatusDetails(seed);
  ensureShellStatusModal();
  bindShellStatusPills();
}

function detectMode() {
  return runtimePresentation.mode;
}

function setActiveNav(activeNav) {
  document.querySelectorAll('.nav-item[data-nav]').forEach((item) => {
    const isActive = item.dataset.nav === activeNav;
    item.classList.toggle('is-active', isActive);
    if (isActive) {
      item.setAttribute('aria-current', 'page');
    } else {
      item.removeAttribute('aria-current');
    }
  });
}

function renderStaticRuntime(runtimeBaseId = 'runtime-base') {
  const mode = detectMode();
  const wallet = runtime.defaults.gcWallet || '--';
  const walletElement = document.getElementById('status-wallet');
  setText(runtimeBaseId, runtimePresentation.displayBase);
  if (walletElement) {
    walletElement.textContent = shorten(wallet);
    walletElement.title = wallet;
  }
  setBadge('status-mode', mode.toUpperCase(), toneForMode(mode));
  syncShellStatusDetails({
    wallet,
    runtimeBase: runtimePresentation.displayBase,
    mode,
    model: runtimePresentation.model,
    hostKind: runtimePresentation.hostKind,
    disconnected: runtimePresentation.disconnected,
  });
}

export function renderShellStatus(summary, signals, errors = []) {
  const cluster = summary?.cluster || {};
  const validatorState = cluster.role || 'unknown';
  const clusterState = cluster.clusterState || 'unknown';
  const signalState = signals?.status || 'unknown';
  const runtimeMode = detectMode();

  setBadge('status-validator', String(validatorState).toUpperCase(), toneForCluster(clusterState));
  setBadge('status-cluster', String(clusterState).toUpperCase(), toneForCluster(clusterState));
  setBadge('status-signals', String(signalState).toUpperCase(), toneForSignals(signalState));
  setBadge('status-mode', String(runtimeMode).toUpperCase(), toneForMode(runtimeMode));

  let overallTone = 'warn';
  if (errors.length === 0) {
    overallTone = toneForSignals(signalState);
    if (overallTone === 'neutral') {
      overallTone = toneForCluster(clusterState);
    }
  }
  setStatusDot(overallTone || 'neutral');
  syncShellStatusDetails({
    summary,
    signals,
    errors,
    runtimeBase: runtimePresentation.displayBase,
    mode: runtimeMode,
    model: runtimePresentation.model,
    hostKind: runtimePresentation.hostKind,
    disconnected: false,
  });
}

export function renderShellDisconnected(message = 'Hosted backend pending') {
  setBadge('status-validator', 'WAITING', 'neutral');
  setBadge('status-cluster', 'OFFLINE', 'warn');
  setBadge('status-signals', 'PENDING', 'neutral');
  setBadge('status-mode', 'PENDING', 'warn');
  setStatusDot('warn');
  syncShellStatusDetails({
    summary: null,
    signals: null,
    errors: [message],
    runtimeBase: runtimePresentation.displayBase,
    mode: 'pending',
    model: runtimePresentation.model,
    hostKind: runtimePresentation.hostKind,
    disconnected: true,
  });
  return message;
}

export function renderShellFailure(error) {
  if (runtimePresentation.hostKind !== 'local') {
    return renderShellDisconnected('Hosted backend unavailable');
  }
  setBadge('status-validator', 'DOWN', 'danger');
  setBadge('status-cluster', 'OFFLINE', 'danger');
  setBadge('status-signals', 'UNKNOWN', 'neutral');
  setStatusDot('danger');
  syncShellStatusDetails({
    summary: null,
    signals: null,
    errors: [error?.message || 'Shell status unavailable'],
    runtimeBase: runtimePresentation.displayBase,
    mode: runtimePresentation.mode,
    model: runtimePresentation.model,
    hostKind: runtimePresentation.hostKind,
    disconnected: true,
  });
  return error?.message || 'Shell status unavailable';
}

export async function fetchEndpoint(path) {
  const url = buildUrl(runtime.apiBase, path);
  if (!url) throw new Error(`Missing endpoint for ${path}`);
  const response = await fetch(url, { headers: { Accept: 'application/json' } });
  if (!response.ok) {
    throw new Error(`${path}: HTTP ${response.status}`);
  }
  return unwrapEnvelope(await response.json());
}

export async function fetchOptionalEndpoints(entries) {
  const keys = Object.keys(entries);
  const settled = await Promise.allSettled(keys.map((key) => fetchEndpoint(entries[key])));
  return settled.reduce((acc, result, index) => {
    const key = keys[index];
    if (result.status === 'fulfilled') {
      acc.data[key] = result.value;
    } else {
      acc.errors.push(result.reason?.message || `${entries[key]} failed`);
    }
    return acc;
  }, { data: {}, errors: [] });
}

export async function initDashboardShell({
  activeNav = 'home',
  fetchStatus = true,
  runtimeBaseId = 'runtime-base',
  lastUpdatedId = 'last-updated',
} = {}) {
  initializeShellStatusPanel();
  setActiveNav(activeNav);
  renderStaticRuntime(runtimeBaseId);

  if (runtimePresentation.disconnected) {
    const message = renderShellDisconnected(runtimePresentation.model);
    if (lastUpdatedId) {
      setText(lastUpdatedId, message);
    }
    syncShellStatusDetails({ lastSync: message });
    return { data: {}, errors: [message] };
  }

  if (!fetchStatus) {
    return { data: {}, errors: [] };
  }

  try {
    const result = await fetchOptionalEndpoints({
      summary: runtime.endpoints.explorerSummary,
      signals: runtime.endpoints.signals,
    });
    if (Object.keys(result.data).length === 0 && runtimePresentation.hostKind !== 'local') {
      const message = renderShellDisconnected('Hosted backend unavailable');
      if (lastUpdatedId) {
        setText(lastUpdatedId, message);
      }
      syncShellStatusDetails({ lastSync: message });
      return { data: {}, errors: [message] };
    }
    renderShellStatus(result.data.summary, result.data.signals, result.errors);
    if (lastUpdatedId) {
      const refreshedAt = `Updated ${new Date().toLocaleTimeString()}`;
      setText(lastUpdatedId, result.errors.length ? `${refreshedAt} • degraded` : refreshedAt);
      syncShellStatusDetails({
        lastSync: result.errors.length ? `${refreshedAt} • degraded` : refreshedAt,
      });
    }
    return result;
  } catch (error) {
    const message = renderShellFailure(error);
    if (lastUpdatedId) {
      setText(lastUpdatedId, `Unavailable • ${message}`);
    }
    syncShellStatusDetails({ lastSync: `Unavailable • ${message}` });
    return { data: {}, errors: [message] };
  }
}
