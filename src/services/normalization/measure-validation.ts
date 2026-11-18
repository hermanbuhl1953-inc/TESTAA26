import {
  MeasureSchema,
  type DataQuality,
  type Measure,
  type MeasureValidationIssue,
  type MeasureValidationResult,
} from '../../domain/measures/model.ts';

export interface ValidationOptions {
  asOf?: Date;
}

function issue(
  severity: MeasureValidationIssue['severity'],
  code: string,
  path: string,
  message: string,
): MeasureValidationIssue {
  return { severity, code, path, message };
}

function validDate(value: string | null): number | null {
  if (value === null) return null;
  const parsed = Date.parse(value);
  return Number.isNaN(parsed) ? null : parsed;
}

function statusDateIssues(measure: Measure, asOf: Date): MeasureValidationIssue[] {
  const start = validDate(measure.application.startDate);
  const end = validDate(measure.application.endDate);
  const now = asOf.getTime();
  const issues: MeasureValidationIssue[] = [];

  if (measure.status === 'OPEN'
    && ((start !== null && now < start) || (end !== null && now > end))) {
    issues.push(issue('ERROR', 'STATUS_DATE_CONFLICT', 'status', 'Lo stato OPEN non è compatibile con le date della domanda.'));
  }
  if (measure.status === 'UPCOMING' && start !== null && now >= start) {
    issues.push(issue('ERROR', 'STATUS_DATE_CONFLICT', 'status', 'Lo stato UPCOMING non è compatibile con la data di apertura.'));
  }
  if (measure.status === 'CLOSED' && end !== null && now <= end) {
    issues.push(issue('ERROR', 'STATUS_DATE_CONFLICT', 'status', 'Lo stato CLOSED non è compatibile con una scadenza futura o odierna.'));
  }
  if (measure.status === 'UPCOMING' && start === null) {
    issues.push(issue('WARNING', 'STATUS_CANNOT_BE_CONFIRMED', 'application.startDate', 'Senza data di apertura non è possibile verificare lo stato UPCOMING.'));
  }
  if (measure.status === 'CLOSED' && end === null) {
    issues.push(issue('WARNING', 'STATUS_CANNOT_BE_CONFIRMED', 'application.endDate', 'Senza data di chiusura lo stato CLOSED non è verificabile dalle sole date.'));
  }
  return issues;
}

function amountIssues(measure: Measure): MeasureValidationIssue[] {
  const { amount } = measure;
  const issues: MeasureValidationIssue[] = [];
  if (amount.min !== null && amount.max !== null && amount.min > amount.max) {
    issues.push(issue('ERROR', 'AMOUNT_RANGE_INVERTED', 'amount', 'L’importo minimo supera l’importo massimo.'));
  }
  if (amount.value !== null
    && ((amount.min !== null && amount.value < amount.min)
      || (amount.max !== null && amount.value > amount.max))) {
    issues.push(issue('ERROR', 'AMOUNT_VALUE_OUT_OF_RANGE', 'amount.value', 'L’importo indicato è fuori dai limiti min/max.'));
  }
  if (amount.type === 'FIXED' && amount.value === null) {
    issues.push(issue('WARNING', 'FIXED_AMOUNT_MISSING', 'amount.value', 'L’importo è indicato come fisso ma il valore non è disponibile.'));
  }
  if (amount.type === 'MAXIMUM' && amount.max === null && amount.value === null) {
    issues.push(issue('WARNING', 'MAXIMUM_AMOUNT_MISSING', 'amount.max', 'L’importo massimo non è disponibile.'));
  }
  if (amount.type === 'UNKNOWN' && [amount.value, amount.min, amount.max].some((value) => value !== null)) {
    issues.push(issue('ERROR', 'UNKNOWN_AMOUNT_HAS_VALUES', 'amount', 'Un importo UNKNOWN non può contenere valori.'));
  }
  if (amount.type !== 'UNKNOWN' && amount.currency === null) {
    issues.push(issue('WARNING', 'AMOUNT_CURRENCY_MISSING', 'amount.currency', 'La valuta non è specificata.'));
  }
  return issues;
}

