# Scadenzario

Prototipo web installabile (PWA) per organizzare le scadenze personali, senza installare Flutter o Android Studio.

## Avvio con monitoraggio automatico delle fonti

1. Installa Node.js 22.3 o successivo, se non è già disponibile.
2. Apri questa cartella in Visual Studio Code e un terminale PowerShell.
3. Installa le dipendenze backend:

```powershell
npm ci
```

4. Esegui:

```powershell
node server.mjs
```

Il server funziona anche senza configurare OpenAI; per abilitare l'estrazione AI in locale, configura `OPENAI_API_KEY` nell'ambiente del processo prima dell'avvio.

5. Visita `http://127.0.0.1:4173`. Il servizio controlla le fonti ufficiali all'avvio e poi ogni 24 ore, finché resta in esecuzione.

Con **Live Server** o `python -m http.server` la PWA continua a funzionare con il catalogo locale, ma non ha API né monitoraggio automatico. Non aprire `index.html` con doppio clic se vuoi usare il catalogo o installare la PWA: i browser limitano queste funzioni sui file `file://`.

Per fermare il servizio usa `Ctrl+C` nel terminale. Per avere controlli anche quando il proprio computer è spento serve distribuire il backend su un host sempre attivo con disco persistente; una pubblicazione statica o un servizio serverless senza stato persistente non basta. Il prototipo non è ancora pubblicato su Internet.

## Pubblicazione pianificata con GitHub Actions e Pages

È predisposto `.github/workflows/pages.yml`; sul branch predefinito `main`, il workflow:

- esegue i test e controlla le fonti all'avvio, su richiesta e una volta al giorno;
- se è configurato il secret Actions `OPENAI_API_KEY`, invia a OpenAI il testo estratto da pagine e PDF solo quando rileva una variazione e salva la proposta AI nello stato privato; senza il secret resta attiva la revisione manuale;
- salva il risultato pubblico in `assets/catalog/source-monitoring.json` e lo stato necessario al controllo successivo in `backend/data/source-state.json`;
- pubblica su GitHub Pages solo l'app e i cataloghi pubblici, senza esporre la cartella `backend`, quando la pubblicazione è abilitata.

Il progetto è collegato a `https://github.com/hermanbuhl1953-inc/scadenzario`. Il monitoraggio pianificato è stato eseguito; la pubblicazione Pages è disattivata finché non viene abilitata nelle impostazioni del repository. Per pubblicare, prima verifica che il piano supporti GitHub Pages per un repository privato e decidi se il sito può essere pubblico. Poi configura **Settings → Pages → Build and deployment → GitHub Actions** e crea la variabile Actions `PUBLISH_GITHUB_PAGES` con valore `true` in **Settings → Secrets and variables → Actions → Variables**. Le esecuzioni successive pubblicano il sito; se il piano o la configurazione non lo consentono, lascia la variabile non impostata e il monitoraggio continuerà comunque.

I risultati pubblicati sono uno snapshot: l'applicazione resta statica; GitHub Actions aggiorna lo stato delle fonti e ridistribuisce il sito. Il workflow registra le impronte delle pagine nel repository per poter rilevare variazioni tra esecuzioni. Non caricare nel repository credenziali, documenti o dati personali. I controlli possono essere ritardati da GitHub o fallire se una fonte blocca richieste automatiche.

## Controllo delle fonti e revisione

