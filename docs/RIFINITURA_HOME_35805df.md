# Rifinitura Home sulla base 35805df — delta locale

## Origine e confini

Base autorevole: **`TESTAA26-main (4).zip`**, 218.116 byte. SHA-256:
`399b97b7abd89bc3b057ff3f5aa205abe869298b56e055b85e761cfbe14a2516`.
Commento dell’archivio: **`35805df6c50231613652eb58162fbaa2957c0bb2`**. È un riferimento dichiarato dallo ZIP, non prova della cronologia Git o della relazione con `72c5126` («Aggiunge calendario flussi di cassa»). Non contiene `.git` e non sono stati effettuati accessi a GitHub.

Preflight: 156 voci (106 file), 628.788 byte decompressi, radice unica `TESTAA26-main/`; CRC integro, nessun traversal o symlink. Estratta esclusivamente la nuova base sotto `working/scadenzario-rifinitura-35805df/project`, senza modificare l’input. Memoria `/mnt/project/memory.md` assente: non ha bloccato il lavoro. Non è stato usato il vecchio pacchetto né copiata la vecchia app.

Il delta contiene **12 file**, radice relativa senza cartella contenitore: 7 modificati e 5 nuovi, nessuna cancellazione. Non include README storico, vecchie note, monitoraggio, cataloghi, backend, dipendenze o build. I 99 file sorgente non modificati della base sono preservati byte per byte; `planning.js`, `radar.js`, `package-lock.json`, `server.mjs`, `scripts/build-pages.mjs`, `backend/`, `src/`, `lib/`, `data/` se presente e `assets/catalog/` rimangono invariati. Nessun modulo runtime o dipendenza aggiunta. Backup v2, schema e validazione sono invariati.

## Presentazione e calendario effettivamente preservati

- **Da gestire**: griglia locale alla Home, da due a tre colonne quando la larghezza utile consente schede da almeno 260 px; una colonna sotto 760 px. Padding schede da 20 a 14 px, distanza 12 px; descrizioni, avvisi, importi e azioni non sono troncati. Nessuna altezza fissa, ellissi o chiusura automatica di dettagli per ridurre artificialmente gli avvisi.
- Ordine immutato **Da gestire → Attendibilità → Andamento → Prossime**. Restano massimo tre priorità in Home, conteggio totale e Radar completo. Il riepilogo successivo è raggiungibile prima perché le priorità non occupano più tre righe a tutta larghezza sul desktop.
- Conservati navy, fondo caldo, caratteri locali leggibili, focus visibile e target principali da almeno 44 px. Nessun nuovo grafico; nessun cambiamento dei selettori CSS del calendario.
- Date strutturate di sola lettura italiane con anno (es. `1 dic 2026`), incluse date critiche, intervalli, Agenda e dialogo movimento. Parsing civile locale già esistente, non conversioni UTC. `formatDate` rifiuta date impossibili, null, oggetti e Date invalide senza eccezioni. `type=date`, `value`, `data-date`, identificativi `serie@ISO`, chiavi, export e storage restano ISO.
- Microcopy: **Data prevista di pagamento**, **Data prevista di incasso**, **Data prevista** per promemoria senza importo. Nel modulo scadenza l’etichetta è esplicita «di pagamento o del promemoria», senza presumere che ogni scadenza sia finanziaria. Nessuna sostituzione globale nei titoli/note utente, nelle descrizioni del Radar o negli avvisi del motore: gli identificativi diagnostici presenti in quei testi restano ISO per non alterarne significato e verificabilità.
- Restano integralmente «Come viene calcolato?», dati mancanti, avvisi sugli arretrati esclusi, attendibilità e spiegazioni dei movimenti. Nessuna rassicurazione artificiale quando il saldo è positivo.

Il calendario della nuova base è stato letto prima delle modifiche: due modalità **Scadenze / Flussi di cassa**, 42 celle da lunedì, navigazione mese precedente/successivo con primo giorno selezionato e focus ripristinato; per i flussi variazione netta e saldo finale, dettaglio entrate previste/incassate e uscite previste/pagate, saldo iniziale/finale e minimo intragiornaliero prudenziale. Uscite prima delle entrate nello stesso giorno; sotto riserva e sotto zero sono evidenziati anche quando il saldo finale recupera. Effettivi sostituiscono le previsioni; date fuori intervallo o saldo assente non producono zeri inventati. I filtri dell’elenco non cambiano i flussi del piano.

**`getCalendarCashDays` è byte-identica** alla nuova base (SHA-256 del blocco funzione: `b18b4579af266f1c38102c8b8c6ad3cd0c5e6c62dd6806974ccc1be1824c01c5`). Stili, calcoli, importi, avvisi, navigazione e handler calendario rimangono invariati; solo data visualizzata del giorno e intervallo non stimabile sono localizzati. Anche la data del toast è solo presentazione. Gli handler finanziari non cambiano; nel dialogo movimento cambiano soltanto due assegnazioni testuali. Nessun bug contabile è stato corretto fuori scope.

