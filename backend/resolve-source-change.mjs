import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { resolveSourceChange } from './source-monitor.mjs';

const backendDirectory = path.dirname(fileURLToPath(import.meta.url));
const projectDirectory = path.dirname(backendDirectory);
const [sourceId, ...noteParts] = process.argv.slice(2);
const note = noteParts.join(' ').replace(/^["']|["']$/g, '');

if (!sourceId || !note) {
  console.error('Uso: node backend/resolve-source-change.mjs <id-fonte> "<nota della verifica manuale>"');
  process.exitCode = 2;
} else {
  try {
    const result = await resolveSourceChange({
      registryPath: path.join(backendDirectory, 'source-registry.json'),
      statePath: path.join(backendDirectory, 'data', 'source-state.json'),
      sourceId,
      note,
    });
    console.info(`Modifica ${sourceId} verificata il ${result.reviewedAt}. Modifiche ancora da rivedere: ${result.pendingReviewCount}.`);
  } catch (error) {
    console.error(`Revisione non registrata: ${error.message}`);
    process.exitCode = 1;
  }
}
