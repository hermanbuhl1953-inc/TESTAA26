import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import { spawnSync } from 'node:child_process';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import test from 'node:test';
import { getSourceById } from '../../src/data/sources/registry.ts';
import { createCandidateMeasure } from '../../src/services/ingestion/candidate-measure.ts';
import { ingestManualRecords } from '../../src/services/ingestion/manual-import.ts';
import { normalizeRawMeasure } from '../../src/services/normalization/normalize-measure.ts';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const NOW = new Date('2026-11-16T13:08:00.000Z');
const FIXTURES = {
  nidi: 'data/import/manual/regione-lombardia-nidi-gratis-plus-2026-27.json',
  buono: 'data/import/manual/regione-lombardia-dote-scuola-buono-scuola-2026-27.json',
  scegliMi: 'data/import/manual/comune-milano-sceglimi-under-35.json',
};

async function loadFixture(name) {
  return JSON.parse(await readFile(path.join(ROOT, FIXTURES[name]), 'utf8'));
}

async function loadRaw(name) {
  const file = await loadFixture(name);
  return { file, raw: file.records[0].raw };
}

function createCandidate(file, raw = file.records[0].raw, existingMeasures = []) {
  const source = getSourceById(file.sourceId);
  assert.ok(source, `Sorgente registrata attesa: ${file.sourceId}`);
  return createCandidateMeasure(raw, {
    source,
    importedAt: NOW.toISOString(),
    importerVersion: 'real-measures-pilot/1',
    existingMeasures,
  });
}

function runCli(fixturePath) {
  return spawnSync(process.execPath, [
    '--experimental-strip-types',
    path.join(ROOT, 'scripts/ingest-manual.mjs'),
    path.join(ROOT, fixturePath),
  ], {
    cwd: ROOT,
    encoding: 'utf8',
    env: { ...process.env, DATABASE_URL: '' },
  });
}

async function sha256(filePath) {
  const contents = await readFile(path.join(ROOT, filePath));
  return createHash('sha256').update(contents).digest('hex');
}

test('una misura REAL verificata entra PENDING e TO_VERIFY', async () => {
  const { file, raw } = await loadRaw('buono');
  const candidate = createCandidate(file, { ...raw, unstructuredRequirements: [] });
  assert.equal(candidate.normalizedMeasure.recordType, 'REAL');
  assert.equal(candidate.normalizedMeasure.dataQuality, 'TO_VERIFY');
  assert.equal(candidate.reviewStatus, 'PENDING');
  assert.equal(candidate.validationResult.issues.length, 0);
});

test('REAL non viene mai promosso automaticamente a VERIFIED', async () => {
  const { file, raw } = await loadRaw('buono');
  const candidate = createCandidate(file, {
    ...raw,
    dataQuality: 'VERIFIED',
    unstructuredRequirements: [],
  });
  assert.equal(candidate.normalizedMeasure.recordType, 'REAL');
  assert.equal(candidate.normalizedMeasure.dataQuality, 'TO_VERIFY');
});

test('una fonte OFFICIAL non approva automaticamente la candidate', async () => {
  const { file, raw } = await loadRaw('buono');
  const candidate = createCandidate(file, { ...raw, unstructuredRequirements: [] });
  assert.equal(candidate.source.sourceType, 'OFFICIAL');
  assert.equal(candidate.reviewStatus, 'PENDING');
  assert.notEqual(candidate.reviewStatus, 'APPROVED');
});

test('requisito economico testuale non genera una soglia ISEE', async () => {
  const { file, raw } = await loadRaw('scegliMi');
  const candidate = createCandidate(file, raw);
  assert.equal(candidate.normalizedMeasure.requirements.iseeMax, null);
  assert.ok(candidate.normalizedMeasure.unstructuredRequirements.some((item) => item.includes('30%')));
  assert.equal(candidate.reviewStatus, 'NEEDS_REVIEW');
});

test('un campo assente nella fonte resta null dopo la normalizzazione', async () => {
  const { file, raw } = await loadRaw('scegliMi');
  const source = getSourceById(file.sourceId);
  assert.ok(source);
  const measure = normalizeRawMeasure(raw, { source });
  assert.equal(measure.requirements.iseeMax, null);
  assert.equal(measure.requirements.maxAge, null);
  assert.equal(measure.source.sourceDocumentDate, null);
});

