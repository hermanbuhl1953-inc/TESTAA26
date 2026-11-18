import { z } from 'zod';
import {
  RawMeasureSchema,
  type IngestionResult,
  type Measure,
} from '../../domain/measures/model.ts';
import { getSourceById } from '../../data/sources/registry.ts';
import { createCandidateMeasure } from './candidate-measure.ts';

export const ManualImportFileSchema = z.object({
  sourceId: z.string().trim().min(1),
  records: z.array(z.object({ raw: RawMeasureSchema })).min(1),
});

export type ManualImportFile = z.infer<typeof ManualImportFileSchema>;

export interface ManualImportOptions {
  existingMeasures?: readonly Measure[];
  now?: () => Date;
  importerVersion?: string;
}

export function ingestManualRecords(
  input: unknown,
  options: ManualImportOptions = {},
): { result: IngestionResult } {
  const manualFile = ManualImportFileSchema.parse(input);
  const startedAt = options.now?.() ?? new Date();
  const source = getSourceById(manualFile.sourceId);
  if (!source) {
    const timestamp = startedAt.toISOString();
    return {
      result: {
        sourceId: manualFile.sourceId,
        startedAt: timestamp,
        completedAt: timestamp,
        status: 'FAILED',
        recordsFound: manualFile.records.length,
        recordsAccepted: 0,
        recordsRejected: manualFile.records.length,
        recordsToVerify: 0,
        candidates: [],
        errors: [`Sorgente non presente nel registry: ${manualFile.sourceId}`],
        warnings: [],
      },
    };
  }

  const candidates = manualFile.records.map(({ raw }) => createCandidateMeasure(raw, {
    source,
    importedAt: startedAt.toISOString(),
    importerVersion: options.importerVersion ?? 'manual-import/1',
    existingMeasures: options.existingMeasures,
  }));
  const recordsRejected = candidates.filter((candidate) => !candidate.validationResult.importAllowed).length;
  const recordsAccepted = candidates.length - recordsRejected;
  const warnings = candidates.flatMap((candidate) => candidate.warnings);
  const errors = candidates.flatMap((candidate) => candidate.validationResult.issues
    .filter((entry) => entry.severity === 'ERROR')
    .map((entry) => `${candidate.normalizedMeasure.id ?? 'senza id'}: ${entry.message}`));
  const completedAt = (options.now?.() ?? new Date()).toISOString();
  const recordsToVerify = candidates.filter((candidate) => candidate.reviewStatus === 'PENDING'
    || candidate.reviewStatus === 'NEEDS_REVIEW').length;
  const status = recordsRejected === candidates.length
    ? 'FAILED'
    : recordsRejected > 0 || recordsToVerify > 0
      ? 'PARTIAL'
      : 'SUCCESS';

  return {
    result: {
      sourceId: source.id,
      startedAt: startedAt.toISOString(),
      completedAt,
      status,
      recordsFound: candidates.length,
      recordsAccepted,
      recordsRejected,
      recordsToVerify,
      candidates,
      errors,
      warnings,
    },
  };
}
