import { initDashboardShell, runtimePresentation } from '/tools/shell.js';

function toneForValue(value) {
  const normalized = String(value || '').toLowerCase();

  if (['healthy', 'ok', 'leader', 'live'].includes(normalized)) return 'success';
  if (['mock'].includes(normalized)) return 'info';
  if (['pending', 'waiting', 'degraded'].includes(normalized)) return 'warn';
  if (['offline', 'critical', 'down'].includes(normalized)) return 'danger';
  return 'neutral';
}

function setPreviewCell(id, value, tone = 'neutral') {
  const element = document.getElementById(id);
  if (!element) return;

  element.textContent = value;
  const cell = element.closest('.ops-preview-cell');
  if (cell) {
    cell.dataset.tone = tone;
  }
}

function summarizeRuntime() {
  if (runtimePresentation.disconnected) return 'Pending';
  if (runtimePresentation.mode === 'mock') return 'Local Mock';
  if (runtimePresentation.displayBase === 'Adobe I/O edge bridge') return 'Edge Bridge';
  if (runtimePresentation.displayBase === 'ops.oakchain.net') return 'Oak Chain Edge';
  return runtimePresentation.model || 'Runtime';
}

function renderOpsPreview({ data = {}, errors = [] } = {}) {
  const summary = data.summary || {};
  const signals = data.signals || {};
  const cluster = summary.cluster || {};

  const runtimeElement = document.getElementById('ops-preview-runtime');
  const noteElement = document.getElementById('ops-preview-note');

  if (runtimeElement) {
    runtimeElement.textContent = summarizeRuntime();
  }

  if (!data.summary && errors.length > 0) {
    const fallbackMode = runtimePresentation.hostKind === 'local' ? 'MOCK' : 'PENDING';
    setPreviewCell('ops-preview-cluster', 'OFFLINE', 'warn');
    setPreviewCell('ops-preview-validator', 'WAITING', 'neutral');
    setPreviewCell('ops-preview-signals', 'PENDING', 'neutral');
    setPreviewCell('ops-preview-mode', fallbackMode, toneForValue(fallbackMode));
    if (noteElement) {
      noteElement.textContent = 'Hosted backend is unavailable right now. Oak Ops becomes the live control plane once the edge bridge is connected.';
    }
    return;
  }

  const clusterState = String(cluster.clusterState || 'unknown').toUpperCase();
  const validatorState = String(cluster.role || 'unknown').toUpperCase();
  const signalState = String(signals.status || 'unknown').toUpperCase();
  const modeState = String(runtimePresentation.mode || 'unknown').toUpperCase();

  setPreviewCell('ops-preview-cluster', clusterState, toneForValue(cluster.clusterState));
  setPreviewCell('ops-preview-validator', validatorState, toneForValue(cluster.role));
  setPreviewCell('ops-preview-signals', signalState, toneForValue(signals.status));
  setPreviewCell('ops-preview-mode', modeState, toneForValue(runtimePresentation.mode));

  if (noteElement) {
    noteElement.textContent = 'Mini readout of cluster posture, validator role, signal health, and runtime mode before you enter Oak Ops.';
  }
}

async function init() {
  const shellState = await initDashboardShell({ activeNav: 'home' });
  renderOpsPreview(shellState);
}

if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', init, { once: true });
} else {
  init();
}
