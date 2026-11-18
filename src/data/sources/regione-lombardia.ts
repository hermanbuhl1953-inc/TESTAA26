import type { SourceDefinition } from './types.ts';

export const regioneLombardiaSources: readonly SourceDefinition[] = [
  {
    id: 'lombardia-bandi',
    authority: { type: 'REGION', name: 'Regione Lombardia' },
    territory: { region: 'Lombardia', province: null, municipality: null },
    baseUrl: 'https://www.bandi.regione.lombardia.it/servizi/home',
    type: 'OFFICIAL',
    enabled: false,
    lastChecked: null,
  },
  {
    id: 'lombardia-nidi-gratis-plus-2026-27',
    authority: { type: 'REGION', name: 'Regione Lombardia' },
    territory: { region: 'Lombardia', province: null, municipality: null },
    baseUrl: 'https://www.bandi.regione.lombardia.it/servizi/servizio/bandi/dettaglio/politiche-sociali/famiglia/nidi-gratis-plus-2026-27-adesione-famiglie-RLD12026053903',
    type: 'OFFICIAL',
    enabled: false,
    lastChecked: null,
  },
  {
    id: 'lombardia-buono-scuola-2026-27',
    authority: { type: 'REGION', name: 'Regione Lombardia' },
    territory: { region: 'Lombardia', province: null, municipality: null },
    baseUrl: 'https://www.bandi.regione.lombardia.it/servizi/servizio/bandi/dettaglio/istruzione-formazione-lavoro/dote-scuola/dote-scuola-componente-buono-scuola-anno-scolastico-2026-2027-RLW12025050894',
    type: 'OFFICIAL',
    enabled: false,
    lastChecked: null,
  },
];
