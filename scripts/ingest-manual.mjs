import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { MANUAL_IMPORT_USAGE, parseManualImportArgs } from './ingest-manual-args.mjs';

async function main() {
  let args;
  try {
    args = parseManualImportArgs(process.argv.slice(2));
  } catch (error) {
    console.error(error.message);
    console.error(MANUAL_IMPORT_USAGE);
    process.exitCode = 2;
    return;
  }

  try {
    const { fileArgument, asOf } = args;
    const filePath = path.resolve(process.cwd(), fileArgument);
    const payload = JSON.parse(await readFile(filePath, 'utf8'));
    const { ingestManualRecords } = await import('../src/services/ingestion/manual-import.ts');
    const { result } = ingestManualRecords(payload, asOf ? { now: () => asOf } : {});
    console.log(`DATA DI RIFERIMENTO\n${result.startedAt}`);
    if (asOf) {
      console.warn('WARNING: CONTESTO STORICO NON VERIFICATO (--as-of): validazione alla data esplicita, non verifica dello stato attuale; nessuna pubblicazione, approvazione o promozione a VERIFIED.');
    } else {
      console.log('CONTESTO\nOROLOGIO CORRENTE');
    }
    console.log(`SOURCE\n${result.sourceId}`);
    console.log(`\nINGESTION\n${result.status}`);
    console.log(`Record trovati: ${result.recordsFound}`);
    console.log(`Candidate accettati: ${result.recordsAccepted}`);
    console.log(`Record con errori: ${result.recordsRejected}`);
    console.log(`Da verificare: ${result.recordsToVerify}`);
    for (const candidate of result.candidates) {
      console.log(`\nRECORD\n${candidate.normalizedMeasure.title ?? '(titolo non disponibile)'}`);
      console.log(`NORMALIZZAZIONE\nOK · ${candidate.normalizedMeasure.id ?? '(id non disponibile)'}`);
      console.log(`RECORD TYPE\n${candidate.normalizedMeasure.recordType}`);
      console.log(`DATA QUALITY\n${candidate.normalizedMeasure.dataQuality}`);
      console.log(`STATO MISURA\n${candidate.normalizedMeasure.status}`);
      console.log(`ENTE\n${candidate.source.authorityName}`);
      console.log(`SOURCE TYPE\n${candidate.source.sourceType}`);
      console.log(`TERRITORIO\n${candidate.normalizedMeasure.territory.region ?? 'NON DISPONIBILE'} · ${candidate.normalizedMeasure.territory.municipality ?? 'NON DISPONIBILE'}`);
      console.log(`SOURCE URL\n${candidate.source.sourceUrl ?? 'NON DISPONIBILE'}`);
      console.log(`RETRIEVED AT\n${candidate.normalizedMeasure.source.retrievedAt ?? 'NON DISPONIBILE'}`);
      console.log(`LAST VERIFIED AT\n${candidate.normalizedMeasure.source.lastVerifiedAt ?? 'NON DISPONIBILE'}`);
      for (const document of candidate.normalizedMeasure.source.documents) {
        console.log(`SOURCE DOCUMENT\n${document.title} · ${document.publishedDate ?? 'data non indicata'} · ${document.url}`);
      }
      console.log(`VALIDATION\n${candidate.validationResult.issues.filter((issue) => issue.severity === 'ERROR').length} errors, ${candidate.warnings.length} warnings`);
      for (const issue of candidate.validationResult.issues) {
        console.log(`${issue.severity} ${issue.path}: ${issue.message}`);
      }
      console.log(`QUALITÀ CONSIGLIATA DALLA VALIDAZIONE\n${candidate.validationResult.recommendedDataQuality}`);
      console.log(`REVIEW\n${candidate.reviewStatus}`);
      console.log(`APPROVABLE\n${candidate.approvable ? 'YES (requires human review)' : 'NO'}`);
      console.log(`FINGERPRINT\n${candidate.fingerprint}`);
      console.log(`CONTENT HASH\n${candidate.contentHash}`);
      if (candidate.conflicts.length === 0) console.log('CONFLICTS\nNONE IN THE SUPPLIED REVIEW SET');
      for (const conflict of candidate.conflicts) {
        console.log(`CONFLICT\n${conflict.type} · ${conflict.existingMeasureId ?? conflict.existingFingerprint}`);
      }
    }
    for (const error of result.errors) console.error(`ERROR: ${error}`);
    for (const warning of result.warnings) console.warn(`WARNING: ${warning}`);
    if (result.status === 'FAILED' || result.status === 'BLOCKED') process.exitCode = 1;
  } catch (error) {
    console.error(error instanceof Error ? error.message : 'Importazione manuale non riuscita.');
    process.exitCode = 1;
  }
}

await main();
