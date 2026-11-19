# Home professionale, Agenda e Radar — aggiornamento locale

## Base e perimetro

Archivio di ingresso: `TESTAA26-main (2).zip`, conservato intatto. Commento ZIP letto prima dell’estrazione: **`5ee6395200412f5b3be82dd05f20a6fefa4f0881`**, coerente con il prefisso `5ee6395` indicato. Il commento è il riferimento dichiarato dall’archivio, non una verifica crittografica della cronologia Git: lo ZIP non contiene `.git`.

Lavoro estratto con radice normalizzata in `working/scadenzario-home-radar/project`, senza utilizzare `working/scadenzario-planning`. Controllati dimensioni, nomi, traversal, collegamenti simbolici e CRC prima di estrarre. Il pacchetto **`Scadenzario-home-radar-aggiornamento.zip` è un delta**, non una copia completa del repository: contiene soltanto i 14 file aggiunti/modificati elencati sotto, senza cartella contenitore e senza cancellazioni. Manifest SHA-256 separato: `MANIFEST_HOME_RADAR.json`, da conservare accanto al delta. Non include dati personali, backup, `.git`, dipendenze, build o stato generato dal monitoraggio.

Repository di destinazione indicato: `https://github.com/hermanbuhl1953-inc/TESTAA26.git`, ora privato. Nessun accesso a GitHub, rete, installazione, commit, push o avvio del monitor delle fonti è stato effettuato. Nuovo ramo locale suggerito: **`home-radar`**, da `main` aggiornato alla base verificata. Le istruzioni del vecchio rilascio `planning-affidabile` non si applicano a questo delta e non sono state riscritte.

## Funzioni effettive

- **Home**: Da gestire (massimo tre schede, con numero totale e Apri Radar), Attendibilità del piano, Andamento previsto, Prossime scadenze. Nessun saluto o messaggio statico «tutto sotto controllo».
- **Attendibilità adiacente ai risultati**: saldo datato, riserva, scelta tutti/nessuno per gli effettivi del giorno, periodo di calcolo, avvisi e cause. Senza saldo appare «Imposta il punto di partenza del tuo piano.»; senza dati completi «La previsione non racconta ancora tutto.». Le uscite con cassa passata escluse mostrano sempre vicino ai risultati «Alcune uscite non sono incluse: il margine potrebbe risultare più alto del reale.». I problemi non sono nascosti da un saldo positivo.
- **Andamento**: prima data sotto riserva, prima data sotto zero, minimo e sua data, margine rispetto alla riserva. Con riserva zero, saldo zero non è una criticità. Nessun numero zero sostituisce un calcolo non disponibile. Non è stato aggiunto un grafico: si privilegiano numeri leggibili, spiegazioni e tabelle esistenti.
- **Come viene calcolato?** disponibile anche senza saldo o con errore: saldo e data, effettivi inclusi/esclusi, previsioni di entrata non incassate, tutti/nessuno nella data saldo, uscite prima delle entrate nello stesso giorno, esclusione degli arretrati di cassa, nessuna stima di spese non inserite.
- **Un solo motore**: `planning.js` è byte-identico all’input; Home e Planning usano la medesima proiezione, fino al primo giorno del mese corrispondente dell’anno successivo incluso. Il calcolo parte dal saldo di riferimento; la tabella mensile preesistente parte dal mese corrente, con gli effettivi precedenti già applicati al suo saldo iniziale. Nessun selettore di periodo puramente visivo.
- **Navigazione equivalente** desktop/mobile: Home · Agenda · Planning · Altro. Altro è una pagina reale con Opportunità (catalogo Bonus e agevolazioni esistente), Suggerimenti, Impostazioni/Profilo e Backup. Le chiavi di vista precedenti `calendar`, `planning`, `catalog`, `benefits`, `profile` continuano a funzionare. Radar è una vera vista raggiungibile da Home. `aria-current`, focus sulle destinazioni e ripristino ragionevole dopo i rerender; annunci mirati nella regione status già esistente, non sull’intero `#app`.
- **Agenda**: Oggi soltanto oggi; Prossime soltanto dopo oggi; Arretrati soltanto occorrenze passate ancora aperte e non archiviate. Categoria e stato si combinano con il periodo. Tutte / storico permette di consultare completate e archiviate, correggere/annullare effettivi o riattivare serie. Selezionare una data del calendario attiva il filtro esplicito Giorno selezionato e cambia il titolo. Cambiare mese seleziona il primo giorno del nuovo mese. Vuoti contestuali, date di Scadenza e Cassa prevista distinte. Calendario con bottoni etichettati e `aria-pressed`, senza dichiarare una grid ARIA incompleta.
- **Stile**: navy `#0a2540` / `#06182b`, superfici `#e8eff7`, fondo chiaro caldo, caratteri locali di sistema, base 16 px, numeri tabulari, controlli di dimensioni usabili, nessun glass o nuova illustrazione. Stessi flussi e identità Scadenzario.

