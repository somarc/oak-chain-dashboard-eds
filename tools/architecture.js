import { runtime, initDashboardShell } from '/tools/shell.js';

function setText(id, value) {
  const element = document.getElementById(id);
  if (element) {
    element.textContent = value;
  }
}

function routeFor(key, fallback) {
  return runtime.endpoints?.[key] || fallback;
}

function detectRuntimeModel() {
  const base = String(runtime.apiBase || '').toLowerCase();
  if (base.includes('127.0.0.1') || base.includes('localhost')) {
    return 'Local direct mock';
  }
  if (base.includes('ops.oakchain.net')) {
    return 'Oak Chain edge domain';
  }
  if (base.includes('adobeio-static.net')) {
    return 'Adobe I/O edge bridge';
  }
  return 'Custom gateway runtime';
}

function renderRuntimeArchitecture() {
  const runtimeModel = detectRuntimeModel();
  setText('runtime-model', runtimeModel);
  setText('architecture-runtime', runtimeModel);
  setText('architecture-mode-heading', runtimeModel);
  setText('architecture-api-base', runtime.apiBase || '--');
  setText('architecture-summary-route', routeFor('explorerSummary', '/ops/v1/overview'));
  setText('architecture-release-route', routeFor('proposalsReleaseFlow', '/ops/v1/proposals/release-flow'));
  setText('architecture-signals-route', routeFor('signals', '/ops/v1/signals'));
}

renderRuntimeArchitecture();
initDashboardShell({ activeNav: 'architecture' });
