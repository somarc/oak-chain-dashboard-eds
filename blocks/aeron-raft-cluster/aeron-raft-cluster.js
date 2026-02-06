import { readBlockConfig } from '../../scripts/aem.js';
import { getOpsRuntimeConfig } from '../../scripts/ops-runtime-config.js';

const SVG_NS = 'http://www.w3.org/2000/svg';

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

function buildUrl(base, path) {
  if (!path) return null;
  const normalizedBase = (base || '').replace(/\/$/, '');
  const normalizedPath = path.startsWith('/') ? path : `/${path}`;
  return `${normalizedBase}${normalizedPath}`;
}

function shortWallet(wallet) {
  if (!wallet || typeof wallet !== 'string' || wallet.length < 12) return wallet || 'unknown';
  return `${wallet.slice(0, 8)}...${wallet.slice(-6)}`;
}

function displayNodeId(node) {
  if (!node || typeof node !== 'object') return 'n/a';
  if (node.displayId !== undefined && node.displayId !== null) return node.displayId;
  if (node.nodeId !== undefined && node.nodeId !== null) return node.nodeId;
  return 'n/a';
}

function svgEl(tag, attrs = {}) {
  const el = document.createElementNS(SVG_NS, tag);
  Object.entries(attrs).forEach(([k, v]) => el.setAttribute(k, String(v)));
  return el;
}

function resolveGraphOrder(nodes) {
  const sorted = [...nodes].sort((a, b) => Number(a.nodeId) - Number(b.nodeId));
  const leaderIdx = sorted.findIndex((n) => String(n.role || '').toUpperCase() === 'LEADER');
  if (leaderIdx > 0) {
    const [leader] = sorted.splice(leaderIdx, 1);
    sorted.unshift(leader);
  }
  return sorted;
}

function renderTriangleGraph(container, nodes, selfNodeId) {
  container.innerHTML = '';

  if (!Array.isArray(nodes) || !nodes.length) {
    const empty = document.createElement('p');
    empty.className = 'aeron-raft-graph-empty';
    empty.textContent = 'No cluster nodes available.';
    container.append(empty);
    return;
  }

  const graphNodes = resolveGraphOrder(nodes).slice(0, 3);
  const positions = [
    { x: 300, y: 78 },
    { x: 145, y: 260 },
    { x: 455, y: 260 },
  ];

  const wrap = document.createElement('div');
  wrap.className = 'aeron-raft-graph-wrap';

  const svg = svgEl('svg', {
    viewBox: '0 0 600 340',
    class: 'aeron-raft-graph',
    role: 'img',
    'aria-label': 'Aeron cluster topology graph',
  });

  [[0, 1], [1, 2], [0, 2]].forEach(([a, b]) => {
    if (!graphNodes[a] || !graphNodes[b]) return;
    const active = graphNodes[a].reachable !== false && graphNodes[b].reachable !== false;
    svg.append(svgEl('line', {
      x1: positions[a].x,
      y1: positions[a].y,
      x2: positions[b].x,
      y2: positions[b].y,
      class: `aeron-raft-edge ${active ? 'is-active' : 'is-muted'}`,
    }));
  });

  graphNodes.forEach((node, idx) => {
    const pos = positions[idx];
    const group = svgEl('g', {
      class: `aeron-raft-node-dot ${String(node.role || '').toUpperCase() === 'LEADER' ? 'is-leader' : 'is-follower'} ${Number(node.nodeId) === selfNodeId ? 'is-self' : ''}`,
      transform: `translate(${pos.x}, ${pos.y})`,
    });

    group.append(svgEl('circle', { r: 40, class: 'dot-bg' }));
    group.append(svgEl('circle', { r: 40, class: 'dot-border' }));

    const label = svgEl('text', { x: 0, y: -6, class: 'dot-label' });
    label.textContent = `Node ${displayNodeId(node)}`;
    group.append(label);

    const role = svgEl('text', { x: 0, y: 14, class: 'dot-role' });
    role.textContent = String(node.role || 'UNKNOWN');
    group.append(role);

    svg.append(group);
  });

  wrap.append(svg);
  container.append(wrap);
}

