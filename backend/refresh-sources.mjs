import { mkdir, rename, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { getMonitoringStatus, refreshSources } from './source-monitor.mjs';

const backendDirectory = path.dirname(fileURLToPath(import.meta.url));
const projectDirectory = path.dirname(backendDirectory);
const registryPath = path.join(backendDirectory, 'source-registry.json');
const statePath = path.join(backendDirectory, 'data', 'source-state.json');
const publicStatusPath = path.join(projectDirectory, 'assets', 'catalog', 'source-monitoring.json');

async function writeStatusAtomically(filePath, value) {
  await mkdir(path.dirname(filePath), { recursive: true });
  const temporaryPath = `${filePath}.${process.pid}.tmp`;
  await writeFile(temporaryPath, `${JSON.stringify(value, null, 2)}\n`, 'utf8');
  await rename(temporaryPath, filePath);
}

try {
  const result = await refreshSources({ registryPath, statePath });
  const monitoring = await getMonitoringStatus({ registryPath, statePath });
  await writeStatusAtomically(publicStatusPath, { ...monitoring, updateMode: 'github-actions' });
  const errors = result.results.filter((source) => source.status === 'error');
  const changes = result.results.filter((source) => ['changed', 'error-ai'].includes(source.status));
  const aiErrors = result.results.filter((source) => source.status === 'error-ai');
  console.info(`Controllate ${result.results.length} fonti; ${changes.length} variazioni da rivedere; ${errors.length} errori fonte; ${aiErrors.length} errori AI.`);
  for (const source of errors) console.error(`${source.id}: ${source.lastError}`);
  for (const source of aiErrors) console.error(`${source.id}: ${source.aiError}`);
} catch (error) {
  console.error(`Aggiornamento stato fonti non riuscito: ${error.message}`);
  process.exitCode = 1;
}
