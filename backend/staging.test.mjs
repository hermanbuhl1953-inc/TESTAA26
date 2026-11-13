import assert from 'node:assert/strict';
import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';
import {
  approveStagingProposal,
  discardStagingEntry,
  getStagingEntries,
  StagingError,
} from './staging.mjs';

const source = {
  id: 'test-source',
  label: 'Fonte ufficiale di test',
  scope: 'comunale',
  region: 'Lombardia',
  municipality: 'Milano',
  url: 'https://example.gov.it/benefits',
};

const proposal = {
  title: 'Bonus comunale di test',
  description: 'Contributo su domanda indicato nella fonte ufficiale.',
  scope: 'comunale',
  region: 'Lombardia',
  municipality: 'Milano',
  iseeMaxCents: 1500000,
  requirements: ['Presentare domanda entro la scadenza.'],
  source: { label: source.label, url: source.url },
  startsAt: '2026-11-01',
  endsAt: '2027-01-31',
  lastVerifiedAt: null,
};

async function withStagingFiles(run) {
  const directory = await mkdtemp(path.join(os.tmpdir(), 'scadenzario-staging-'));
  const paths = {
    registryPath: path.join(directory, 'source-registry.json'),
    statePath: path.join(directory, 'source-state.json'),
    catalogPath: path.join(directory, 'benefits.json'),
  };
  await writeFile(paths.registryPath, JSON.stringify({ schemaVersion: 1, sources: [source] }));
  await writeFile(paths.statePath, JSON.stringify({
    schemaVersion: 1,
    fingerprintVersion: 2,
    lastRunAt: '2026-11-13T10:00:00.000Z',
    sources: {
      'test-source': {
        status: 'changed',
        pendingReview: true,
        lastCheckedAt: '2026-11-13T10:00:00.000Z',
        lastChange: { excerpt: 'Nuovo bando rilevato.' },
        pendingProposal: proposal,
        proposalStatus: 'ready',
      },
    },
  }));
  await writeFile(paths.catalogPath, JSON.stringify({
    schemaVersion: 1,
    updatedAt: '2026-11-13',
    coverage: 'Catalogo di test.',
    programs: [],
  }));
  try {
    await run(paths);
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
}

test('lists only pending source changes and keeps proposals marked as staging', async () => {
  await withStagingFiles(async (paths) => {
    const entries = await getStagingEntries(paths);
    assert.equal(entries.length, 1);
    assert.equal(entries[0].sourceId, source.id);
    assert.equal(entries[0].pendingProposal.title, proposal.title);
    assert.equal(entries[0].status, 'changed');
  });
});

test('keeps malformed proposals in the queue for manual review without exposing them as approvable', async () => {
  await withStagingFiles(async (paths) => {
    const state = JSON.parse(await readFile(paths.statePath, 'utf8'));
    state.sources[source.id].pendingProposal.requirements = 'non è una lista';
    await writeFile(paths.statePath, JSON.stringify(state));

    const entries = await getStagingEntries(paths);
    assert.equal(entries.length, 1);
    assert.equal(entries[0].pendingProposal, null);
    assert.match(entries[0].aiError, /Bozza non valida/);
  });
});

test('approves a proposal into the catalog and records human review', async () => {
  await withStagingFiles(async (paths) => {
    const result = await approveStagingProposal({
      ...paths,
      sourceId: source.id,
      now: () => new Date('2026-11-13T12:00:00.000Z'),
    });
    const catalog = JSON.parse(await readFile(paths.catalogPath, 'utf8'));
    const state = JSON.parse(await readFile(paths.statePath, 'utf8'));

    assert.equal(catalog.programs.length, 1);
    assert.match(catalog.programs[0].id, /^ai-test-source-/);
    assert.equal(catalog.programs[0].lastVerifiedAt, '2026-11-13');
    assert.deepEqual(result.program, catalog.programs[0]);
    assert.equal(catalog.updatedAt, '2026-11-13');
    assert.equal(state.sources[source.id].pendingReview, false);
    assert.equal(state.sources[source.id].approvedProgramId, catalog.programs[0].id);
    assert.equal(Object.hasOwn(state.sources[source.id], 'pendingProposal'), false);
    assert.equal(state.reviewHistory.length, 1);
  });
});

test('approval is idempotent and does not duplicate a catalog entry', async () => {
  await withStagingFiles(async (paths) => {
    const first = await approveStagingProposal({ ...paths, sourceId: source.id });
    await writeFile(paths.statePath, JSON.stringify({
      schemaVersion: 1,
      fingerprintVersion: 2,
      sources: {
        [source.id]: {
          pendingReview: true,
          pendingProposal: proposal,
        },
      },
    }));
    const second = await approveStagingProposal({ ...paths, sourceId: source.id });
    const catalog = JSON.parse(await readFile(paths.catalogPath, 'utf8'));
    assert.equal(first.program.id, second.program.id);
    assert.equal(catalog.programs.length, 1);
  });
});

test('rejects proposals detached from their registered source without changing the catalog', async () => {
  await withStagingFiles(async (paths) => {
    const state = JSON.parse(await readFile(paths.statePath, 'utf8'));
    state.sources[source.id].pendingProposal.source.url = 'https://attacker.example/bonus';
    await writeFile(paths.statePath, JSON.stringify(state));
    const originalCatalog = await readFile(paths.catalogPath, 'utf8');

    await assert.rejects(
      () => approveStagingProposal({ ...paths, sourceId: source.id }),
      (error) => error instanceof StagingError && error.statusCode === 422,
    );
    assert.equal(await readFile(paths.catalogPath, 'utf8'), originalCatalog);
  });
});

test('discards a staging entry and refuses a second resolution', async () => {
  await withStagingFiles(async (paths) => {
    const result = await discardStagingEntry({
      ...paths,
      sourceId: source.id,
      now: () => new Date('2026-11-13T12:00:00.000Z'),
    });
    const state = JSON.parse(await readFile(paths.statePath, 'utf8'));

    assert.equal(result.sourceId, source.id);
    assert.equal(state.sources[source.id].pendingReview, false);
    assert.equal(Object.hasOwn(state.sources[source.id], 'pendingProposal'), false);
    assert.equal(state.reviewHistory[0].note, 'Proposta AI scartata dalla revisione UI.');
    await assert.rejects(
      () => discardStagingEntry({ ...paths, sourceId: source.id }),
      (error) => error instanceof StagingError && error.statusCode === 409,
    );
  });
});
