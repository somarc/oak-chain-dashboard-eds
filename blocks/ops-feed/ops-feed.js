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

function normalizeEvents(payload) {
  if (!payload) return [];
  if (Array.isArray(payload)) return payload;
  if (Array.isArray(payload.events)) return payload.events;
  if (Array.isArray(payload.recentEvents)) return payload.recentEvents;
  return [];
}

function unwrapEnvelope(payload) {
  if (payload && typeof payload === 'object' && payload.data && typeof payload.data === 'object') {
    return payload.data;
  }
  return payload;
}

function renderEvent(event) {
  const li = document.createElement('li');
  li.className = 'ops-feed-item';

  const type = document.createElement('p');
  type.className = 'ops-feed-item-type';
  type.textContent = event.type || event.eventType || 'event';

  const body = document.createElement('p');
  body.className = 'ops-feed-item-body';
  body.textContent = event.message || event.description || JSON.stringify(event).slice(0, 140);

  const ts = document.createElement('p');
  ts.className = 'ops-feed-item-ts';
  ts.textContent = event.timestamp || event.time || new Date().toISOString();

  li.append(type, body, ts);
  return li;
}

function rankEntries(mapLike = {}) {
  return Object.entries(mapLike || {})
    .map(([key, value]) => ({ key, value: Number(value) || 0 }))
    .sort((a, b) => b.value - a.value);
}

function renderSummary(summary, statsPayload, events) {
  const bySeverity = rankEntries(statsPayload.bySeverity || {});
  const byType = rankEntries(statsPayload.byType || {});
  const total = Number(statsPayload.total24h || statsPayload.totalEventsBroadcast || statsPayload.total || events.length || 0);
  const topSeverity = bySeverity[0] || { key: 'info', value: 0 };
  const topType = byType[0] || { key: 'EVENT', value: 0 };
  const eventRate = events.length;

  const stats = summary.querySelector('.ops-feed-summary-stats');
  if (stats) {
    stats.innerHTML = `
      <div class="ops-feed-stat">
        <p class="ops-feed-stat-label">Recent Window</p>
        <p class="ops-feed-stat-value">${eventRate} events</p>
        <p class="ops-feed-stat-detail">Top severity: ${topSeverity.key} (${topSeverity.value})</p>
      </div>
      <div class="ops-feed-stat">
        <p class="ops-feed-stat-label">24h Total</p>
        <p class="ops-feed-stat-value">${total}</p>
        <p class="ops-feed-stat-detail">Top type: ${topType.key} (${topType.value})</p>
      </div>
    `;
  }

  const maxSeverity = Math.max(...bySeverity.map((v) => v.value), 1);
  const maxType = Math.max(...byType.map((v) => v.value), 1);

  const severityBars = summary.querySelector('.ops-feed-severity');
  const typeBars = summary.querySelector('.ops-feed-types');
  if (severityBars) {
    severityBars.replaceChildren(...bySeverity.slice(0, 4).map((entry) => {
      const row = document.createElement('div');
      row.className = 'ops-feed-bar';
      row.innerHTML = `
        <span class="ops-feed-bar-label">${entry.key}</span>
        <span class="ops-feed-bar-track"><span class="ops-feed-bar-fill" style="width:${Math.max(6, (entry.value / maxSeverity) * 100)}%"></span></span>
        <span class="ops-feed-bar-value">${entry.value}</span>
      `;
      return row;
    }));
  }
  if (typeBars) {
    typeBars.replaceChildren(...byType.slice(0, 4).map((entry) => {
      const row = document.createElement('div');
      row.className = 'ops-feed-bar';
      row.innerHTML = `
        <span class="ops-feed-bar-label">${entry.key}</span>
        <span class="ops-feed-bar-track"><span class="ops-feed-bar-fill" style="width:${Math.max(6, (entry.value / maxType) * 100)}%"></span></span>
        <span class="ops-feed-bar-value">${entry.value}</span>
      `;
      return row;
    }));
  }
}

async function refresh({
  list, meta, summary, updated, baseUrl, recentEventsUrl, eventStatsUrl,
}) {
  try {
    const [recentResponse, statsResponse] = await Promise.all([
      fetch(recentEventsUrl, { headers: { Accept: 'application/json' } }),
      fetch(eventStatsUrl, { headers: { Accept: 'application/json' } }),
    ]);

    if (!recentResponse.ok) {
      throw new Error(`recent events HTTP ${recentResponse.status}`);
    }
    if (!statsResponse.ok) {
      throw new Error(`event stats HTTP ${statsResponse.status}`);
    }

    const recentPayload = unwrapEnvelope(await recentResponse.json());
    const statsPayload = unwrapEnvelope(await statsResponse.json());

    const events = normalizeEvents(recentPayload).slice(0, 12);
    if (!events.length) {
      const empty = document.createElement('li');
      empty.className = 'ops-feed-item';
      empty.textContent = 'No recent events yet.';
      list.replaceChildren(empty);
    } else {
      list.replaceChildren(...events.map(renderEvent));
    }

    const count = statsPayload.totalEvents || statsPayload.total || events.length;
    meta.textContent = `${count} total events observed from ${baseUrl}`;
    updated.textContent = `Updated ${new Date().toLocaleTimeString()}`;
    renderSummary(summary, statsPayload, events);
  } catch (error) {
    list.replaceChildren();
    const li = document.createElement('li');
    li.className = 'ops-feed-item ops-feed-item-error';
    li.textContent = `Feed unavailable: ${error.message}`;
    list.append(li);
    const stats = summary.querySelector('.ops-feed-summary-stats');
    const severity = summary.querySelector('.ops-feed-severity');
    const types = summary.querySelector('.ops-feed-types');
    if (stats) stats.innerHTML = '';
    if (severity) severity.replaceChildren();
    if (types) types.replaceChildren();
    meta.textContent = 'Awaiting event stream';
  }
}

export default function decorate(block) {
  const runtime = getOpsRuntimeConfig();
  const config = readBlockConfig(block);
  const baseUrl = readConfig(config, 'api-base', 'apiBase') || runtime.apiBase;
  const refreshSeconds = Number(readConfig(config, 'refresh-seconds', 'refreshSeconds') || runtime.refreshSeconds.feed);

  const recentEventsUrl = buildUrl(
    baseUrl,
    readConfig(config, 'recent-events', 'recentEvents') || runtime.endpoints.eventsRecent,
  );
  const eventStatsUrl = buildUrl(
    baseUrl,
    readConfig(config, 'event-stats', 'eventStats') || runtime.endpoints.eventsStats,
  );

  const shell = document.createElement('div');
  shell.className = 'ops-feed-shell';

  const meta = document.createElement('p');
  meta.className = 'ops-feed-meta';
  meta.textContent = `Polling ${baseUrl} every ${refreshSeconds}s`;

  const summary = document.createElement('div');
  summary.className = 'ops-feed-summary';
  summary.innerHTML = `
    <div class="ops-feed-summary-stats"></div>
    <div class="ops-feed-severity"></div>
    <div class="ops-feed-types"></div>
  `;

  const list = document.createElement('ul');
  list.className = 'ops-feed-list';

  const updated = document.createElement('p');
  updated.className = 'ops-feed-updated';
  updated.textContent = 'Updated --';

  shell.append(meta, summary, list, updated);
  block.replaceChildren(shell);

  const tick = () => refresh({
    list, meta, summary, updated, baseUrl, recentEventsUrl, eventStatsUrl,
  });
  tick();
  window.setInterval(tick, Math.max(1, refreshSeconds) * 1000);
}
