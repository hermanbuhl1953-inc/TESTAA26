import { createServer } from 'node:http';
import { readFile, stat } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { getMonitoringStatus, refreshSources } from './backend/source-monitor.mjs';

const projectDirectory = path.dirname(fileURLToPath(import.meta.url));
const backendDirectory = path.join(projectDirectory, 'backend');
const registryPath = path.join(backendDirectory, 'source-registry.json');
const sourceStatePath = path.join(backendDirectory, 'data', 'source-state.json');
const catalogPath = path.join(projectDirectory, 'assets', 'catalog', 'benefits.json');
const refreshIntervalMs = 24 * 60 * 60 * 1000;
const publicRootFiles = new Set(['app.js', 'index.html', 'manifest.webmanifest', 'service-worker.js', 'styles.css']);
const publicDirectories = new Set(['assets', 'icons']);
const mimeTypes = {
  '.css': 'text/css; charset=utf-8',
  '.html': 'text/html; charset=utf-8',
  '.ico': 'image/x-icon',
  '.jpeg': 'image/jpeg',
  '.jpg': 'image/jpeg',
  '.js': 'text/javascript; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.mjs': 'text/javascript; charset=utf-8',
  '.png': 'image/png',
  '.svg': 'image/svg+xml',
  '.webmanifest': 'application/manifest+json; charset=utf-8',
};
let refreshInProgress = false;

function sendJson(response, statusCode, value) {
  response.writeHead(statusCode, {
    'cache-control': 'no-store',
    'content-type': 'application/json; charset=utf-8',
    'x-content-type-options': 'nosniff',
  });
  response.end(`${JSON.stringify(value)}\n`);
}

async function refreshAndLog() {
  if (refreshInProgress) return;
  refreshInProgress = true;
  try {
    const result = await refreshSources({ registryPath, statePath: sourceStatePath });
    const errors = result.results.filter((source) => source.status === 'error');
    const changes = result.results.filter((source) => source.status === 'changed');
    console.info(`[fonti] ${result.state.lastRunAt}: ${result.results.length} controllate, ${changes.length} da rivedere, ${errors.length} errori.`);
    for (const source of errors) console.error(`[fonti] ${source.id}: ${source.lastError}`);
  } catch (error) {
    console.error(`[fonti] Controllo non completato: ${error.message}`);
  } finally {
    refreshInProgress = false;
  }
}

async function serveStatic(pathname, response) {
  let decodedPath;
  try {
    decodedPath = decodeURIComponent(pathname);
  } catch {
    response.writeHead(400).end('Percorso non valido.');
    return;
  }
  const relativePath = decodedPath === '/' ? 'index.html' : decodedPath.replace(/^\/+/, '');
  const resolvedPath = path.resolve(projectDirectory, relativePath);
  const relativeResolvedPath = path.relative(projectDirectory, resolvedPath);
  const pathParts = relativeResolvedPath.split(path.sep);
  if (relativeResolvedPath.startsWith('..') || path.isAbsolute(relativeResolvedPath)
    || pathParts.some((part) => part.startsWith('.'))
    || (!publicRootFiles.has(pathParts[0]) && !publicDirectories.has(pathParts[0]))) {
    response.writeHead(404).end('Risorsa non trovata.');
    return;
  }
  try {
    const info = await stat(resolvedPath);
    if (!info.isFile()) {
      response.writeHead(404).end('Risorsa non trovata.');
      return;
    }
    const body = await readFile(resolvedPath);
    response.writeHead(200, {
      'cache-control': 'no-cache',
      'content-length': body.length,
      'content-type': mimeTypes[path.extname(resolvedPath).toLowerCase()] ?? 'application/octet-stream',
      'x-content-type-options': 'nosniff',
    });
    response.end(body);
  } catch (error) {
    if (error.code === 'ENOENT' || error.code === 'EISDIR') {
      response.writeHead(404).end('Risorsa non trovata.');
      return;
    }
    console.error(`[http] Lettura file non riuscita: ${error.message}`);
    response.writeHead(500).end('Errore nella lettura della risorsa.');
  }
}

const server = createServer(async (request, response) => {
  const requestUrl = new URL(request.url, 'http://localhost');
  if (request.method === 'GET' && requestUrl.pathname === '/api/benefits') {
    try {
      const catalog = JSON.parse(await readFile(catalogPath, 'utf8'));
      sendJson(response, 200, catalog);
    } catch (error) {
      console.error(`[api] Catalogo agevolazioni non disponibile: ${error.message}`);
      sendJson(response, 500, { error: 'Catalogo agevolazioni temporaneamente non disponibile.' });
    }
    return;
  }
  if (request.method === 'GET' && requestUrl.pathname === '/api/monitoring') {
    try {
      sendJson(response, 200, await getMonitoringStatus({ registryPath, statePath: sourceStatePath }));
    } catch (error) {
      console.error(`[api] Stato fonti non disponibile: ${error.message}`);
      sendJson(response, 500, { error: 'Stato delle fonti temporaneamente non disponibile.' });
    }
    return;
  }
  if (requestUrl.pathname.startsWith('/api/')) {
    if (request.method !== 'GET') {
      response.writeHead(405, { allow: 'GET', 'cache-control': 'no-store' }).end();
      return;
    }
    sendJson(response, 404, { error: 'Endpoint non trovato.' });
    return;
  }
  if (request.method !== 'GET') {
    response.writeHead(405, { allow: 'GET' }).end('Metodo non consentito.');
    return;
  }
  await serveStatic(requestUrl.pathname, response);
});

const port = Number(process.env.PORT ?? 4173);
const host = process.env.HOST ?? '127.0.0.1';
if (!Number.isInteger(port) || port < 1 || port > 65535) throw new Error('PORT deve essere un numero tra 1 e 65535.');

server.listen(port, host, () => {
  console.info(`Scadenzario disponibile su http://${host}:${port}`);
  void refreshAndLog();
  const refreshTimer = setInterval(() => void refreshAndLog(), refreshIntervalMs);
  refreshTimer.unref();
});

for (const signal of ['SIGINT', 'SIGTERM']) {
  process.on(signal, () => server.close(() => process.exit(0)));
}
