import assert from 'node:assert/strict';
import test from 'node:test';
import { evaluateBenefit } from '../../src/domain/eligibility/engine.ts';

const DEMO_EVALUATION_DATE = new Date('2026-06-15T12:00:00.000Z');
const DEMO_BENEFIT = {
  code: 'DEMO-FAMIGLIA',
  title: 'Agevolazione dimostrativa',
  description: 'Fixture DEMO esclusivamente per test; non rappresenta una misura reale.',
  opensAt: new Date('2026-01-01T00:00:00.000Z'),
  closesAt: new Date('2026-12-31T23:59:59.999Z'),
  rules: [
    { code: 'regione', label: 'Regione', field: 'region', operator: 'EQ', expectedValue: 'Lombardia', required: true },
    { code: 'comune', label: 'Comune', field: 'municipality', operator: 'EQ', expectedValue: 'Milano', required: true },
    { code: 'isee', label: 'ISEE', field: 'iseeAmountCents', operator: 'LTE', expectedValue: 3_000_000, required: true },
    { code: 'figli', label: 'Numero figli', field: 'childCount', operator: 'GTE', expectedValue: 2, required: true },
    { code: 'eta-figlio', label: 'Età figli', field: 'childAges', operator: 'ANY_BETWEEN', expectedValue: [0, 3], required: true },
    { code: 'affitto', label: 'Abitazione', field: 'housingType', operator: 'EQ', expectedValue: 'RENT', required: true },
    { code: 'contratto', label: 'Contratto registrato', field: 'registeredRentalContract', operator: 'EQ', expectedValue: true, required: true },
    { code: 'residenza', label: 'Residenza minima', field: 'residenceMonths', operator: 'GTE', expectedValue: 12, required: true },
  ],
};

const DEMO_PROFILE = {
  region: 'Lombardia',
  municipality: 'Milano',
  iseeAmountCents: 1_800_000,
  iseeType: 'ORDINARIO',
  adultCount: 2,
  childCount: 2,
  members: [
    { role: 'ADULT', ageYears: 40, hasDisability: false, isNonSelfSufficient: false, employmentStatus: 'EMPLOYED' },
    { role: 'ADULT', ageYears: 38, hasDisability: false, isNonSelfSufficient: false, employmentStatus: 'EMPLOYED' },
    { role: 'CHILD', ageYears: 8, hasDisability: false, isNonSelfSufficient: false, employmentStatus: 'INACTIVE' },
    { role: 'CHILD', ageYears: 2, hasDisability: false, isNonSelfSufficient: false, employmentStatus: 'INACTIVE' },
  ],
  housingType: 'RENT',
  registeredRentalContract: true,
  residenceMonths: 24,
};

function evaluate(benefit = DEMO_BENEFIT, profile = DEMO_PROFILE, date = DEMO_EVALUATION_DATE) {
  return evaluateBenefit(benefit, profile, date);
}

function withRule(ruleCode, changes) {
  return {
    ...DEMO_BENEFIT,
    rules: DEMO_BENEFIT.rules.map((rule) => rule.code === ruleCode ? { ...rule, ...changes } : rule),
  };
}

test('DEMO: profilo compatibile produce ELIGIBLE e spiegazioni PASS', () => {
  const result = evaluate();
  const iseeMessage = result.rules.find((rule) => rule.rule.code === 'isee')?.message ?? '';
  const municipalityMessage = result.rules.find((rule) => rule.rule.code === 'comune')?.message ?? '';
  assert.equal(result.status, 'ELIGIBLE');
  assert.equal(result.rules.find((rule) => rule.rule.code === 'isee')?.status, 'PASS');
  assert.equal(result.rules.find((rule) => rule.rule.code === 'comune')?.status, 'PASS');
  assert.match(iseeMessage.replace(/\s/g, ''), /18\.000€/);
  assert.match(municipalityMessage, /Comune di Milano/);
});

test('DEMO: ISEE troppo alto produce NOT_ELIGIBLE con dettaglio FAIL', () => {
  const result = evaluate(DEMO_BENEFIT, { ...DEMO_PROFILE, iseeAmountCents: 3_100_000 });
  assert.equal(result.status, 'NOT_ELIGIBLE');
  assert.equal(result.rules.find((rule) => rule.rule.code === 'isee')?.status, 'FAIL');
});

