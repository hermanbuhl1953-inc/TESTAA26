export { normalizeRawMeasure } from './normalize-measure.ts';
export type { NormalizationContext } from './normalize-measure.ts';
export { compareMeasures, getMeasureFingerprint } from './measure-fingerprint.ts';
export { validateMeasure } from './measure-validation.ts';
export type {
  MeasureConflictResult,
  MeasureValidationIssue,
  MeasureValidationResult,
} from '../../domain/measures/model.ts';
