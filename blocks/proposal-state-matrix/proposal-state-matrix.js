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

function renderPressure(pressureEl, payload) {
  const queuePressure = payload.queuePressure || {};
  const types = payload.types || {};
  const statesLifetime = payload.statesLifetime || {};
  const routing = payload.routing || {};
  const parts = [
    `queue ${formatMaybe(queuePressure.queuePending ?? queuePressure.pending)}`,
    `mempool ${formatMaybe(queuePressure.mempool)}`,
    `backpressure ${formatMaybe(queuePressure.backpressurePending)}/${formatMaybe(queuePressure.backpressureMax)}`,
    `active ${queuePressure.backpressureActive ? 'yes' : 'no'}`,
    `write ${formatMaybe(types.write)}`,
    `delete ${formatMaybe(types.delete)}`,
    `total ${formatMaybe(types.total)}`,
    `finalized(life) ${formatMaybe(statesLifetime.finalized)}`,
    `sent(life) ${formatMaybe(routing.sentLifetime)}`,
  ];
  pressureEl.textContent = parts.join(' • ');
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
  pressure.className = 'proposal-state-matrix-pressure';
  pressure.textContent = 'Loading proposal pressure...';

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

  shell.append(meta, pressure, table, note, updated);
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
      renderPressure(pressure, payload);
      renderMatrix(body, payload);
      renderAvailability(note, payload);
      meta.textContent = `Polling ${baseUrl} every ${refreshSeconds}s`;
      updated.textContent = `Updated ${new Date().toLocaleTimeString()}`;
    } catch (error) {
      pressure.textContent = `Proposal state unavailable: ${error.message}`;
      renderMatrix(body, { states: {}, stateByType: { write: {}, delete: {} } });
      note.textContent = 'Awaiting proposal state payload.';
    }
  }

  refresh();
  window.setInterval(refresh, Math.max(1, refreshSeconds) * 1000);
}
