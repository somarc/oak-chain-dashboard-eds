function asArray(value) {
  return Array.isArray(value) ? value : [];
}

function asFiniteNumber(value) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
}

function formatDuration(ms) {
  const value = asFiniteNumber(ms);
  if (value === null || value <= 0) return '--';
  if (value < 1000) return `${value} ms`;
  if (value < 60 * 1000) return `${Math.round(value / 1000)}s`;
  if (value < 60 * 60 * 1000) return `${Math.round(value / (60 * 1000))}m`;
  if (value <= 24 * 60 * 60 * 1000) return `${Math.round(value / (60 * 60 * 1000))}h`;
  return `${Math.round(value / (24 * 60 * 60 * 1000))}d`;
}

export function buildContentSections(nav = {}) {
  const localCluster = nav.localCluster || null;
  const mountedNeighbors = asArray(nav.mountedNeighbors);
  const outerNetwork = nav.outerNetwork || null;

  return [
    {
      key: 'local',
      title: 'Local Cluster',
      kind: 'clusters',
      items: localCluster ? [localCluster] : [],
    },
    {
      key: 'mounted',
      title: 'Mounted Neighbors',
      kind: 'clusters',
      items: mountedNeighbors,
    },
    {
      key: 'outer',
      title: 'Outer Network',
      kind: 'summary',
      items: outerNetwork ? [outerNetwork] : [],
    },
  ];
}

export function defaultContentSelection(nav = {}) {
  const localRoots = asArray(nav.localCluster?.roots);
  if (localRoots.length > 0) {
    return {
      clusterId: nav.localCluster.clusterId,
      path: localRoots[0].path || '/oak-chain',
      readOnly: Boolean(nav.localCluster.readOnly),
    };
  }

  const mounted = asArray(nav.mountedNeighbors);
  const firstMounted = mounted.find((cluster) => asArray(cluster.roots).length > 0);
  if (firstMounted) {
    return {
      clusterId: firstMounted.clusterId,
      path: firstMounted.roots[0].path || '/oak-chain',
      readOnly: Boolean(firstMounted.readOnly),
    };
  }

  return null;
}

export function describeAuthority(tree = {}, provenance = {}) {
  const cluster = tree.cluster || {};
  const authority = tree.authority || {};
  const walletAuthority = provenance.walletAuthority || {};
  const isLocal = cluster.authoritative && !cluster.readOnly;
  const isMounted = cluster.readOnly;
  const namespace = authority.namespace || tree.namespace || walletAuthority.scope || '--';
  const ownedPrefixes = cluster.ownedPrefixes || authority.ownedPrefixes || walletAuthority.l1Prefix || '--';

  if (isLocal) {
    return {
      tone: 'local',
      label: 'Local Authoritative',
      writeAccess: 'Permitted (leader-owned namespace)',
      summary: `This node is served from the local authoritative cluster for ${namespace}.`,
      namespace,
      ownedPrefixes,
    };
  }

  if (isMounted) {
    return {
      tone: 'mounted',
      label: 'Mounted Read-Only',
      writeAccess: 'Blocked (mounted neighbor)',
      summary: `This subtree is mounted from ${cluster.displayName || cluster.clusterId || 'a remote cluster'} and is visible through the read fabric only.`,
      namespace,
      ownedPrefixes,
    };
  }

  return {
    tone: 'outer',
    label: 'Observed Remote',
    writeAccess: 'Unavailable',
    summary: 'This content is outside the local write authority plane.',
    namespace,
    ownedPrefixes,
  };
}

export function describeFreshness(nav = {}, tree = {}) {
  const cluster = tree.cluster || {};
  const cacheHints = nav.cacheHints || {};
  const localHint = cacheHints.local || {};
  const remoteHint = cacheHints.remote || {};

  if (cluster.readOnly) {
    return {
      tone: 'mounted',
      label: 'Observed Remote',
      state: 'TTL Cache',
      policy: remoteHint.strategy || 'ttl',
      invalidation: 'Hard expiry',
      detail: formatDuration(remoteHint.ttlMs),
    };
  }

  return {
    tone: 'local',
    label: 'Live State',
    state: 'Event Invalidated',
    policy: localHint.strategy || 'event-invalidated',
    invalidation: 'Local event stream',
    detail: localHint.fallbackTtlMs ? `fallback ${formatDuration(localHint.fallbackTtlMs)}` : '--',
  };
}

export function buildScopeFacts(tree = {}, provenance = {}) {
  const cluster = tree.cluster || {};
  const contentFacts = provenance.contentFacts || {};

  return [
    { label: 'Namespace', value: tree.namespace || tree.authority?.namespace || '--' },
    { label: 'Prefixes', value: cluster.ownedPrefixes || tree.authority?.ownedPrefixes || '--' },
    { label: 'Child Nodes', value: String(contentFacts.childCount ?? tree.node?.childCount ?? '--') },
    { label: 'Properties', value: String(contentFacts.propertyCount ?? tree.node?.propertyCount ?? '--') },
    { label: 'Transport', value: cluster.transport || (cluster.readOnly ? 'Lazy read fabric' : 'Aeron consensus') },
    { label: 'Mount Context', value: cluster.readOnly ? 'Mounted neighbor' : 'Local authority' },
  ];
}

export function formatPropertyValue(property = {}) {
  if (property.value !== undefined && property.value !== null && property.value !== '') {
    return String(property.value);
  }
  const values = asArray(property.values);
  if (values.length > 0) {
    return values.map((value) => String(value)).join(', ');
  }
  return '--';
}