Cache incrementale: da **`scadenzario-shell-v11-cash-calendar`** a **`scadenzario-shell-v12-home-refinement`**. Liste dei moduli in shell, build e server mantenute.

## Correzione bloccante della regressione prestazionale

La revisione indipendente ha individuato nel primo delta una ricerca `findOccurrence()` per ogni segnalazione, introdotta soltanto per scegliere l’etichetta. Su una serie valida di **1200 occorrenze aperte**, i contatori hanno misurato **1200 generazioni e 720.600 occorrenze rigenerate** nel solo `renderRadarItems`: costo quadratico non accettabile. Il nuovo test ha riprodotto il difetto prima della correzione (1200 lookup contro zero attesi).

La versione corretta costruisce **una sola Map delle serie di uscita per rendering**, usando `id` e override già presenti. Dalla chiave dell’occorrenza ricava importo singolo/di serie senza generare occorrenze; `??` preserva un override pari a zero. Ultimo separatore `@` per identificativi che lo contengono, etichetta di incasso per le entrate e neutra se manca una serie/chiave. Nessuna modifica ai motori o ai flussi finanziari.

Verifica deterministica sulle stesse 1200 aperte: **1 indicizzazione, 0 lookup, 0 generazioni, 0 occorrenze rigenerate**, 1200 etichette di pagamento corrette e stato/storage invariati. Non usa soglie temporali fragili. Due ulteriori test coprono override zero/positivo, ID con `@`, fallback neutro e tutte le viste Home/Agenda/Radar/Planning. Per queste viste restano soltanto le generazioni preesistenti dell’elenco: rispettivamente 1/1/0/0 chiamate app-level nella fixture da 1200; i calcoli interni ai motori non vengono intercettati né alterati. Calendario dedicato e test originali rieseguiti integralmente. Questo ZIP sostituisce il primo delta non pubblicato, nello stesso percorso.

## Applicazione prudente — Windows PowerShell, senza rete

1. Se si usano già dati personali, esportare dall’app **Altro → Impostazioni / Profilo e Backup → Esporta**. Tenere backup e copie delle modifiche locali **fuori da Git**. Non importare sull’unica copia dei dati per una prova.
2. Tenere ZIP e `MANIFEST_RIFINITURA_35805df.json` insieme fuori dal clone. Lavorare su `main` locale pulito e con HEAD esattamente alla base. Se il clone diverge, fermarsi e integrare manualmente: non usare reset, clean o sovrascritture forzate della base.
3. Dalla radice del clone eseguire il preflight **completo prima della prima copia**. Il manifest riporta hash grezzi e normalizzati CRLF→LF per tutti i file base e per il delta. La sola differenza CRLF è accettata soltanto dopo confronto normalizzato; ogni altra divergenza blocca l’applicazione. Nessuna normalizzazione globale del repository.

```powershell
$ErrorActionPreference = 'Stop'
$base = '35805df6c50231613652eb58162fbaa2957c0bb2'
$zip = 'C:\ConsegneFuoriGit\Scadenzario-rifinitura-home-base-35805df.zip'
$folder = Split-Path $zip
$manifest = Get-Content -LiteralPath (Join-Path $folder 'MANIFEST_RIFINITURA_35805df.json') -Raw | ConvertFrom-Json
if (git status --porcelain) { throw 'Working tree non pulita: proteggere prima i file locali.' }
git switch main
if ($LASTEXITCODE -ne 0) { throw 'Impossibile selezionare main.' }
if ((git rev-parse HEAD).Trim() -ne $base) { throw 'Main differisce dalla base ZIP: non applicare automaticamente.' }
if ($manifest.baseCommit -ne $base) { throw 'Manifest di altra base.' }
if ((Get-FileHash -LiteralPath $zip -Algorithm SHA256).Hash.ToLowerInvariant() -ne $manifest.deltaZip.sha256) { throw 'Hash ZIP errato.' }
$repo = (git rev-parse --show-toplevel).Trim()
$staging = Join-Path $folder ('verifica-rifinitura-' + [guid]::NewGuid().ToString('N'))
Expand-Archive -LiteralPath $zip -DestinationPath $staging

function Get-NormalizedHash([string]$Path) {
  $bytes = [IO.File]::ReadAllBytes($Path)
  $text = [Text.Encoding]::UTF8.GetString($bytes).Replace("`r`n", "`n")
  $sha = [Security.Cryptography.SHA256]::Create()
  try { return ([BitConverter]::ToString($sha.ComputeHash([Text.Encoding]::UTF8.GetBytes($text)))).Replace('-', '').ToLowerInvariant() }
  finally { $sha.Dispose() }
}