- Il registro controlla soltanto fonti nazionali INPS e ARERA, coerentemente con il catalogo per persone e famiglie.
- Il catalogo in app è curato da schede ufficiali per persone e famiglie, non importato come regole da cataloghi statistici. L'API CKAN di [dati.gov.it](https://www.dati.gov.it/api) indicizza, ad esempio, il dataset INPS [Assegno Unico Nuclei 2022-2024](https://dati.gov.it/opendata/dataset/assegno-unico-nuclei-2022-2024), ma i suoi CSV/JSON contengono conteggi aggregati e importi storici, non requisiti correnti o una verifica individuale; per questo non viene trattato come elenco di bonus richiedibili. Il nuovo portale [Incentivi Italia](https://www.incentivitalia.gov.it/il-progetto) è rivolto principalmente agli incentivi alle imprese e non è usato per il catalogo familiare.
- Il sistema confronta il contenuto delle pagine e, solo se rileva un cambiamento e `OPENAI_API_KEY` è configurata, usa lo SDK OpenAI con Structured Outputs JSON Schema per generare una proposta in `pendingProposal` dentro `backend/data/source-state.json`. Configura `OPENAI_API_KEY` come secret GitHub Actions; `OPENAI_MODEL` è una variabile facoltativa (predefinito `gpt-4o-mini`). In locale, definisci `OPENAI_API_KEY` nell'ambiente prima di avviare Node.
- Con il backend attivo, la sezione **Bonus e agevolazioni** mostra la coda staging. `GET /api/staging` restituisce le variazioni in attesa; `POST /api/staging/approve` aggiunge una bozza al catalogo dopo una conferma esplicita, mentre `POST /api/staging/discard` rimuove la voce dalla coda. La conferma richiede una verifica sulla fonte: la data di approvazione viene registrata come ultima verifica. Le API di scrittura richiedono origine same-site e il server ascolta in locale per impostazione predefinita.
- Il monitor estrae anche i link `.pdf` HTTPS sullo stesso host della pagina (fino a cinque per fonte) e supporta fonti che sono direttamente PDF. Ogni download ha timeout di 15 secondi e limite di 10 MB; il testo viene passato all'estrazione AI solo quando il PDF è nuovo o cambia. L'hash e l'ultimo esito sono registrati in `pdfDocuments`/`lastPdfAnalyzed`; file identici non vengono riparsati. I link verso host diversi vengono ignorati per sicurezza.
- Il testo della pagina è inviato a OpenAI solo per l'estrazione; l'uso dell'API può comportare costi secondo il piano OpenAI. Non inviare la chiave API nel codice o in chat. Le istruzioni eventualmente presenti nella pagina sono trattate come dati non attendibili. L'ambito e la fonte della proposta vengono vincolati al registro, le date non accertate restano null e `lastVerifiedAt` resta null.
- La proposta è solo staging: non viene aggiunta o pubblicata automaticamente in `assets/catalog/benefits.json`. Una persona deve confrontarla con la fonte ufficiale; dopo la verifica può approvarla dalla UI locale, oppure aggiornare il catalogo manualmente. Senza chiave, con errore di quota o risposta non valida, la variazione resta in revisione manuale con stato `error-ai` (quando il provider è configurato ma fallisce).
- Una variazione va aperta sulla fonte ufficiale e verificata da una persona. Se la revisione viene svolta fuori dalla UI, dopo l'eventuale aggiornamento manuale di `assets/catalog/benefits.json` registra l'esito:

```powershell
node backend/resolve-source-change.mjs milano-quota-nidi "Requisiti riletti sulla pagina ufficiale"
```

- Sostituisci l'ID con quello mostrato nel registro (`inps-auu`, `inps-adi`, `arera-bonus-sociale`, `lombardia-bandi`, `milano-quota-nidi`, `milano-refezione`) e descrivi la verifica svolta. Non registrare la revisione prima di avere esaminato la fonte.
- Lo stato e l'impronta delle pagine sono salvati in `backend/data/source-state.json`, escluso dai backup dell'app. In locale il file è ignorato da Git; il workflow pianificato lo aggiunge al repository per conservare le impronte tra esecuzioni. Contiene soltanto dati delle pagine pubbliche e note di revisione: non inserire informazioni personali. Nessun dato ISEE viene inviato al backend.
- Il monitoraggio usa richieste HTTP giornaliere: indisponibilità, variazioni di impaginazione o contenuti dinamici possono produrre errori o segnalazioni da verificare. Un controllo riuscito non certifica che il catalogo sia completo o che una misura sia applicabile.
- Il catalogo continua a richiedere revisione e manutenzione editoriale; la copertura nazionale e quella di tutti i Comuni non sono complete.

## Funzioni disponibili

