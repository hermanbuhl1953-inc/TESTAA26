import { comuneMilanoSources } from './comune-milano.ts';
import { regioneLombardiaSources } from './regione-lombardia.ts';
import type { SourceDefinition } from './types.ts';

export const sourceRegistry: readonly SourceDefinition[] = [
  ...regioneLombardiaSources,
  ...comuneMilanoSources,
];

export function getSourceById(sourceId: string): SourceDefinition | undefined {
  return sourceRegistry.find((source) => source.id === sourceId);
}