foreach ($entry in $manifest.deltaFiles) {
  $source = Join-Path $staging $entry.path
  $target = Join-Path $repo $entry.path
  if (!(Test-Path -LiteralPath $source -PathType Leaf)) { throw "Delta mancante: $($entry.path)" }
  if ((Get-FileHash -LiteralPath $source -Algorithm SHA256).Hash.ToLowerInvariant() -ne $entry.sha256) { throw "Delta alterato: $($entry.path)" }
  if ($null -eq $entry.baseSha256) {
    if (Test-Path -LiteralPath $target) { throw "File nuovo già presente: $($entry.path)" }
  } else {
    if (!(Test-Path -LiteralPath $target -PathType Leaf)) { throw "Base mancante: $($entry.path)" }
    $hash = (Get-FileHash -LiteralPath $target -Algorithm SHA256).Hash.ToLowerInvariant()
    if ($hash -ne $entry.baseSha256) {
      if ((Get-NormalizedHash $target) -ne $entry.baseNormalizedSha256) { throw "Divergenza locale: $($entry.path). Integrare manualmente." }
      Write-Host "Solo CRLF/LF verificato: $($entry.path)"
    }
  }
}

$branch = 'rifinitura-home'
while (git branch --list $branch) { $branch = 'rifinitura-home-' + [guid]::NewGuid().ToString('N').Substring(0, 8) }
git switch -c $branch
if ($LASTEXITCODE -ne 0) { throw 'Creazione del nuovo ramo non riuscita.' }
foreach ($entry in $manifest.deltaFiles) {
  $target = Join-Path $repo $entry.path
  New-Item -ItemType Directory -Force -Path (Split-Path $target) | Out-Null
  Copy-Item -LiteralPath (Join-Path $staging $entry.path) -Destination $target -Force
  if ((Get-FileHash -LiteralPath $target -Algorithm SHA256).Hash.ToLowerInvariant() -ne $entry.sha256) { throw "Copia non verificata: $($entry.path)" }
}
git diff --check
git status --short
```

Se la copia si interrompe, fermarsi e controllare i file già copiati: non è una transazione né un rollback automatico. ZIP e manifest sono controlli d’integrità, non firme digitali. Il manifest sibling non viene copiato nel repository dai comandi.

Elenco **esatto** dei 12 file da mettere in staging dopo revisione; non usare `git add .`:

```powershell
git add -- app.js index.html package.json service-worker.js styles.css test/planning/app-integration.test.mjs test/radar/app-integration.test.mjs test/ui/harness.mjs test/ui/refinement.test.mjs test/ui/calendar.test.mjs docs/RIFINITURA_HOME_35805df.md VERIFICA_RIFINITURA_35805df.txt
git diff --cached --stat
git diff --cached --check
```

Non sono stati eseguiti commit o push e non sono necessari per questa applicazione locale.

## Verifiche ripetibili e limiti

```powershell
npm run test:planning
npm run test:radar
npm run test:ui
npm run test:calendar
node --check app.js
node --check planning.js
node --check radar.js
node --check service-worker.js
node --check server.mjs
node --check scripts/build-pages.mjs
node --check test/ui/harness.mjs
node --check test/ui/refinement.test.mjs
node --check test/ui/calendar.test.mjs
node scripts/build-pages.mjs
```

`test:ui` e `test:calendar` sono nuovi script senza dipendenze; il secondo è un sottoinsieme del primo. Le suite originali non sono state ridotte: cambiano soltanto 5 attese di testo/cache nel test Radar e 1 di cache nel test Planning, senza eliminare asserzioni. I due test originali del calendario rimangono integralmente invariati.

Risultati aggiornati dopo la correzione prestazionale: Planning **55/55**, Radar **42/42**, UI **20/20** (10 rifinitura/prestazioni + 10 calendario), quindi **117 test distinti**; calendario dedicato **10/10**. Inoltre gli stessi 10 test calendario sono stati eseguiti sul codice originale dello ZIP e sul delta, in UTC, Europe/Rome e America/New_York: **30/30 prima e 30/30 dopo**. Verificati entrate/uscite, effettivi, soglie, aggregati mensili, mesi/anno/bisestili/DST, limiti, navigazione, input ISO e non mutazione.

`npm run test:all`, `npm run typecheck` e i test backend **non eseguiti**: TypeScript, openai, pdf-parse e zod non disponibili. Nessuna installazione, controllo versioni, rete, backend, refresh o monitor avviato. Build Pages riuscita e verificata senza backend, poi artefatti generati esclusi dalla consegna.

**Nessuna QA visuale reale o screenshot**: non disponibili Chromium/Chrome/Firefox, Playwright o Puppeteer. Il DOM simulato non misura dimensioni effettive, touch, focus nativo, contrasto su dispositivo, service worker, installazione o offline. Prima dell’uso personale verificare con browser già disponibile a 360/390 px e desktop: schede lunghe, riepilogo e avvisi, tastiera/dialoghi, tutti i controlli del calendario flussi e aggiornamento PWA v11→v12. Non usare `node server.mjs` per una semplice prova UI: avvia il monitoraggio. Le note storiche e il README della base sono lasciati intatti; per questa consegna prevalgono le presenti istruzioni.
