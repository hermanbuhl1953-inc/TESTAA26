import { createHash } from 'node:crypto';
import { mkdir, readFile, rename, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { createOpenAIBenefitExtractor, getAIErrorMessage, normalizeBenefitProposal } from './benefit-extractor.mjs';
import { MAX_PDF_BYTES, parsePdfBuffer } from './pdf-parser.mjs';

const MAX_SOURCE_BYTES = 2 * 1024 * 1024;
const MAX_AI_TEXT_LENGTH = 60_000;
const MAX_PDF_LINKS = 5;
const MAX_PDF_HISTORY = 25;
const MAX_PDF_REDIRECTS = 3;
const MAX_SOURCE_REDIRECTS = 5;
const MAX_EXCERPT_LENGTH = 280;
const MAX_REVIEW_NOTE_LENGTH = 500;
const FINGERPRINT_VERSION = 2;
const USER_AGENT = 'ScadenzarioSourceMonitor/1.0 (scheduled checks of official public pages)';

export async function readJson(filePath, fallback) {
  try {
    return JSON.parse(await readFile(filePath, 'utf8'));
  } catch (error) {
    if (error.code === 'ENOENT') return fallback;
    throw new Error(`Impossibile leggere ${filePath}: ${error.message}`, { cause: error });
  }
}

async function writeJsonAtomically(filePath, value) {
  await mkdir(path.dirname(filePath), { recursive: true });
  const temporaryPath = `${filePath}.${process.pid}.tmp`;
  await writeFile(temporaryPath, `${JSON.stringify(value, null, 2)}\n`, 'utf8');
  await rename(temporaryPath, filePath);
}

function assertRegistry(registry) {
  if (!registry || registry.schemaVersion !== 1 || !Array.isArray(registry.sources)) {
    throw new Error('Il registro fonti deve avere schemaVersion 1 e un elenco sources.');
  }
  const ids = new Set();
  for (const source of registry.sources) {
    if (!source || typeof source.id !== 'string' || !/^[a-z0-9-]+$/.test(source.id)
      || ids.has(source.id) || typeof source.label !== 'string' || !source.label.trim()
      || !['nazionale', 'regionale', 'comunale'].includes(source.scope)) {
      throw new Error(`La fonte ${source?.id ?? '(senza id)'} non rispetta lo schema.`);
    }
    let url;
    try {
      url = new URL(source.url);
    } catch {
      throw new Error(`URL non valido per la fonte ${source.id ?? '(senza id)'}.`);
    }
    if (url.protocol !== 'https:' || url.username || url.password
      || (source.scope !== 'nazionale' && typeof source.region !== 'string')
      || (source.scope === 'comunale' && typeof source.municipality !== 'string')) {
      throw new Error(`La fonte ${source.id ?? '(senza id)'} non rispetta lo schema o non usa HTTPS.`);
    }
    ids.add(source.id);
  }
}

async function readResponseBytes(response, maximumBytes, label) {
  const declaredLength = Number(response.headers.get('content-length'));
  if (Number.isFinite(declaredLength) && declaredLength > maximumBytes) {
    throw new Error(`${label} oltre il limite di ${maximumBytes} byte`);
  }
  if (!response.body) return new Uint8Array();

  const reader = response.body.getReader();
  const chunks = [];
  let totalBytes = 0;
  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    totalBytes += value.byteLength;
    if (totalBytes > maximumBytes) {
      await reader.cancel();
      throw new Error(`${label} oltre il limite di ${maximumBytes} byte`);
    }
    chunks.push(value);
  }
  const bytes = new Uint8Array(totalBytes);
  let offset = 0;
  for (const chunk of chunks) {
    bytes.set(chunk, offset);
    offset += chunk.byteLength;
  }
  return bytes;
}

async function readResponseText(response) {
  const contentType = response.headers.get('content-type') ?? '';
  if (!/^(text\/|application\/(json|xml|xhtml\+xml|atom\+xml|rss\+xml))/i.test(contentType)) {
    throw new Error(`tipo di contenuto non testuale: ${contentType || 'sconosciuto'}`);
  }
  const bytes = await readResponseBytes(response, MAX_SOURCE_BYTES, 'pagina');
  return new TextDecoder().decode(bytes);
}

