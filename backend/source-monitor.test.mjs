import assert from 'node:assert/strict';
import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';
import {
  getMonitoringStatus,
  refreshSources as refreshSourcesWithAI,
  resolveSourceChange,
} from './source-monitor.mjs';
import { MAX_PDF_BYTES, parsePdfBuffer } from './pdf-parser.mjs';

const registry = {
  schemaVersion: 1,
  sources: [{
    id: 'test-source',
    label: 'Fonte ufficiale di test',
    scope: 'nazionale',
    region: null,
    municipality: null,
    url: 'https://example.gov.it/benefits',
  }],
};

const proposal = {
  title: 'Nuova impresa',
  description: 'Contributo regionale per nuove imprese.',
  scope: 'nazionale',
  region: null,
  municipality: null,
  iseeMaxCents: null,
  requirements: ['Presentare domanda entro la scadenza.'],
  source: { label: 'Fonte fornita dal modello', url: 'https://example.com' },
  startsAt: null,
  endsAt: '2027-01-29',
  lastVerifiedAt: '2026-11-13',
};

function refreshSources(options) {
  return refreshSourcesWithAI({
    ...options,
    benefitExtractor: options.benefitExtractor ?? null,
  });
}

function response(body, headers = {}) {
  return new Response(body, {
    status: 200,
    headers: { 'content-type': 'text/html; charset=utf-8', ...headers },
  });
}

function pdfFixture(text) {
  const stream = `BT /F1 12 Tf 72 220 Td (${text}) Tj ET`;
  const objects = [
    '<< /Type /Catalog /Pages 2 0 R >>',
    '<< /Type /Pages /Kids [3 0 R] /Count 1 >>',
    '<< /Type /Page /Parent 2 0 R /MediaBox [0 0 300 300] /Resources << /Font << /F1 4 0 R >> >> /Contents 5 0 R >>',
    '<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>',
    `<< /Length ${Buffer.byteLength(stream)} >>\nstream\n${stream}\nendstream`,
  ];
  let document = '%PDF-1.4\n';
  const offsets = [0];
  for (const [index, object] of objects.entries()) {
    offsets.push(Buffer.byteLength(document));
    document += `${index + 1} 0 obj\n${object}\nendobj\n`;
  }
  const xrefOffset = Buffer.byteLength(document);
  document += `xref\n0 ${offsets.length}\n0000000000 65535 f \n`;
  for (const offset of offsets.slice(1)) {
    document += `${String(offset).padStart(10, '0')} 00000 n \n`;
  }
  document += `trailer\n<< /Size ${offsets.length} /Root 1 0 R >>\nstartxref\n${xrefOffset}\n%%EOF`;
  return Buffer.from(document);
}

function pdfResponse(body, headers = {}) {
  return new Response(body, {
    status: 200,
    headers: { 'content-type': 'application/pdf', ...headers },
  });
}

