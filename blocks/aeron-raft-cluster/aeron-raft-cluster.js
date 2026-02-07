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

function shortPublicKey(value) {
  if (!value || typeof value !== 'string') return null;
  const normalized = value.startsWith('0x') ? value : `0x${value}`;
  if (normalized.length < 18) return normalized;
  return `${normalized.slice(0, 10)}...${normalized.slice(-8)}`;
}

function resolveNodeIdentity(node) {
  if (!node || typeof node !== 'object') return 'unknown';
  const wallet = node.wallet
    || node.walletAddress
    || node.validatorWallet
    || (node.validatorIdentity && node.validatorIdentity.walletAddress)
    || null;
  if (wallet) return shortWallet(wallet);

  const pubKey = node.publicKey
    || node.validatorPublicKey
    || (node.validatorIdentity && node.validatorIdentity.publicKey)
    || null;
  const shortenedKey = shortPublicKey(pubKey);
  if (shortenedKey) return shortenedKey;

  return 'unknown';
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

function buildGraphLayout(count) {
  if (count <= 3) {
    return {
      viewBox: '0 0 600 340',
      positions: [
        { x: 300, y: 78 },
        { x: 145, y: 260 },
        { x: 455, y: 260 },
      ].slice(0, count),
    };
  }

  if (count === 5) {
    return {
      viewBox: '0 0 760 430',
      positions: [
        { x: 380, y: 72 },
        { x: 185, y: 175 },
        { x: 575, y: 175 },
        { x: 255, y: 330 },
        { x: 505, y: 330 },
      ],
    };
  }

  const cx = 420;
  const cy = 220;
  const radius = Math.max(130, Math.min(190, 250 - (count * 4)));
  const positions = [];
  for (let i = 0; i < count; i += 1) {
    const angle = (-Math.PI / 2) + ((2 * Math.PI * i) / count);
    positions.push({
      x: cx + (Math.cos(angle) * radius),
      y: cy + (Math.sin(angle) * radius),
    });
  }
  return {
    viewBox: '0 0 840 440',
    positions,
  };
}

function buildEdges(graphNodes) {
  const n = graphNodes.length;
  const edges = [];
  if (n <= 1) return edges;

  if (n <= 3) {
    for (let i = 0; i < n; i += 1) {
      for (let j = i + 1; j < n; j += 1) {
        edges.push([i, j, 'mesh']);
      }
    }
    return edges;
  }

  for (let i = 0; i < n; i += 1) {
    edges.push([i, (i + 1) % n, 'ring']);
  }

  const leaderIdx = graphNodes.findIndex((node) => String(node.role || '').toUpperCase() === 'LEADER');
  if (leaderIdx >= 0) {
    for (let i = 0; i < n; i += 1) {
      if (i !== leaderIdx) edges.push([leaderIdx, i, 'leader-link']);
    }
  }

  return edges;
}

function renderTopologyGraph(container, nodes, selfNodeId) {
  container.innerHTML = '';

  if (!Array.isArray(nodes) || !nodes.length) {
    const empty = document.createElement('p');
    empty.className = 'aeron-raft-graph-empty';
    empty.textContent = 'No cluster nodes available.';
    container.append(empty);
    return;
  }

  const graphNodes = resolveGraphOrder(nodes);
  const { viewBox, positions } = buildGraphLayout(graphNodes.length);
  const dotRadius = graphNodes.length >= 6 ? 28 : (graphNodes.length >= 5 ? 32 : 40);

  const wrap = document.createElement('div');
  wrap.className = 'aeron-raft-graph-wrap';
  if (graphNodes.length > 3) wrap.classList.add('is-multi');

  const svg = svgEl('svg', {
    viewBox,
    class: `aeron-raft-graph size-${graphNodes.length}`,
    role: 'img',
    'aria-label': 'Aeron cluster topology graph',
  });

  buildEdges(graphNodes).forEach(([a, b, kind]) => {
    const active = graphNodes[a].reachable !== false && graphNodes[b].reachable !== false;
    svg.append(svgEl('line', {
      x1: positions[a].x,
      y1: positions[a].y,
      x2: positions[b].x,
      y2: positions[b].y,
      class: `aeron-raft-edge ${active ? 'is-active' : 'is-muted'} ${kind}`,
    }));
  });

  graphNodes.forEach((node, idx) => {
    const pos = positions[idx];
    const group = svgEl('g', {
      class: `aeron-raft-node-dot ${String(node.role || '').toUpperCase() === 'LEADER' ? 'is-leader' : 'is-follower'} ${Number(node.nodeId) === selfNodeId ? 'is-self' : ''}`,
      transform: `translate(${pos.x}, ${pos.y})`,
    });

    group.append(svgEl('circle', { r: dotRadius, class: 'dot-bg' }));
    group.append(svgEl('circle', { r: dotRadius, class: 'dot-border' }));

    const label = svgEl('text', { x: 0, y: -5, class: 'dot-label' });
    label.textContent = `Node ${displayNodeId(node)}`;
    group.append(label);

    const role = svgEl('text', { x: 0, y: 12, class: 'dot-role' });
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

      renderTopologyGraph(graph, cluster.nodes || [], selfNodeId);

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
        wallet.textContent = resolveNodeIdentity(node);

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
