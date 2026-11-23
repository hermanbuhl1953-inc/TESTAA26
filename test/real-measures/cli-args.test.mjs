import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { readFile, readdir } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import test from 'node:test';
import { parseManualImportArgs } from '../../scripts/ingest-manual-args.mjs';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const AS_OF = '2026-11-16T13:08:00.000Z';
const FIXTURE = 'data/import/manual/regione-lombardia-nidi-gratis-plus-2026-27.json';

function runCli(args) {
  return spawnSync(process.execPath, [
    '--experimental-strip-types',
    path.join(ROOT, 'scripts/ingest-manual.mjs'),
    ...args,
  ], {
    cwd: ROOT,
    encoding: 'utf8',
    env: { ...process.env, DATABASE_URL: '' },
  });
}

async function snapshotData(directory = path.join(ROOT, 'data')) {
  const entries = await readdir(directory, { withFileTypes: true });
  const snapshot = [];
  for (const entry of entries.sort((a, b) => a.name.localeCompare(b.name))) {
    const filePath = path.join(directory, entry.name);
    snapshot.push([path.relative(ROOT, filePath), entry.isDirectory()
      ? await snapshotData(filePath)
      : await readFile(filePath, 'utf8')]);
  }
  return snapshot;
}

test('senza --as-of il parser non imposta un orologio alternativo', () => {
  assert.deepEqual(parseManualImportArgs([FIXTURE]), { fileArgument: FIXTURE, asOf: undefined });
});

test('--as-of accetta la data ISO UTC esplicita prima o dopo il file', () => {
  for (const args of [[FIXTURE, '--as-of', AS_OF], ['--as-of', AS_OF, FIXTURE]]) {
    const parsed = parseManualImportArgs(args);
    assert.equal(parsed.fileArgument, FIXTURE);
    assert.equal(parsed.asOf.toISOString(), AS_OF);
  }
  assert.equal(parseManualImportArgs([FIXTURE, '--as-of', '2028-02-29T23:59:59.999Z']).asOf.toISOString(), '2028-02-29T23:59:59.999Z');
});

test('--as-of rifiuta valori assenti, ambigui, normalizzati o fuori calendario', () => {
  const invalid = [
    undefined, '', 'invalid', '2026-11-16', '2026-11-16T13:08:00',
    '2026-11-16T13:08:00Z', '2026-11-16T14:08:00.000+01:00',
    '2026-02-29T13:08:00.000Z', '2026-11-31T13:08:00.000Z',
    '2026-13-01T13:08:00.000Z', '2026-11-16T24:00:00.000Z',
    '2026-11-16T13:60:00.000Z', '2026-11-16T13:08:60.000Z',
    ' 2026-11-16T13:08:00.000Z', '2026-11-16T13:08:00.000Z ',
  ];
  for (const value of invalid) {
    const args = [FIXTURE, '--as-of', ...(value === undefined ? [] : [value])];
    assert.throws(() => parseManualImportArgs(args), /--as-of richiede una data ISO UTC valida/, String(value));
  }
});

test('il parser rifiuta flag duplicati, sconosciuti e argomenti extra', () => {
  for (const args of [
    [], ['--as-of', AS_OF], [FIXTURE, '--as-of', AS_OF, '--as-of', AS_OF],
    [FIXTURE, '--unknown'], [FIXTURE, '--as-of=' + AS_OF], [FIXTURE, 'altro.json'],
  ]) assert.throws(() => parseManualImportArgs(args));
});

test('CLI: argomenti invalidi escono con 2 prima di leggere o importare dati, senza persistenza', async () => {
  const before = await snapshotData();
  for (const args of [
    [], [FIXTURE, '--as-of'], [FIXTURE, '--as-of', '2026-02-29T13:08:00.000Z'],
    [FIXTURE, '--as-of', 'invalid'], [FIXTURE, '--as-of', AS_OF, '--as-of', AS_OF],
    ['file-inesistente-cli-date.json', '--as-of', 'invalid'],
    [FIXTURE, '--unknown'],
  ]) {
    const result = runCli(args);
    assert.equal(result.status, 2, result.stderr);
    assert.equal(result.stdout, '');
    assert.match(result.stderr, /Uso: npm run ingest:manual/);
    assert.doesNotMatch(result.stderr, /ENOENT|ERR_MODULE_NOT_FOUND/);
  }
  assert.deepEqual(await snapshotData(), before);
});
