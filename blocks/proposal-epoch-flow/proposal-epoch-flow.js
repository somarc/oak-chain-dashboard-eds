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

function valueCard(label, value) {
  const item = document.createElement('div');
  item.className = 'proposal-epoch-flow-metric';

  const l = document.createElement('p');
  l.className = 'proposal-epoch-flow-metric-label';
  l.textContent = label;

  const v = document.createElement('p');
  v.className = 'proposal-epoch-flow-metric-value';
  v.textContent = String(value ?? 0);

  item.append(l, v);
  return item;
}

function finalizedByPriority(blockData) {
  const byPriority = blockData.byPriority || {};
  const standard = Number(byPriority.standard?.finalized || 0);
  const express = Number(byPriority.express?.finalized || 0);
  const priority = Number(byPriority.priority?.finalized || 0);
  return { standard, express, priority };
}

function sumPriorityState(blockData, priorities, state) {
  const byPriority = blockData.byPriority || {};
  return priorities.reduce((sum, priority) => (
    sum + Number(byPriority[priority]?.[state] || 0)
  ), 0);
}

function laneModel(blockData, payload) {
  const status = String(blockData.status || '').toLowerCase();
  const epochsUntilFinality = Number(payload?.epochsUntilFinality || 0);

  if (status === 'next') {
    return {
      title: blockData.label || 'Next to be Finalized',
      phaseLabel: 'T+1',
      metrics: {
        unverified: sumPriorityState(blockData, ['express'], 'unverified') || Number(blockData.counts?.unverified || 0),
        verified: sumPriorityState(blockData, ['standard', 'express'], 'verified') || Number(blockData.counts?.verified || 0),
        rejected: sumPriorityState(blockData, ['standard', 'express'], 'rejected') || Number(blockData.counts?.rejected || 0),
      },
      typeLabel: blockData.typeLabel || 'Standard + Express',
    };
  }

  if (status === 'current') {
    const phaseDepth = epochsUntilFinality > 0 ? epochsUntilFinality : 2;
    return {
      title: blockData.label || 'Current',
      phaseLabel: `T+${phaseDepth}`,
      metrics: {
        unverified: sumPriorityState(blockData, ['standard'], 'unverified') || Number(blockData.counts?.unverified || 0),
        verified: sumPriorityState(blockData, ['standard'], 'verified') || Number(blockData.counts?.verified || 0),
        rejected: sumPriorityState(blockData, ['standard'], 'rejected') || Number(blockData.counts?.rejected || 0),
      },
      typeLabel: blockData.typeLabel || 'Standard',
    };
  }

  return {
    title: blockData.label || 'Epoch',
    phaseLabel: String(blockData.status || '').toLowerCase() === 'finalized' ? 'T=0' : 'T+?',
    metrics: {
      unverified: Number(blockData.counts?.unverified || 0),
      verified: Number(blockData.counts?.verified || 0),
      rejected: Number(blockData.counts?.rejected || 0),
    },
    typeLabel: blockData.typeLabel || 'n/a',
  };
}

function epochCard(blockData, payload) {
  const card = document.createElement('article');
  card.className = `proposal-epoch-flow-card is-${String(blockData.status || 'unknown').toLowerCase()}`;
  const model = laneModel(blockData, payload);

  const top = document.createElement('div');
  top.className = 'proposal-epoch-flow-card-top';

  const epoch = document.createElement('p');
  epoch.className = 'proposal-epoch-flow-card-epoch';
  epoch.textContent = `${model.title} • Epoch ${blockData.epoch ?? 'n/a'}`;

  const status = document.createElement('p');
  status.className = 'proposal-epoch-flow-card-status';
  status.textContent = model.phaseLabel || String(blockData.status || 'unknown').toUpperCase();

  const grid = document.createElement('div');
  grid.className = 'proposal-epoch-flow-grid';
  if (String(blockData.status || '').toLowerCase() === 'finalized') {
    const lanes = finalizedByPriority(blockData);
    grid.append(
      valueCard('Standard', lanes.standard),
      valueCard('Express', lanes.express),
      valueCard('Priority', lanes.priority),
    );
  } else {
    grid.append(
      valueCard('Unverified', model.metrics.unverified ?? 0),
      valueCard('Verified', model.metrics.verified ?? 0),
      valueCard('Rejected', model.metrics.rejected ?? 0),
      valueCard('Type', model.typeLabel),
    );
  }

  top.append(epoch, status);
  card.append(top, grid);
  return card;
}

