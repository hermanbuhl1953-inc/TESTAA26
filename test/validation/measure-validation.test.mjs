import assert from 'node:assert/strict';
import test from 'node:test';
import { getSourceById } from '../../src/data/sources/registry.ts';
import { normalizeRawMeasure } from '../../src/services/normalization/normalize-measure.ts';
import { validateMeasure } from '../../src/services/normalization/measure-validation.ts';
import { pilotSampleMeasures } from '../../src/data/samples/pilot-measures.ts';

const DEMO_AS_OF = new Date('2026-11-16T12:00:00.000Z');
const regionSource = getSourceById('lombardia-bandi');

function validDemoMeasure(overrides = {}) {
  if (!regionSource) throw new Error('Fixture DEMO senza sorgente registry');
  return normalizeRawMeasure({
    id: 'SAMPLE-VALIDATION-001',
    title: 'SAMPLE — record tecnico di validazione',
    description: 'Fixture tecnica non riferita a una misura reale.',
    sourceUrl: regionSource.baseUrl,
    retrievedAt: '2026-11-16T10:00:00.000Z',
    lastVerifiedAt: '2026-11-16T10:00:00.000Z',
    recordType: 'SAMPLE',
    status: 'UNKNOWN',
    ...overrides,
  }, { source: regionSource });
}

function issueCodes(measure) {
  return validateMeasure(measure, { asOf: DEMO_AS_OF }).issues.map((entry) => entry.code);
}

test('misura senza URL sorgente produce ERROR e blocca l’importazione', () => {
  const measure = validDemoMeasure({ sourceUrl: null });
  const result = validateMeasure(measure, { asOf: DEMO_AS_OF });
  assert.equal(result.importAllowed, false);
  assert.ok(result.issues.some((entry) => entry.severity === 'ERROR' && entry.code === 'SOURCE_URL_MISSING'));
});

test('ISEE minimo superiore al massimo produce ERROR', () => {
  const measure = validDemoMeasure({ requirements: { iseeMin: 3_000_000, iseeMax: 2_000_000 } });
  assert.ok(issueCodes(measure).includes('ISEE_RANGE_INVERTED'));
  assert.equal(validateMeasure(measure, { asOf: DEMO_AS_OF }).importAllowed, false);
});

test('date di domanda invertite producono ERROR', () => {
  const measure = validDemoMeasure({
    application: {
      startDate: '2026-12-01T00:00:00.000Z',
      endDate: '2026-11-01T00:00:00.000Z',
    },
  });
  assert.ok(issueCodes(measure).includes('APPLICATION_DATES_INVERTED'));
});

test('età minima superiore alla massima produce ERROR', () => {
  const measure = validDemoMeasure({ requirements: { minAge: 65, maxAge: 18 } });
  assert.ok(issueCodes(measure).includes('AGE_RANGE_INVERTED'));
});

test('importi incoerenti producono ERROR', () => {
  const measure = validDemoMeasure({ amount: { type: 'VARIABLE', min: 2_000, max: 1_000, currency: 'EUR' } });
  assert.ok(issueCodes(measure).includes('AMOUNT_RANGE_INVERTED'));
});

test('territorio comunale incompleto è WARNING e suggerisce qualità non verificata', () => {
  const source = getSourceById('milano-quota-nidi');
  if (!source) throw new Error('Fixture DEMO senza sorgente comunale');
  const measure = normalizeRawMeasure({
    id: 'SAMPLE-MILANO-TERRITORY',
    title: 'SAMPLE — territorio incompleto',
    sourceUrl: source.baseUrl,
  }, { source });
  const result = validateMeasure({
    ...measure,
    territory: { region: null, province: null, municipality: null },
  }, { asOf: DEMO_AS_OF });
  assert.ok(result.issues.some((entry) => entry.severity === 'WARNING'
    && entry.code === 'MUNICIPAL_TERRITORY_INCOMPLETE'));
  assert.equal(result.importAllowed, true);
  assert.equal(result.recommendedDataQuality, 'TO_VERIFY');
});

