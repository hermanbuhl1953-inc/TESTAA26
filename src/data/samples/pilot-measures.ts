import { getSourceById } from '../sources/registry.ts';
import { normalizeRawMeasure } from '../../services/normalization/normalize-measure.ts';
import type { Measure } from '../../domain/measures/model.ts';

const sampleRecords = [
  {
    sourceId: 'lombardia-bandi',
    id: 'SAMPLE-LOMBARDIA-001',
    title: 'SAMPLE — record pipeline Lombardia 001 (nessuna misura reale)',
  },
  {
    sourceId: 'milano-quota-nidi',
    id: 'SAMPLE-MILANO-001',
    title: 'SAMPLE — record pipeline Milano 001 (nessuna misura reale)',
  },
  {
    sourceId: 'milano-refezione',
    id: 'SAMPLE-MILANO-002',
    title: 'SAMPLE — record pipeline Milano 002 (nessuna misura reale)',
  },
] as const;

export const pilotSampleMeasures: readonly Measure[] = sampleRecords.map((record) => {
  const source = getSourceById(record.sourceId);
  if (!source) throw new Error(`Sorgente SAMPLE non registrata: ${record.sourceId}`);
  return normalizeRawMeasure({
    id: record.id,
    title: record.title,
    description: 'Solo fixture tecnica SAMPLE/TO_VERIFY. Non descrive un bonus, bando o contributo reale.',
    sourceUrl: null,
    status: 'UNKNOWN',
    dataQuality: 'TO_VERIFY',
    recordType: 'SAMPLE',
  }, { source });
});
