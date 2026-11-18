import type {
  CandidateMeasure,
  IngestionResult,
  Measure,
  RawMeasure,
} from '../../domain/measures/model.ts';

export interface ManualImportRecord {
  raw: RawMeasure;
}

export interface ManualImportFile {
  sourceId: string;
  records: ManualImportRecord[];
}

export interface ManualIngestionOptions {
  existingMeasures?: readonly Measure[];
  now?: () => Date;
}

export interface ManualIngestionOutput {
  result: IngestionResult;
  candidates: CandidateMeasure[];
}

export type { CandidateMeasure, IngestionResult };
