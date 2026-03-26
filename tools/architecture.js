import { getRunnerRuntimeConfig } from '/scripts/ops-runtime-config.js';
import { runtime, initDashboardShell } from '/tools/shell.js';

const runnerRuntime = getRunnerRuntimeConfig();

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

function getRunnerBaseLabel() {
  return runnerRuntime.apiBase || 'Pending deployment';
}

function renderRuntimeArchitecture() {
  const runtimeModel = detectRuntimeModel();
  setText('runtime-model', runtimeModel);
  setText('architecture-runtime', runtimeModel);
  setText('architecture-mode-heading', runtimeModel);
  setText('ops-runtime-base', runtime.apiBase || '--');
  setText('runner-runtime-base', getRunnerBaseLabel());
  setText('architecture-ops-api-base', runtime.apiBase || '--');
  setText('architecture-runner-api-base', getRunnerBaseLabel());
  setText('architecture-summary-route', routeFor('explorerSummary', '/ops/v1/overview'));
  setText('architecture-release-route', routeFor('proposalsReleaseFlow', '/ops/v1/proposals/release-flow'));
  setText('architecture-runner-runs-route', runnerRuntime.endpoints?.testRuns || '/runner/v1/test-runs');
  setText('architecture-runner-events-route', runnerRuntime.endpoints?.events || '/runner/v1/test-runs/{runId}/events');
}

renderRuntimeArchitecture();
initDashboardShell({ activeNav: 'architecture' });
