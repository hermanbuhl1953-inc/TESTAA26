import assert from 'node:assert/strict';
import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';
import { getMonitoringStatus, refreshSources, resolveSourceChange } from './source-monitor.mjs';

const registry = {
  schemaVersion: 1,
  sources: [{
    id: 'test-source',
    label: 'Fonte ufficiale di test',
    scope: 'nazionale',
    region: null,
    municipality: null,
    url: 'https://example.gov.it/benefits',
  }],
};

function response(body, headers = {}) {
  return new Response(body, {
    status: 200,
    headers: { 'content-type': 'text/html; charset=utf-8', ...headers },
  });
}

async function withTemporaryFiles(run) {
  const directory = await mkdtemp(path.join(os.tmpdir(), 'scadenzario-monitor-'));
  const registryPath = path.join(directory, 'registry.json');
  const statePath = path.join(directory, 'state.json');
  await writeFile(registryPath, JSON.stringify(registry));
  try {
    await run({ registryPath, statePath });
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
}

test('creates a baseline on first check and flags page changes without publishing them', async () => {
  await withTemporaryFiles(async (paths) => {
    const pages = ['<html><title>Bonus</title><p>Scadenza 2026</p></html>', '<html><title>Bonus</title><p>Scadenza 2027</p></html>'];
    const fetchImpl = async () => response(pages.shift());
    const now = () => new Date('2026-11-13T10:00:00.000Z');

    const first = await refreshSources({ ...paths, fetchImpl, now });
    assert.equal(first.results[0].status, 'baseline');
    assert.equal((await getMonitoringStatus(paths)).pendingReviewCount, 0);

    const second = await refreshSources({ ...paths, fetchImpl, now });
    const status = await getMonitoringStatus(paths);
    assert.equal(second.results[0].status, 'changed');
    assert.equal(status.updateMode, 'local-server');
    assert.equal(status.pendingReviewCount, 1);
    assert.match(status.sources[0].lastChange.excerpt, /Scadenza 2027/);
  });
});

test('records a review only when a pending change exists and requires a reason', async () => {
  await withTemporaryFiles(async (paths) => {
    const fetchImpl = async () => response('<html><title>Bonus</title><p>Prima versione</p></html>');
    await refreshSources({ ...paths, fetchImpl });
    await refreshSources({ ...paths, fetchImpl: async () => response('<html><title>Bonus</title><p>Seconda versione</p></html>') });
    await assert.rejects(() => resolveSourceChange({ ...paths, sourceId: 'test-source', note: 'ok' }), /da 8 a 500/);

    const result = await resolveSourceChange({
      ...paths,
      sourceId: 'test-source',
      note: 'Requisiti riletti sulla pagina ufficiale',
      now: () => new Date('2026-11-13T12:00:00.000Z'),
    });
    const state = JSON.parse(await readFile(paths.statePath, 'utf8'));
    assert.equal(result.pendingReviewCount, 0);
    assert.equal(state.reviewHistory.length, 1);
    assert.equal(state.sources['test-source'].pendingReview, false);
  });
});

test('keeps errors visible and does not erase the last successful source fingerprint', async () => {
  await withTemporaryFiles(async (paths) => {
    await refreshSources({ ...paths, fetchImpl: async () => response('<html><title>Bonus</title><p>Disponibile</p></html>') });
    const before = JSON.parse(await readFile(paths.statePath, 'utf8'));
    const result = await refreshSources({ ...paths, fetchImpl: async () => { throw new Error('rete non disponibile'); } });
    const after = JSON.parse(await readFile(paths.statePath, 'utf8'));
    assert.equal(result.results[0].status, 'error');
    assert.equal(after.sources['test-source'].contentHash, before.sources['test-source'].contentHash);
    assert.match((await getMonitoringStatus(paths)).sources[0].lastError, /rete non disponibile/);
  });
});

test('re-baselines stored data when the fingerprint format changes', async () => {
  await withTemporaryFiles(async (paths) => {
    await writeFile(paths.statePath, JSON.stringify({
      schemaVersion: 1,
      fingerprintVersion: 1,
      lastRunAt: '2026-11-12T10:00:00.000Z',
      sources: {
        'test-source': {
          status: 'changed',
          pendingReview: true,
          contentHash: 'old-format-hash',
        },
      },
    }));
    const result = await refreshSources({
      ...paths,
      fetchImpl: async () => response('<html><title>Bonus</title><p>Current page</p></html>'),
      now: () => new Date('2026-11-13T10:00:00.000Z'),
    });
    assert.equal(result.results[0].status, 'baseline');
    assert.equal(result.state.sources['test-source'].pendingReview, false);
    assert.equal(result.state.fingerprintVersion, 2);
  });
});

test('ships an explicit unconfigured snapshot for the static web app', async () => {
  const projectDirectory = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
  const snapshot = JSON.parse(await readFile(path.join(projectDirectory, 'assets', 'catalog', 'source-monitoring.json'), 'utf8'));
  const sourceRegistry = JSON.parse(await readFile(path.join(projectDirectory, 'backend', 'source-registry.json'), 'utf8'));
  assert.equal(snapshot.schemaVersion, 1);
  assert.ok(['github-actions', 'not-configured'].includes(snapshot.updateMode));
  if (snapshot.updateMode === 'not-configured') assert.equal(snapshot.lastRunAt, null);
  else assert.equal(Number.isNaN(Date.parse(snapshot.lastRunAt)), false);
  assert.deepEqual(snapshot.sources.map((source) => source.id), sourceRegistry.sources.map((source) => source.id));
});
