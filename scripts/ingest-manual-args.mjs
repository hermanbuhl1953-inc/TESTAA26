export const MANUAL_IMPORT_USAGE = 'Uso: npm run ingest:manual -- <file.json> [--as-of YYYY-MM-DDTHH:mm:ss.sssZ]';

export function parseManualImportArgs(args) {
  let fileArgument;
  let asOf;
  for (let index = 0; index < args.length; index += 1) {
    const argument = args[index];
    if (argument === '--as-of') {
      if (asOf !== undefined) throw new Error('--as-of può essere specificato una sola volta.');
      const value = args[++index];
      if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/.test(value)) {
        throw new Error('--as-of richiede una data ISO UTC valida nel formato YYYY-MM-DDTHH:mm:ss.sssZ.');
      }
      asOf = new Date(value);
      if (!Number.isFinite(asOf.getTime()) || asOf.toISOString() !== value) {
        throw new Error('--as-of richiede una data ISO UTC valida nel formato YYYY-MM-DDTHH:mm:ss.sssZ.');
      }
    } else if (argument.startsWith('-') || fileArgument !== undefined) {
      throw new Error(`Argomento non riconosciuto: ${argument}`);
    } else {
      fileArgument = argument;
    }
  }
  if (!fileArgument) throw new Error('File JSON obbligatorio.');
  return { fileArgument, asOf };
}
