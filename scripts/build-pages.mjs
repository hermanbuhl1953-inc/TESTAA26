import { copyFile, cp, mkdir, rm, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const projectDirectory = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const outputDirectory = path.join(projectDirectory, 'site');
const publicFiles = [
  'app.js',
  'planning.js',
  'radar.js',
  'index.html',
  'manifest.webmanifest',
  'service-worker.js',
  'styles.css',
];

await rm(outputDirectory, { recursive: true, force: true });
await mkdir(outputDirectory, { recursive: true });
for (const file of publicFiles) {
  await copyFile(path.join(projectDirectory, file), path.join(outputDirectory, file));
}
for (const directory of ['assets', 'icons']) {
  await cp(path.join(projectDirectory, directory), path.join(outputDirectory, directory), { recursive: true });
}
await writeFile(path.join(outputDirectory, '.nojekyll'), '', 'utf8');
console.info(`Sito GitHub Pages creato in ${outputDirectory}.`);