## Regole Radar (pure, spiegabili, senza LLM)

`radar.js` deriva segnalazioni dallo stato esistente senza salvare un nuovo archivio e senza migrazione:

1. Configurazione incompleta: saldo non pronto, data assente/non valida/futura, scelta sugli effettivi mancante. La CTA porta al campo reale del saldo in Planning. Questo stato **non nasconde gli arretrati**.
2. Criticità aggregata: prima sotto riserva e/o sotto zero dalla proiezione originale. Una sola scheda aggregata con saldo di partenza, soglie, date e movimenti applicati fino al giorno della prima criticità/sottozero (tutte le operazioni di quella giornata, mantenendo l’ordine prudenziale). Non viene attribuita una causa inventata a un singolo pagamento. Il collegamento porta ai risultati reali del Planning.
3. Uscita aperta con scadenza passata **o cassa prevista passata**, anche quando la scadenza è futura/oltre l’orizzonte ma la cassa è già trascorsa. Pagate, completate e archiviate non vengono rietichettate come aperte. Identità stabile dell’occorrenza, non dell’intera serie.
4. Entrata con **data di cassa attesa passata**, senza incasso registrato: non si presume un incasso dalla sola data. Cassa sconosciuta produce un problema dati, non un falso «ok» né un falso arretrato ricavato dalla sola scadenza.
5. Importo mancante o cassa sconosciuta: Completa dati apre la modifica effettiva della singola scadenza/previsione. Un promemoria senza importo può essere completato senza movimento con la conferma già prevista dall’app.

Chiavi stabili per tipo + occurrenceId, ordinamento per gravità/data/identificativo, nessun punteggio percentuale. Una stessa occorrenza può avere due problemi diversi (per esempio arretrato e cassa sconosciuta), mai due copie dello stesso tipo. Home mostra solo le prime tre schede e il conteggio completo; Radar non tronca la lista. Si considerano le serie dall’ancora fino all’orizzonte indicato e le eccezioni/casse anticipate che il motore riconosce. Il limite di sicurezza del motore è 100.000 passi per serie, con errore visibile anziché una lista silenziosamente completa. Non è un controllo di occorrenze infinite o dati non registrati.

Le CTA Registra pagamento/incasso usano i dialoghi, validatori ed effettivi esistenti. Aggiorna previsione / modifica singola apre la modifica reale, non paga e non sposta automaticamente la scadenza legale. Pagamento/incasso rimuovono la relativa anomalia; annullamento la riapre, senza eliminare serie o storico. Importi in centesimi e date civili ISO restano invariati. Titoli, identificativi, note e date sono escaped in HTML; è preservata la validazione incondizionata di `balanceDate` anche con `ready: false`.

## Applicazione prudente con Windows PowerShell

1. Dall’app attualmente in uso esportare **Altro → Impostazioni / Profilo e Backup → Esporta**, oppure dal vecchio Profilo. Conservare il backup personale **fuori da Git**, insieme a una copia dei file locali modificati. Il backup v2 rimane v2, con migrazione v1 preesistente. Non sovrascrivere l’unica copia dei dati personali.
2. Nel clone locale verificare che `main` sia già aggiornato alla base indicata. Questi comandi **non contattano origin**. Se mancano quel commit o l’aggiornamento locale di main, fermarsi: non applicare il delta ad altra base alla cieca. Se `home-radar` esiste già, non cancellarlo o ricrearlo: risolvere localmente il caso senza sovrascriverlo.
3. Scaricare il delta e il manifest insieme in una cartella **fuori dal repository**, poi impostare `$zip` al percorso reale. Eseguire dalla radice del clone:

