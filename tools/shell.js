import { getOpsRuntimeConfig } from '/scripts/ops-runtime-config.js';

export const runtime = getOpsRuntimeConfig();

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

function setText(id, value) {
  const element = document.getElementById(id);
  if (element) element.textContent = value;
}

function setBadge(id, value, tone = 'neutral') {
  const element = document.getElementById(id);
  if (!element) return;
  element.textContent = value;
  element.className = `status-badge is-${tone}`;
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
  return 'neutral';
}

function detectMode() {
  const base = String(runtime.apiBase || '').toLowerCase();
  if (base.includes('127.0.0.1') || base.includes('localhost')) return 'mock';
  return 'live';
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
  setText(runtimeBaseId, runtime.apiBase);
  if (walletElement) {
    walletElement.textContent = shorten(wallet);
    walletElement.title = wallet;
  }
  setBadge('status-mode', mode.toUpperCase(), toneForMode(mode));
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

  const overallTone = errors.length > 0
    ? 'warn'
    : toneForSignals(signalState) === 'neutral'
      ? toneForCluster(clusterState)
      : toneForSignals(signalState);
  setStatusDot(overallTone || 'neutral');
}

function renderShellFailure(error) {
  setBadge('status-validator', 'DOWN', 'danger');
  setBadge('status-cluster', 'OFFLINE', 'danger');
  setBadge('status-signals', 'UNKNOWN', 'neutral');
  setStatusDot('danger');
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
  setActiveNav(activeNav);
  renderStaticRuntime(runtimeBaseId);

  if (!fetchStatus) {
    return { data: {}, errors: [] };
  }

  try {
    const result = await fetchOptionalEndpoints({
      summary: runtime.endpoints.explorerSummary,
      signals: runtime.endpoints.signals,
    });
    renderShellStatus(result.data.summary, result.data.signals, result.errors);
    if (lastUpdatedId) {
      const refreshedAt = `Updated ${new Date().toLocaleTimeString()}`;
      setText(lastUpdatedId, result.errors.length ? `${refreshedAt} • degraded` : refreshedAt);
    }
    return result;
  } catch (error) {
    const message = renderShellFailure(error);
    if (lastUpdatedId) {
      setText(lastUpdatedId, `Unavailable • ${message}`);
    }
    return { data: {}, errors: [message] };
  }
}
