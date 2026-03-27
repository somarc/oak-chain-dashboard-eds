/* eslint-disable import/extensions */

import { initDashboardShell, fetchEndpoint, runtime } from '../shell.js';
import { buildCatalogSections } from './catalog-model.mjs';

function renderSection(section) {
  return `
    <section class="catalog-section">
      <p class="card-kicker">Category</p>
      <h2>${section.category}</h2>
      <p class="section-meta">${section.count} governed GET route${section.count === 1 ? '' : 's'} surfaced for upstream UX.</p>
      <div class="catalog-endpoints">
        ${section.items.map((endpoint) => `
          <article class="endpoint-card">
            <div class="endpoint-head">
              <strong class="endpoint-path">${endpoint.path}</strong>
              <span class="endpoint-method">${endpoint.method}</span>
            </div>
            <p class="endpoint-description">${endpoint.description || 'No description provided.'}</p>
            <p class="endpoint-replacement">${endpoint.replacement || 'No edge mapping published yet.'}</p>
          </article>
        `).join('')}
      </div>
    </section>
  `;
}

async function init() {
  await initDashboardShell({ activeNav: 'api-catalog' });

  const hero = document.getElementById('catalog-hero');
  const sectionsElement = document.getElementById('catalog-sections');

  try {
    const payload = await fetchEndpoint(runtime.endpoints.apiIndex);
    const sections = buildCatalogSections(payload);
    hero.innerHTML = `
      <p class="card-kicker">Governed Browser Contract</p>
      <h2>Read-Only API Catalog</h2>
      <p class="card-body">
        This catalog is derived from the validator-native <code>/v1/index</code> surface and filtered down to governed, browser-safe GET routes only. It replaces the old inline tester with a route inventory that upstream UX can depend on.
      </p>
      <div class="catalog-meta">
        <span class="catalog-chip">Derived From ${payload.derivedFrom || '/v1/index'}</span>
        <span class="catalog-chip">${payload.count || 0} Governed Routes</span>
        <span class="catalog-chip">${payload.surfaceRole || 'edge-governed'}</span>
      </div>
    `;
    sectionsElement.innerHTML = sections.length
      ? sections.map(renderSection).join('')
      : '<p class="empty-state">No governed GET routes were returned.</p>';
  } catch (error) {
    hero.innerHTML = `
      <p class="card-kicker">Governed Browser Contract</p>
      <h2>Read-Only API Catalog</h2>
      <p class="card-body">The catalog is unavailable right now.</p>
    `;
    sectionsElement.innerHTML = `<p class="empty-state">${error.message}</p>`;
  }
}

if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', init, { once: true });
} else {
  init();
}
