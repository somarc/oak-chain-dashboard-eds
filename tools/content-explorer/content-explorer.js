/* eslint-disable import/no-unresolved, import/no-absolute-path */
/* eslint-disable import/extensions, no-use-before-define */

import {
  buildUrl,
  fetchEndpoint,
  runtime,
  runtimePresentation,
} from '../shell.js';
import {
  buildScopeFacts,
  defaultContentSelection,
  describeAuthority,
  describeFreshness,
  formatPropertyValue,
} from './content-explorer-model.mjs';

const state = {
  nav: null,
  selection: null,
  tree: null,
  node: null,
  provenance: null,
  activeTab: 'properties',
};

function escapeHtml(value) {
  return String(value ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

function asArray(value) {
  return Array.isArray(value) ? value : [];
}

function endpoint(template, values = {}) {
  return Object.entries(values).reduce(
    (resolved, [key, value]) => resolved.replace(`{${key}}`, encodeURIComponent(value)),
    template,
  );
}

function withPath(template, values, path) {
  return `${endpoint(template, values)}?path=${encodeURIComponent(path)}`;
}

function pathLeaf(path = '/') {
  const segments = String(path || '/').split('/').filter(Boolean);
  return segments.length > 0 ? segments[segments.length - 1] : '/';
}

function toTimestampMs(value) {
  if (typeof value === 'number' && Number.isFinite(value)) return value;
  if (typeof value === 'string' && /^\d+$/.test(value)) {
    return Number(value);
  }
  const parsed = Date.parse(String(value || ''));
  return Number.isFinite(parsed) ? parsed : null;
}

function formatTimestamp(value) {
  const timestamp = toTimestampMs(value);
  if (timestamp === null) return value ? String(value) : '--';
  return new Date(timestamp).toISOString();
}

function formatRelativeTime(value) {
  const timestamp = toTimestampMs(value);
  if (timestamp === null) return '--';
  const deltaMs = Date.now() - timestamp;
  const absDelta = Math.abs(deltaMs);
  const minute = 60 * 1000;
  const hour = 60 * minute;
  const day = 24 * hour;

  if (absDelta < minute) return 'just now';
  if (absDelta < hour) return `${Math.round(absDelta / minute)}m ago`;
  if (absDelta < day) return `${Math.round(absDelta / hour)}h ago`;
  return `${Math.round(absDelta / day)}d ago`;
}

function formatCount(value, fallback = '--') {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed.toLocaleString() : fallback;
}

function toneClass(tone) {
  if (tone === 'local') return 'is-local';
  if (tone === 'mounted') return 'is-mounted';
  if (tone === 'outer') return 'is-outer';
  if (tone === 'danger') return 'is-danger';
  return 'is-pending';
}

function runtimeModeClass(mode) {
  if (mode === 'live') return 'is-live';
  if (mode === 'mock') return 'is-mock';
  return 'is-pending';
}

function activeSelection(clusterId, path) {
  return (
    state.selection?.clusterId === clusterId
    && state.selection?.path === path
  );
}

function renderEmpty(message) {
  return `<div class="empty-state">${escapeHtml(message)}</div>`;
}

function renderErrorState(message) {
  return `<div class="error-state">${escapeHtml(message)}</div>`;
}

function icon(name) {
  const common = 'viewBox="0 0 24 24" role="presentation"';
  if (name === 'chevron-right') {
    return `<svg ${common}><path d="m9 18 6-6-6-6"/></svg>`;
  }
  if (name === 'chevron-down') {
    return `<svg ${common}><path d="m6 9 6 6 6-6"/></svg>`;
  }
  if (name === 'home') {
    return `<svg ${common}><path d="m3 9 9-7 9 7"/><path d="M9 22v-8h6v8"/></svg>`;
  }
  if (name === 'database') {
    return `<svg ${common}><ellipse cx="12" cy="5" rx="8" ry="3"/><path d="M4 5v14c0 1.7 3.6 3 8 3s8-1.3 8-3V5"/><path d="M4 12c0 1.7 3.6 3 8 3s8-1.3 8-3"/></svg>`;
  }
  if (name === 'wallet') {
    return `<svg ${common}><path d="M3 7h15a2 2 0 0 1 2 2v8a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V7Z"/><path d="M16 12h4"/><path d="M18 10v4"/></svg>`;
  }
  if (name === 'cube') {
    return `<svg ${common}><path d="M12 2.5 4 7v10l8 4.5 8-4.5V7l-8-4.5Z"/><path d="M4 7 12 11.5 20 7"/><path d="M12 22V11.5"/></svg>`;
  }
  return `<svg ${common}><path d="M4 5h6l2 2h8v12H4z"/></svg>`;
}

function treeIcon(kind) {
  if (kind === 'root') return icon('home');
  if (kind === 'cluster') return icon('database');
  if (kind === 'wallet') return icon('wallet');
  if (kind === 'leaf') return icon('cube');
  return icon('folder');
}

function deriveBreadcrumbs(tree = {}) {
  const path = String(tree.path || '/');
  const segments = path.split('/').filter(Boolean);
  return segments.map((segment, index) => ({
    label: segment,
    path: `/${segments.slice(0, index + 1).join('/')}`,
  }));
}

function propertyType(property = {}) {
  const base = String(property.type || 'unknown');
  return property.multiValued ? `${base}[]` : base;
}

function propertyIcon(property = {}) {
  const name = String(property.name || '').toLowerCase();
  if (name.startsWith('jcr:')) return icon('database');
  if (name.includes('wallet')) return icon('wallet');
  return icon('cube');
}

function renderTreeRow({
  clusterId,
  path,
  label,
  depth = 0,
  active = false,
  meta = '',
  kind = 'folder',
  expandable = true,
}) {
  let chevron = '<span class="tree-chevron"></span>';
  if (expandable) {
    chevron = active ? icon('chevron-down') : icon('chevron-right');
  }

  return `
    <button
      class="tree-row ${active ? 'is-active' : ''}"
      type="button"
      style="--tree-depth:${depth};"
      data-cluster-id="${escapeHtml(clusterId || '')}"
      data-path="${escapeHtml(path || '/oak-chain')}"
    >
      <span class="tree-node-main">
        <span class="tree-chevron">${chevron}</span>
        <span class="tree-kind-${escapeHtml(kind)}">${treeIcon(kind)}</span>
        <span>${escapeHtml(label)}</span>
      </span>
      ${meta ? `<span class="tree-meta">${escapeHtml(meta)}</span>` : ''}
    </button>
  `;
}

function renderClusterRows(cluster, { includeWorkspaceRoot = false } = {}) {
  const clusterId = cluster.clusterId || '';
  const browseRoot = cluster.browseRoot || cluster.roots?.[0]?.path || '/oak-chain';
  const rows = [];
  const isActiveCluster = state.selection?.clusterId === clusterId;

  if (includeWorkspaceRoot) {
    rows.push(renderTreeRow({
      clusterId,
      path: browseRoot,
      label: '/',
      depth: 0,
      active: activeSelection(clusterId, browseRoot),
      meta: '',
      kind: 'root',
    }));
  }

  rows.push(renderTreeRow({
    clusterId,
    path: browseRoot,
    label: pathLeaf(browseRoot),
    depth: includeWorkspaceRoot ? 0 : 1,
    active: activeSelection(clusterId, browseRoot),
    meta: cluster.readOnly ? 'read-only' : cluster.ownedPrefixes || '',
    kind: 'cluster',
  }));

  if (!isActiveCluster || !state.tree) {
    return rows.join('');
  }

  const breadcrumbs = deriveBreadcrumbs(state.tree).filter((crumb) => crumb.path !== browseRoot);
  breadcrumbs.forEach((crumb, index) => {
    const { label } = crumb;
    const kind = label === 'wallet' ? 'wallet' : 'folder';
    rows.push(renderTreeRow({
      clusterId,
      path: crumb.path,
      label,
      depth: index + 1 + (includeWorkspaceRoot ? 1 : 2),
      active: activeSelection(clusterId, crumb.path),
      meta: '',
      kind,
      expandable: true,
    }));
  });

  asArray(state.tree.children).forEach((child) => {
    const label = child.name || pathLeaf(child.path || browseRoot);
    const kind = child.hasChildren ? 'folder' : 'leaf';
    const active = activeSelection(clusterId, child.path || browseRoot);
    const meta = child.hasChildren
      ? `${formatCount(child.childCount, '0')} children`
      : child.primaryType || '';
    rows.push(renderTreeRow({
      clusterId,
      path: child.path || browseRoot,
      label,
      depth: breadcrumbs.length + 2 + (includeWorkspaceRoot ? 1 : 2),
      active,
      meta,
      kind,
      expandable: child.hasChildren,
    }));
  });

  return rows.join('');
}

function renderMountedRows(cluster) {
  if (state.selection?.clusterId === cluster.clusterId && state.tree) {
    return renderClusterRows(cluster);
  }

  const browseRoot = cluster.browseRoot || cluster.roots?.[0]?.path || '/oak-chain';
  const clusterId = cluster.clusterId || '';
  return renderTreeRow({
    clusterId,
    path: browseRoot,
    label: cluster.displayName || cluster.clusterId || pathLeaf(browseRoot),
    depth: 0,
    active: false,
    meta: cluster.mountPath || browseRoot,
    kind: 'folder',
  });
}

function renderTreeSections() {
  const container = document.getElementById('content-tree-sections');

  if (!state.nav) {
    container.innerHTML = renderErrorState('Unable to load explorer topology.');
    return;
  }

  const localCluster = state.nav.localCluster || {};
  const mountedNeighbors = asArray(state.nav.mountedNeighbors);
  const outerNetwork = state.nav.outerNetwork || {};
  const workspaceLabel = state.tree?.cluster?.displayName
    || localCluster.displayName
    || localCluster.clusterId
    || 'default';
  const localMarkup = renderClusterRows(localCluster, { includeWorkspaceRoot: true });
  const mountedMarkup = mountedNeighbors.length > 0
    ? mountedNeighbors.map((cluster) => renderMountedRows(cluster)).join('')
    : renderEmpty('No mounted neighbors available.');
  const outerSummary = outerNetwork.summary || 'Independent clusters remain outside the local consensus plane.';
  document.getElementById('content-workspace-label').textContent = workspaceLabel;

  container.innerHTML = `
    <section class="tree-section">
      <div class="tree-section-label">Local Cluster</div>
      ${localMarkup || renderEmpty('No local cluster roots available.')}
    </section>
    <section class="tree-section">
      <div class="tree-section-label">Mounted Neighbors</div>
      ${mountedMarkup}
    </section>
    <section class="tree-section">
      <div class="tree-section-label">Outer Network</div>
      <article class="tree-info-card">
        <p>${escapeHtml(outerSummary)}</p>
        <div class="tree-summary-meta">
          <div class="tree-metric"><span>Discovery</span><strong>${escapeHtml(outerNetwork.discoveryPlane || '--')}</strong></div>
          <div class="tree-metric"><span>Read Fabric</span><strong>${escapeHtml(outerNetwork.readFabric || '--')}</strong></div>
          <div class="tree-metric"><span>Observed</span><strong>${formatCount(outerNetwork.observedClusterCount)}</strong></div>
          <div class="tree-metric"><span>Mounted</span><strong>${formatCount(outerNetwork.mountedClusterCount)}</strong></div>
        </div>
      </article>
    </section>
  `;

  bindPathButtons(container);
}

function renderPropertiesTable(node = {}) {
  const properties = asArray(node.properties);
  if (properties.length === 0) {
    return renderEmpty('No node properties returned for the selected path.');
  }

  const rows = properties.map((property) => {
    const propertyName = String(property.name || '--');
    const nameClasses = [
      'prop-name',
      propertyName.startsWith('jcr:') ? 'is-system' : '',
      propertyName.toLowerCase().includes('wallet') ? 'is-wallet' : '',
    ].filter(Boolean).join(' ');
    const valueClass = propertyName.startsWith('jcr:') || propertyName.toLowerCase().includes('wallet')
      ? 'prop-value is-strong'
      : 'prop-value';

    return `
      <tr>
        <td>
          <div class="${nameClasses}">
            ${propertyIcon(property)}
            <span>${escapeHtml(propertyName)}</span>
          </div>
        </td>
        <td class="prop-type">${escapeHtml(propertyType(property))}</td>
        <td><div class="${valueClass}">${escapeHtml(formatPropertyValue(property))}</div></td>
      </tr>
    `;
  }).join('');

  return `
    <table class="prop-table">
      <thead>
        <tr>
          <th scope="col">Name</th>
          <th scope="col">Type</th>
          <th scope="col">Value</th>
        </tr>
      </thead>
      <tbody>${rows}</tbody>
    </table>
  `;
}

function renderChildrenTable(tree = {}) {
  const children = asArray(tree.children);
  if (children.length === 0) {
    return renderEmpty('No child nodes are visible for the selected path.');
  }

  return `
    <table class="child-table">
      <thead>
        <tr>
          <th scope="col">Name</th>
          <th scope="col">Type</th>
          <th scope="col">Path</th>
          <th scope="col">Children</th>
          <th scope="col">Props</th>
        </tr>
      </thead>
      <tbody>
        ${children.map((child) => `
          <tr>
            <td>
              <button
                class="child-link"
                type="button"
                data-cluster-id="${escapeHtml(tree.cluster?.clusterId || '')}"
                data-path="${escapeHtml(child.path || tree.path || '/oak-chain')}"
              >
                ${icon(child.hasChildren ? 'folder' : 'cube')}
                <span>${escapeHtml(child.name || 'node')}</span>
              </button>
            </td>
            <td>${escapeHtml(child.primaryType || '--')}</td>
            <td><code>${escapeHtml(child.path || '--')}</code></td>
            <td>${formatCount(child.childCount, '0')}</td>
            <td>${formatCount(child.propertyCount, '0')}</td>
          </tr>
        `).join('')}
      </tbody>
    </table>
  `;
}

function renderNodeMeta(tree = {}, node = {}) {
  const nodeState = node.node || tree.node || {};
  const cluster = tree.cluster || {};
  const items = [
    { label: 'Cluster', value: cluster.displayName || cluster.clusterId || '--' },
    { label: 'Scope', value: cluster.readOnly ? 'Mounted neighbor' : 'Local authority' },
    { label: 'Namespace', value: tree.namespace || tree.authority?.namespace || '--' },
    { label: 'Children', value: formatCount(nodeState.childCount) },
    { label: 'Properties', value: formatCount(nodeState.propertyCount) },
    { label: 'Root', value: cluster.browseRoot || '--' },
  ];

  return items.map((item) => `
    <div class="node-meta-item">
      <span>${escapeHtml(item.label)}</span>
      <strong>${escapeHtml(item.value)}</strong>
    </div>
  `).join('');
}

function renderProvenancePanel(tree = {}, provenance = {}) {
  const authority = describeAuthority(tree, provenance);
  const freshness = describeFreshness(state.nav || {}, tree);
  const scopeFacts = buildScopeFacts(tree, provenance);
  const writeMetadata = provenance.writeMetadata || {};
  const walletAuthority = provenance.walletAuthority || {};
  const recordBlock = writeMetadata.recordId
    || writeMetadata.message
    || writeMetadata.source
    || 'No authoritative validator record is exposed for this node.';

  return `
    <article class="provenance-card">
      <div class="provenance-grid">
        <section class="provenance-block">
          <span class="provenance-block-label">Authority Plane</span>
          <strong>${escapeHtml(authority.label)}</strong>
          <div class="provenance-facts">
            <div class="provenance-item"><span>Write Access</span><strong>${escapeHtml(authority.writeAccess)}</strong></div>
            <div class="provenance-item"><span>Cluster</span><strong>${escapeHtml(tree.cluster?.displayName || tree.cluster?.clusterId || '--')}</strong></div>
            <div class="provenance-item"><span>Namespace</span><strong>${escapeHtml(authority.namespace)}</strong></div>
            <div class="provenance-item"><span>Prefixes</span><strong>${escapeHtml(authority.ownedPrefixes)}</strong></div>
          </div>
        </section>
        <section class="provenance-block">
          <span class="provenance-block-label">Freshness</span>
          <strong>${escapeHtml(freshness.label)}</strong>
          <div class="provenance-facts">
            <div class="provenance-item"><span>State</span><strong>${escapeHtml(freshness.state)}</strong></div>
            <div class="provenance-item"><span>Cache Policy</span><strong>${escapeHtml(freshness.policy)}</strong></div>
            <div class="provenance-item"><span>Invalidation</span><strong>${escapeHtml(freshness.invalidation)}</strong></div>
            <div class="provenance-item"><span>Detail</span><strong>${escapeHtml(freshness.detail)}</strong></div>
          </div>
        </section>
      </div>

      <div class="panel-heading">
        <h2>Validator Lineage</h2>
        <span class="tree-pill ${toneClass(authority.tone)}">${escapeHtml(formatRelativeTime(writeMetadata.timestamp))}</span>
      </div>
      <div class="provenance-grid">
        <div class="provenance-item"><span>Timestamp</span><strong>${escapeHtml(formatTimestamp(writeMetadata.timestamp))}</strong></div>
        <div class="provenance-item"><span>Source Validator</span><strong>${escapeHtml(writeMetadata.validator || '--')}</strong></div>
        <div class="provenance-item"><span>Message</span><strong>${escapeHtml(writeMetadata.message || writeMetadata.source || '--')}</strong></div>
        <div class="provenance-item"><span>Wallet</span><strong>${escapeHtml(walletAuthority.wallet || '--')}</strong></div>
      </div>

      <div class="panel-heading">
        <h2>Record / Signature</h2>
      </div>
      <div class="signature-box">${escapeHtml(recordBlock)}</div>

      <div class="panel-heading">
        <h2>Namespace Context</h2>
      </div>
      <div class="provenance-grid">
        ${scopeFacts.map((fact) => `
          <div class="provenance-item">
            <span>${escapeHtml(fact.label)}</span>
            <strong>${escapeHtml(fact.value)}</strong>
          </div>
        `).join('')}
      </div>
    </article>
  `;
}

function renderJsonPanel(tree, node, provenance) {
  const payload = {
    selection: state.selection,
    tree,
    node,
    provenance,
  };
  document.getElementById('content-json').textContent = JSON.stringify(payload, null, 2);
}

function renderToolbarState(tree = {}, provenance = {}) {
  const authority = describeAuthority(tree, provenance);
  const readOnlyBadge = document.getElementById('content-readonly-badge');
  const runtimeMode = document.getElementById('runtime-mode');

  document.getElementById('runtime-base').textContent = runtime.apiBase || '--';
  runtimeMode.textContent = String(runtimePresentation.mode || 'pending').toUpperCase();
  runtimeMode.className = `runtime-mode ${runtimeModeClass(runtimePresentation.mode)}`;

  readOnlyBadge.className = `toolbar-pill ${toneClass(authority.tone)}`;
  readOnlyBadge.textContent = authority.label;

  const selectionPill = document.getElementById('content-selection-pill');
  selectionPill.className = `status-chip ${toneClass(authority.tone)}`;
  selectionPill.textContent = authority.label;
}

function renderLoading(selection = state.selection) {
  document.getElementById('content-node-title').textContent = 'Node Properties';
  document.getElementById('content-node-summary').textContent = selection?.path
    ? `Loading node state for ${selection.path}.`
    : 'Loading node state.';
  document.getElementById('content-primary-type-badge').textContent = '--';
  document.getElementById('content-node-meta').innerHTML = renderEmpty('Fetching node facts...');
  document.getElementById('content-properties').innerHTML = renderEmpty('Loading properties...');
  document.getElementById('content-children').innerHTML = renderEmpty('Loading child nodes...');
  document.getElementById('content-provenance-panel').innerHTML = renderEmpty('Loading provenance...');
  document.getElementById('content-json').textContent = '';
}

function renderOverview() {
  const localCluster = state.nav?.localCluster || {};
  document.getElementById('content-workspace-label').textContent = state.tree?.cluster?.displayName
    || localCluster.displayName
    || localCluster.clusterId
    || 'default';
}

function renderDetail(tree, node, provenance) {
  const authority = describeAuthority(tree, provenance);
  const primaryType = node.primaryType || tree.node?.primaryType || '--';
  const summary = `${authority.summary} Selected path: ${tree.path || '/oak-chain'}.`;
  const updatedLabel = `Updated ${new Date().toLocaleTimeString([], {
    hour: 'numeric',
    minute: '2-digit',
  })}`;

  document.getElementById('content-node-title').textContent = pathLeaf(tree.path || '/oak-chain');
  document.getElementById('content-node-summary').textContent = summary;
  document.getElementById('content-primary-type-badge').textContent = primaryType;
  document.getElementById('content-current-path').value = tree.path || state.selection?.path || '/oak-chain';
  document.getElementById('last-updated').textContent = updatedLabel;
  document.getElementById('content-node-meta').innerHTML = renderNodeMeta(tree, node);
  document.getElementById('content-properties').innerHTML = renderPropertiesTable(node);
  document.getElementById('content-children').innerHTML = renderChildrenTable(tree);
  document.getElementById('content-provenance-panel').innerHTML = renderProvenancePanel(tree, provenance);
  renderJsonPanel(tree, node, provenance);
  renderToolbarState(tree, provenance);
  renderOverview();
  renderTreeSections();
  bindPathButtons(document.getElementById('content-children'));
}

function renderError(error) {
  const message = error?.message || 'Content explorer request failed.';
  document.getElementById('content-node-summary').textContent = message;
  document.getElementById('content-node-meta').innerHTML = renderErrorState('Node facts unavailable.');
  document.getElementById('content-properties').innerHTML = renderErrorState(message);
  document.getElementById('content-children').innerHTML = renderErrorState(message);
  document.getElementById('content-provenance-panel').innerHTML = renderErrorState(message);
  document.getElementById('content-json').textContent = JSON.stringify({ error: message }, null, 2);
  document.getElementById('content-readonly-badge').className = 'toolbar-pill is-danger';
  document.getElementById('content-readonly-badge').textContent = 'Request failed';
}

async function loadNav() {
  state.nav = await fetchEndpoint(runtime.endpoints.explorerContentNav);
  renderOverview();
  renderTreeSections();
  return state.nav;
}

async function loadSelection(selection) {
  state.selection = selection;
  renderTreeSections();
  renderLoading(selection);

  const [tree, node, provenance] = await Promise.all([
    fetchEndpoint(
      withPath(
        runtime.endpoints.explorerContentTree,
        { clusterId: selection.clusterId },
        selection.path,
      ),
    ),
    fetchEndpoint(
      withPath(
        runtime.endpoints.explorerContentNode,
        { clusterId: selection.clusterId },
        selection.path,
      ),
    ),
    fetchEndpoint(
      withPath(
        runtime.endpoints.explorerContentProvenance,
        { clusterId: selection.clusterId },
        selection.path,
      ),
    ),
  ]);

  state.tree = tree;
  state.node = node;
  state.provenance = provenance;
  renderDetail(tree, node, provenance);
}

async function refreshTopology({ preserveSelection = true } = {}) {
  const nav = await loadNav();
  const fallbackSelection = defaultContentSelection(nav);
  const selection = preserveSelection
    ? state.selection || fallbackSelection
    : fallbackSelection;

  if (!selection) {
    document.getElementById('content-node-summary').textContent = 'No cluster roots available.';
    document.getElementById('content-properties').innerHTML = renderEmpty('No cluster roots available.');
    document.getElementById('content-children').innerHTML = renderEmpty('No cluster roots available.');
    document.getElementById('content-provenance-panel').innerHTML = renderEmpty('No cluster roots available.');
    return;
  }

  await loadSelection(selection);
}

function bindPathButtons(container) {
  if (!container) return;
  container.querySelectorAll('[data-cluster-id][data-path]').forEach((button) => {
    button.addEventListener('click', () => {
      loadSelection({
        clusterId: button.dataset.clusterId,
        path: button.dataset.path,
      }).catch(renderError);
    });
  });
}

function setActiveTab(nextTab) {
  state.activeTab = nextTab;
  document.querySelectorAll('.content-tab').forEach((button) => {
    const isActive = button.dataset.tab === nextTab;
    button.classList.toggle('is-active', isActive);
    button.setAttribute('aria-selected', isActive ? 'true' : 'false');
  });
  document.querySelectorAll('.content-panel-view').forEach((panel) => {
    panel.classList.toggle('is-hidden', panel.dataset.panel !== nextTab);
  });
}

function bindTabs() {
  document.querySelectorAll('.content-tab').forEach((button) => {
    button.addEventListener('click', () => setActiveTab(button.dataset.tab || 'properties'));
  });
}

function currentSelectionPath() {
  return document.getElementById('content-current-path').value.trim() || state.selection?.path || '/oak-chain';
}

function currentClusterId() {
  return state.selection?.clusterId
    || state.tree?.cluster?.clusterId
    || state.nav?.localCluster?.clusterId;
}

function bindToolbar() {
  document.getElementById('action-refresh').addEventListener('click', () => {
    refreshTopology().catch(renderError);
  });

  document.getElementById('action-browse-root').addEventListener('click', () => {
    const clusterId = currentClusterId();
    const currentCluster = state.tree?.cluster
      || asArray(state.nav?.mountedNeighbors).find((cluster) => cluster.clusterId === clusterId)
      || state.nav?.localCluster
      || {};
    const browseRoot = currentCluster.browseRoot || '/oak-chain';
    if (!clusterId) return;
    loadSelection({ clusterId, path: browseRoot }).catch(renderError);
  });

  document.getElementById('action-copy-path').addEventListener('click', async () => {
    const path = currentSelectionPath();
    if (!navigator.clipboard?.writeText) return;
    try {
      await navigator.clipboard.writeText(path);
    } catch {
      document.getElementById('action-copy-path').title = 'Copy unavailable';
    }
  });

  document.getElementById('action-open-path').addEventListener('click', () => {
    const clusterId = currentClusterId();
    if (!clusterId) return;
    const path = currentSelectionPath();
    const url = buildUrl(
      runtime.apiBase,
      withPath(runtime.endpoints.explorerContentNode, { clusterId }, path),
    );
    if (url) window.open(url, '_blank', 'noopener');
  });

  document.getElementById('content-current-path').addEventListener('keydown', (event) => {
    if (event.key !== 'Enter') return;
    event.preventDefault();
    const clusterId = currentClusterId();
    if (!clusterId) return;
    loadSelection({ clusterId, path: currentSelectionPath() }).catch(renderError);
  });
}

async function init() {
  bindTabs();
  bindToolbar();
  setActiveTab(state.activeTab);
  document.getElementById('runtime-base').textContent = runtime.apiBase || '--';
  document.getElementById('runtime-mode').textContent = String(runtimePresentation.mode || 'pending').toUpperCase();
  document.getElementById('runtime-mode').className = `runtime-mode ${runtimeModeClass(runtimePresentation.mode)}`;

  try {
    await refreshTopology({ preserveSelection: false });
  } catch (error) {
    renderTreeSections();
    renderError(error);
  }
}

if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', init, { once: true });
} else {
  init();
}