export default function decorate(block) {
  const runtime = getOpsRuntimeConfig();
  const config = readBlockConfig(block);
  const apiBase = readConfig(config, 'api-base', 'apiBase') || runtime.apiBase;
  const refreshSeconds = Number(readConfig(config, 'refresh-seconds', 'refreshSeconds') || runtime.refreshSeconds.raftCluster);
  const selfNodeId = Number(readConfig(config, 'self-node-id', 'selfNodeId') || runtime.defaults.selfNodeId);

  const clusterEndpoint = readConfig(config, 'cluster-endpoint', 'clusterEndpoint') || runtime.endpoints.cluster;
  const raftEndpoint = readConfig(config, 'raft-endpoint', 'raftEndpoint') || runtime.endpoints.raft;
  const overviewEndpoint = readConfig(config, 'overview-endpoint', 'overviewEndpoint') || runtime.endpoints.overview;

  const shell = document.createElement('div');
  shell.className = 'aeron-raft-shell';

  const meta = document.createElement('p');
  meta.className = 'aeron-raft-meta';
  meta.textContent = `Polling ${apiBase} every ${refreshSeconds}s`;

  const stats = document.createElement('div');
  stats.className = 'aeron-raft-stats';

  const graph = document.createElement('div');
  graph.className = 'aeron-raft-graph-container';

  const nodes = document.createElement('div');
  nodes.className = 'aeron-raft-nodes';

  shell.append(meta, stats, graph, nodes);
  block.replaceChildren(shell);

  async function refresh() {
    try {
      const [clusterRes, raftRes, overviewRes] = await Promise.all([
        fetch(buildUrl(apiBase, clusterEndpoint), { headers: { Accept: 'application/json' } }),
        fetch(buildUrl(apiBase, raftEndpoint), { headers: { Accept: 'application/json' } }),
        fetch(buildUrl(apiBase, overviewEndpoint), { headers: { Accept: 'application/json' } }),
      ]);

      if (!clusterRes.ok || !raftRes.ok || !overviewRes.ok) {
        throw new Error(`cluster=${clusterRes.status} raft=${raftRes.status} overview=${overviewRes.status}`);
      }

      const cluster = unwrapEnvelope(await clusterRes.json());
      const raft = unwrapEnvelope(await raftRes.json());
      const overview = unwrapEnvelope(await overviewRes.json());

      const term = raft.term ?? cluster.term ?? 'n/a';
      const leaderNodeId = cluster.leaderNodeId ?? 'n/a';
      const nodeCount = Array.isArray(cluster.nodes) ? cluster.nodes.length : 0;
      const quorum = overview?.cluster?.quorum ?? 'n/a';

      stats.innerHTML = '';
      const statItems = [
        `Term: ${term}`,
        `Leader: Node ${leaderNodeId}`,
        `Nodes: ${nodeCount}`,
        `Quorum: ${quorum}`,
      ];
      statItems.forEach((text) => {
        const item = document.createElement('p');
        item.className = 'aeron-raft-stat';
        item.textContent = text;
        stats.append(item);
      });

      renderTriangleGraph(graph, cluster.nodes || [], selfNodeId);

      nodes.innerHTML = '';
      (cluster.nodes || []).forEach((node) => {
        const card = document.createElement('article');
        card.className = 'aeron-raft-node';

        const role = String(node.role || '').toUpperCase();
        if (role === 'LEADER') card.classList.add('is-leader');
        if (Number(node.nodeId) === selfNodeId) card.classList.add('is-self');

        const header = document.createElement('p');
        header.className = 'aeron-raft-node-title';
        header.textContent = `Node ${displayNodeId(node)} - ${role || 'UNKNOWN'}`;

        const wallet = document.createElement('p');
        wallet.className = 'aeron-raft-node-wallet';
        wallet.textContent = shortWallet(node.wallet);

        const status = document.createElement('p');
        status.className = 'aeron-raft-node-status';
        status.textContent = `status=${node.status || 'unknown'} reachable=${node.reachable ? 'yes' : 'no'} port=${node.port || 'n/a'}`;

        card.append(header, wallet, status);
        nodes.append(card);
      });
    } catch (error) {
      stats.innerHTML = '';
      graph.innerHTML = '';
      nodes.innerHTML = '';
      const fail = document.createElement('p');
      fail.className = 'aeron-raft-fail';
      fail.textContent = `Cluster unavailable: ${error.message}`;
      stats.append(fail);
    }
  }

  refresh();
  window.setInterval(refresh, Math.max(1, refreshSeconds) * 1000);
}
