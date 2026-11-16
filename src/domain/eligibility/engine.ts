import {
  BenefitSchema,
  type Benefit,
  type BenefitEvaluation,
  type BenefitRule,
  type HouseholdProfile,
  type JsonValue,
  type RuleResult,
  HouseholdProfileSchema,
} from './model.ts';

type Comparable = string | number | boolean;

const fieldLabels: Record<BenefitRule['field'], string> = {
  region: 'Regione',
  municipality: 'Comune',
  iseeAmountCents: 'ISEE',
  iseeType: 'Tipo ISEE',
  adultCount: 'Numero di adulti',
  childCount: 'Numero di figli',
  householdSize: 'Numero di componenti',
  childAges: 'Età dei figli',
  hasMinor: 'Presenza di minorenni',
  hasChildUnder3: 'Presenza di figli sotto i 3 anni',
  hasAdultOver65: 'Presenza di adulti over 65',
  hasDisability: 'Presenza di disabilità',
  hasNonSelfSufficientMember: 'Presenza di non autosufficienza',
  employmentStatuses: 'Situazione lavorativa',
  housingType: 'Tipo di abitazione',
  registeredRentalContract: 'Contratto di affitto registrato',
  residenceMonths: 'Mesi di residenza',
};

function getActualValue(
  field: BenefitRule['field'],
  profile: HouseholdProfile,
): JsonValue | undefined {
  const members = profile.members;

  switch (field) {
    case 'householdSize':
      return profile.adultCount === undefined || profile.childCount === undefined
        ? undefined
        : profile.adultCount + profile.childCount;
    case 'childAges':
      if (profile.childCount === 0 || (members && !members.some((member) => member.role === 'CHILD'))) {
        return [];
      }
      if (!members) return undefined;
      if (members.some((member) => member.role === 'CHILD' && member.ageYears === undefined)) {
        return undefined;
      }
      return members
        .filter((member) => member.role === 'CHILD')
        .map((member) => member.ageYears as number);
    case 'hasMinor':
      return aggregateMemberFact(members, (age) => age < 18);
    case 'hasChildUnder3':
      if (profile.childCount === 0) return false;
      return aggregateChildFact(members, (age) => age < 3);
    case 'hasAdultOver65':
      return aggregateMemberFact(
        members?.filter((member) => member.role === 'ADULT'),
        (age) => age > 65,
      );
    case 'hasDisability':
      return aggregateBooleanFact(members, (member) => member.hasDisability);
    case 'hasNonSelfSufficientMember':
      return aggregateBooleanFact(members, (member) => member.isNonSelfSufficient);
    case 'employmentStatuses': {
      if (!members?.length || members.some((member) => member.employmentStatus === undefined)) {
        return undefined;
      }
      return members.map((member) => member.employmentStatus as string);
    }
    default:
      return profile[field];
  }
}

function aggregateMemberFact(
  members: HouseholdProfile['members'],
  predicate: (age: number) => boolean,
): boolean | undefined {
  if (!members?.length) return undefined;
  const knownAges = members.flatMap((member) => member.ageYears === undefined ? [] : [member.ageYears]);
  if (knownAges.some(predicate)) return true;
  return knownAges.length === members.length ? false : undefined;
}

function aggregateChildFact(
  members: HouseholdProfile['members'],
  predicate: (age: number) => boolean,
): boolean | undefined {
  const children = members?.filter((member) => member.role === 'CHILD');
  if (!children?.length) return undefined;
  const knownAges = children.flatMap((member) => member.ageYears === undefined ? [] : [member.ageYears]);
  if (knownAges.some(predicate)) return true;
  return knownAges.length === children.length ? false : undefined;
}

function aggregateBooleanFact(
  members: HouseholdProfile['members'],
  getValue: (member: NonNullable<HouseholdProfile['members']>[number]) => boolean | undefined,
): boolean | undefined {
  if (!members?.length) return undefined;
  const values = members.map(getValue);
  if (values.some((value) => value === true)) return true;
  return values.every((value) => value === false) ? false : undefined;
}

function matches(rule: BenefitRule, actual: JsonValue): boolean {
  const expected = rule.expectedValue;
  switch (rule.operator) {
    case 'EQ':
      return actual === expected;
    case 'NE':
      return actual !== expected;
    case 'LTE':
      return typeof actual === 'number' && typeof expected === 'number' && actual <= expected;
    case 'GTE':
      return typeof actual === 'number' && typeof expected === 'number' && actual >= expected;
    case 'IN':
      return Array.isArray(expected) && expected.includes(actual);
    case 'BETWEEN':
      return isNumberPair(expected) && typeof actual === 'number'
        && actual >= expected[0] && actual <= expected[1];
    case 'ANY_BETWEEN':
      return isNumberArray(actual) && isNumberPair(expected)
        && actual.some((value) => value >= expected[0] && value <= expected[1]);
    case 'ALL_BETWEEN':
      return isNumberArray(actual) && actual.length > 0 && isNumberPair(expected)
        && actual.every((value) => value >= expected[0] && value <= expected[1]);
    case 'CONTAINS':
      return Array.isArray(actual) && actual.includes(expected);
  }
}

function isNumberPair(value: JsonValue): value is [number, number] {
  return Array.isArray(value) && value.length === 2
    && typeof value[0] === 'number' && typeof value[1] === 'number';
}

