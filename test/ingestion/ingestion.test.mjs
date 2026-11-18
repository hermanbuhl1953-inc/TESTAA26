import assert from 'node:assert/strict';
import test from 'node:test';
import { getSourceById } from '../../src/data/sources/registry.ts';
import { evaluateBenefit } from '../../src/domain/eligibility/engine.ts';
import { getMeasureContentHash } from '../../src/services/ingestion/content-hash.ts';
import { createCandidateMeasure } from '../../src/services/ingestion/candidate-measure.ts';
import { HttpSourceClient } from '../../src/services/ingestion/http-source-client.ts';
import { checkInstitutionalSource } from '../../src/services/ingestion/ingestion-service.ts';
import { ingestManualRecords } from '../../src/services/ingestion/manual-import.ts';
import { getMeasureFingerprint } from '../../src/services/normalization/measure-fingerprint.ts';

const DEMO_NOW = new Date('2026-11-16T12:00:00.000Z');
const source = getSourceById('lombardia-bandi');

function demoRaw(overrides = {}) {
  return {
    id: 'SAMPLE-INGEST-001',
    title: 'SAMPLE — fixture tecnica ingestion',
    description: 'Dato di test sintetico, non misura reale.',
    sourceUrl: source?.baseUrl ?? null,
    retrievedAt: DEMO_NOW.toISOString(),
    lastVerifiedAt: DEMO_NOW.toISOString(),
    status: 'UNKNOWN',
    dataQuality: 'TO_VERIFY',
    recordType: 'SAMPLE',
    ...overrides,
  };
}

function mockResponse(status, headers = {}, body = '') {
  return new Response(body, { status, headers });
}

function createHttpClient(fetchImpl, options = {}) {
  return new HttpSourceClient({
    fetchImpl,
    delayBetweenRequestsMs: 0,
    timeoutMs: 100,
    sleep: async () => {},
    ...options,
  });
}

test('HTTP 403 produce BLOCKED senza tentare bypass', async () => {
  let requests = 0;
  const client = createHttpClient(async () => {
    requests += 1;
    return mockResponse(403);
  });
  const result = await client.get(source);
  assert.equal(result.status, 'BLOCKED');
  assert.equal(result.httpStatus, 403);
  assert.equal(requests, 1);
  assert.match(result.error, /nessun tentativo di aggiramento/);
});

test('HTTP 404 produce FAILED', async () => {
  const client = createHttpClient(async () => mockResponse(404));
  const result = await client.get(source);
  assert.equal(result.status, 'FAILED');
  assert.equal(result.httpStatus, 404);
});

test('HTTP 429 è gestito senza retry automatici', async () => {
  let requests = 0;
  const client = createHttpClient(async () => {
    requests += 1;
    return mockResponse(429, { 'retry-after': '60' });
  });
  const result = await client.get(source);
  assert.equal(result.status, 'FAILED');
  assert.equal(result.httpStatus, 429);
  assert.equal(requests, 1);
  assert.match(result.warnings[0], /nessun retry/);
});

test('timeout HTTP produce FAILED', async () => {
  const client = createHttpClient((_url, options) => new Promise((_resolve, reject) => {
    options.signal.addEventListener('abort', () => reject(new Error('aborted')), { once: true });
  }), { timeoutMs: 5 });
  const result = await client.get(source);
  assert.equal(result.status, 'FAILED');
  assert.match(result.error, /Timeout/);
});

test('redirect esterno al registry è bloccato; redirect registrato è seguito in sicurezza', async () => {
  const rejected = createHttpClient(async () => mockResponse(302, { location: 'https://example.invalid/path' }));
  assert.equal((await rejected.get(source)).status, 'BLOCKED');

  let requests = 0;
  const followed = createHttpClient(async () => {
    requests += 1;
    return requests === 1
      ? mockResponse(302, { location: '/servizi/aggiornata' })
      : mockResponse(200, {}, 'fixture');
  });
  const result = await followed.get(source);
  assert.equal(result.status, 'SUCCESS');
  assert.equal(requests, 2);
  assert.equal(result.body, 'fixture');
});

test('controllo fonte senza parser non crea misure da HTML acquisito', async () => {
  const client = createHttpClient(async () => mockResponse(200, {}, '<html>fixture</html>'));
  const result = await checkInstitutionalSource(
    source.id,
    client,
    () => DEMO_NOW,
  );
  assert.equal(result.status, 'PARTIAL');
  assert.equal(result.recordsFound, 0);
  assert.equal(result.recordsAccepted, 0);
  assert.equal(result.candidates.length, 0);
  assert.ok(result.warnings.some((warning) => warning.includes('estrazione automatica')));
});

test('manual import valido passa da normalizzazione e validazione a candidate PENDING', () => {
  const { result } = ingestManualRecords({
    sourceId: source.id,
    records: [{ raw: demoRaw({ recordType: 'REAL' }) }],
  }, { now: () => DEMO_NOW });
  const [candidate] = result.candidates;
  assert.equal(result.recordsAccepted, 1);
  assert.equal(candidate.normalizedMeasure.authority.name, 'Regione Lombardia');
  assert.equal(candidate.normalizedMeasure.provenance.rawSourceId, source.id);
  assert.equal(candidate.validationResult.valid, true);
  assert.equal(candidate.reviewStatus, 'PENDING');
  assert.equal(candidate.approvable, true);
  assert.equal(candidate.normalizedMeasure.recordType, 'REAL');
  assert.equal(candidate.normalizedMeasure.dataQuality, 'TO_VERIFY');
});

