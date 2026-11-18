import type {
  CandidateConflict,
  CandidateMeasure,
  Measure,
  RawMeasure,
} from '../../domain/measures/model.ts';
import type { SourceDefinition } from '../../data/sources/types.ts';
import { normalizeRawMeasure } from '../normalization/normalize-measure.ts';
import { compareMeasures, getMeasureFingerprint } from '../normalization/measure-fingerprint.ts';
import { validateMeasure } from '../normalization/measure-validation.ts';
import { getMeasureContentHash } from './content-hash.ts';

function changedApplicationFields(left: Measure, right: Measure): string[] {
  const keys = ['startDate', 'endDate', 'deadlineDescription'] as const;
  return keys.filter((key) => left.application[key] !== right.application[key]);
}

function classifyConflict(measure: Measure, fingerprint: string, contentHash: string, existing: Measure): CandidateConflict | null {
  const comparison = compareMeasures(measure, existing);
  if (!comparison.possibleDuplicate) return null;
  const existingFingerprint = getMeasureFingerprint(existing);
  const existingHash = getMeasureContentHash(existing);
  if (comparison.sameFingerprint && contentHash === existingHash) {
    return {
      type: 'EXACT_DUPLICATE',
      existingMeasureId: existing.id,
      existingFingerprint,
      conflictingFields: [],
    };
  }
  const applicationOnlyChange = comparison.conflictingFields.every((field) => [
    'application',
    'status',
  ].includes(field)) && (
    changedApplicationFields(measure, existing).length > 0
      || measure.status !== existing.status
  );
  return {
    type: applicationOnlyChange ? 'POSSIBLE_UPDATE' : 'CONFLICT',
    existingMeasureId: existing.id,
    existingFingerprint,
    conflictingFields: comparison.conflictingFields,
  };
}

export interface CandidateCreationContext {
  source: SourceDefinition;
  importedAt: string;
  importerVersion: string;
  existingMeasures?: readonly Measure[];
}

export function createCandidateMeasure(raw: RawMeasure, context: CandidateCreationContext): CandidateMeasure {
  const normalized = normalizeRawMeasure(raw, {
    source: context.source,
    importedAt: context.importedAt,
    importerVersion: context.importerVersion,
  });
  const normalizedMeasure: Measure = {
    ...normalized,
    dataQuality: normalized.dataQuality === 'VERIFIED' ? 'TO_VERIFY' : normalized.dataQuality,
  };
  const validationResult = validateMeasure(normalizedMeasure, { asOf: new Date(context.importedAt) });
  if (normalizedMeasure.source.url) {
    let sourceUrlHost: string | null = null;
    try {
      sourceUrlHost = new URL(normalizedMeasure.source.url).host.toLocaleLowerCase('en-US');
    } catch {
      sourceUrlHost = null;
    }
    const sourceBaseHost = new URL(context.source.baseUrl).host.toLocaleLowerCase('en-US');
    if (sourceUrlHost !== sourceBaseHost) {
      validationResult.issues.push({
        severity: 'ERROR',
        code: 'SOURCE_HOST_MISMATCH',
        path: 'source.url',
        message: 'L’URL del record non appartiene al dominio della fonte registrata.',
      });
      validationResult.valid = false;
      validationResult.importAllowed = false;
      validationResult.recommendedDataQuality = 'TO_VERIFY';
    }
  }
  const fingerprint = getMeasureFingerprint(normalizedMeasure);
  const contentHash = getMeasureContentHash(normalizedMeasure);
  const conflicts = (context.existingMeasures ?? [])
    .map((existing) => classifyConflict(normalizedMeasure, fingerprint, contentHash, existing))
    .filter((conflict): conflict is CandidateConflict => conflict !== null);
  const warnings = validationResult.issues
    .filter((entry) => entry.severity === 'WARNING')
    .map((entry) => entry.message);
  const approvable = validationResult.importAllowed
    && !conflicts.some((conflict) => conflict.type === 'EXACT_DUPLICATE' || conflict.type === 'CONFLICT');
  const reviewStatus = conflicts.length > 0 || validationResult.issues.length > 0
    ? 'NEEDS_REVIEW'
    : 'PENDING';

  return {
    normalizedMeasure,
    validationResult,
    fingerprint,
    contentHash,
    source: {
      sourceId: context.source.id,
      authorityName: context.source.authority.name,
      sourceUrl: normalizedMeasure.source.url,
      sourceType: context.source.type,
    },
    ingestedAt: context.importedAt,
    warnings,
    conflicts,
    reviewStatus,
    approvable,
  };
}