test('DEMO: ISEE mancante produce NEEDS_DATA, non NOT_ELIGIBLE', () => {
  const { iseeAmountCents: _ignored, ...profile } = DEMO_PROFILE;
  const result = evaluate(DEMO_BENEFIT, profile);
  assert.equal(result.status, 'NEEDS_DATA');
  const iseeRule = result.rules.find((rule) => rule.rule.code === 'isee');
  assert.equal(iseeRule?.status, 'MISSING');
  assert.equal(iseeRule?.actualValue, null);
  assert.ok(iseeRule && 'rule' in iseeRule && 'expectedValue' in iseeRule && 'message' in iseeRule);
});

test('DEMO: Comune errato produce NOT_ELIGIBLE e spiega il territorio atteso', () => {
  const result = evaluate(DEMO_BENEFIT, { ...DEMO_PROFILE, municipality: 'Bergamo' });
  const municipality = result.rules.find((rule) => rule.rule.code === 'comune');
  assert.equal(result.status, 'NOT_ELIGIBLE');
  assert.equal(municipality?.status, 'FAIL');
  assert.match(municipality?.message ?? '', /Comune di Milano/);
});

test('DEMO: numero figli insufficiente produce NOT_ELIGIBLE', () => {
  const profile = {
    ...DEMO_PROFILE,
    childCount: 1,
    members: [
      ...DEMO_PROFILE.members.filter((member) => member.role === 'ADULT'),
      DEMO_PROFILE.members.find((member) => member.role === 'CHILD' && member.ageYears === 2),
    ],
  };
  const result = evaluate(DEMO_BENEFIT, profile);
  assert.equal(result.status, 'NOT_ELIGIBLE');
  assert.equal(result.rules.find((rule) => rule.rule.code === 'figli')?.status, 'FAIL');
});

test('DEMO: età dei figli non compatibile produce NOT_ELIGIBLE', () => {
  const profile = {
    ...DEMO_PROFILE,
    members: DEMO_PROFILE.members?.map((member) => member.role === 'CHILD'
      ? { ...member, ageYears: 5 }
      : member),
  };
  const result = evaluate(DEMO_BENEFIT, profile);
  assert.equal(result.status, 'NOT_ELIGIBLE');
  assert.equal(result.rules.find((rule) => rule.rule.code === 'eta-figlio')?.status, 'FAIL');
});

test('DEMO: dato opzionale assente è NOT_APPLICABLE e non obbliga a raccoglierlo', () => {
  const benefit = {
    ...DEMO_BENEFIT,
    rules: [
      ...DEMO_BENEFIT.rules,
      { code: 'disabilita', label: 'Disabilità', field: 'hasDisability', operator: 'EQ', expectedValue: true, required: false },
    ],
  };
  const profile = {
    ...DEMO_PROFILE,
    members: DEMO_PROFILE.members?.map(({ hasDisability: _ignored, ...member }) => member),
  };
  const result = evaluate(benefit, profile);
  assert.equal(result.status, 'LIKELY');
  assert.equal(result.rules.find((rule) => rule.rule.code === 'disabilita')?.status, 'NOT_APPLICABLE');
});

test('DEMO: requisito affitto e contratto registrato vengono valutati separatamente', () => {
  const result = evaluate(DEMO_BENEFIT, { ...DEMO_PROFILE, registeredRentalContract: false });
  assert.equal(result.rules.find((rule) => rule.rule.code === 'affitto')?.status, 'PASS');
  assert.equal(result.rules.find((rule) => rule.rule.code === 'contratto')?.status, 'FAIL');
  assert.equal(result.status, 'NOT_ELIGIBLE');
});

test('DEMO: misura scaduta produce EXPIRED', () => {
  const result = evaluate(DEMO_BENEFIT, DEMO_PROFILE, new Date('2027-01-01T00:00:00.000Z'));
  assert.equal(result.status, 'EXPIRED');
  assert.match(result.message, /scaduta/);
});

test('DEMO: misura non ancora aperta produce EXPIRED con messaggio distinto', () => {
  const result = evaluate(DEMO_BENEFIT, DEMO_PROFILE, new Date('2025-12-31T23:59:59.000Z'));
  assert.equal(result.status, 'EXPIRED');
  assert.match(result.message, /non è ancora aperta/);
});

test('DEMO: regola ISEE opzionale non applicabile lascia esito LIKELY', () => {
  const benefit = withRule('isee', { required: false });
  const { iseeAmountCents: _ignored, ...profile } = DEMO_PROFILE;
  assert.equal(evaluate(benefit, profile).status, 'LIKELY');
});
