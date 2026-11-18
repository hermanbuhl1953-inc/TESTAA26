import assert from 'node:assert/strict';
import test from 'node:test';
import { getSourceById } from '../../src/data/sources/registry.ts';
import { normalizeRawMeasure } from '../../src/services/normalization/normalize-measure.ts';
import {
  compareMeasures,
  getMeasureFingerprint,
} from '../../src/services/normalization/measure-fingerprint.ts';
import { pilotSampleMeasures } from '../../src/data/samples/pilot-measures.ts';

const DEMO_CONTEXT = {
  source: getSourceById('lombardia-bandi'),
  importedAt: '2026-11-16T10:00:00.000Z',
  importerVersion: 'test-demo',
};

function demoRawMeasure(overrides = {}) {
  return {
    id: 'SAMPLE-TEST-001',
    title: 'SAMPLE — fixture di normalizzazione',
    description: 'Fixture tecnica, non misura reale.',
    sourceUrl: 'https://www.bandi.regione.lombardia.it/servizi/home',
    retrievedAt: '2026-11-16T09:00:00.000Z',
    lastVerifiedAt: '2026-11-16T09:00:00.000Z',
    recordType: 'SAMPLE',
    dataQuality: 'TO_VERIFY',
    ...overrides,
  };
}

test('normalizza una misura valida mantenendo source, territorio e valori sconosciuti', () => {
  const measure = normalizeRawMeasure(demoRawMeasure(), DEMO_CONTEXT);
  assert.equal(measure.id, 'SAMPLE-TEST-001');
  assert.equal(measure.authority.name, 'Regione Lombardia');
  assert.equal(measure.territory.region, 'Lombardia');
  assert.equal(measure.source.url, demoRawMeasure().sourceUrl);
  assert.equal(measure.amount.type, 'UNKNOWN');
  assert.equal(measure.amount.value, null);
});

test('normalizzazione conserva la provenance e non perde l’URL fonte', () => {
  const measure = normalizeRawMeasure(demoRawMeasure(), DEMO_CONTEXT);
  assert.equal(measure.source.url, demoRawMeasure().sourceUrl);
  assert.deepEqual(measure.provenance, {
    importedAt: '2026-11-16T10:00:00.000Z',
    importerVersion: 'test-demo',
    rawSourceId: 'lombardia-bandi',
  });
});

test('l’URL di base della sorgente non viene inventato come URL specifico del record', () => {
  const measure = normalizeRawMeasure(demoRawMeasure({ sourceUrl: null }), DEMO_CONTEXT);
  assert.equal(measure.source.url, null);
});

test('fingerprint è stabile per lo stesso record normalizzato', () => {
  const first = normalizeRawMeasure(demoRawMeasure(), DEMO_CONTEXT);
  const second = normalizeRawMeasure(demoRawMeasure(), DEMO_CONTEXT);
  assert.equal(getMeasureFingerprint(first), getMeasureFingerprint(second));
  assert.deepEqual(compareMeasures(first, second), {
    possibleDuplicate: true,
    sameFingerprint: true,
    conflictingFields: [],
  });
});

test('fingerprint cambia per autorità diverse e conflitti non vengono eliminati', () => {
  const first = normalizeRawMeasure(demoRawMeasure(), DEMO_CONTEXT);
  const milano = getSourceById('milano-quota-nidi');
  assert.ok(milano);
  const second = normalizeRawMeasure(demoRawMeasure(), { source: milano });
  assert.notEqual(getMeasureFingerprint(first), getMeasureFingerprint(second));
  assert.equal(compareMeasures(first, second).possibleDuplicate, false);

  const changedSource = normalizeRawMeasure(demoRawMeasure({
    sourceUrl: 'https://www.bandi.regione.lombardia.it/servizi/home?pagina=2',
  }), DEMO_CONTEXT);
  const conflict = compareMeasures(first, changedSource);
  assert.equal(conflict.possibleDuplicate, true);
  assert.equal(conflict.sameFingerprint, false);
  assert.ok(conflict.conflictingFields.includes('source.url'));
});

test('dataset pilota contiene solo record SAMPLE non reali', () => {
  assert.equal(pilotSampleMeasures.length, 3);
  for (const measure of pilotSampleMeasures) {
    assert.equal(measure.recordType, 'SAMPLE');
    assert.equal(measure.status, 'UNKNOWN');
    assert.equal(measure.dataQuality, 'TO_VERIFY');
    assert.match(measure.title ?? '', /^SAMPLE/);
    assert.match(measure.description ?? '', /non descrive.*reale/i);
  }
});
