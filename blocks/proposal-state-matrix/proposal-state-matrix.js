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

function formatMaybe(value) {
  if (value === null || value === undefined) return '--';
  return String(value);
}

function formatCount(value) {
  if (value === null || value === undefined || Number.isNaN(Number(value))) return '--';
  return Number(value).toLocaleString();
}

function formatPct(value) {
  if (!Number.isFinite(value)) return '--';
  return `${value.toFixed(1)}%`;
}

function asNum(value, fallback = 0) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
}

function cell(text, className = '') {
  const td = document.createElement('td');
  if (className) td.className = className;
  td.textContent = text;
  return td;
}

function renderMatrix(tableBody, payload) {
  const stateByType = payload.stateByType || {};
  const rows = [
    ['WRITE', stateByType.write || {}],
    ['DELETE', stateByType.delete || {}],
    ['TOTAL', payload.states || {}],
  ];

  tableBody.replaceChildren(...rows.map(([label, values]) => {
    const tr = document.createElement('tr');
    tr.append(
      cell(label, 'proposal-state-matrix-type'),
      cell(formatMaybe(values.unverified)),
      cell(formatMaybe(values.verified)),
      cell(formatMaybe(values.finalized)),
      cell(formatMaybe(values.rejected)),
    );
    return tr;
  }));
}

function deriveModel(payload) {
  const queuePressure = payload.queuePressure || {};
  const types = payload.types || {};
  const statesLifetime = payload.statesLifetime || {};
  const routing = payload.routing || {};

  const queuePending = asNum(queuePressure.queuePending ?? queuePressure.pending, 0);
  const mempool = asNum(queuePressure.mempool, 0);
  const bpPending = asNum(queuePressure.backpressurePending, 0);
  const bpMax = asNum(queuePressure.backpressureMax, 0);
  const bpActive = Boolean(queuePressure.backpressureActive);

  const verified = asNum(payload.states?.verified, 0);
  const finalized = asNum(payload.states?.finalized, 0);
  const rejected = asNum(payload.states?.rejected, 0);
  const gap = Math.max(0, verified - finalized);
  const coverage = verified > 0 ? (finalized / verified) * 100 : 100;

  const sentCurrent = asNum(routing.sentCurrent, 0);
  const routingDebt = Math.max(0, sentCurrent - finalized);
  const writeCount = asNum(types.write, 0);
  const deleteCount = asNum(types.delete, 0);

  let status = 'IDLE';
  let statusClass = 'idle';
  if (payload.degraded) {
    status = 'DEGRADED';
    statusClass = 'degraded';
  } else if (bpActive && bpPending > 0) {
    status = 'BACKPRESSURE';
    statusClass = 'constrained';
  } else if (queuePending > 0 || gap > 0 || routingDebt > 0) {
    status = 'DRAINING';
    statusClass = 'draining';
  } else if (rejected > 0) {
    status = 'REJECTS';
    statusClass = 'constrained';
  } else {
    status = 'STEADY';
    statusClass = 'healthy';
  }

  return {
    status,
    statusClass,
    queuePending,
    mempool,
    bpPending,
    bpMax,
    bpActive,
    gap,
    coverage,
    routingDebt,
    sentCurrent,
    writeCount,
    deleteCount,
    finalizedLifetime: asNum(statesLifetime.finalized, 0),
    rejected,
  };
}

function renderAvailability(noteEl, payload) {
  const availability = payload?.stateByType?.availability;
  const statesLifetime = payload?.statesLifetime || {};
  const lifetimeNote = `Lifetime totals: verified=${formatMaybe(statesLifetime.verified)} finalized=${formatMaybe(statesLifetime.finalized)} rejected=${formatMaybe(statesLifetime.rejected)}.`;
  if (availability === 'needs_upstream_counters') {
    noteEl.textContent = `Per-type state splits require additional upstream counters; total row reflects authoritative current-window counts. ${lifetimeNote}`;
    return;
  }
  noteEl.textContent = `State and type counters sourced from queue stats (current window). ${lifetimeNote}`;
}