test('un WARNING non blocca l’importazione e suggerisce qualità PARTIAL', () => {
  const measure = validDemoMeasure({
    recordType: 'DEMO',
    unstructuredRequirements: ['Fixture DEMO: nota non ancora strutturata.'],
  });
  const result = validateMeasure(measure, { asOf: DEMO_AS_OF });
  assert.equal(result.importAllowed, true);
  assert.equal(result.recommendedDataQuality, 'PARTIAL');
  assert.ok(result.issues.some((entry) => entry.severity === 'WARNING'));
  assert.equal(measure.recordType, 'DEMO');
});

test('una fonte secondaria può restare parziale ma non verificare o aprire una misura', () => {
  const measure = {
    ...validDemoMeasure({ recordType: 'DEMO', dataQuality: 'PARTIAL' }),
    source: { ...validDemoMeasure().source, sourceType: 'SECONDARY' },
  };
  const result = validateMeasure(measure, { asOf: DEMO_AS_OF });
  assert.equal(result.importAllowed, true);
  assert.equal(result.recommendedDataQuality, 'TO_VERIFY');
  assert.ok(result.issues.some((entry) => entry.code === 'SECONDARY_SOURCE_ONLY'));

  const open = validateMeasure({
    ...measure,
    status: 'OPEN',
  }, { asOf: DEMO_AS_OF });
  assert.equal(open.importAllowed, false);
  assert.ok(open.issues.some((entry) => entry.severity === 'ERROR'
    && entry.code === 'SECONDARY_SOURCE_ONLY'));
});

test('stato OPEN incompatibile con date produce ERROR', () => {
  const measure = validDemoMeasure({
    status: 'OPEN',
    application: { startDate: '2026-12-01T00:00:00.000Z' },
  });
  assert.ok(issueCodes(measure).includes('STATUS_DATE_CONFLICT'));
});

test('record REAL senza fonte ufficiale non è importabile', () => {
  const measure = validDemoMeasure({
    id: 'FIXTURE-NOT-A-REAL-BENEFIT',
    title: 'Fixture sintetica — controllo fonte REAL',
    recordType: 'REAL',
    sourceUrl: null,
    lastVerifiedAt: null,
  });
  const result = validateMeasure(measure, { asOf: DEMO_AS_OF });
  assert.equal(result.importAllowed, false);
  assert.ok(result.issues.some((entry) => entry.code === 'REAL_REQUIRES_OFFICIAL_SOURCE'));
  assert.ok(result.issues.some((entry) => entry.code === 'SOURCE_URL_MISSING'));
});

test('record SAMPLE non è mai misura reale verificata', () => {
  const sample = pilotSampleMeasures[0];
  const result = validateMeasure({ ...sample, dataQuality: 'VERIFIED' }, { asOf: DEMO_AS_OF });
  assert.equal(sample.recordType, 'SAMPLE');
  assert.equal(result.recommendedDataQuality, 'TO_VERIFY');
  assert.ok(result.issues.some((entry) => entry.code === 'SAMPLE_NOT_REAL'));
  assert.ok(result.issues.some((entry) => entry.code === 'VERIFIED_QUALITY_UNSUPPORTED'));
});

test('titolo e autorità mancanti sono ERROR; requisiti testuali restano WARNING', () => {
  const measure = validDemoMeasure({ unstructuredRequirements: ['Fixture: requisito non strutturato.'] });
  const incomplete = {
    ...measure,
    title: null,
    authority: { type: null, name: null },
  };
  const result = validateMeasure(incomplete, { asOf: DEMO_AS_OF });
  assert.equal(result.importAllowed, false);
  assert.ok(result.issues.some((entry) => entry.code === 'TITLE_MISSING'));
  assert.ok(result.issues.some((entry) => entry.code === 'AUTHORITY_MISSING'));
  assert.ok(result.issues.some((entry) => entry.severity === 'WARNING' && entry.code === 'UNSTRUCTURED_REQUIREMENTS'));
});
