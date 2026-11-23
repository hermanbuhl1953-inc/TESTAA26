# Correzione minima: data dei test CLI

## Base e applicazione

Delta rispetto alla rifinitura **già applicata e non committata** sul branch
`rifinitura-home-35805df`, snapshot locale
`working/scadenzario-rifinitura-35805df/project` (117 test Planning/Radar/UI).
Non è un pacchetto sostitutivo dell'app e non riparte da `user input (4).zip`.

Nel proprio progetto, restando sul branch attuale con la rifinitura presente:
1. Controllare `git status` e conservare una copia delle modifiche locali.
2. Estrarre `Scadenzario-correzione-test-cli-date.zip` **nella radice del progetto**,
   sovrapponendo soltanto i sei file elencati sotto. Non creare un nuovo ramo,
   non fare rollback/reset e non sostituire app, CSS o altri file.
3. Eseguire i controlli sotto usando le dipendenze già disponibili localmente.

## Scelta e comportamento

La fixture REAL dichiara OPEN con chiusura 19/11/2026 ore 12:00 +01:00.
I test avevano NOW fisso al 16/11, ma il subprocess CLI usava la data corrente:
dopo la chiusura il rifiuto del validator era corretto, non una regressione UI.

Il CLI offre ora `--as-of` opzionale per una validazione storica esplicita:

```sh
npm run ingest:manual -- data/import/manual/regione-lombardia-nidi-gratis-plus-2026-27.json --as-of 2026-11-16T13:08:00.000Z
```

Il flag funziona dopo il file (anche prima). Accetta soltanto ISO UTC canonico
`YYYY-MM-DDTHH:mm:ss.sssZ`, con calendario valido: niente date sole, offset,
valori mancanti, duplicati o normalizzazioni come 31 novembre. Gli errori
argomento escono con 2, prima di leggere il JSON/caricare l'ingestion.
La funzione di parsing separata permette di verificarli senza dipendenze.

La data viene passata all'opzione `now` **già esistente** di `ingestManualRecords`.
Si stampa la data di riferimento; con il flag si emette il warning
**CONTESTO STORICO NON VERIFICATO**: non certifica lo stato odierno, non pubblica,
non approva e non promuove a VERIFIED. Tutti i warning esistenti restano visibili.
Senza flag resta `new Date()` nell'importer e il contesto è OROLOGIO CORRENTE.
Non ci sono mock globali, loader speciali, bypass del validator o persistenza.

I subprocess dei test storici passano NOW esplicitamente; sono aggiunte le
regressioni per exit 1 appena dopo la scadenza, argomenti invalidi senza modifica
dei dati e default legato all'orologio reale. I controlli hash preesistenti su
catalogo SAMPLE ed eligibility restano intatti. Fixture, src, backend,
dipendenze e rifinitura frontend non sono modificati.

## File esatti nel delta

- `scripts/ingest-manual.mjs` (modificato)
- `scripts/ingest-manual-args.mjs` (nuovo)
- `test/real-measures/real-measures.test.mjs` (modificato)
- `test/real-measures/cli-args.test.mjs` (nuovo)
- `docs/CORREZIONE_TEST_CLI_DATE.md` (nuovo)
- `docs/CORREZIONE_TEST_CLI_DATE_MANIFEST.json` (nuovo)

Il manifest riporta SHA-256/CRC32 e hash di base per i cinque file di contenuto;
non contiene un hash ricorsivo di se stesso. Il CRC ZIP copre anche il manifest.
Il file `.zip.sha256` esterno identifica l'archivio completo.

## Verifiche e limiti (23/11/2026)

Eseguiti e superati: syntax check Node dei quattro file JS/MJS modificati/nuovi;
`node --test test/real-measures/cli-args.test.mjs` **5/5** (inclusi subprocess CLI
reali con exit 2 e snapshot dei dati invariato); `npm run test:planning` **55/55**;
`npm run test:radar` **42/42**; `npm run test:ui` **20/20**.

`npm run test:all` è stato eseguito ma **NON è verde**: mancano le dipendenze
locali (`ERR_MODULE_NOT_FOUND: zod`), con cinque file suite bloccati al caricamento
e i cinque test args superati. Le regressioni di ingestion/validator, compresi
as-of valido, default ed exit 1 dopo scadenza, sono aggiunte ma **non eseguite**
in questo ambiente. Nessun mock sostitutivo, installazione, rete o server usato.
Nessun `node_modules` disponibile nelle altre copie `working/`.

Sul proprio ambiente con dipendenze già presenti eseguire:

```sh
node --test test/real-measures/cli-args.test.mjs
npm run test:real-measures
npm run test:all
npm run test:planning
npm run test:radar
npm run test:ui
```

I log integrali della verifica locale sono nella cartella di lavoro della
correzione, fuori dal delta. Nessun commit/push o pubblicazione è stato eseguito.
