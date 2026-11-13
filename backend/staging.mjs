import { createHash } from 'node:crypto';
import { mkdir, readFile, rename, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { readJson, resolveSourceChange } from './source-monitor.mjs';

const DATE_PATTERN = /^\d{4}-\d{2}-\d{2}$/;
const MAX_STAGING_ENTRIES = 100;

export class StagingError extends Error {
  constructor(message, statusCode = 400) {
    super(message);
    this.name = 'StagingError';
    this.statusCode = statusCode;
  }
}

function isIsoDate(value) {
  if (typeof value !== 'string' || !DATE_PATTERN.test(value)) return false;
  const parsed = new Date(`${value}T00:00:00.000Z`);
  return !Number.isNaN(parsed.valueOf()) && parsed.toISOString().slice(0, 10) === value;
}

async function writeJsonAtomically(filePath, value) {
  await mkdir(path.dirname(filePath), { recursive: true });
  const temporaryPath = `${filePath}.${process.pid}.tmp`;
  await writeFile(temporaryPath, `${JSON.stringify(value, null, 2)}\n`, 'utf8');
  await rename(temporaryPath, filePath);
}

function validateProposal(proposal, source) {
  if (!proposal || typeof proposal !== 'object' || Array.isArray(proposal)
    || typeof proposal.title !== 'string' || !proposal.title.trim() || proposal.title.length > 200
    || typeof proposal.description !== 'string' || !proposal.description.trim() || proposal.description.length > 10_000
    || proposal.scope !== source.scope
    || (proposal.region ?? null) !== (source.region ?? null)
    || (proposal.municipality ?? null) !== (source.municipality ?? null)
    || (proposal.iseeMaxCents !== null
      && (!Number.isSafeInteger(proposal.iseeMaxCents) || proposal.iseeMaxCents < 0))
    || !Array.isArray(proposal.requirements) || proposal.requirements.length > 100
    || proposal.requirements.some((requirement) => typeof requirement !== 'string'
      || !requirement.trim() || requirement.length > 2_000)
    || !proposal.source || proposal.source.label !== source.label || proposal.source.url !== source.url
    || ![proposal.startsAt, proposal.endsAt].every((date) => date === null || isIsoDate(date))
    || proposal.lastVerifiedAt !== null) {
    throw new StagingError('La proposta non rispetta lo schema o non corrisponde alla fonte registrata.', 422);
  }
  let url;
  try {
    url = new URL(proposal.source.url);
  } catch {
    throw new StagingError('La proposta contiene un URL fonte non valido.', 422);
  }
  if (url.protocol !== 'https:' || url.username || url.password) {
    throw new StagingError('La proposta deve riferirsi a una fonte HTTPS valida.', 422);
  }
}

function createProgramId(sourceId, proposal) {
  const digest = createHash('sha256').update(JSON.stringify(proposal)).digest('hex').slice(0, 16);
  return `ai-${sourceId}-${digest}`;
}

function createProgram(sourceId, proposal, approvedAt) {
  return {
    id: createProgramId(sourceId, proposal),
    title: proposal.title.trim(),
    description: proposal.description.trim(),
    scope: proposal.scope,
    region: proposal.region ?? null,
    municipality: proposal.municipality ?? null,
    iseeMaxCents: proposal.iseeMaxCents,
    requirements: proposal.requirements.map((requirement) => requirement.trim()),
    startsAt: proposal.startsAt,
    endsAt: proposal.endsAt,
    lastVerifiedAt: approvedAt,
    source: { label: proposal.source.label, url: proposal.source.url },
  };
}

async function loadStagingContext({ registryPath, statePath, sourceId }) {
  const [registry, state] = await Promise.all([
    readJson(registryPath, null),
    readJson(statePath, { schemaVersion: 1, fingerprintVersion: 2, lastRunAt: null, sources: {} }),
  ]);
  if (!registry || registry.schemaVersion !== 1 || !Array.isArray(registry.sources)
    || !state || state.schemaVersion !== 1 || !state.sources || Array.isArray(state.sources)) {
    throw new StagingError('Registro o stato del monitoraggio non valido.', 500);
  }
  const source = registry.sources.find((entry) => entry.id === sourceId);
  if (!source) throw new StagingError(`Fonte sconosciuta: ${sourceId}.`, 404);
  const sourceState = state.sources[sourceId];
  if (!sourceState?.pendingReview) throw new StagingError('La variazione non è più in attesa di revisione.', 409);
  return { registry, state, source, sourceState };
}

export async function getStagingEntries({ registryPath, statePath }) {
  const [registry, state] = await Promise.all([
    readJson(registryPath, null),
    readJson(statePath, { schemaVersion: 1, sources: {} }),
  ]);
  if (!registry || registry.schemaVersion !== 1 || !Array.isArray(registry.sources)
    || !state || state.schemaVersion !== 1 || !state.sources || Array.isArray(state.sources)) {
    throw new StagingError('Registro o stato del monitoraggio non valido.', 500);
  }
  const entries = registry.sources.flatMap((source) => {
    const sourceState = state.sources[source.id];
    if (!sourceState?.pendingReview) return [];
    let pendingProposal = sourceState.pendingProposal ?? null;
    let aiError = sourceState.aiError ?? null;
    if (pendingProposal) {
      try {
        validateProposal(pendingProposal, source);
      } catch (error) {
        if (!(error instanceof StagingError)) throw error;
        pendingProposal = null;
        aiError = `Bozza non valida: ${error.message}`;
      }
    }
    return [{
      sourceId: source.id,
      sourceLabel: source.label,
      sourceUrl: source.url,
      scope: source.scope,
      region: source.region ?? null,
      municipality: source.municipality ?? null,
      status: sourceState.status ?? 'changed',
      lastCheckedAt: sourceState.lastCheckedAt ?? null,
      lastChange: sourceState.lastChange ?? null,
      pendingProposal,
      proposalStatus: sourceState.proposalStatus ?? 'manual-review',
      aiError,
    }];
  });
  if (entries.length > MAX_STAGING_ENTRIES) {
    throw new StagingError('La coda di revisione supera il limite consentito.', 500);
  }
  return entries;
}

export async function approveStagingProposal({
  registryPath,
  statePath,
  catalogPath,
  sourceId,
  now = () => new Date(),
}) {
  const { state, source, sourceState } = await loadStagingContext({ registryPath, statePath, sourceId });
  const proposal = sourceState.pendingProposal;
  if (!proposal) throw new StagingError('Questa variazione non contiene una proposta AI da approvare.', 409);
  validateProposal(proposal, source);

  const catalog = await readJson(catalogPath, null);
  if (!catalog || catalog.schemaVersion !== 1 || !Array.isArray(catalog.programs)) {
    throw new StagingError('Il catalogo agevolazioni non rispetta lo schema previsto.', 500);
  }
  const approvedAt = now().toISOString().slice(0, 10);
  const program = createProgram(sourceId, proposal, approvedAt);
  const existingProgram = catalog.programs.find((entry) => entry.id === program.id);
  if (existingProgram && JSON.stringify(existingProgram) !== JSON.stringify(program)) {
    throw new StagingError('Esiste già una voce con un identificativo incompatibile.', 409);
  }
  if (!existingProgram) {
    catalog.programs.push(program);
    catalog.updatedAt = approvedAt;
    await writeJsonAtomically(catalogPath, catalog);
  }

  const reviewedAt = now().toISOString();
  sourceState.pendingReview = false;
  sourceState.status = 'unchanged';
  sourceState.reviewedAt = reviewedAt;
  sourceState.reviewNote = `Proposta approvata nel catalogo come ${program.id}.`;
  delete sourceState.pendingProposal;
  delete sourceState.proposalStatus;
  delete sourceState.aiError;
  sourceState.approvedProgramId = program.id;
  state.reviewHistory = [...(state.reviewHistory ?? []), {
    sourceId,
    reviewedAt,
    note: sourceState.reviewNote,
  }].slice(-100);
  await writeJsonAtomically(statePath, state);
  return { sourceId, program };
}

export async function discardStagingEntry({ registryPath, statePath, sourceId, now = () => new Date() }) {
  const { state, sourceState } = await loadStagingContext({ registryPath, statePath, sourceId });
  const reviewedAt = now().toISOString();
  const note = sourceState.pendingProposal ? 'Proposta AI scartata dalla revisione UI.' : 'Variazione scartata dalla revisione UI.';
  sourceState.pendingReview = false;
  sourceState.status = sourceState.status === 'error' ? 'error' : 'unchanged';
  sourceState.reviewedAt = reviewedAt;
  sourceState.reviewNote = note;
  delete sourceState.pendingProposal;
  delete sourceState.proposalStatus;
  delete sourceState.aiError;
  state.reviewHistory = [...(state.reviewHistory ?? []), { sourceId, reviewedAt, note }].slice(-100);
  await writeJsonAtomically(statePath, state);
  return { sourceId, reviewedAt };
}
