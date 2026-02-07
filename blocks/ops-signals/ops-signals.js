import { readBlockConfig } from '../../scripts/aem.js';
import { getOpsRuntimeConfig } from '../../scripts/ops-runtime-config.js';

function buildUrl(base, path) {
  if (!path) return null;
  const normalizedBase = (base || '').replace(/\/$/, '');
  const normalizedPath = path.startsWith('/') ? path : `/${path}`;
  return `${normalizedBase}${normalizedPath}`;
}

function readConfig(config, ...keys) {
  for (let i = 0; i < keys.length; i += 1) {
    const key = keys[i];
    if (config[key] !== undefined && config[key] !== null && config[key] !== '') {
      return config[key];
    }
  }
  return undefined;
}

function unwrapEnvelope(payload) {
  if (payload && typeof payload === 'object' && payload.data && typeof payload.data === 'object') {
    return payload.data;
  }
  return payload;
}

function formatValue(value, unit) {
  if (value === null || value === undefined) return '--';
  if (unit === 'percent') return `${Number(value).toFixed(1)}%`;
  if (unit === 'ms') return `${value} ms`;
  return `${value}`;
}

function asNum(value, fallback = 0) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
}

function formatRate(value) {
  return `${asNum(value, 0).toFixed(1)}/s`;
}

function formatPercent(value) {
  return `${(asNum(value, 0) * 100).toFixed(1)}%`;
}

function pick(obj, path, fallback = 0) {
  if (!obj || typeof obj !== 'object') return fallback;
  const parts = path.split('.');
  let cur = obj;
  for (let i = 0; i < parts.length; i += 1) {
    const p = parts[i];
    if (cur && typeof cur === 'object' && p in cur) {
      cur = cur[p];
    } else {
      return fallback;
    }
  }
  return cur === undefined || cur === null ? fallback : cur;
}

function severityWeight(severity) {
  if (severity === 'critical') return 0;
  if (severity === 'warn') return 1;
  if (severity === 'ok') return 2;
  return 3;
}

function computeDerivedStatus(sample, previous) {
  const gap = Math.max(0, sample.verified - sample.finalized);
  const gapRatio = sample.verified > 0 ? gap / sample.verified : 0;
  const queueDelta = previous ? sample.queuePending - previous.queuePending : 0;
  const finalizedDelta = previous ? sample.finalized - previous.finalized : 0;
  const dtSec = previous ? Math.max(1, (sample.ts - previous.ts) / 1000) : 1;
  const drainRate = previous ? -queueDelta / dtSec : 0;
  const finalizedRate = previous ? finalizedDelta / dtSec : 0;
  const queueSlope = previous ? queueDelta / dtSec : 0;
  const slopeEpsilon = 0.25;
  let pressureMode = 'idle';
  if (queueSlope > slopeEpsilon) pressureMode = 'growing';
  else if (queueSlope < -slopeEpsilon) pressureMode = 'draining';

  let state = 'healthy';
  const noActivePressure = sample.queuePending === 0
    && sample.backpressurePending === 0
    && sample.pendingAcks === 0
    && Math.abs(queueSlope) <= slopeEpsilon;

  // Cold-start / idle steady-state should not be marked constrained purely from ratio math.
  if (noActivePressure) {
    state = 'healthy';
  } else if (sample.backpressurePending > 0 && previous && sample.queuePending === previous.queuePending && sample.finalized === previous.finalized) {
    state = 'stalled';
  } else if (sample.queuePending > 8000 || gapRatio > 0.35 || sample.pendingAcks > 200) {
    state = 'constrained';
  } else if (sample.queuePending > 0 || gap > 0) {
    state = 'draining';
  }

  return {
    state,
    gap,
    gapRatio,
    drainRate,
    finalizedRate,
    queueSlope,
    pressureMode,
  };
}

