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

function firstDefined(...values) {
  for (let i = 0; i < values.length; i += 1) {
    const value = values[i];
    if (value !== undefined && value !== null && value !== '') {
      return value;
    }
  }
  return undefined;
}

function asNum(value, fallback = 0) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
}

function asList(value) {
  if (Array.isArray(value)) {
    return value.filter((item) => item !== undefined && item !== null && item !== '').map((item) => String(item));
  }
  if (value === undefined || value === null || value === '') {
    return [];
  }
  return [String(value)];
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

function metaPill(text, tone = 'neutral') {
  const pill = document.createElement('p');
  pill.className = `proposal-epoch-flow-meta is-${tone}`;
  pill.textContent = text;
  return pill;
}

function stageStatusBadge(status) {
  if (status === 'overflow') return 'OVERFLOW';
  if (status === 'throttled') return 'THROTTLED';
  if (status === 'ready') return 'READY';
  if (status === 'packing') return 'PACKING';
  if (status === 'mempool') return 'MEMPOOL';
  return 'IDLE';
}

function stageCard(stage) {
  const card = document.createElement('article');
  card.className = `proposal-epoch-flow-card is-${stage.status}`;

  const top = document.createElement('div');
  top.className = 'proposal-epoch-flow-card-top';

  const titleWrap = document.createElement('div');
  titleWrap.className = 'proposal-epoch-flow-card-title-wrap';

  const title = document.createElement('p');
  title.className = 'proposal-epoch-flow-card-epoch';
  title.textContent = stage.title;

  const hint = document.createElement('p');
  hint.className = 'proposal-epoch-flow-card-hint';
  hint.textContent = stage.hint;

  const status = document.createElement('p');
  status.className = `proposal-epoch-flow-card-status is-${stage.status}`;
  status.textContent = stageStatusBadge(stage.status);

  const grid = document.createElement('div');
  grid.className = 'proposal-epoch-flow-grid';
  stage.metrics.forEach((metric) => {
    grid.append(valueCard(metric.label, metric.value));
  });

  titleWrap.append(title, hint);
  top.append(titleWrap, status);
  card.append(top, grid);
  return card;
}

function normalizeReleaseFlowPayload(payload) {
  if (!payload || typeof payload !== 'object') {
    throw new Error('Missing adaptive release-flow payload');
  }
  if (Array.isArray(payload.blocks)) {
    throw new Error('Deprecated epoch payload detected; point this block at /ops/v1/proposals/release-flow');
  }
  if (!payload.releaseStages || !payload.governor) {
    throw new Error('Unexpected payload shape; expected release-flow.v1 contract');
  }

  const releaseStages = (payload.releaseStages && typeof payload.releaseStages === 'object') ? payload.releaseStages : {};
  const governor = (payload.governor && typeof payload.governor === 'object') ? payload.governor : {};
  const packing = (payload.packing && typeof payload.packing === 'object') ? payload.packing : {};
  const overflow = (payload.overflow && typeof payload.overflow === 'object') ? payload.overflow : {};
  const throughput = (payload.throughput && typeof payload.throughput === 'object') ? payload.throughput : {};
  const epochCompatibility = (payload.epochCompatibility && typeof payload.epochCompatibility === 'object')
    ? payload.epochCompatibility
    : {};

  const totalVerified = asNum(firstDefined(payload.totalVerifiedCount, payload.verifiedCount), 0);
  const totalFinalized = asNum(firstDefined(throughput.totalFinalizedCount, payload.totalFinalizedCount), 0);
  const verifiedResidentFallback = Math.max(totalVerified - totalFinalized, 0);

  return {
    schedulerModel: String(firstDefined(payload.schedulerModel, payload.releasePolicy?.schedulerModel, 'adaptive-capacity')),
    releaseMode: String(firstDefined(payload.releaseMode, payload.releasePolicy?.mode, 'adaptive-active')),
    source: String(firstDefined(payload.source, 'runtime')),
    note: String(firstDefined(payload.note, 'Adaptive release stages sourced from queue control-plane data.')),
    requiredConfirmations: asNum(
      firstDefined(payload.requiredConfirmations, payload.releasePolicy?.requiredConfirmations, 1),
      1,
    ),
    priorityDirectReleaseEnabled: Boolean(firstDefined(payload.priorityDirectReleaseEnabled, false)),
    currentEpoch: asNum(firstDefined(payload.currentEpoch, epochCompatibility.currentEpoch, 0), 0),
    finalizedEpoch: asNum(firstDefined(payload.finalizedEpoch, epochCompatibility.finalizedEpoch, 0), 0),
    epochsUntilFinality: asNum(firstDefined(payload.epochsUntilFinality, epochCompatibility.epochsUntilFinality, 0), 0),
    releaseStages: {
      unverifiedMempoolCount: Math.max(
        asNum(firstDefined(releaseStages.unverifiedMempoolCount, payload.mempoolPendingCount, payload.unverifiedQueueSize), 0),
        asNum(firstDefined(payload.pendingCount, 0), 0),
      ),
      verifiedPackingBufferCount: asNum(firstDefined(releaseStages.verifiedPackingBufferCount, payload.verifiedPackingBufferCount, 0), 0),
      releaseReadyProposalCount: asNum(firstDefined(releaseStages.releaseReadyProposalCount, payload.releaseReadyProposalCount, payload.batchQueueSize, 0), 0),
      releaseReadyBatchCount: asNum(firstDefined(releaseStages.releaseReadyBatchCount, payload.releaseReadyBatchCount, 0), 0),
      backpressureOverflowProposalCount: asNum(
        firstDefined(releaseStages.backpressureOverflowProposalCount, payload.backpressureOverflowProposalCount, 0),
        0,
      ),
      backpressureOverflowBatchCount: asNum(
        firstDefined(releaseStages.backpressureOverflowBatchCount, payload.backpressureOverflowBatchCount, 0),
        0,
      ),
      verifiedResidentProposalCount: asNum(
        firstDefined(releaseStages.verifiedResidentProposalCount, payload.verifiedResidentProposalCount, verifiedResidentFallback),
        verifiedResidentFallback,
      ),
    },
    governor: {
      state: String(firstDefined(governor.state, payload.adaptiveReleaseGovernorState, 'UNKNOWN')),
      action: String(firstDefined(governor.action, payload.adaptiveReleaseAction, 'UNKNOWN')),
      reasonCodes: asList(firstDefined(governor.reasonCodes, payload.adaptiveReleaseReasonCodes, [])),
      backpressureActive: Boolean(firstDefined(governor.backpressureActive, payload.backpressureActive, false)),
      backpressurePendingCount: asNum(firstDefined(governor.backpressurePendingCount, payload.backpressurePendingCount, 0), 0),
      backpressureMaxPending: asNum(firstDefined(governor.backpressureMaxPending, payload.backpressureMaxPending, 0), 0),
      pendingOldestMs: asNum(firstDefined(governor.pendingOldestMs, payload.backpressurePendingOldestMs, 0), 0),
      pendingStalledMs: asNum(firstDefined(governor.pendingStalledMs, payload.backpressurePendingStalledMs, 0), 0),
    },
    packing: {
      walletCount: asNum(firstDefined(packing.walletCount, payload.adaptivePackingWalletCount, 0), 0),
      queuedProposalCountTotal: asNum(firstDefined(packing.queuedProposalCountTotal, payload.adaptivePackingQueuedProposalCountTotal, 0), 0),
      drainedProposalCountTotal: asNum(firstDefined(packing.drainedProposalCountTotal, payload.adaptivePackingDrainedProposalCountTotal, 0), 0),
      createdBatchCountTotal: asNum(firstDefined(packing.createdBatchCountTotal, payload.adaptivePackingCreatedBatchCountTotal, 0), 0),
    },
    overflow: {
      separateBufferEnabled: Boolean(firstDefined(overflow.separateBufferEnabled, true)),
      bufferedBatchCountTotal: asNum(firstDefined(overflow.bufferedBatchCountTotal, payload.backpressureOverflowBufferedBatchCountTotal, 0), 0),
      bufferedProposalCountTotal: asNum(firstDefined(overflow.bufferedProposalCountTotal, payload.backpressureOverflowBufferedProposalCountTotal, 0), 0),
      promotedBatchCountTotal: asNum(firstDefined(overflow.promotedBatchCountTotal, payload.backpressureOverflowPromotedBatchCountTotal, 0), 0),
      promotedProposalCountTotal: asNum(firstDefined(overflow.promotedProposalCountTotal, payload.backpressureOverflowPromotedProposalCountTotal, 0), 0),
    },
    throughput: {
      priorityProposalsSent: asNum(firstDefined(throughput.priorityProposalsSent, payload.priorityProposalsSent, 0), 0),
      batchedProposalsSent: asNum(firstDefined(throughput.batchedProposalsSent, payload.batchedProposalsSent, 0), 0),
      totalProposalsSent: asNum(firstDefined(throughput.totalProposalsSent, payload.totalProposalsSent, 0), 0),
      totalFinalizedCount: totalFinalized,
      totalRejectedCount: asNum(firstDefined(throughput.totalRejectedCount, payload.totalRejectedCount, 0), 0),
    },
    epochCompatibility: {
      source: String(firstDefined(epochCompatibility.source, 'compatibility-epoch-overlay')),
      pendingEpochs: asNum(firstDefined(epochCompatibility.pendingEpochs, payload.pendingEpochs, 0), 0),
      pendingEpochStats: firstDefined(epochCompatibility.pendingEpochStats, payload.pendingEpochStats, null),
      replacementEndpoint: firstDefined(epochCompatibility.replacementEndpoint, null),
    },
  };
}

function governorTone(model) {
  if (model.releaseStages.backpressureOverflowProposalCount > 0 || model.governor.backpressureActive) {
    return 'overflow';
  }
  if (model.releaseStages.releaseReadyProposalCount > 0) {
    return 'ready';
  }
  if (model.releaseStages.verifiedPackingBufferCount > 0) {
    return 'packing';
  }
  if (model.releaseStages.unverifiedMempoolCount > 0) {
    return 'mempool';
  }
  return 'neutral';
}

function buildStageModels(model) {
  const readyStatus = model.governor.backpressureActive
    ? (model.releaseStages.releaseReadyProposalCount > 0 ? 'throttled' : 'idle')
    : (model.releaseStages.releaseReadyProposalCount > 0 ? 'ready' : 'idle');
  const overflowStatus = (
    model.releaseStages.backpressureOverflowProposalCount > 0
    || model.releaseStages.backpressureOverflowBatchCount > 0
    || model.governor.backpressureActive
  ) ? 'overflow' : 'idle';

  return [
    {
      title: 'Unverified Mempool',
      status: model.releaseStages.unverifiedMempoolCount > 0 ? 'mempool' : 'idle',
      hint: 'Proof intake waiting for confirmation maturity.',
      metrics: [
        { label: 'Proposals', value: model.releaseStages.unverifiedMempoolCount },
        { label: 'Confirmations', value: model.requiredConfirmations },
      ],
    },
    {
      title: 'Verified Packing Buffer',
      status: model.releaseStages.verifiedPackingBufferCount > 0 ? 'packing' : 'idle',
      hint: 'Wallet and path-aware coalescing before release.',
      metrics: [
        { label: 'Proposals', value: model.releaseStages.verifiedPackingBufferCount },
        { label: 'Wallets', value: model.packing.walletCount },
      ],
    },
    {
      title: 'Release Ready',
      status: readyStatus,
      hint: model.governor.backpressureActive
        ? 'Paced drain while Aeron is under pressure.'
        : 'Direct release path when Aeron is healthy.',
      metrics: [
        { label: 'Proposals', value: model.releaseStages.releaseReadyProposalCount },
        { label: 'Batches', value: model.releaseStages.releaseReadyBatchCount },
      ],
    },
    {
      title: 'Backpressure Overflow',
      status: overflowStatus,
      hint: 'Safety valve for burst absorption under sustained pressure.',
      metrics: [
        { label: 'Proposals', value: model.releaseStages.backpressureOverflowProposalCount },
        { label: 'Batches', value: model.releaseStages.backpressureOverflowBatchCount },
      ],
    },
  ];
}

function buildSummaryMetrics(model) {
  return [
    valueCard('Verified Resident', model.releaseStages.verifiedResidentProposalCount),
    valueCard('Finalized', model.throughput.totalFinalizedCount),
    valueCard('Required Confs', model.requiredConfirmations),
    valueCard('Epoch Overlay', `${model.currentEpoch} / ${model.finalizedEpoch}`),
  ];
}

function buildNote(model) {
  const reasons = model.governor.reasonCodes.length
    ? ` Reasons: ${model.governor.reasonCodes.join(', ')}.`
    : '';
  const epochOverlay = ` Epoch overlay current ${model.currentEpoch}, finalized ${model.finalizedEpoch}, gap ${model.epochsUntilFinality}.`;
  return `${model.schedulerModel} mode ${model.releaseMode}; governor ${model.governor.state} -> ${model.governor.action}.${reasons}${epochOverlay} ${model.note}`.trim();
}

export default function decorate(block) {
  const runtime = getOpsRuntimeConfig();
  const config = readBlockConfig(block);
  const baseUrl = readConfig(config, 'api-base', 'apiBase') || runtime.apiBase;
  const refreshSetting = readConfig(config, 'refresh-seconds', 'refreshSeconds') ?? runtime.refreshSeconds.queueStats ?? 0;
  const refreshSeconds = Number(refreshSetting);
  const endpoint = readConfig(
    config,
    'release-flow-endpoint',
    'releaseFlowEndpoint',
  )
    || runtime.endpoints.proposalsReleaseFlow
    || '/ops/v1/proposals/release-flow';

  const shell = document.createElement('div');
  shell.className = 'proposal-epoch-flow-shell';

  const metas = document.createElement('div');
  metas.className = 'proposal-epoch-flow-metas';

  const summary = document.createElement('div');
  summary.className = 'proposal-epoch-flow-summary';

  const rail = document.createElement('div');
  rail.className = 'proposal-epoch-flow-rail';

  const note = document.createElement('p');
  note.className = 'proposal-epoch-flow-note';
  note.textContent = 'Awaiting canonical adaptive release-flow payload.';

  const updated = document.createElement('p');
  updated.className = 'proposal-epoch-flow-updated';
  updated.textContent = 'Updated --';

  shell.append(metas, summary, rail, note, updated);
  block.replaceChildren(shell);

  async function refresh() {
    const target = buildUrl(baseUrl, endpoint);
    if (!target) {
      note.textContent = 'Missing release-flow endpoint configuration.';
      return;
    }

    try {
      const response = await fetch(target, { headers: { Accept: 'application/json' } });
      if (!response.ok) {
        throw new Error(`HTTP ${response.status}`);
      }
      const payload = unwrapEnvelope(await response.json());
      const model = normalizeReleaseFlowPayload(payload);
      const tone = governorTone(model);

      metas.replaceChildren(
        metaPill(`Mode ${model.releaseMode}`, 'neutral'),
        metaPill(`Governor ${model.governor.state}`, tone),
        metaPill(model.governor.action, tone),
        metaPill(`Source ${model.source}`, 'neutral'),
      );
      summary.replaceChildren(...buildSummaryMetrics(model));
      rail.replaceChildren(...buildStageModels(model).map((stage) => stageCard(stage)));
      note.textContent = buildNote(model);
      updated.textContent = `Updated ${new Date().toLocaleTimeString()}${refreshSeconds > 0 ? ` • auto ${Math.max(1, refreshSeconds)}s` : ''}`;
    } catch (error) {
      metas.replaceChildren();
      summary.replaceChildren();
      rail.replaceChildren();
      note.textContent = `Release flow unavailable: ${error.message}`;
    }
  }

  refresh();
  if (refreshSeconds > 0) {
    window.setInterval(refresh, Math.max(1, refreshSeconds) * 1000);
  }
}