test('manual import passa dalla validation e conserva candidate con ERROR non approvabili', () => {
  const { result } = ingestManualRecords({
    sourceId: source.id,
    records: [{ raw: demoRaw({ sourceUrl: null }) }],
  }, { now: () => DEMO_NOW });
  assert.equal(result.recordsRejected, 1);
  assert.equal(result.candidates.length, 1);
  assert.equal(result.candidates[0].validationResult.importAllowed, false);
  assert.equal(result.candidates[0].approvable, false);
  assert.ok(result.candidates[0].validationResult.issues.some((issue) => issue.code === 'SOURCE_URL_MISSING'));
});

test('fingerprint duplicato è segnalato e non approvabile automaticamente', () => {
  const raw = demoRaw();
  const first = createCandidateMeasure(raw, {
    source,
    importedAt: DEMO_NOW.toISOString(),
    importerVersion: 'test',
  });
  const second = createCandidateMeasure(raw, {
    source,
    importedAt: DEMO_NOW.toISOString(),
    importerVersion: 'test',
    existingMeasures: [first.normalizedMeasure],
  });
  assert.equal(second.fingerprint, getMeasureFingerprint(first.normalizedMeasure));
  assert.equal(second.conflicts[0].type, 'EXACT_DUPLICATE');
  assert.equal(second.reviewStatus, 'NEEDS_REVIEW');
  assert.equal(second.approvable, false);
});

test('stessa identità con deadline modificata è POSSIBLE_UPDATE, non sovrascritta', () => {
  const existing = createCandidateMeasure(demoRaw({
    application: { endDate: '2026-12-01T00:00:00.000Z' },
  }), {
    source,
    importedAt: DEMO_NOW.toISOString(),
    importerVersion: 'test',
  });
  const update = createCandidateMeasure(demoRaw({
    application: { endDate: '2026-12-15T00:00:00.000Z' },
  }), {
    source,
    importedAt: DEMO_NOW.toISOString(),
    importerVersion: 'test',
    existingMeasures: [existing.normalizedMeasure],
  });
  assert.equal(update.conflicts[0].type, 'POSSIBLE_UPDATE');
  assert.equal(update.approvable, true);
  assert.equal(existing.normalizedMeasure.application.endDate, '2026-12-01T00:00:00.000Z');
});

test('contenuto significativo modificato cambia contentHash', () => {
  const original = createCandidateMeasure(demoRaw(), {
    source,
    importedAt: DEMO_NOW.toISOString(),
    importerVersion: 'test',
  });
  const changed = createCandidateMeasure(demoRaw({ description: 'SAMPLE — descrizione modificata.' }), {
    source,
    importedAt: DEMO_NOW.toISOString(),
    importerVersion: 'test',
  });
  assert.notEqual(original.contentHash, changed.contentHash);
});

test('retrievedAt e lastVerifiedAt diversi non cambiano contentHash', () => {
  const first = createCandidateMeasure(demoRaw(), {
    source,
    importedAt: DEMO_NOW.toISOString(),
    importerVersion: 'test',
  });
  const second = createCandidateMeasure(demoRaw({
    retrievedAt: '2026-11-15T12:00:00.000Z',
    lastVerifiedAt: '2026-11-15T12:00:00.000Z',
  }), {
    source,
    importedAt: '2026-11-17T12:00:00.000Z',
    importerVersion: 'test',
  });
  assert.equal(first.contentHash, getMeasureContentHash(second.normalizedMeasure));
  assert.notEqual(first.normalizedMeasure.source.retrievedAt, second.normalizedMeasure.source.retrievedAt);
});

test('REAL senza fonte ufficiale resta REAL ma non è VERIFIED né approvabile', () => {
  const candidate = createCandidateMeasure(demoRaw({
    sourceUrl: 'https://not-the-registered-source.invalid/measure',
    recordType: 'REAL',
    dataQuality: 'VERIFIED',
  }), {
    source,
    importedAt: DEMO_NOW.toISOString(),
    importerVersion: 'test',
  });
  assert.equal(candidate.normalizedMeasure.recordType, 'REAL');
  assert.equal(candidate.normalizedMeasure.dataQuality, 'TO_VERIFY');
  assert.equal(candidate.approvable, false);
  assert.ok(candidate.validationResult.issues.some((issue) => issue.code === 'SOURCE_HOST_MISMATCH'));
});

test('UNKNOWN e TO_VERIFY restano tali dopo ingestion', () => {
  const candidate = createCandidateMeasure(demoRaw({
    status: 'UNKNOWN',
    dataQuality: 'TO_VERIFY',
  }), {
    source,
    importedAt: DEMO_NOW.toISOString(),
    importerVersion: 'test',
  });
  assert.equal(candidate.normalizedMeasure.status, 'UNKNOWN');
  assert.equal(candidate.normalizedMeasure.dataQuality, 'TO_VERIFY');
});

test('ingestion non modifica né invoca il motore eligibility', () => {
  const measure = demoRaw();
  const before = structuredClone(measure);
  const benefit = {
    code: 'DEMO-UNCHANGED',
    title: 'DEMO eligibility invariata',
    description: 'Fixture DEMO.',
    opensAt: null,
    closesAt: null,
    rules: [],
  };
  const beforeEvaluation = evaluateBenefit(benefit, {}, DEMO_NOW);
  createCandidateMeasure(measure, {
    source,
    importedAt: DEMO_NOW.toISOString(),
    importerVersion: 'test',
  });
  const afterEvaluation = evaluateBenefit(benefit, {}, DEMO_NOW);
  assert.deepEqual(measure, before);
  assert.deepEqual(afterEvaluation, beforeEvaluation);
});