```powershell
$ErrorActionPreference = 'Stop'
$base = '5ee6395200412f5b3be82dd05f20a6fefa4f0881'
if (git status --porcelain) { throw 'Working tree non pulita: proteggere prima tutte le modifiche locali.' }
git switch main
if ($LASTEXITCODE -ne 0) { throw 'Impossibile selezionare main.' }
if ((git rev-parse HEAD).Trim() -ne $base) { throw 'Main diverge dalla base ZIP: confrontare e integrare manualmente, senza overwrite.' }
if (git branch --list home-radar) { throw 'Il ramo home-radar esiste: non sovrascriverlo.' }

$repo = (git rev-parse --show-toplevel).Trim()
$zip = 'C:\PercorsoFuoriRepo\Scadenzario-home-radar-aggiornamento.zip'
$folder = Split-Path $zip
$manifest = Get-Content (Join-Path $folder 'MANIFEST_HOME_RADAR.json') -Raw | ConvertFrom-Json
if ($manifest.baseCommit -ne $base) { throw 'Manifest di altra base.' }
if ((Get-FileHash $zip -Algorithm SHA256).Hash.ToLowerInvariant() -ne $manifest.deltaZip.sha256) { throw 'SHA-256 ZIP non corrispondente.' }
$staging = Join-Path $folder 'delta-home-radar'
if (Test-Path $staging) { throw 'La cartella di verifica esiste gia: non sovrascriverla.' }
Expand-Archive -LiteralPath $zip -DestinationPath $staging

# Tutti i controlli PRIMA di copiare il primo file.
foreach ($entry in $manifest.deltaFiles) {
  $source = Join-Path $staging $entry.path
  $target = Join-Path $repo $entry.path
  if ((Get-FileHash $source -Algorithm SHA256).Hash.ToLowerInvariant() -ne $entry.sha256) { throw "Delta alterato: $($entry.path)" }
  if ($null -eq $entry.baseSha256) {
    if (Test-Path $target) { throw "File nuovo gia presente: $($entry.path)" }
  } else {
    if (!(Test-Path $target)) { throw "File base mancante: $($entry.path)" }
    if ((Get-FileHash $target -Algorithm SHA256).Hash.ToLowerInvariant() -ne $entry.baseSha256) { throw "Divergenza locale: $($entry.path). Integrare senza sovrascrivere." }
  }
}

git switch -c home-radar
if ($LASTEXITCODE -ne 0) { throw 'Creazione ramo non riuscita.' }
foreach ($entry in $manifest.deltaFiles) {
  $target = Join-Path $repo $entry.path
  New-Item -ItemType Directory -Force -Path (Split-Path $target) | Out-Null
  Copy-Item -LiteralPath (Join-Path $staging $entry.path) -Destination $target -Force
  if ((Get-FileHash $target -Algorithm SHA256).Hash.ToLowerInvariant() -ne $entry.sha256) { throw "Verifica copia fallita: $($entry.path)" }
}
git diff --check
git status --short
```

Il confronto usa i byte reali dell’input. Anche una divergenza dovuta soltanto a CRLF/LF (per esempio `core.autocrlf` su Windows) fa fermare il controllo: verificare e integrare consapevolmente, non rimuovere la protezione e non usare comandi distruttivi di reset. Se una copia fallisce, fermarsi e confrontare i file già copiati; lo script non promette una transazione o un rollback automatico. ZIP e manifest consentono di verificare l’integrità della consegna, non sostituiscono una firma digitale.

4. Verificare le differenze prima dello staging. Elenco **esatto**, senza `git add .` e senza file del monitor:

```powershell
git add -- README.md VERIFICA_HOME_RADAR.txt app.js docs/HOME_RADAR.md index.html package.json radar.js scripts/build-pages.mjs server.mjs service-worker.js styles.css test/planning/app-integration.test.mjs test/radar/app-integration.test.mjs test/radar/radar.test.mjs
git diff --cached --stat
git diff --cached --check
```

Non sono inclusi comandi di commit o push. Prima dell’uso verificare test e interfaccia con il metodo statico locale già disponibile; **non eseguire `node server.mjs` per una semplice prova UI** perché avvia anche il monitoraggio fonti. I moduli ES richiedono un server HTTP statico (non doppio clic `file://`). Non installare nuove dipendenze per applicare questo delta.

## Verifiche ripetibili e QA residua

```powershell
npm run test:planning
npm run test:radar
node --check app.js
node --check radar.js
node --check planning.js
node --check service-worker.js
node --check server.mjs
node --check scripts/build-pages.mjs
node scripts/build-pages.mjs
```

Solo se le dipendenze già previste sono disponibili: `npm run test:all`, `npm run typecheck`, test backend esistenti. Non installarle per ottenere artificialmente un esito verde. I test backend usano directory di prova: configurarli in un percorso di lavoro consentito prima dell’esecuzione; non avviare server o refresh delle fonti.

La cache passa a **`scadenzario-shell-v10-home-radar`**. `radar.js` è importato con percorso relativo dall’app e incluso in cache, allowlist statica e build Pages. Nessuna pubblicazione: la cartella `site/` serve solo come build locale. Percorsi relativi controllati per Pages sotto `/TESTAA26/`; installazione e aggiornamento offline devono essere verificati in un browser reale.

Esiti reali in `VERIFICA_HOME_RADAR.txt`. Ambiente senza browser/Playwright/Puppeteer: nessuno screenshot o test visuale/touch/screen reader è dichiarato. Il DOM harness è lo stesso approccio minimo già usato dal progetto, con azioni, storage e rete disabilitata simulati; non certifica layout, focus nativo o service worker su dispositivo.

Prima dell’uso personale controllare a 360/390 px e desktop: gerarchia e importi, navigazione a tastiera e ritorno dai dialoghi, filtri Agenda, registrazione/correzione/annullamento di pagamento e incasso, stessa scadenza con cassa diversa, cassa sconosciuta, saldo non pronto, riserva zero, import/export v1/v2 su profilo di prova, ricarica e aggiornamento cache offline. Nessuna promessa di sincronizzazione, notifiche ad app chiusa o verifica bancaria; restano esclusi fondi, budget, simulatori e nuove funzioni AI.
