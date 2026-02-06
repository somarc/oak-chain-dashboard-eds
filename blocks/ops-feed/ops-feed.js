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

async function refresh({ list, meta, baseUrl, recentEventsUrl, eventStatsUrl }) {
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
  } catch (error) {
    list.replaceChildren();
    const li = document.createElement('li');
    li.className = 'ops-feed-item ops-feed-item-error';
    li.textContent = `Feed unavailable: ${error.message}`;
    list.append(li);
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

  const list = document.createElement('ul');
  list.className = 'ops-feed-list';

  shell.append(meta, list);
  block.replaceChildren(shell);

  const tick = () => refresh({ list, meta, baseUrl, recentEventsUrl, eventStatsUrl });
  tick();
  window.setInterval(tick, Math.max(1, refreshSeconds) * 1000);
}