async function withTemporaryFiles(run) {
  const directory = await mkdtemp(path.join(os.tmpdir(), 'scadenzario-monitor-'));
  const registryPath = path.join(directory, 'registry.json');
  const statePath = path.join(directory, 'state.json');
  await writeFile(registryPath, JSON.stringify(registry));
  try {
    await run({ registryPath, statePath });
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
}

test('extracts cleaned text from PDF and rejects invalid or oversized input', async () => {
  const text = await parsePdfBuffer(pdfFixture('Bando 2026'));
  assert.match(text, /Bando 2026/);
  await assert.rejects(() => parsePdfBuffer(Buffer.from('not a PDF')), /non è un PDF valido/);
  await assert.rejects(
    () => parsePdfBuffer(Buffer.alloc(MAX_PDF_BYTES + 1)),
    /dimensione compresa/,
  );
});

test('downloads same-origin linked PDFs, detects changes and skips unchanged parsing', async () => {
  await withTemporaryFiles(async (paths) => {
    const pdfUrl = 'https://example.gov.it/files/bando.pdf';
    const pages = [
      pdfFixture('Requisiti prima versione'),
      pdfFixture('Requisiti prima versione'),
      pdfFixture('Requisiti seconda versione'),
    ];
    let parseCount = 0;
    let aiText = '';
    const fetchImpl = async (url) => url === registry.sources[0].url
      ? response('<html><title>Bando</title><a href="/files/bando.pdf">Avviso</a></html>')
      : pdfResponse(pages.shift());
    const pdfParser = async (bytes) => {
      parseCount += 1;
      return `Testo PDF ${Buffer.from(bytes).toString('latin1').includes('seconda') ? 'seconda versione' : 'prima versione'}`;
    };

    await refreshSources({ ...paths, fetchImpl, pdfParser });
    const baseline = JSON.parse(await readFile(paths.statePath, 'utf8'));
    assert.equal(baseline.sources['test-source'].lastPdfAnalyzed.url, pdfUrl);
    assert.equal(baseline.sources['test-source'].lastPdfAnalyzed.status, 'analyzed');

    await refreshSources({ ...paths, fetchImpl, pdfParser });
    assert.equal(parseCount, 1);

    const changed = await refreshSources({
      ...paths,
      fetchImpl,
      pdfParser,
      benefitExtractor: async ({ pageText }) => {
        aiText = pageText;
        return proposal;
      },
    });
    const state = JSON.parse(await readFile(paths.statePath, 'utf8'));

    assert.equal(changed.results[0].status, 'changed');
    assert.equal(parseCount, 2);
    assert.match(aiText, /Testo PDF seconda versione/);
    assert.equal(state.sources['test-source'].pdfDocuments[0].url, pdfUrl);
    assert.equal(state.sources['test-source'].pendingProposal.source.url, registry.sources[0].url);
  });
});

test('checks stored PDF links even when the source page responds not modified', async () => {
  await withTemporaryFiles(async (paths) => {
    const pdfUrl = 'https://example.gov.it/files/bando.pdf';
    const documents = [
      Buffer.from('%PDF-1.4 first'),
      Buffer.from('%PDF-1.4 second'),
    ];
    let pageChecks = 0;
    let pdfChecks = 0;
    let extractionText = '';
    const fetchImpl = async (url) => {
      if (url === registry.sources[0].url) {
        pageChecks += 1;
        return pageChecks === 1
          ? response('<a href="/files/bando.pdf">Avviso</a>', { etag: '"page-v1"' })
          : new Response(null, { status: 304, headers: { etag: '"page-v1"' } });
      }
      pdfChecks += 1;
      return pdfResponse(documents.shift());
    };
    const pdfParser = async (bytes) => Buffer.from(bytes).toString('latin1');
    await refreshSources({ ...paths, fetchImpl, pdfParser });
    const result = await refreshSources({
      ...paths,
      fetchImpl,
      pdfParser,
      benefitExtractor: async ({ pageText }) => {
        extractionText = pageText;
        return proposal;
      },
    });
    const state = JSON.parse(await readFile(paths.statePath, 'utf8'));

    assert.equal(result.results[0].status, 'changed');
    assert.equal(pdfChecks, 2);
    assert.match(extractionText, /second/);
    assert.equal(state.sources['test-source'].etag, '"page-v1"');
    assert.equal(state.sources['test-source'].lastPdfAnalyzed.url, pdfUrl);
  });
});

test('discovers PDF links when upgrading state that predates PDF tracking', async () => {
  await withTemporaryFiles(async (paths) => {
    let includePdf = false;
    let sentConditionalHeader;
    const fetchImpl = async (url, options) => {
      if (url === registry.sources[0].url) {
        sentConditionalHeader = options.headers['if-none-match'];
        return response(includePdf
          ? '<html><title>Bando</title><a href="/new.pdf">Nuovo PDF</a></html>'
          : '<html><title>Bando</title></html>', { etag: '"old-page"' });
      }
      return pdfResponse(Buffer.from('%PDF-1.4 upgraded'));
    };
    await refreshSources({ ...paths, fetchImpl: async (url, options) => response(
      '<html><title>Bando</title></html>',
      { etag: '"old-page"' },
    ) });
    const oldState = JSON.parse(await readFile(paths.statePath, 'utf8'));
    delete oldState.sources['test-source'].pdfFingerprint;
    delete oldState.sources['test-source'].pdfLinks;
    delete oldState.sources['test-source'].pdfDocuments;
    await writeFile(paths.statePath, JSON.stringify(oldState));
    includePdf = true;

    await refreshSources({ ...paths, fetchImpl, pdfParser: async () => 'Nuovo testo PDF' });
    const state = JSON.parse(await readFile(paths.statePath, 'utf8'));

    assert.equal(sentConditionalHeader, undefined);
    assert.equal(state.sources['test-source'].pdfLinks.length, 1);
    assert.equal(state.sources['test-source'].pdfDocuments[0].status, 'analyzed');
  });
});

test('parses a PDF configured as the source page itself', async () => {
  await withTemporaryFiles(async ({ registryPath, statePath }) => {
    const pdfSource = { ...registry.sources[0], url: 'https://example.gov.it/notices/current.pdf' };
    await writeFile(registryPath, JSON.stringify({ schemaVersion: 1, sources: [pdfSource] }));
    let extractedText = '';
    const result = await refreshSources({
      registryPath,
      statePath,
      fetchImpl: async () => pdfResponse(pdfFixture('Avviso direttamente in PDF')),
      benefitExtractor: async ({ pageText }) => {
        extractedText = pageText;
        return proposal;
      },
    });
    const state = JSON.parse(await readFile(statePath, 'utf8'));

    assert.equal(result.results[0].status, 'baseline');
    assert.match(state.sources['test-source'].lastPdfAnalyzed.url, /\.pdf$/);
    assert.match(state.sources['test-source'].lastPdfAnalyzed.contentHash, /^[a-f0-9]{64}$/);
    assert.equal(extractedText, '');
  });
});

test('rejects linked PDFs from another origin without requesting them', async () => {
  await withTemporaryFiles(async (paths) => {
    const requestedUrls = [];
    const result = await refreshSources({
      ...paths,
      fetchImpl: async (url) => {
        requestedUrls.push(url);
        return response('<a href="https://other.example.gov.it/hidden.pdf">PDF</a>');
      },
    });
    assert.deepEqual(requestedUrls, [registry.sources[0].url]);
    assert.equal(result.results[0].status, 'baseline');
  });
});

test('rejects cross-origin PDF redirects without following them', async () => {
  await withTemporaryFiles(async (paths) => {
    const requestedUrls = [];
    const result = await refreshSources({
      ...paths,
      fetchImpl: async (url) => {
        requestedUrls.push(url);
        if (url === registry.sources[0].url) return response('<a href="/redirect.pdf">PDF</a>');
        return new Response(null, {
          status: 302,
          headers: { location: 'https://other.example.gov.it/redirected.pdf' },
        });
      },
    });

    assert.equal(result.results[0].status, 'baseline');
    assert.deepEqual(requestedUrls, [registry.sources[0].url, 'https://example.gov.it/redirect.pdf']);
    assert.match(result.results[0].pdfError, /stesso host/);
  });
});

test('rejects HTTPS source redirects that downgrade to HTTP', async () => {
  await withTemporaryFiles(async (paths) => {
    const requestedUrls = [];
    const result = await refreshSources({
      ...paths,
      fetchImpl: async (url) => {
        requestedUrls.push(url);
        return new Response(null, {
          status: 302,
          headers: { location: 'http://example.gov.it/insecure.pdf' },
        });
      },
    });

    assert.deepEqual(requestedUrls, [registry.sources[0].url]);
    assert.equal(result.results[0].status, 'error');
    assert.match(result.results[0].lastError, /mantenere HTTPS/);
  });
});

test('records an over-limit linked PDF error without processing its body', async () => {
  await withTemporaryFiles(async (paths) => {
    const result = await refreshSources({
      ...paths,
      fetchImpl: async (url) => url === registry.sources[0].url
        ? response('<a href="/large.pdf">PDF</a>')
        : pdfResponse(new Uint8Array(), { 'content-length': String(MAX_PDF_BYTES + 1) }),
    });
    const state = JSON.parse(await readFile(paths.statePath, 'utf8'));

    assert.equal(result.results[0].status, 'baseline');
    assert.match(state.sources['test-source'].pdfError, /oltre il limite/);
    assert.equal(state.sources['test-source'].pdfDocuments[0].status, 'error');
  });
});

test('marks a changed unreadable PDF for manual review and logs the parse failure', async () => {
  await withTemporaryFiles(async (paths) => {
    let currentPdf = pdfFixture('Bando valido');
    const fetchImpl = async (url) => url === registry.sources[0].url
      ? response('<a href="/bando.pdf">Bando</a>')
      : pdfResponse(currentPdf);
    await refreshSources({ ...paths, fetchImpl });
    currentPdf = Buffer.from('%PDF-1.4 damaged file');

    const result = await refreshSources({ ...paths, fetchImpl });
    const state = JSON.parse(await readFile(paths.statePath, 'utf8'));
    const sourceState = state.sources['test-source'];

    assert.equal(result.results[0].status, 'changed');
    assert.equal(sourceState.pendingReview, true);
    assert.equal(sourceState.lastPdfAnalyzed.status, 'error');
    assert.match(sourceState.pdfError, /PDF|document/i);
  });
});

test('creates a baseline on first check and flags page changes without publishing them', async () => {
  await withTemporaryFiles(async (paths) => {
    const pages = ['<html><title>Bonus</title><p>Scadenza 2026</p></html>', '<html><title>Bonus</title><p>Scadenza 2027</p></html>'];
    const fetchImpl = async () => response(pages.shift());
    const now = () => new Date('2026-11-13T10:00:00.000Z');

    const first = await refreshSources({ ...paths, fetchImpl, now });
    assert.equal(first.results[0].status, 'baseline');
    assert.equal((await getMonitoringStatus(paths)).pendingReviewCount, 0);

    const second = await refreshSources({ ...paths, fetchImpl, now });
    const status = await getMonitoringStatus(paths);
    assert.equal(second.results[0].status, 'changed');
    assert.equal(status.updateMode, 'local-server');
    assert.equal(status.pendingReviewCount, 1);
    assert.match(status.sources[0].lastChange.excerpt, /Scadenza 2027/);
    const storedState = JSON.parse(await readFile(paths.statePath, 'utf8'));
    assert.equal(storedState.sources['test-source'].proposalStatus, 'manual-review');
    assert.equal(storedState.sources['test-source'].pendingProposal, null);
    assert.equal(Object.hasOwn(status.sources[0], 'pendingProposal'), false);
  });
});

test('extracts changed page text into a normalized staging proposal only', async () => {
  await withTemporaryFiles(async (paths) => {
    const pages = [
      '<html><title>Bando</title><p>Prima versione</p></html>',
      '<html><title>Bando</title><script>ignore me</script><p>Nuova impresa 2026 &amp; contributi</p></html>',
    ];
    let extractionInput;
    const fetchImpl = async () => response(pages.shift());
    const benefitExtractor = async (input) => {
      extractionInput = input;
      return proposal;
    };

    await refreshSources({ ...paths, fetchImpl });
    const result = await refreshSources({ ...paths, fetchImpl, benefitExtractor });
    const state = JSON.parse(await readFile(paths.statePath, 'utf8'));
    const staged = state.sources['test-source'].pendingProposal;

    assert.equal(result.results[0].status, 'changed');
    assert.match(extractionInput.pageText, /Nuova impresa 2026 & contributi/);
    assert.doesNotMatch(extractionInput.pageText, /<script>|ignore me|<html>/);
    assert.equal(staged.scope, 'nazionale');
    assert.equal(staged.source.label, 'Fonte ufficiale di test');
    assert.equal(staged.source.url, 'https://example.gov.it/benefits');
    assert.equal(staged.lastVerifiedAt, null);
    assert.equal(state.sources['test-source'].proposalStatus, 'ready');
    assert.equal(Object.hasOwn(await getMonitoringStatus(paths).then((status) => status.sources[0]), 'pendingProposal'), false);
  });
});

test('creates a proposal for a previously pending change when AI is configured later', async () => {
  await withTemporaryFiles(async (paths) => {
    const pages = [
      '<html><title>Bando</title><p>Prima versione</p></html>',
      '<html><title>Bando</title><p>Nuova versione</p></html>',
      '<html><title>Bando</title><p>Nuova versione</p></html>',
    ];
    const fetchImpl = async () => response(pages.shift());

    await refreshSources({ ...paths, fetchImpl });
    await refreshSources({ ...paths, fetchImpl });
    const result = await refreshSources({
      ...paths,
      fetchImpl,
      benefitExtractor: async () => proposal,
    });
    const state = JSON.parse(await readFile(paths.statePath, 'utf8'));

    assert.equal(result.results[0].status, 'changed');
    assert.equal(state.sources['test-source'].pendingProposal.title, 'Nuova impresa');
    assert.equal(state.sources['test-source'].proposalStatus, 'ready');
  });
});

test('keeps AI quota failures in manual review without retrying an unchanged page', async () => {
  await withTemporaryFiles(async (paths) => {
    const page = '<html><title>Bando</title><p>Scadenza 2027</p></html>';
    let extractionCount = 0;
    const fetchImpl = async () => response(page);
    await refreshSources({ ...paths, fetchImpl: async () => response('<html><title>Bando</title><p>Scadenza 2026</p></html>') });
    const failed = await refreshSources({
      ...paths,
      fetchImpl,
      benefitExtractor: async () => {
        extractionCount += 1;
        throw Object.assign(new Error('quota exceeded'), { status: 429, code: 'insufficient_quota' });
      },
    });
    const unchanged = await refreshSources({ ...paths, fetchImpl, benefitExtractor: async () => { extractionCount += 1; return proposal; } });
    const state = JSON.parse(await readFile(paths.statePath, 'utf8'));

    assert.equal(failed.results[0].status, 'error-ai');
    assert.equal(unchanged.results[0].status, 'error-ai');
    assert.equal(extractionCount, 1);
    assert.equal(state.sources['test-source'].pendingReview, true);
    assert.equal(state.sources['test-source'].pendingProposal, null);
    assert.equal(state.sources['test-source'].aiError, 'Quota o limite di richieste OpenAI raggiunto.');
    const monitoring = await getMonitoringStatus(paths);
    assert.equal(monitoring.sources[0].status, 'error-ai');
    assert.equal(monitoring.sources[0].lastError, 'Quota o limite di richieste OpenAI raggiunto.');
  });
});

test('falls back to manual review when an AI response cannot be parsed or validated', async () => {
  await withTemporaryFiles(async (paths) => {
    const fetchImpl = async () => response('<html><title>Bando</title><p>Prima versione</p></html>');
    await refreshSources({ ...paths, fetchImpl });
    const result = await refreshSources({
      ...paths,
      fetchImpl: async () => response('<html><title>Bando</title><p>Seconda versione</p></html>'),
      benefitExtractor: async () => { throw new SyntaxError('Unexpected token'); },
    });
    const state = JSON.parse(await readFile(paths.statePath, 'utf8'));

    assert.equal(result.results[0].status, 'error-ai');
    assert.equal(state.sources['test-source'].pendingReview, true);
    assert.equal(state.sources['test-source'].pendingProposal, null);
    assert.equal(state.sources['test-source'].proposalStatus, 'error');
    assert.equal(state.sources['test-source'].aiError, 'Risposta AI non valida o non conforme allo schema.');
  });
});

test('records a review only when a pending change exists and requires a reason', async () => {
  await withTemporaryFiles(async (paths) => {
    const fetchImpl = async () => response('<html><title>Bonus</title><p>Prima versione</p></html>');
    await refreshSources({ ...paths, fetchImpl });
    await refreshSources({ ...paths, fetchImpl: async () => response('<html><title>Bonus</title><p>Seconda versione</p></html>') });
    await assert.rejects(() => resolveSourceChange({ ...paths, sourceId: 'test-source', note: 'ok' }), /da 8 a 500/);

    const result = await resolveSourceChange({
      ...paths,
      sourceId: 'test-source',
      note: 'Requisiti riletti sulla pagina ufficiale',
      now: () => new Date('2026-11-13T12:00:00.000Z'),
    });
    const state = JSON.parse(await readFile(paths.statePath, 'utf8'));
    assert.equal(result.pendingReviewCount, 0);
    assert.equal(state.reviewHistory.length, 1);
    assert.equal(state.sources['test-source'].pendingReview, false);
    assert.equal(Object.hasOwn(state.sources['test-source'], 'pendingProposal'), false);
  });
});

test('keeps errors visible and does not erase the last successful source fingerprint', async () => {
  await withTemporaryFiles(async (paths) => {
    await refreshSources({ ...paths, fetchImpl: async () => response('<html><title>Bonus</title><p>Disponibile</p></html>') });
    const before = JSON.parse(await readFile(paths.statePath, 'utf8'));
    const result = await refreshSources({ ...paths, fetchImpl: async () => { throw new Error('rete non disponibile'); } });
    const after = JSON.parse(await readFile(paths.statePath, 'utf8'));
    assert.equal(result.results[0].status, 'error');
    assert.equal(after.sources['test-source'].contentHash, before.sources['test-source'].contentHash);
    assert.match((await getMonitoringStatus(paths)).sources[0].lastError, /rete non disponibile/);
  });
});

test('re-baselines stored data when the fingerprint format changes', async () => {
  await withTemporaryFiles(async (paths) => {
    await writeFile(paths.statePath, JSON.stringify({
      schemaVersion: 1,
      fingerprintVersion: 1,
      lastRunAt: '2026-11-12T10:00:00.000Z',
      sources: {
        'test-source': {
          status: 'changed',
          pendingReview: true,
          contentHash: 'old-format-hash',
        },
      },
    }));
    const result = await refreshSources({
      ...paths,
      fetchImpl: async () => response('<html><title>Bonus</title><p>Current page</p></html>'),
      now: () => new Date('2026-11-13T10:00:00.000Z'),
    });
    assert.equal(result.results[0].status, 'baseline');
    assert.equal(result.state.sources['test-source'].pendingReview, false);
    assert.equal(result.state.fingerprintVersion, 2);
  });
});

test('ships an explicit unconfigured snapshot for the static web app', async () => {
  const projectDirectory = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
  const snapshot = JSON.parse(await readFile(path.join(projectDirectory, 'assets', 'catalog', 'source-monitoring.json'), 'utf8'));
  const sourceRegistry = JSON.parse(await readFile(path.join(projectDirectory, 'backend', 'source-registry.json'), 'utf8'));
  assert.equal(snapshot.schemaVersion, 1);
  assert.ok(['github-actions', 'not-configured'].includes(snapshot.updateMode));
  if (snapshot.updateMode === 'not-configured') assert.equal(snapshot.lastRunAt, null);
  else assert.equal(Number.isNaN(Date.parse(snapshot.lastRunAt)), false);
  assert.deepEqual(snapshot.sources.map((source) => source.id), sourceRegistry.sources.map((source) => source.id));
});
