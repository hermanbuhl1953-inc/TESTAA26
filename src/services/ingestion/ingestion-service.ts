import type { IngestionResult } from '../../domain/measures/model.ts';
import { getSourceById } from '../../data/sources/registry.ts';
import { HttpSourceClient } from './http-source-client.ts';

export async function checkInstitutionalSource(
  sourceId: string,
  client: HttpSourceClient,
  now: () => Date = () => new Date(),
): Promise<IngestionResult> {
  const startedAt = now();
  const source = getSourceById(sourceId);
  if (!source) {
    const timestamp = startedAt.toISOString();
    return {
      sourceId,
      startedAt: timestamp,
      completedAt: timestamp,
      status: 'FAILED',
      recordsFound: 0,
      recordsAccepted: 0,
      recordsRejected: 0,
      recordsToVerify: 0,
      candidates: [],
      errors: [`Sorgente non presente nel registry: ${sourceId}`],
      warnings: [],
    };
  }

  const response = await client.get(source);
  const completedAt = now();
  const warnings = [...response.warnings];
  if (response.status === 'SUCCESS') {
    warnings.push('Nessuna misura è stata estratta o creata: acquisizione HTTP disponibile, parser per questa fonte non configurato.');
  }
  return {
    sourceId: source.id,
    startedAt: startedAt.toISOString(),
    completedAt: completedAt.toISOString(),
    status: response.status === 'SUCCESS' ? 'PARTIAL' : response.status,
    recordsFound: 0,
    recordsAccepted: 0,
    recordsRejected: 0,
    recordsToVerify: 0,
    candidates: [],
    errors: response.error ? [response.error] : [],
    warnings,
  };
}