test('una misura chiusa resta CLOSED quando la scadenza è passata', async () => {
  const { file, raw } = await loadRaw('buono');
  const candidate = createCandidate(file, {
    ...raw,
    status: 'CLOSED',
    application: {
      ...raw.application,
      startDate: '2026-10-01T00:00:00+02:00',
      endDate: '2026-10-20T12:00:00+02:00',
    },
  });
  assert.equal(candidate.normalizedMeasure.status, 'CLOSED');
  assert.equal(candidate.validationResult.importAllowed, true);
});

test('senza date della domanda lo stato resta UNKNOWN se non dichiarato', async () => {
  const { file, raw } = await loadRaw('buono');
  const candidate = createCandidate(file, {
    ...raw,
    status: 'UNKNOWN',
    application: { ...raw.application, startDate: null, endDate: null },
  });
  assert.equal(candidate.normalizedMeasure.status, 'UNKNOWN');
  assert.equal(candidate.normalizedMeasure.application.startDate, null);
  assert.equal(candidate.normalizedMeasure.application.endDate, null);
});

test('retrievedAt non modifica il contentHash', async () => {
  const { file, raw } = await loadRaw('buono');
  const first = createCandidate(file, raw);
  const second = createCandidate(file, {
    ...raw,
    retrievedAt: '2026-11-15T10:00:00+01:00',
    lastVerifiedAt: '2026-11-15T10:00:00+01:00',
  });
  assert.equal(first.contentHash, second.contentHash);
});

test('una scadenza diversa modifica il contentHash', async () => {
  const { file, raw } = await loadRaw('buono');
  const first = createCandidate(file, raw);
  const second = createCandidate(file, {
    ...raw,
    application: { ...raw.application, endDate: '2026-12-11T12:00:00+01:00' },
  });
  assert.notEqual(first.contentHash, second.contentHash);
});

test('stesso URL e contenuto producono un duplicato esatto', async () => {
  const { file, raw } = await loadRaw('buono');
  const first = createCandidate(file, raw);
  const second = createCandidate(file, raw, [first.normalizedMeasure]);
  assert.equal(second.fingerprint, first.fingerprint);
  assert.equal(second.conflicts[0].type, 'EXACT_DUPLICATE');
  assert.equal(second.approvable, false);
});

test('stesso fingerprint con contenuto diverso viene segnalato come conflitto', async () => {
  const { file, raw } = await loadRaw('buono');
  const first = createCandidate(file, raw);
  const changed = createCandidate(file, {
    ...raw,
    description: 'Descrizione differente da sottoporre a revisione.',
  }, [first.normalizedMeasure]);
  assert.equal(changed.fingerprint, first.fingerprint);
  assert.equal(changed.conflicts[0].type, 'CONFLICT');
  assert.equal(changed.approvable, false);
});

test('il CLI importa senza DATABASE_URL e non richiede un database', () => {
  const result = runCli(FIXTURES.nidi);
  assert.equal(result.status, 0, result.stderr);
  assert.match(result.stdout, /RECORD TYPE\nREAL/);
  assert.match(result.stdout, /REVIEW\nNEEDS_REVIEW/);
});

test('il CLI non modifica il catalogo SAMPLE', async () => {
  const pathToCatalog = 'src/data/samples/pilot-measures.ts';
  const before = await sha256(pathToCatalog);
  const result = runCli(FIXTURES.nidi);
  assert.equal(result.status, 0, result.stderr);
  assert.equal(await sha256(pathToCatalog), before);
});

test('il CLI non modifica il motore eligibility', async () => {
  const pathToEngine = 'src/domain/eligibility/engine.ts';
  const before = await sha256(pathToEngine);
  const result = runCli(FIXTURES.nidi);
  assert.equal(result.status, 0, result.stderr);
  assert.equal(await sha256(pathToEngine), before);
});

test('un errore di validazione rende la candidate non approvabile', async () => {
  const { file, raw } = await loadRaw('buono');
  const candidate = createCandidate(file, { ...raw, sourceUrl: null });
  assert.equal(candidate.validationResult.importAllowed, false);
  assert.equal(candidate.approvable, false);
  assert.equal(candidate.reviewStatus, 'NEEDS_REVIEW');
});

test('normalizzazione conserva URL e date dei documenti ufficiali', async () => {
  const { file, raw } = await loadRaw('scegliMi');
  const candidate = createCandidate(file, raw);
  assert.equal(candidate.normalizedMeasure.source.url, raw.sourceUrl);
  assert.equal(candidate.normalizedMeasure.source.documents.length, 3);
  assert.equal(candidate.normalizedMeasure.source.documents[1].publishedDate, '2026-08-18');
  assert.match(candidate.normalizedMeasure.source.documents[1].url, /\.pdf/);
});