export default function decorate(block) {
  const runtime = getOpsRuntimeConfig();
  const config = readBlockConfig(block);
  const baseUrl = readConfig(config, 'api-base', 'apiBase') || runtime.apiBase;
  const refreshSeconds = Number(readConfig(config, 'refresh-seconds', 'refreshSeconds') || runtime.refreshSeconds.proposals || 4);
  const endpoint = readConfig(config, 'proposals-endpoint', 'proposalsEndpoint') || runtime.endpoints.proposals;

  const shell = document.createElement('div');
  shell.className = 'proposal-state-matrix-shell';

  const meta = document.createElement('p');
  meta.className = 'proposal-state-matrix-meta';
  meta.textContent = `Polling ${baseUrl} every ${refreshSeconds}s`;

  const pressure = document.createElement('p');
  pressure.className = 'proposal-state-matrix-status';
  pressure.innerHTML = '<span class="status-label">State</span><strong class="status-value">Loading…</strong>';

  const cards = document.createElement('div');
  cards.className = 'proposal-state-matrix-cards';

  const cardDefs = [
    ['Queue Pending', 'queuePending'],
    ['In-flight Gap', 'gap'],
    ['Backpressure', 'backpressure'],
    ['Routing Debt', 'routingDebt'],
    ['Finalize Coverage', 'coverage'],
    ['Finalized Lifetime', 'finalizedLifetime'],
  ];
  const cardEls = {};
  cardDefs.forEach(([label, key]) => {
    const el = document.createElement('article');
    el.className = 'proposal-state-matrix-card';
    el.innerHTML = `<p>${label}</p><strong>--</strong>`;
    cards.append(el);
    cardEls[key] = el.querySelector('strong');
  });

  const table = document.createElement('table');
  table.className = 'proposal-state-matrix-table';
  table.innerHTML = `
    <thead>
      <tr>
        <th>Type</th>
        <th>Unverified</th>
        <th>Verified</th>
        <th>Finalized</th>
        <th>Rejected</th>
      </tr>
    </thead>
  `;

  const body = document.createElement('tbody');
  table.append(body);

  const note = document.createElement('p');
  note.className = 'proposal-state-matrix-note';

  const updated = document.createElement('p');
  updated.className = 'proposal-state-matrix-updated';
  updated.textContent = 'Updated --';

  shell.append(meta, pressure, cards, table, note, updated);
  block.replaceChildren(shell);

  async function refresh() {
    const target = buildUrl(baseUrl, endpoint);
    if (!target) {
      pressure.textContent = 'Missing proposals endpoint configuration.';
      note.textContent = 'Configure proposals endpoint in runtime config.';
      return;
    }

    try {
      const response = await fetch(target, { headers: { Accept: 'application/json' } });
      if (!response.ok) {
        throw new Error(`HTTP ${response.status}`);
      }
      const payload = unwrapEnvelope(await response.json());
      const model = deriveModel(payload);
      pressure.className = `proposal-state-matrix-status is-${model.statusClass}`;
      pressure.innerHTML = `<span class="status-label">State</span><strong class="status-value">${model.status}</strong>`;

      cardEls.queuePending.textContent = formatCount(model.queuePending);
      cardEls.gap.textContent = formatCount(model.gap);
      cardEls.backpressure.textContent = `${formatCount(model.bpPending)} / ${formatCount(model.bpMax)}`;
      cardEls.routingDebt.textContent = formatCount(model.routingDebt);
      cardEls.coverage.textContent = formatPct(model.coverage);
      cardEls.finalizedLifetime.textContent = formatCount(model.finalizedLifetime);

      renderMatrix(body, payload);
      renderAvailability(note, payload);
      note.textContent = `${note.textContent} Mempool=${formatCount(model.mempool)} • Backpressure active=${model.bpActive ? 'yes' : 'no'} • Writes=${formatCount(model.writeCount)} • Deletes=${formatCount(model.deleteCount)} • Rejected=${formatCount(model.rejected)} • Sent(current)=${formatCount(model.sentCurrent)}.`;
      meta.textContent = `Polling ${baseUrl} every ${refreshSeconds}s`;
      updated.textContent = `Updated ${new Date().toLocaleTimeString()}`;
    } catch (error) {
      pressure.className = 'proposal-state-matrix-status is-error';
      pressure.innerHTML = `<span class="status-label">State</span><strong class="status-value">UNAVAILABLE</strong>`;
      Object.values(cardEls).forEach((el) => { el.textContent = '--'; });
      renderMatrix(body, { states: {}, stateByType: { write: {}, delete: {} } });
      note.textContent = `Proposal state unavailable: ${error.message}`;
    }
  }

  refresh();
  window.setInterval(refresh, Math.max(1, refreshSeconds) * 1000);
}