function sourceIssues(measure: Measure, asOfTime: number): MeasureValidationIssue[] {
  const issues: MeasureValidationIssue[] = [];
  if (!measure.source.sourceName?.trim()) {
    issues.push(issue('ERROR', 'SOURCE_NAME_MISSING', 'source.sourceName', 'Il nome della fonte istituzionale è obbligatorio.'));
  }
  if (!measure.source.url?.trim()) {
    issues.push(issue('ERROR', 'SOURCE_URL_MISSING', 'source.url', 'La fonte deve avere un URL specifico verificabile.'));
  } else {
    try {
      const url = new URL(measure.source.url);
      if (url.protocol !== 'https:' && url.protocol !== 'http:') {
        issues.push(issue('ERROR', 'SOURCE_URL_INVALID', 'source.url', 'La fonte deve usare un URL HTTP o HTTPS.'));
      }
    } catch {
      issues.push(issue('ERROR', 'SOURCE_URL_INVALID', 'source.url', 'L’URL della fonte non è valido.'));
    }
  }
  if (!measure.authority.type || !measure.authority.name?.trim()) {
    issues.push(issue('ERROR', 'AUTHORITY_MISSING', 'authority', 'Ente e tipologia dell’ente sono obbligatori.'));
  }
  if (measure.recordType === 'REAL'
    && (measure.source.sourceType !== 'OFFICIAL'
      || !measure.source.url?.trim()
      || !measure.source.lastVerifiedAt)) {
    issues.push(issue(
      'ERROR',
      'REAL_REQUIRES_OFFICIAL_SOURCE',
      'source',
      'Un record REAL richiede una fonte istituzionale con URL e data di ultima verifica.',
    ));
  }
  if (measure.source.sourceType !== 'OFFICIAL') {
    const mustBeOfficial = measure.recordType === 'REAL'
      || measure.status === 'OPEN'
      || measure.dataQuality === 'VERIFIED';
    issues.push(issue(
      mustBeOfficial ? 'ERROR' : 'WARNING',
      measure.source.sourceType === 'SECONDARY' ? 'SECONDARY_SOURCE_ONLY' : 'OFFICIAL_SOURCE_REQUIRED',
      'source.sourceType',
      mustBeOfficial
        ? 'Una misura REAL, OPEN o VERIFIED richiede una fonte ufficiale.'
        : 'La fonte non è istituzionale: il record non può essere presentato come misura ufficiale.',
    ));
  }
  if (measure.application.url) {
    try {
      const url = new URL(measure.application.url);
      if (url.protocol !== 'https:' && url.protocol !== 'http:') {
        issues.push(issue('ERROR', 'APPLICATION_URL_INVALID', 'application.url', 'L’URL della procedura deve usare HTTP o HTTPS.'));
      }
    } catch {
      issues.push(issue('ERROR', 'APPLICATION_URL_INVALID', 'application.url', 'L’URL della procedura non è valido.'));
    }
  }
  if (!measure.source.lastVerifiedAt) {
    const severity = measure.status === 'OPEN' || measure.dataQuality === 'VERIFIED' ? 'ERROR' : 'WARNING';
    issues.push(issue(severity, 'SOURCE_NOT_VERIFIED', 'source.lastVerifiedAt', 'La data dell’ultima verifica della fonte non è disponibile.'));
  }
  if (!measure.source.retrievedAt) {
    issues.push(issue('WARNING', 'SOURCE_RETRIEVAL_DATE_MISSING', 'source.retrievedAt', 'La data di acquisizione della fonte non è disponibile.'));
  }
  const retrievedAt = validDate(measure.source.retrievedAt);
  const lastVerifiedAt = validDate(measure.source.lastVerifiedAt);
  if (retrievedAt !== null && lastVerifiedAt !== null && retrievedAt > lastVerifiedAt) {
    issues.push(issue('ERROR', 'SOURCE_DATES_INVERTED', 'source', 'La data di acquisizione è successiva all’ultima verifica dichiarata.'));
  }
  if (lastVerifiedAt !== null && lastVerifiedAt > asOfTime) {
    issues.push(issue('ERROR', 'SOURCE_VERIFICATION_IN_FUTURE', 'source.lastVerifiedAt', 'La data di ultima verifica è nel futuro rispetto alla validazione.'));
  }
  if (measure.dataQuality === 'VERIFIED'
    && (measure.recordType === 'SAMPLE'
      || !measure.source.lastVerifiedAt
      || !measure.source.url?.trim()
      || measure.source.sourceType !== 'OFFICIAL')) {
    issues.push(issue('ERROR', 'VERIFIED_QUALITY_UNSUPPORTED', 'dataQuality', 'La qualità VERIFIED richiede una fonte verificata; un record SAMPLE non può essere VERIFIED.'));
  }
  return issues;
}

