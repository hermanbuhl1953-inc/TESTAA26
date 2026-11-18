import { createHash } from 'node:crypto';
import type { Measure } from '../../domain/measures/model.ts';

export function getMeasureContentHash(measure: Measure): string {
  const meaningfulContent = {
    title: measure.title,
    description: measure.description,
    authority: measure.authority,
    territory: measure.territory,
    category: measure.category,
    benefitType: measure.benefitType,
    amount: measure.amount,
    requirements: measure.requirements,
    application: measure.application,
    source: {
      url: measure.source.url,
      sourceName: measure.source.sourceName,
      sourceType: measure.source.sourceType,
      sourceDocumentDate: measure.source.sourceDocumentDate,
      documents: measure.source.documents,
    },
    status: measure.status,
    unstructuredRequirements: measure.unstructuredRequirements,
  };
  return createHash('sha256').update(stableJson(meaningfulContent)).digest('hex');
}

function stableJson(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(stableJson).join(',')}]`;
  if (value !== null && typeof value === 'object') {
    const entries = Object.entries(value).sort(([left], [right]) => left.localeCompare(right));
    return `{${entries.map(([key, item]) => `${JSON.stringify(key)}:${stableJson(item)}`).join(',')}}`;
  }
  return JSON.stringify(value);
}
