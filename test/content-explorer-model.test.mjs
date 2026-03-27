/* eslint-disable import/extensions */

import test from 'node:test';
import assert from 'node:assert/strict';

import {
  buildContentSections,
  buildScopeFacts,
  defaultContentSelection,
  describeAuthority,
  describeFreshness,
  formatPropertyValue,
} from '../tools/content-explorer/content-explorer-model.mjs';

test('content sections preserve local, mounted, and outer separation', () => {
  const nav = {
    localCluster: {
      clusterId: 'local-a',
      roots: [{ path: '/oak-chain' }],
      readOnly: false,
    },
    mountedNeighbors: [
      {
        clusterId: 'remote-b',
        roots: [{ path: '/oak-chain' }],
        readOnly: true,
      },
    ],
    outerNetwork: { label: 'Outer network' },
  };

  const sections = buildContentSections(nav);
  assert.equal(sections.length, 3);
  assert.equal(sections[0].title, 'Local Cluster');
  assert.equal(sections[1].title, 'Mounted Neighbors');
  assert.equal(sections[2].title, 'Outer Network');
  assert.equal(sections[0].items[0].clusterId, 'local-a');
  assert.equal(sections[1].items[0].readOnly, true);
});

test('default selection prefers local cluster roots', () => {
  const selection = defaultContentSelection({
    localCluster: {
      clusterId: 'local-a',
      readOnly: false,
      roots: [{ path: '/oak-chain' }],
    },
    mountedNeighbors: [
      {
        clusterId: 'remote-b',
        readOnly: true,
        roots: [{ path: '/oak-chain' }],
      },
    ],
  });

  assert.deepEqual(selection, {
    clusterId: 'local-a',
    path: '/oak-chain',
    readOnly: false,
  });
});

test('authority description distinguishes local and mounted clusters', () => {
  const localAuthority = describeAuthority({
    cluster: {
      authoritative: true,
      readOnly: false,
      ownedPrefixes: '00-7f',
    },
    authority: {
      namespace: '/oak-chain',
    },
  });

  const mountedAuthority = describeAuthority({
    cluster: {
      clusterId: 'remote-b',
      displayName: 'remote-b',
      authoritative: false,
      readOnly: true,
      ownedPrefixes: '80-ff',
    },
    authority: {
      namespace: '/oak-chain/80',
    },
  });

  assert.equal(localAuthority.label, 'Local Authoritative');
  assert.equal(localAuthority.writeAccess, 'Permitted (leader-owned namespace)');
  assert.equal(mountedAuthority.label, 'Mounted Read-Only');
  assert.match(mountedAuthority.summary, /remote-b/);
});

test('freshness description uses local invalidation and remote ttl hints', () => {
  const nav = {
    cacheHints: {
      local: { strategy: 'event-invalidated', fallbackTtlMs: 10000 },
      remote: { strategy: 'ttl', ttlMs: 24 * 60 * 60 * 1000 },
    },
  };

  const localFreshness = describeFreshness(nav, {
    cluster: { readOnly: false, authoritative: true },
  });

  const remoteFreshness = describeFreshness(nav, {
    cluster: { readOnly: true, authoritative: false },
  });

  assert.equal(localFreshness.state, 'Event Invalidated');
  assert.match(localFreshness.detail, /10s/);
  assert.equal(remoteFreshness.state, 'TTL Cache');
  assert.equal(remoteFreshness.detail, '24h');
});

test('scope facts and property formatting fall back cleanly', () => {
  const facts = buildScopeFacts({
    namespace: '/oak-chain',
    cluster: {
      ownedPrefixes: '00-7f',
      readOnly: false,
      transport: 'Aeron consensus',
    },
    node: {
      childCount: 3,
      propertyCount: 5,
    },
  }, {});

  assert.equal(facts[0].value, '/oak-chain');
  assert.equal(facts[2].value, '3');
  assert.equal(formatPropertyValue({ values: ['a', 'b'] }), 'a, b');
  assert.equal(formatPropertyValue({}), '--');
});