- profilo locale (nome e profilo: single, coppia, famiglia, anziano o professionista)
- aggiunta, modifica, completamento, riapertura e archiviazione delle scadenze
- categorie, date, importi in centesimi, ricorrenze mensili e promemoria
- vista panoramica con stato delle scadenze e filtri
- calendario mensile
- suggerimenti iniziali dal catalogo JSON, filtrati per profilo
- proiezione indicativa a 12 mesi con saldo iniziale, riserva, entrate ricorrenti e scadenze registrate
- consultazione delle misure nazionali per persone e famiglie nel catalogo JSON, con requisiti ISEE descritti separatamente per misura e senza raccolta di dati ISEE; catalogo parziale, non esaustivo e non idoneo a verificare automaticamente il diritto
- controllo giornaliero delle modifiche alle prime fonti ufficiali nazionali e lombardo-milanesi, con coda di revisione umana e senza pubblicazione automatica delle variazioni
- lettura testuale dei PDF collegati alle fonti, con limiti di download e deduplicazione tramite hash
- esportazione e ripristino di un backup JSON
- installazione come PWA e uso offline dopo il primo caricamento, se supportato dal browser
- notifiche del browser facoltative: funzionano mentre la pagina/app è aperta, non sono affidabili a browser chiuso

## Dati e privacy: limiti del prototipo

- Profilo e scadenze sono conservati nel `localStorage` di quel browser e dispositivo.
- I dati **non sono cifrati**, sincronizzati o protetti da un account.
- Saldo iniziale, riserva ed entrate inserite nella pianificazione restano solo in memoria temporanea: non sono salvati né inclusi nei backup e si cancellano ricaricando la pagina.
- Non inserire documenti, dati sanitari o informazioni riservate.
- L'eliminazione dei dati del sito dal browser può cancellare le scadenze. Esporta periodicamente un backup.
- Le voci del catalogo sono promemoria generici, non consulenza fiscale o legale: verifica date e periodicità con fonti ufficiali e personalizza i suggerimenti prima di salvarli.
- La proiezione considera soltanto gli importi registrati nelle scadenze attive e le entrate inserite; le scadenze arretrate sono conteggiate come uscite immediate. Non include spese quotidiane o movimenti non modellati e non è una previsione finanziaria certa.
- Le agevolazioni mostrate sono solo piste da verificare: l'ISEE non basta a determinare un diritto. Il catalogo `assets/catalog/benefits.json` è parziale e non copre i bandi di tutti i Comuni e le Regioni; aggiungere voci solo con fonte ufficiale e data di verifica. La revisione della quota nidi di Milano è una procedura su domanda, non un contributo automatico.
- QR PagoPA, OCR, revisione AI automatica e pubblicazione di proposte, condivisione file, account e sincronizzazione non sono implementati.

## Struttura web

```text
index.html
styles.css
app.js
manifest.webmanifest
service-worker.js
assets/catalog/deadlines.json
assets/catalog/benefits.json
backend/source-registry.json
backend/source-monitor.mjs
backend/benefit-extractor.mjs
backend/pdf-parser.mjs
backend/benefit-extractor.mjs
backend/resolve-source-change.mjs
backend/refresh-sources.mjs
package.json
package-lock.json
server.mjs
scripts/build-pages.mjs
.github/workflows/pages.yml
assets/catalog/source-monitoring.json
icons/icon.svg, icon-192.png, icon-512.png
docs/ARCHITETTURA_PWA.md
docs/BACKLOG_SPRINTS.md
```

Il codice Flutter iniziale è ancora presente in `lib/` e `test/` come materiale di riferimento, ma non è usato dalla versione web né serve installare Flutter per avviarla.

## Prossimi incrementi

- Architettura e limiti: [`docs/ARCHITETTURA_PWA.md`](./docs/ARCHITETTURA_PWA.md)
- Backlog aggiornato: [`docs/BACKLOG_SPRINTS.md`](./docs/BACKLOG_SPRINTS.md)
- Test del monitoraggio fonti: `node --test backend/source-monitor.test.mjs`
