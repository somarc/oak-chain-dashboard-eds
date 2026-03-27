import { initDashboardShell, fetchEndpoint, runtime } from '../shell.js';

function endpoint(template, values = {}) {
  return Object.entries(values).reduce(
    (resolved, [key, value]) => resolved.replace(`{${key}}`, encodeURIComponent(value)),
    template,
  );
}

function renderSummary(summary = {}, network = {}) {
  const queue = summary.queue?.compact || {};
  const cluster = summary.cluster || {};
  const localCluster = network.localCluster || {};
  return `
    <div class="summary-grid">
      <article class="summary-card"><p class="label">Consensus</p><p class="value">${cluster.clusterState || '--'}</p></article>
      <article class="summary-card"><p class="label">Role</p><p class="value">${cluster.role || '--'}</p></article>
      <article class="summary-card"><p class="label">Reachable Validators</p><p class="value">${cluster.reachableValidators ?? '--'}</p></article>
      <article class="summary-card"><p class="label">Pending Queue</p><p class="value">${queue.queuePending ?? '--'}</p></article>
      <article class="summary-card"><p class="label">Release Mode</p><p class="value">${queue.releaseMode || '--'}</p></article>
      <article class="summary-card"><p class="label">Authority Plane</p><p class="value">${localCluster.displayName || 'Local cluster'}</p></article>
    </div>
  `;
}

function setJson(id, payload) {
  const element = document.getElementById(id);
  if (element) {
    element.innerHTML = `<pre>${JSON.stringify(payload, null, 2)}</pre>`;
  }
}

async function loadProposal() {
  const proposalId = document.getElementById('proposal-input').value.trim();
  if (!proposalId) return;
  const payload = await fetchEndpoint(endpoint(runtime.endpoints.explorerProposal, { proposalId }));
  setJson('proposal-detail', payload);
}

async function loadWallet() {
  const walletAddress = document.getElementById('wallet-input').value.trim();
  if (!walletAddress) return;
  const payload = await fetchEndpoint(
    endpoint(runtime.endpoints.explorerWallet, { walletAddress }),
  );
  setJson('wallet-detail', payload);
}

async function init() {
  await initDashboardShell({ activeNav: 'block-explorer' });
  document.getElementById('wallet-input').value = runtime.defaults.gcWallet || '';

  const hero = document.getElementById('explorer-hero');
  const summaryElement = document.getElementById('explorer-summary');

  try {
    const [summary, releaseFlow, network] = await Promise.all([
      fetchEndpoint(runtime.endpoints.explorerSummary),
      fetchEndpoint(runtime.endpoints.explorerReleaseFlow),
      fetchEndpoint(runtime.endpoints.network),
    ]);

    hero.innerHTML = `
      <p class="card-kicker">Governed Explorer</p>
      <h2>Block Explorer</h2>
      <p class="card-body">
        Summary, proposal detail, wallet detail, and release-flow diagnostics are now driven through the edge-owned explorer contract instead of inline validator HTML.
      </p>
    `;
    summaryElement.innerHTML = renderSummary(summary, network);
    setJson('release-detail', releaseFlow);
  } catch (error) {
    hero.innerHTML = `
      <p class="card-kicker">Governed Explorer</p>
      <h2>Block Explorer</h2>
      <p class="card-body">${error.message}</p>
    `;
  }

  document.getElementById('proposal-load').addEventListener('click', () => {
    loadProposal().catch((error) => setJson('proposal-detail', { error: error.message }));
  });
  document.getElementById('wallet-load').addEventListener('click', () => {
    loadWallet().catch((error) => setJson('wallet-detail', { error: error.message }));
  });
}

if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', init, { once: true });
} else {
  init();
}