function summarizePage(body, contentHash) {
  const title = body.match(/<title\b[^>]*>([\s\S]*?)<\/title>/i)?.[1] ?? '';
  const comparablePage = body
    .replace(/<(script|style|noscript|svg)\b[^>]*>[\s\S]*?<\/\1>/gi, ' ')
    .replace(/<!--[\s\S]*?-->/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
  const text = comparablePage
    .replace(/<[^>]*>/g, ' ')
    .replace(/&nbsp;|&#160;/gi, ' ')
    .replace(/&amp;/gi, '&')
    .replace(/&lt;/gi, '<')
    .replace(/&gt;/gi, '>')
    .replace(/&quot;|&#34;/gi, '"')
    .replace(/&#39;|&apos;/gi, "'")
    .replace(/\s+/g, ' ')
    .trim();
  const cleanTitle = title.replace(/<[^>]*>/g, '').replace(/\s+/g, ' ').trim().slice(0, 160);
  return {
    title: cleanTitle || null,
    excerpt: text.slice(0, MAX_EXCERPT_LENGTH) || null,
    text,
    hash: contentHash ?? createHash('sha256').update(comparablePage).digest('hex'),
  };
}

function isPdfUrl(value) {
  try {
    return /\.pdf$/i.test(new URL(value).pathname);
  } catch {
    return false;
  }
}

function isPdfResponse(response, url) {
  return /(?:^|\/)pdf(?:;|$)/i.test(response.headers.get('content-type') ?? '')
    || isPdfUrl(url);
}

function extractPdfLinks(body, baseUrl) {
  const base = new URL(baseUrl);
  const links = new Set();
  const hrefPattern = /\bhref\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s>]+))/gi;
  for (const match of body.matchAll(hrefPattern)) {
    const href = (match[1] ?? match[2] ?? match[3] ?? '').replace(/&amp;/gi, '&');
    let url;
    try {
      url = new URL(href, base);
    } catch {
      continue;
    }
    if (url.protocol === 'https:' && url.origin === base.origin && isPdfUrl(url.href)) {
      url.hash = '';
      links.add(url.href);
      if (links.size >= MAX_PDF_LINKS) break;
    }
  }
  return [...links];
}

function assertSafePdfUrl(value, allowedOrigin) {
  let url;
  try {
    url = new URL(value);
  } catch {
    throw new Error('URL PDF non valido.');
  }
  if (url.protocol !== 'https:' || url.origin !== allowedOrigin
    || url.username || url.password) {
    throw new Error('Il PDF deve usare HTTPS sullo stesso host della pagina monitorata.');
  }
  return url;
}

async function fetchSourceResponse(url, options, fetchImpl) {
  let target = new URL(url);
  for (let redirectCount = 0; redirectCount <= MAX_SOURCE_REDIRECTS; redirectCount += 1) {
    const response = await fetchImpl(target.href, { ...options, redirect: 'manual' });
    if (response.status < 300 || response.status >= 400 || response.status === 304) return response;
    const location = response.headers.get('location');
    if (!location || redirectCount === MAX_SOURCE_REDIRECTS) {
      throw new Error('Reindirizzamento della fonte non valido o oltre il limite.');
    }
    target = new URL(location, target);
    if (target.protocol !== 'https:' || target.username || target.password) {
      throw new Error('Il reindirizzamento della fonte deve mantenere HTTPS.');
    }
  }
  throw new Error('Reindirizzamento della fonte non valido.');
}

async function downloadLinkedPdf(url, allowedOrigin, fetchImpl) {
  let target = assertSafePdfUrl(url, allowedOrigin);
  for (let redirectCount = 0; redirectCount <= MAX_PDF_REDIRECTS; redirectCount += 1) {
    const response = await fetchImpl(target.href, {
      headers: { 'user-agent': USER_AGENT, accept: 'application/pdf' },
      redirect: 'manual',
      signal: AbortSignal.timeout(15_000),
    });
    if (response.status >= 300 && response.status < 400) {
      const location = response.headers.get('location');
      if (!location || redirectCount === MAX_PDF_REDIRECTS) {
        throw new Error('Reindirizzamento PDF non valido o oltre il limite.');
      }
      target = assertSafePdfUrl(new URL(location, target).href, allowedOrigin);
      continue;
    }
    if (!response.ok) throw new Error(`risposta HTTP ${response.status}`);
    const finalUrl = assertSafePdfUrl(response.url || target.href, allowedOrigin);
    const contentType = response.headers.get('content-type') ?? '';
    const bytes = await readResponseBytes(response, MAX_PDF_BYTES, 'PDF');
    if (!/^application\/pdf(?:;|$)/i.test(contentType)
      && !/^%PDF-/i.test(Buffer.from(bytes).subarray(0, 1024).toString('latin1'))) {
      throw new Error('La risorsa collegata non contiene un PDF.');
    }
    return { url: finalUrl.href, bytes };
  }
  throw new Error('Reindirizzamento PDF non valido.');
}

function getPdfDocuments(previous) {
  return Array.isArray(previous?.pdfDocuments) ? previous.pdfDocuments : [];
}

async function analyzePdf({ url, bytes, previousDocuments, now, pdfParser }) {
  const contentHash = createHash('sha256').update(bytes).digest('hex');
  const previousDocument = previousDocuments.find((document) => document.url === url);
  if (previousDocument?.contentHash === contentHash) {
    return { document: { ...previousDocument, lastSeenAt: now().toISOString() }, text: null, changed: false };
  }
  const analyzedAt = now().toISOString();
  let text;
  let error = null;
  try {
    text = await pdfParser(bytes);
  } catch (parseError) {
    error = String(parseError.message || parseError).slice(0, 180);
  }
  return {
    document: {
      url,
      contentHash,
      sizeBytes: bytes.byteLength,
      lastSeenAt: analyzedAt,
      analyzedAt,
      status: error ? 'error' : 'analyzed',
      textLength: text?.length ?? 0,
      error,
    },
    text: text ?? null,
    changed: previousDocument
      ? previousDocument.contentHash !== contentHash
      : false,
  };
}

function getSourceHeaders(previous) {
  const headers = { 'user-agent': USER_AGENT, accept: 'text/html,application/xhtml+xml,application/xml;q=0.9,text/plain;q=0.8' };
  if (!Array.isArray(previous?.pdfLinks)) return headers;
  if (previous?.etag) headers['if-none-match'] = previous.etag;
  if (previous?.lastModified) headers['if-modified-since'] = previous.lastModified;
  return headers;
}

async function checkSource(source, previous, fetchImpl, now, benefitExtractor, pdfParser) {
  const checkedAt = now().toISOString();
  try {
    const response = await fetchSourceResponse(source.url, {
      headers: getSourceHeaders(previous),
      signal: AbortSignal.timeout(15_000),
    }, fetchImpl);
    if (new URL(response.url || source.url).protocol !== 'https:') {
      throw new Error('il reindirizzamento finale non usa HTTPS');
    }
    const notModified = response.status === 304 && Boolean(previous?.contentHash);
    if (!notModified && !response.ok) throw new Error(`risposta HTTP ${response.status}`);

    const pageUrl = response.url || source.url;
    const previousDocuments = getPdfDocuments(previous);
    const pdfDocumentsByUrl = new Map(previousDocuments.map((document) => [document.url, document]));
    const changedPdfTexts = [];
    let pdfChanged = false;
    let lastPdfAnalyzed = previous?.lastPdfAnalyzed ?? null;
    let pdfError = null;
    let page;
    let pdfLinks;

    if (notModified) {
      page = {
        title: previous.title ?? null,
        excerpt: previous.excerpt ?? null,
        text: '',
        hash: previous.contentHash,
      };
      pdfLinks = previous.pdfLinks ?? [];
    } else if (isPdfResponse(response, pageUrl)) {
      const bytes = await readResponseBytes(response, MAX_PDF_BYTES, 'PDF');
      const analyzed = await analyzePdf({
        url: pageUrl,
        bytes,
        previousDocuments,
        now,
        pdfParser,
      });
      pdfDocumentsByUrl.set(analyzed.document.url, analyzed.document);
      pdfChanged = analyzed.changed;
      if (previous?.contentHash && !previousDocuments.some((document) => document.url === analyzed.document.url)) {
        pdfChanged = true;
      }
      if (analyzed.text) changedPdfTexts.push(analyzed.text);
      if (analyzed.document.analyzedAt) lastPdfAnalyzed = analyzed.document;
      if (analyzed.document.error) pdfError = `${analyzed.document.url}: ${analyzed.document.error}`;
      page = summarizePage(analyzed.text ?? previous?.excerpt ?? '', analyzed.document.contentHash);
      pdfLinks = [];
    } else {
      const body = await readResponseText(response);
      page = summarizePage(body);
      pdfLinks = extractPdfLinks(body, pageUrl);
    }

    for (const pdfUrl of pdfLinks) {
      try {
        const downloaded = await downloadLinkedPdf(pdfUrl, new URL(pageUrl).origin, fetchImpl);
        const analyzed = await analyzePdf({
          ...downloaded,
          previousDocuments,
          now,
          pdfParser,
        });
        pdfDocumentsByUrl.set(analyzed.document.url, analyzed.document);
        pdfChanged ||= analyzed.changed
          || Boolean(previous?.contentHash
            && !previousDocuments.some((document) => document.url === analyzed.document.url));
        if (analyzed.document.analyzedAt) lastPdfAnalyzed = analyzed.document;
        if (analyzed.document.error) {
          pdfError = `${analyzed.document.url}: ${analyzed.document.error}`;
        }
        if (analyzed.text) {
          changedPdfTexts.push(analyzed.text);
        }
      } catch (error) {
        pdfError = `${pdfUrl}: ${String(error.message || error).slice(0, 180)}`;
        pdfDocumentsByUrl.set(pdfUrl, {
          ...(pdfDocumentsByUrl.get(pdfUrl) ?? {}),
          url: pdfUrl,
          lastSeenAt: checkedAt,
          status: 'error',
          error: String(error.message || error).slice(0, 180),
        });
      }
    }
    const pdfFingerprint = [...pdfDocumentsByUrl.values()]
      .filter((document) => document.contentHash)
      .map(({ url, contentHash }) => `${url}:${contentHash}`)
      .sort()
      .join('\n');
    page.pdfFingerprint = pdfFingerprint;

    const isBaseline = !previous?.contentHash;
    const changed = !isBaseline && (
      previous.contentHash !== page.hash
      || (previous.pdfFingerprint !== undefined && previous.pdfFingerprint !== page.pdfFingerprint)
      || pdfChanged
    );
    const pendingReview = changed ? true : Boolean(previous?.pendingReview);
    const needsProposal = changed || (pendingReview
      && !previous?.pendingProposal
      && [undefined, 'manual-review'].includes(previous?.proposalStatus));
    const previousChange = previous?.pendingReview && !changed ? previous.lastChange : null;
    const result = {
      status: changed ? 'changed' : isBaseline ? 'baseline'
        : pendingReview ? previous.status === 'error-ai' ? 'error-ai' : 'changed' : 'unchanged',
      lastCheckedAt: checkedAt,
      title: page.title,
      excerpt: page.excerpt,
      contentHash: page.hash,
      pdfFingerprint: page.pdfFingerprint,
      pdfLinks,
      etag: response.headers.get('etag') ?? (notModified ? previous.etag : null),
      lastModified: response.headers.get('last-modified') ?? (notModified ? previous.lastModified : null),
      pendingReview,
      lastChange: changed
        ? { detectedAt: checkedAt, title: page.title, excerpt: page.excerpt }
        : previousChange,
      reviewedAt: previous?.reviewedAt ?? null,
      reviewNote: previous?.reviewNote ?? null,
      lastError: null,
      pdfDocuments: [...pdfDocumentsByUrl.values()]
        .sort((left, right) => (right.lastSeenAt ?? '').localeCompare(left.lastSeenAt ?? ''))
        .slice(0, MAX_PDF_HISTORY),
      lastPdfAnalyzed,
      pdfError,
      pendingProposal: needsProposal ? null : previous?.pendingProposal ?? null,
      proposalStatus: needsProposal ? 'manual-review' : previous?.proposalStatus ?? null,
      aiError: needsProposal ? null : previous?.aiError ?? null,
    };
    if (!needsProposal || typeof benefitExtractor !== 'function') return result;

    try {
      const candidate = await benefitExtractor({
        source,
        pageText: [page.text, ...changedPdfTexts].filter(Boolean).join('\n\n').slice(0, MAX_AI_TEXT_LENGTH),
        observedAt: checkedAt,
      });
      result.pendingProposal = normalizeBenefitProposal(candidate, source);
      result.proposalStatus = 'ready';
      return result;
    } catch (error) {
      result.status = 'error-ai';
      result.pendingProposal = null;
      result.proposalStatus = 'error';
      result.aiError = getAIErrorMessage(error);
      return result;
    }
  } catch (error) {
    return {
      ...previous,
      status: 'error',
      lastCheckedAt: checkedAt,
      lastError: String(error.message || error).slice(0, 240),
    };
  }
}

export async function refreshSources({
  registryPath,
  statePath,
  fetchImpl = globalThis.fetch,
  benefitExtractor,
  pdfParser = parsePdfBuffer,
  now = () => new Date(),
}) {
  if (typeof fetchImpl !== 'function' || typeof pdfParser !== 'function') {
    throw new Error('Il runtime deve supportare fetch e un parser PDF valido.');
  }
  const registry = await readJson(registryPath, null);
  assertRegistry(registry);
  const loadedState = await readJson(statePath, { schemaVersion: 1, lastRunAt: null, sources: {} });
  const state = loadedState.fingerprintVersion === FINGERPRINT_VERSION
    ? loadedState
    : { schemaVersion: 1, lastRunAt: null, sources: {} };
  if (state.schemaVersion !== 1 || !state.sources || Array.isArray(state.sources)) {
    throw new Error('Lo stato del monitoraggio non rispetta lo schema.');
  }
  let configuredExtractor = benefitExtractor;
  if (configuredExtractor === undefined) {
    try {
      configuredExtractor = await createOpenAIBenefitExtractor();
    } catch (error) {
      configuredExtractor = async () => { throw error; };
    }
  }
  const nextSources = {};
  const results = await Promise.all(registry.sources.map(async (source) => {
    const checked = await checkSource(
      source,
      state.sources[source.id],
      fetchImpl,
      now,
      configuredExtractor,
      pdfParser,
    );
    nextSources[source.id] = checked;
    return {
      id: source.id,
      status: checked.status,
      lastError: checked.lastError ?? null,
      aiError: checked.aiError ?? null,
      pdfError: checked.pdfError ?? null,
    };
  }));
  const nextState = {
    schemaVersion: 1,
    fingerprintVersion: FINGERPRINT_VERSION,
    lastRunAt: now().toISOString(),
    sources: nextSources,
  };
  await writeJsonAtomically(statePath, nextState);
  return { state: nextState, results };
}

export async function getMonitoringStatus({ registryPath, statePath }) {
  const [registry, loadedState] = await Promise.all([
    readJson(registryPath, null),
    readJson(statePath, { schemaVersion: 1, lastRunAt: null, sources: {} }),
  ]);
  assertRegistry(registry);
  const state = loadedState.fingerprintVersion === FINGERPRINT_VERSION
    ? loadedState
    : { schemaVersion: 1, lastRunAt: null, sources: {} };
  const sources = registry.sources.map((source) => {
    const status = state.sources[source.id] ?? { status: 'unchecked', lastCheckedAt: null, pendingReview: false };
    return {
      id: source.id,
      label: source.label,
      scope: source.scope,
      region: source.region,
      municipality: source.municipality,
      url: source.url,
      status: status.status ?? 'unchecked',
      lastCheckedAt: status.lastCheckedAt ?? null,
      pendingReview: Boolean(status.pendingReview),
      lastChange: status.lastChange ?? null,
      lastError: status.lastError ?? status.aiError ?? status.pdfError ?? null,
      lastPdfAnalyzed: status.lastPdfAnalyzed ?? null,
      pdfError: status.pdfError ?? null,
    };
  });
  return {
    schemaVersion: 1,
    updateMode: 'local-server',
    lastRunAt: state.lastRunAt,
    pendingReviewCount: sources.filter((source) => source.pendingReview).length,
    sources,
  };
}

export async function resolveSourceChange({ registryPath, statePath, sourceId, note, now = () => new Date() }) {
  if (typeof note !== 'string' || note.trim().length < 8 || note.trim().length > MAX_REVIEW_NOTE_LENGTH) {
    throw new Error(`La nota di verifica deve contenere da 8 a ${MAX_REVIEW_NOTE_LENGTH} caratteri.`);
  }
  const registry = await readJson(registryPath, null);
  assertRegistry(registry);
  if (!registry.sources.some((source) => source.id === sourceId)) throw new Error(`Fonte sconosciuta: ${sourceId}`);
  const state = await readJson(statePath, { schemaVersion: 1, lastRunAt: null, sources: {} });
  if (state.fingerprintVersion !== FINGERPRINT_VERSION) {
    throw new Error('Il monitoraggio deve completare un nuovo controllo prima di registrare una revisione.');
  }
  const sourceState = state.sources[sourceId];
  if (!sourceState?.pendingReview) throw new Error(`La fonte ${sourceId} non ha modifiche in attesa di revisione.`);
  const reviewedAt = now().toISOString();
  sourceState.pendingReview = false;
  sourceState.reviewedAt = reviewedAt;
  sourceState.reviewNote = note.trim();
  sourceState.status = sourceState.status === 'error' ? 'error' : 'unchanged';
  delete sourceState.pendingProposal;
  delete sourceState.proposalStatus;
  delete sourceState.aiError;
  state.reviewHistory = [...(state.reviewHistory ?? []), { sourceId, reviewedAt, note: note.trim() }].slice(-100);
  await writeJsonAtomically(statePath, state);
  return { sourceId, reviewedAt, pendingReviewCount: Object.values(state.sources).filter((source) => source.pendingReview).length };
}