function isNumberArray(value: JsonValue): value is number[] {
  return Array.isArray(value) && value.every((item) => typeof item === 'number');
}

function formatValue(value: JsonValue): string {
  if (typeof value === 'boolean') return value ? 'sì' : 'no';
  if (typeof value === 'number') return new Intl.NumberFormat('it-IT').format(value);
  if (Array.isArray(value)) return value.map(formatValue).join(', ');
  if (value !== null && typeof value === 'object') {
    return Object.values(value).map(formatValue).join(' – ');
  }
  return String(value);
}

function formatIsee(cents: number): string {
  return new Intl.NumberFormat('it-IT', {
    style: 'currency',
    currency: 'EUR',
    maximumFractionDigits: 0,
  }).format(cents / 100);
}

function describeRule(
  rule: BenefitRule,
  actual: JsonValue | undefined,
  status: RuleResult['status'],
): string {
  const label = fieldLabels[rule.field];
  if (status === 'MISSING') return `Per valutare il requisito «${label}» serve questa informazione.`;
  if (status === 'NOT_APPLICABLE') {
    return `Il requisito «${label}» è facoltativo e non è valutabile con i dati disponibili.`;
  }

  const actualText = rule.field === 'iseeAmountCents' && typeof actual === 'number'
    ? formatIsee(actual)
    : formatValue(actual as JsonValue);
  const expectedText = rule.field === 'iseeAmountCents' && typeof rule.expectedValue === 'number'
    ? formatIsee(rule.expectedValue)
    : formatValue(rule.expectedValue);

  if (rule.field === 'iseeAmountCents' && rule.operator === 'LTE') {
    return status === 'PASS'
      ? `Il tuo ISEE di ${actualText} rientra nella soglia massima di ${expectedText}.`
      : `Il tuo ISEE di ${actualText} supera la soglia massima di ${expectedText}.`;
  }
  if (rule.field === 'municipality' && rule.operator === 'EQ') {
    return status === 'PASS'
      ? `La misura è disponibile per i residenti nel Comune di ${expectedText}.`
      : `La misura richiede la residenza nel Comune di ${expectedText}; il profilo indica ${actualText}.`;
  }
  if (rule.field === 'housingType' && rule.expectedValue === 'RENT') {
    return status === 'PASS'
      ? 'Il requisito relativo all’abitazione in affitto risulta soddisfatto.'
      : 'Il requisito relativo all’abitazione in affitto non risulta soddisfatto.';
  }
  if (status === 'PASS') return `Il requisito «${label}» risulta soddisfatto (${actualText}).`;
  return `Il requisito «${label}» non risulta soddisfatto: richiesto ${expectedText}, rilevato ${actualText}.`;
}

function evaluateRule(rule: BenefitRule, profile: HouseholdProfile): RuleResult {
  const actualValue = getActualValue(rule.field, profile);
  const status = actualValue === undefined
    ? rule.required ? 'MISSING' : 'NOT_APPLICABLE'
    : matches(rule, actualValue) ? 'PASS' : 'FAIL';

  return {
    rule,
    expectedValue: rule.expectedValue,
    actualValue: actualValue ?? null,
    status,
    message: describeRule(rule, actualValue, status),
  };
}

function checkAvailability(benefit: Benefit, evaluatedAt: Date): string | undefined {
  if (benefit.closesAt && evaluatedAt >= benefit.closesAt) {
    return 'La misura risulta scaduta alla data di valutazione.';
  }
  if (benefit.opensAt && evaluatedAt < benefit.opensAt) {
    return 'La misura non è ancora aperta alla data di valutazione.';
  }
  return undefined;
}

export function evaluateBenefit(
  rawBenefit: Benefit,
  rawProfile: HouseholdProfile,
  evaluatedAt: Date = new Date(),
): BenefitEvaluation {
  const benefit = BenefitSchema.parse(rawBenefit);
  const profile = HouseholdProfileSchema.parse(rawProfile);
  if (Number.isNaN(evaluatedAt.getTime())) throw new Error('La data di valutazione non è valida.');

  const rules = benefit.rules.map((rule) => evaluateRule(rule, profile));
  const unavailableMessage = checkAvailability(benefit, evaluatedAt);
  let status: BenefitEvaluation['status'];
  let message: string;

  if (unavailableMessage) {
    status = 'EXPIRED';
    message = unavailableMessage;
  } else if (rules.some((result) => result.rule.required && result.status === 'FAIL')) {
    status = 'NOT_ELIGIBLE';
    message = 'Almeno un requisito obbligatorio non risulta soddisfatto.';
  } else if (rules.some((result) => result.rule.required && result.status === 'MISSING')) {
    status = 'NEEDS_DATA';
    message = 'Completa le informazioni richieste per valutare la misura.';
  } else if (rules.some((result) => result.status === 'FAIL' || result.status === 'NOT_APPLICABLE')) {
    status = 'LIKELY';
    message = 'I requisiti obbligatori risultano soddisfatti, ma alcuni criteri facoltativi non sono verificabili o non coincidono.';
  } else {
    status = 'ELIGIBLE';
    message = 'Tutti i requisiti obbligatori risultano soddisfatti in base ai dati inseriti.';
  }

  return { benefitCode: benefit.code, status, message, evaluatedAt, rules };
}