function renderDiagnostics(el, derived) {
  const badge = document.createElement('li');
  badge.className = `ops-signals-summary-pill is-${derived.state}`;
  badge.innerHTML = `<span>Status</span><strong>${derived.state.toUpperCase()}</strong>`;

  const gap = document.createElement('li');
  gap.className = 'ops-signals-summary-pill';
  gap.innerHTML = `<span>Gap Ratio</span><strong>${formatPercent(derived.gapRatio)}</strong>`;

  const drain = document.createElement('li');
  drain.className = 'ops-signals-summary-pill';
  drain.innerHTML = `<span>Drain Rate</span><strong>${formatRate(derived.drainRate)}</strong>`;

  const finalize = document.createElement('li');
  finalize.className = 'ops-signals-summary-pill';
  finalize.innerHTML = `<span>Finalize Rate</span><strong>${formatRate(derived.finalizedRate)}</strong>`;

  const pressure = document.createElement('li');
  const pressureSeverity = derived.pressureMode === 'draining'
    ? 'ok'
    : (derived.pressureMode === 'growing' ? 'warn' : 'unknown');
  pressure.className = `ops-signals-summary-pill is-${pressureSeverity}`;
  pressure.innerHTML = `<span>Queue Pressure</span><strong>${derived.pressureMode.toUpperCase()}</strong>`;

  const slope = document.createElement('li');
  slope.className = 'ops-signals-summary-pill';
  slope.innerHTML = `<span>Net Queue Slope</span><strong>${asNum(derived.queueSlope, 0).toFixed(1)}/s</strong>`;

  el.replaceChildren(badge, gap, drain, finalize, pressure, slope);
}

function renderSummary(el, summary = {}) {
  const parts = [
    { key: 'critical', label: 'Critical' },
    { key: 'warn', label: 'Warn' },
    { key: 'ok', label: 'OK' },
    { key: 'unknown', label: 'Unknown' },
  ];
  const pills = parts.map((part) => {
    const li = document.createElement('li');
    li.className = `ops-signals-summary-pill is-${part.key}`;
    const label = document.createElement('span');
    label.textContent = part.label;
    const value = document.createElement('strong');
    value.textContent = String(summary[part.key] ?? 0);
    li.append(label, value);
    return li;
  });
  el.replaceChildren(...pills);
}

function renderSignals(grid, payload) {
  const signals = Array.isArray(payload.signals) ? payload.signals : [];
  const missingUpstream = signals.filter((signal) => signal && signal.available === false && signal.source === 'missing-upstream-counter');
  const filteredSignals = signals.filter((signal) => !(signal && signal.available === false && signal.source === 'missing-upstream-counter'));
  if (missingUpstream.length > 0) {
    const labels = missingUpstream.map((s) => s.label || s.id).filter(Boolean).join(', ');
    filteredSignals.push({
      id: 'telemetry.gaps',
      label: 'Telemetry Gaps',
      severity: 'unknown',
      available: false,
      value: null,
      source: 'missing-upstream-counter',
      description: labels ? `Missing upstream counters: ${labels}` : 'Missing upstream counters.',
    });
  }
  const sorted = [...filteredSignals].sort((a, b) => {
    const bySeverity = severityWeight(a.severity) - severityWeight(b.severity);
    if (bySeverity !== 0) return bySeverity;
    return String(a.label || a.id).localeCompare(String(b.label || b.id));
  });

  if (!sorted.length) {
    const empty = document.createElement('article');
    empty.className = 'ops-signals-card is-empty';
    empty.textContent = 'No signals available.';
    grid.replaceChildren(empty);
    return;
  }

  const cards = sorted.map((signal) => {
    const card = document.createElement('article');
    const severity = signal.severity || 'unknown';
    card.className = `ops-signals-card is-${severity}`;

    const head = document.createElement('div');
    head.className = 'ops-signals-card-head';

    const title = document.createElement('h3');
    title.className = 'ops-signals-card-title';
    title.textContent = signal.label || signal.id || 'Signal';

    const badge = document.createElement('span');
    badge.className = `ops-signals-badge is-${severity}`;
    badge.textContent = severity.toUpperCase();

    head.append(title, badge);

    const value = document.createElement('p');
    value.className = 'ops-signals-card-value';
    value.textContent = signal.available === false
      ? 'UNAVAILABLE'
      : formatValue(signal.value, signal.unit);

    const desc = document.createElement('p');
    desc.className = 'ops-signals-card-desc';
    desc.textContent = signal.description || '';

    const meta = document.createElement('p');
    meta.className = 'ops-signals-card-meta';
    const source = signal.source || 'unknown-source';
    meta.textContent = `source ${source}`;

    card.append(head, value, desc, meta);
    return card;
  });

  grid.replaceChildren(...cards);
}