function connector(value) {
  const c = document.createElement('div');
  c.className = 'proposal-epoch-flow-connector';

  const line = document.createElement('span');
  line.className = 'proposal-epoch-flow-connector-line';
  line.setAttribute('aria-hidden', 'true');

  const txt = document.createElement('span');
  txt.className = 'proposal-epoch-flow-connector-label';
  txt.textContent = `${value ?? 0} flowing`;

  c.append(line, txt);
  return c;
}

function renderFlow(rail, payload) {
  const blocks = Array.isArray(payload.blocks) ? payload.blocks : [];
  if (!blocks.length) {
    rail.replaceChildren();
    return;
  }

  const finalizedBlock = blocks.find((b) => String(b.status || '').toLowerCase() === 'finalized');
  const nextBlock = blocks.find((b) => String(b.status || '').toLowerCase() === 'next');
  const currentBlock = blocks.find((b) => String(b.status || '').toLowerCase() === 'current');

  const ordered = [];
  if (currentBlock) ordered.push(currentBlock);
  if (nextBlock) ordered.push(nextBlock);
  if (finalizedBlock) ordered.push(finalizedBlock);

  const nodes = [];
  ordered.forEach((item, index) => {
    nodes.push(epochCard(item, payload));
    if (index < ordered.length - 1) {
      nodes.push(connector(item.flowToNext ?? 0));
    }
  });
  rail.replaceChildren(...nodes);
}

export default function decorate(block) {
  const runtime = getOpsRuntimeConfig();
  const config = readBlockConfig(block);
  const baseUrl = readConfig(config, 'api-base', 'apiBase') || runtime.apiBase;
  const refreshSeconds = Number(readConfig(config, 'refresh-seconds', 'refreshSeconds') || runtime.refreshSeconds.proposals || 4);
  const endpoint = readConfig(config, 'epochs-endpoint', 'epochsEndpoint') || runtime.endpoints.proposalsEpochs;

  const shell = document.createElement('div');
  shell.className = 'proposal-epoch-flow-shell';

  const meta = document.createElement('p');
  meta.className = 'proposal-epoch-flow-meta';
  meta.textContent = `Polling ${baseUrl} every ${refreshSeconds}s`;

  const rail = document.createElement('div');
  rail.className = 'proposal-epoch-flow-rail';

  const note = document.createElement('p');
  note.className = 'proposal-epoch-flow-note';
  note.textContent = 'Awaiting epoch flow payload.';

  const updated = document.createElement('p');
  updated.className = 'proposal-epoch-flow-updated';
  updated.textContent = 'Updated --';

  shell.append(meta, rail, note, updated);
  block.replaceChildren(shell);

  async function refresh() {
    const target = buildUrl(baseUrl, endpoint);
    if (!target) {
      note.textContent = 'Missing epoch flow endpoint configuration.';
      return;
    }

    try {
      const response = await fetch(target, { headers: { Accept: 'application/json' } });
      if (!response.ok) {
        throw new Error(`HTTP ${response.status}`);
      }
      const payload = unwrapEnvelope(await response.json());
      renderFlow(rail, payload);
      note.textContent = payload.note || `Source: ${payload.source || 'unknown'}`;
      meta.textContent = `Polling ${baseUrl} every ${refreshSeconds}s`;
      updated.textContent = `Updated ${new Date().toLocaleTimeString()}`;
    } catch (error) {
      rail.replaceChildren();
      note.textContent = `Epoch flow unavailable: ${error.message}`;
    }
  }

  refresh();
  window.setInterval(refresh, Math.max(1, refreshSeconds) * 1000);
}
