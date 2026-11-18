import type { Measure, MeasureConflictResult } from '../../domain/measures/model.ts';

function normalizedText(value: string | null): string {
  return (value ?? '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLocaleLowerCase('it-IT')
    .replace(/[^\p{L}\p{N}]+/gu, ' ')
    .trim()
    .replace(/\s+/g, ' ');
}

function normalizedUrl(value: string | null): string {
  if (!value) return '';
  try {
    const url = new URL(value);
    url.hash = '';
    url.hostname = url.hostname.toLocaleLowerCase('en-US');
    url.pathname = url.pathname.replace(/\/+$/, '') || '/';
    return `${url.protocol}//${url.host}${url.pathname}${url.search}`;
  } catch {
    return normalizedText(value);
  }
}

function identity(measure: Measure): string[] {
  return [
    measure.authority.type ?? '',
    normalizedText(measure.authority.name),
    normalizedText(measure.title),
    normalizedText(measure.territory.region),
    normalizedText(measure.territory.province),
    normalizedText(measure.territory.municipality),
  ];
}

export function getMeasureFingerprint(measure: Measure): string {
  return JSON.stringify([...identity(measure), normalizedUrl(measure.source.url)]);
}

export function compareMeasures(left: Measure, right: Measure): MeasureConflictResult {
  const sameFingerprint = getMeasureFingerprint(left) === getMeasureFingerprint(right);
  const sameIdentity = JSON.stringify(identity(left)) === JSON.stringify(identity(right));
  const comparedFields = [
    { name: 'description', left: left.description, right: right.description },
    { name: 'benefitType', left: left.benefitType, right: right.benefitType },
    { name: 'amount', left: left.amount, right: right.amount },
    { name: 'requirements', left: left.requirements, right: right.requirements },
    { name: 'application', left: left.application, right: right.application },
    { name: 'source.url', left: left.source.url, right: right.source.url },
    { name: 'source.documents', left: left.source.documents, right: right.source.documents },
    { name: 'status', left: left.status, right: right.status },
    { name: 'authority', left: left.authority, right: right.authority },
    { name: 'territory', left: left.territory, right: right.territory },
  ];
  const conflictingFields = comparedFields
    .filter(({ left: leftValue, right: rightValue }) => JSON.stringify(leftValue) !== JSON.stringify(rightValue))
    .map(({ name }) => name);

  return {
    possibleDuplicate: sameFingerprint || sameIdentity,
    sameFingerprint,
    conflictingFields,
  };
}
