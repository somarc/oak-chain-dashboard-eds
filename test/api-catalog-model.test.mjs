import test from 'node:test';
import assert from 'node:assert/strict';

import { buildCatalogSections } from '../tools/api-catalog/catalog-model.mjs';

test('catalog sections only include governed GET source endpoints', () => {
  const sections = buildCatalogSections({
    endpoints: [
      { method: 'GET', path: '/v1/explorer/summary', surfaceClass: 'source', category: 'Explorer' },
      { method: 'GET', path: '/v1/config/osgi', surfaceClass: 'source', category: 'Configuration' },
      { method: 'POST', path: '/v1/propose-write', surfaceClass: 'internal', category: 'Consensus' },
      { method: 'GET', path: '/api/explore', surfaceClass: 'local-diagnostic', category: 'Explorer' },
    ],
  });

  assert.equal(sections.length, 2);
  assert.deepEqual(sections.map((section) => section.category), ['Configuration', 'Explorer']);
  assert.equal(sections[0].count, 1);
  assert.equal(sections[1].count, 1);
  assert.equal(sections[1].items[0].path, '/v1/explorer/summary');
});