function territoryIssues(measure: Measure): MeasureValidationIssue[] {
  if (measure.authority.type === 'REGION' && !measure.territory.region) {
    return [issue('WARNING', 'REGION_MISSING', 'territory.region', 'Il territorio non indica la Regione di riferimento.')];
  }
  if (measure.authority.type === 'MUNICIPALITY'
    && (!measure.territory.region || !measure.territory.municipality)) {
    return [issue('WARNING', 'MUNICIPAL_TERRITORY_INCOMPLETE', 'territory', 'Per una misura comunale è opportuno indicare Regione e Comune.')];
  }
  return [];
}

function recommendQuality(measure: Measure, issues: MeasureValidationIssue[]): DataQuality {
  if (measure.recordType === 'SAMPLE' || issues.some((entry) => entry.severity === 'ERROR')) {
    return 'TO_VERIFY';
  }
  if (issues.some((entry) => [
    'SOURCE_NOT_VERIFIED',
    'SOURCE_RETRIEVAL_DATE_MISSING',
    'SOURCE_URL_MISSING',
    'SOURCE_NAME_MISSING',
    'SECONDARY_SOURCE_ONLY',
  ].includes(entry.code))) {
    return 'TO_VERIFY';
  }
  if (issues.some((entry) => entry.severity === 'WARNING')
    || measure.unstructuredRequirements.length > 0
    || measure.requirements.otherRequirements.some((requirement) => !requirement.structured)) {
    return 'PARTIAL';
  }
  return measure.dataQuality;
}

export function validateMeasure(
  input: Measure,
  options: ValidationOptions = {},
): MeasureValidationResult {
  const measure = MeasureSchema.parse(input);
  const asOf = options.asOf ?? new Date();
  if (Number.isNaN(asOf.getTime())) throw new Error('La data di validazione non è valida.');
  const asOfTime = asOf.getTime();

  const issues: MeasureValidationIssue[] = [];
  if (!measure.id?.trim()) issues.push(issue('ERROR', 'ID_MISSING', 'id', 'L’identificativo della misura è obbligatorio.'));
  if (!measure.title?.trim()) issues.push(issue('ERROR', 'TITLE_MISSING', 'title', 'Il titolo della misura è obbligatorio.'));
  if (!measure.description?.trim()) issues.push(issue('WARNING', 'DESCRIPTION_MISSING', 'description', 'La descrizione non è disponibile.'));
  if (measure.application.startDate && measure.application.endDate
    && Date.parse(measure.application.startDate) > Date.parse(measure.application.endDate)) {
    issues.push(issue('ERROR', 'APPLICATION_DATES_INVERTED', 'application', 'La data di inizio è successiva alla data di fine.'));
  }
  if (measure.requirements.iseeMin !== null && measure.requirements.iseeMax !== null
    && measure.requirements.iseeMin > measure.requirements.iseeMax) {
    issues.push(issue('ERROR', 'ISEE_RANGE_INVERTED', 'requirements', 'ISEE minimo superiore all’ISEE massimo.'));
  }
  if (measure.requirements.minAge !== null && measure.requirements.maxAge !== null
    && measure.requirements.minAge > measure.requirements.maxAge) {
    issues.push(issue('ERROR', 'AGE_RANGE_INVERTED', 'requirements', 'Età minima superiore all’età massima.'));
  }
  issues.push(...amountIssues(measure), ...sourceIssues(measure, asOfTime), ...territoryIssues(measure));
  issues.push(...statusDateIssues(measure, asOf));
  if (measure.recordType === 'SAMPLE') {
    issues.push(issue('WARNING', 'SAMPLE_NOT_REAL', 'recordType', 'Record SAMPLE: non rappresenta una misura reale e non deve essere presentato agli utenti come agevolazione.'));
  }
  if (measure.unstructuredRequirements.length > 0) {
    issues.push(issue('WARNING', 'UNSTRUCTURED_REQUIREMENTS', 'unstructuredRequirements', 'Sono presenti requisiti testuali non ancora trasformati in regole.'));
  }

  const errors = issues.some((entry) => entry.severity === 'ERROR');
  return {
    measureId: measure.id,
    valid: !errors,
    importAllowed: !errors,
    issues,
    recommendedDataQuality: recommendQuality(measure, issues),
  };
}
