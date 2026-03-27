function comparePaths(left, right) {
  return String(left || '').localeCompare(String(right || ''));
}

export function buildCatalogSections(payload = {}) {
  const endpoints = Array.isArray(payload.endpoints) ? payload.endpoints : [];
  const governedGets = endpoints
    .filter((endpoint) => String(endpoint.method || '').toUpperCase().includes('GET'))
    .filter((endpoint) => String(endpoint.surfaceClass || '') === 'source')
    .sort((left, right) => comparePaths(left.path, right.path));

  const byCategory = new Map();
  governedGets.forEach((endpoint) => {
    const category = String(endpoint.category || 'Other');
    if (!byCategory.has(category)) {
      byCategory.set(category, []);
    }
    byCategory.get(category).push(endpoint);
  });

  return Array.from(byCategory.entries()).map(([category, items]) => ({
    category,
    count: items.length,
    items,
  }));
}
