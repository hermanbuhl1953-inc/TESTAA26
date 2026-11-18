import type { SourceDefinition } from './types.ts';

export const comuneMilanoSources: readonly SourceDefinition[] = [
  {
    id: 'milano-quota-nidi',
    authority: { type: 'MUNICIPALITY', name: 'Comune di Milano' },
    territory: { region: 'Lombardia', province: 'Milano', municipality: 'Milano' },
    baseUrl: 'https://www.comune.milano.it/servizi/scuola/nidi-d-infanzia-e-sezioni-primavera-revisione-della-quota-contributiva',
    type: 'OFFICIAL',
    enabled: false,
    lastChecked: null,
  },
  {
    id: 'milano-refezione',
    authority: { type: 'MUNICIPALITY', name: 'Comune di Milano' },
    territory: { region: 'Lombardia', province: 'Milano', municipality: 'Milano' },
    baseUrl: 'https://www.comune.milano.it/servizi/scuola/refezione-scolastica',
    type: 'OFFICIAL',
    enabled: false,
    lastChecked: null,
  },
  {
    id: 'milano-sceglimi-2026',
    authority: { type: 'MUNICIPALITY', name: 'Comune di Milano' },
    territory: { region: 'Lombardia', province: 'Milano', municipality: 'Milano' },
    baseUrl: 'https://www.comune.milano.it/servizi/casa/sceglimi-sostegno-all-affitto-per-under-35',
    type: 'OFFICIAL',
    enabled: false,
    lastChecked: null,
  },
];