export default function decorate(block) {
  const runtime = getOpsRuntimeConfig();
  const config = readBlockConfig(block);
  const baseUrl = readConfig(config, 'api-base', 'apiBase') || runtime.apiBase;
  const refreshSeconds = Number(readConfig(config, 'refresh-seconds', 'refreshSeconds') || runtime.refreshSeconds.signals || 4);
  const endpoint = readConfig(config, 'signals-endpoint', 'signalsEndpoint') || runtime.endpoints.signals;
  const overviewEndpoint = runtime.endpoints.overview;
  const proposalsEndpoint = runtime.endpoints.proposals;

  const shell = document.createElement('div');
  shell.className = 'ops-signals-shell';

  const meta = document.createElement('p');
  meta.className = 'ops-signals-meta';
  meta.textContent = `Polling ${baseUrl} every ${refreshSeconds}s`;

  const summary = document.createElement('ul');
  summary.className = 'ops-signals-summary';

  const diagnostics = document.createElement('ul');
  diagnostics.className = 'ops-signals-summary ops-signals-diagnostics';

  const grid = document.createElement('div');
  grid.className = 'ops-signals-grid';

  const updated = document.createElement('p');
  updated.className = 'ops-signals-updated';
  updated.textContent = 'Updated --';

  shell.append(meta, diagnostics, summary, grid, updated);
  block.replaceChildren(shell);
  let previousDerivedSample = null;

  async function refresh() {
    const target = buildUrl(baseUrl, endpoint);
    const overviewTarget = buildUrl(baseUrl, overviewEndpoint);
    const proposalsTarget = buildUrl(baseUrl, proposalsEndpoint);
    if (!target) {
      grid.replaceChildren();
      updated.textContent = 'Signals endpoint missing';
      return;
    }

    try {
      const response = await fetch(target, { headers: { Accept: 'application/json' } });
      if (!response.ok) {
        throw new Error(`HTTP ${response.status}`);
      }
      const payload = unwrapEnvelope(await response.json());
      renderSummary(summary, payload.summary || {});
      renderSignals(grid, payload);

      if (overviewTarget && proposalsTarget) {
        const [overviewRes, proposalsRes] = await Promise.all([
          fetch(overviewTarget, { headers: { Accept: 'application/json' } }),
          fetch(proposalsTarget, { headers: { Accept: 'application/json' } }),
        ]);
        if (overviewRes.ok && proposalsRes.ok) {
          const overview = unwrapEnvelope(await overviewRes.json());
          const proposals = unwrapEnvelope(await proposalsRes.json());
          const sample = {
            ts: Date.now(),
            queuePending: asNum(pick(overview, 'queue.queuePending', pick(overview, 'queue.pending', 0)), 0),
            pendingAcks: asNum(pick(overview, 'durability.pendingAcks', 0), 0),
            verified: asNum(pick(proposals, 'states.verified', 0), 0),
            finalized: asNum(pick(proposals, 'states.finalized', 0), 0),
            backpressurePending: asNum(pick(proposals, 'queuePressure.backpressurePending', 0), 0),
          };
          const derived = computeDerivedStatus(sample, previousDerivedSample);
          previousDerivedSample = sample;
          renderDiagnostics(diagnostics, derived);
        }
      }
      updated.textContent = `Updated ${new Date().toLocaleTimeString()}`;
    } catch (error) {
      renderSummary(summary, {});
      diagnostics.replaceChildren();
      grid.replaceChildren();
      const err = document.createElement('article');
      err.className = 'ops-signals-card is-error';
      err.textContent = `Ops signals unavailable: ${error.message}`;
      grid.append(err);
      updated.textContent = `Updated ${new Date().toLocaleTimeString()}`;
    }
  }

  refresh();
  window.setInterval(refresh, Math.max(1, refreshSeconds) * 1000);
}
