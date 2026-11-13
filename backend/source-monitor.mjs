import { createHash } from 'node:crypto';
import { mkdir, readFile, rename, writeFile } from 'node:fs/promises';
import path from 'node:path';

const MAX_SOURCE_BYTES = 2 * 1024 * 1024;
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
    if (url.protocol !== 'https:'
      || (source.scope !== 'nazionale' && typeof source.region !== 'string')
      || (source.scope === 'comunale' && typeof source.municipality !== 'string')) {
      throw new Error(`La fonte ${source.id ?? '(senza id)'} non rispetta lo schema o non usa HTTPS.`);
    }
    ids.add(source.id);
  }
}

async function readResponseText(response) {
  const contentType = response.headers.get('content-type') ?? '';
  if (!/^(text\/|application\/(json|xml|xhtml\+xml|atom\+xml|rss\+xml))/i.test(contentType)) {
    throw new Error(`tipo di contenuto non testuale: ${contentType || 'sconosciuto'}`);
  }
  const declaredLength = Number(response.headers.get('content-length'));
  if (Number.isFinite(declaredLength) && declaredLength > MAX_SOURCE_BYTES) {
    throw new Error(`pagina oltre il limite di ${MAX_SOURCE_BYTES} byte`);
  }
  if (!response.body) return '';

  const reader = response.body.getReader();
  const chunks = [];
  let totalBytes = 0;
  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    totalBytes += value.byteLength;
    if (totalBytes > MAX_SOURCE_BYTES) {
      await reader.cancel();
      throw new Error(`pagina oltre il limite di ${MAX_SOURCE_BYTES} byte`);
    }
    chunks.push(value);
  }
  const bytes = new Uint8Array(totalBytes);
  let offset = 0;
  for (const chunk of chunks) {
    bytes.set(chunk, offset);
    offset += chunk.byteLength;
  }
  return new TextDecoder().decode(bytes);
}

function summarizePage(body) {
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
    hash: createHash('sha256').update(comparablePage).digest('hex'),
  };
}

function getSourceHeaders(previous) {
  const headers = { 'user-agent': USER_AGENT, accept: 'text/html,application/xhtml+xml,application/xml;q=0.9,text/plain;q=0.8' };
  if (previous?.etag) headers['if-none-match'] = previous.etag;
  if (previous?.lastModified) headers['if-modified-since'] = previous.lastModified;
  return headers;
}

async function checkSource(source, previous, fetchImpl, now) {
  const checkedAt = now().toISOString();
  try {
    const response = await fetchImpl(source.url, {
      headers: getSourceHeaders(previous),
      redirect: 'follow',
      signal: AbortSignal.timeout(15_000),
    });
    if (new URL(response.url || source.url).protocol !== 'https:') {
      throw new Error('il reindirizzamento finale non usa HTTPS');
    }
    if (response.status === 304 && previous?.contentHash) {
      return { ...previous, status: previous.pendingReview ? 'changed' : 'unchanged', lastCheckedAt: checkedAt, lastError: null };
    }
    if (!response.ok) throw new Error(`risposta HTTP ${response.status}`);

    const page = summarizePage(await readResponseText(response));
    const isBaseline = !previous?.contentHash;
    const changed = !isBaseline && previous.contentHash !== page.hash;
    const pendingReview = changed ? true : Boolean(previous?.pendingReview);
    const previousChange = previous?.pendingReview && !changed ? previous.lastChange : null;
    return {
      status: changed ? 'changed' : isBaseline ? 'baseline' : pendingReview ? 'changed' : 'unchanged',
      lastCheckedAt: checkedAt,
      title: page.title,
      excerpt: page.excerpt,
      contentHash: page.hash,
      etag: response.headers.get('etag'),
      lastModified: response.headers.get('last-modified'),
      pendingReview,
      lastChange: changed
        ? { detectedAt: checkedAt, title: page.title, excerpt: page.excerpt }
        : previousChange,
      reviewedAt: previous?.reviewedAt ?? null,
      reviewNote: previous?.reviewNote ?? null,
      lastError: null,
    };
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
  now = () => new Date(),
}) {
  if (typeof fetchImpl !== 'function') throw new Error('Il runtime deve supportare fetch.');
  const registry = await readJson(registryPath, null);
  assertRegistry(registry);
  const loadedState = await readJson(statePath, { schemaVersion: 1, lastRunAt: null, sources: {} });
  const state = loadedState.fingerprintVersion === FINGERPRINT_VERSION
    ? loadedState
    : { schemaVersion: 1, lastRunAt: null, sources: {} };
  if (state.schemaVersion !== 1 || !state.sources || Array.isArray(state.sources)) {
    throw new Error('Lo stato del monitoraggio non rispetta lo schema.');
  }
  const nextSources = {};
  const results = await Promise.all(registry.sources.map(async (source) => {
    const checked = await checkSource(source, state.sources[source.id], fetchImpl, now);
    nextSources[source.id] = checked;
    return { id: source.id, status: checked.status, lastError: checked.lastError ?? null };
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
      lastError: status.lastError ?? null,
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
  state.reviewHistory = [...(state.reviewHistory ?? []), { sourceId, reviewedAt, note: note.trim() }].slice(-100);
  await writeJsonAtomically(statePath, state);
  return { sourceId, reviewedAt, pendingReviewCount: Object.values(state.sources).filter((source) => source.pendingReview).length };
}
