# Correzioni cassa, focus e termine esclusivo — prima tranche

## Provenienza e perimetro

Base effettiva: copia isolata di `working/scadenzario-fix-cli-date/project`, ultima nostra rifinitura 35805df + correzione CLI `--as-of`. Non è una lettura del main privato live: nessun accesso remoto, verifica di ancestry, commit o push. Il riferimento c45b59b/PR #3 proviene dal contesto utente, non da una cronologia Git verificata.

La base disponibile coincide byte per byte, per tutti i file degli overlay confrontati, con `Scadenzario-rifinitura-home-base-35805df.zip` e `Scadenzario-correzione-test-cli-date.zip`. Entrambi gli archivi originali hanno CRC integro. Non è stato necessario ricostruire la base. Input, precedenti basi e precedenti ZIP non sono stati modificati.

Il delta è applicabile solo dopo il confronto dei file toccati con la propria copia aggiornata di main. Non contiene i vecchi overlay: non riapplicarli sopra main. Gli hash di base e risultato sono nel manifest JSON affiancato allo ZIP; il file `.sha256` affiancato verifica lo ZIP stesso.

### Normalizzazione già nota del main

Nella nostra base `test/ui/harness.mjs` termina con una riga vuota aggiuntiva; l'utente l'ha rimossa nel commit indicato e1b8df3. In questa tranche l'import del motore nel medesimo harness include anche `cashReport`, e l'EOF è a singolo newline. Il confronto normalizzato ammette CRLF→LF e, **solo per questo harness**, la rimozione di esattamente un newline aggiuntivo finale se presente. Non ignora differenze di codice. Gli altri file non ricevono pulizie di EOF estranee alla modifica.

## Implementato

### Consuntivo separato dalla proiezione

- `cashReport()` in `planning.js` è puro e derivato: aggrega pagamenti e incassi per `actual.date`, senza dipendere dall'assorbimento nel saldo. Include gli effettivi delle serie archiviate, delle scadenze precedenti e delle scadenze oltre la finestra di previsione.
- Un effettivo sostituisce la previsione collegata anche nel report. Correzione e annullamento usano gli stessi override già esistenti: nessun movimento persistente duplicato.
- In Planning è visibile il consuntivo del mese corrente: **Pagato nel mese**, **Incassato nel mese**, **Pagamenti previsti**, **Incassi previsti**. Le ultime due voci riguardano previsioni aperte per data di cassa, comprese quelle arretrate, non somme applicate al saldo.
- Per il mese intero di altre date, anche passate, usare **Agenda → Calendario → Flussi di cassa**, con le frecce mese già esistenti. Il report mensile non termina alla data parziale della proiezione.
- La vecchia tabella mensile è ora etichettata come riepilogo dei soli movimenti applicati alla proiezione, **non consuntivo**. Le colonne chiariscono entrate/uscite applicate al saldo.
- I completamenti legacy senza effettivo non sono ricostruiti. Il report segnala completamenti non attribuibili, previsioni senza data e importi mancanti. Le somme a zero significano nessun movimento registrato noto in quella categoria, non prova dell'assenza di spese/incassi reali.

### Calendario e saldi

- Il calendario sovrappone lo storico effettivo al calendario di proiezione senza applicarlo nuovamente al saldo. Nella data saldo gli effettivi sono visibili anche quando già inclusi; la scelta di inclusione continua a governare soltanto il saldo.
- Nei giorni con effettivi precedenti al saldo sono visibili importi e descrizioni, ma saldo iniziale, finale e minimo restano `null` e non sono stampati come zero. Nessun saldo storico inventato.
- Senza saldo pronto sono consultabili consuntivo mensile ed effettivi giornalieri; i saldi restano indisponibili. Le previsioni giornaliere restano quelle della proiezione; gli arretrati aperti sono riepilogati separatamente nel mese.
- Il flusso netto visibile può differire dalla variazione del saldo se comprende effettivi già assorbiti: la spiegazione è esplicita. Dal saldo in avanti i valori e minimi prudenziali restano quelli del motore originale, uscite prima delle entrate.
- Le scadenze originali rimangono nella vista Scadenze; il pagamento/incasso compare come effettivo soltanto nella propria data di cassa. I filtri Agenda non cambiano i totali finanziari.
- Importi previsionali mancanti non producono righe giornaliere di movimento a zero. Errori del report sono mostrati esplicitamente, senza un consuntivo o saldo numerico di ripiego.

### Focus e UX cassa

- Nuova scadenza e modifica singola focalizzano il titolo, non la data. La modale movimento focalizza l'importo, anche in modifica previsione. Nessuna chiamata automatica a `showPicker()`.
- Il campo **Altra data** è mostrato, abilitato e obbligatorio solo per quella scelta. Con **Stessa data** e **Non ancora nota** il wrapper con label è nascosto e l'input è disabilitato/non obbligatorio; il salvataggio scrive `cashDate: null`.
- Nessuna nuova data di cassa viene prefissata scegliendo Altra data. Un draft digitato esplicitamente può essere recuperato cambiando modalità prima del salvataggio. In modifica può restare nel campo nascosto la data civile materializzata della modalità same per compatibilità dell'harness, ma viene svuotata alla prima scelta Altra data e mai salvata come data distinta.
- La modifica singola conserva ancora, successive ed effettivo. Cambiare soltanto titolo/importo non cambia scadenza o data effettiva. Le previsioni di incasso nella modale rispettano le medesime tre modalità; un incasso effettivo richiede sempre data non futura e importo positivo.

### Termine esclusivo, senza migrazione

- Solo per nuove scadenze/entrate: **Senza termine / Fino a una data / Dopo N occorrenze**. Visibile e obbligatorio soltanto il campo coerente. Salvando si annulla il limite non scelto. N include la prima occorrenza; la data finale è inclusiva.
- Nessun nuovo campo persistente `endMode`; schema v2 invariato e import v1/v2 preservato.
- Le vecchie serie con entrambi i limiti mantengono entrambi e la regola più restrittiva del generatore. La modifica singola espone l'avviso legacy e lascia disabilitati i controlli di serie; non cancella nessun termine originale. Anche la modale incasso/previsione avvisa dei doppi limiti quando presenti.
- Non è stata introdotta una modifica dell'intera serie per convertirla alla nuova scelta: richiede la successiva tranche/versionamento.

## Esplicitamente rimandato

Esclusione di mesi, regole come primo mercoledì, modifica di una serie/intera serie o questa e successive, cancellazioni di occorrenze/serie e relativo versionamento. Non sono implementati né dichiarati completati. Le funzioni di archiviazione/riattivazione già presenti rimangono quelle precedenti.

## Invarianti e verifiche

`project()`, generazione ricorrenze, validazione, migrazione e gestione effettivi originali sono byte-identici alla base: in `planning.js` è stata soltanto aggiunta la funzione pura di reporting. `radar.js` è byte-identico e continua a usare la proiezione, non il consuntivo storico. Restano centesimi interi, date ISO civili, ID `serie@dataoriginale`, assorbimento prima/stesso giorno saldo, backup v2/v1, rollback storage, escaping e validazione della data saldo anche a planning non pronto. Layout navy compatto, date italiane, cataloghi, backend, `src/`, `lib/`, script CLI/fixture REAL e dipendenze non sono cambiati.

Cache shell incrementata da v12 a `scadenzario-shell-v13-cash-report`. Nessun nuovo modulo runtime: allowlist server e lista build già comprendono `planning.js`. Stili e asset riutilizzati, nessun grafico.

Test eseguiti e limiti effettivi sono in `VERIFICA_CASSA_RICORRENZE.txt`. I test UI usano un DOM minimo in VM: non equivalgono a un browser. Nessun browser disponibile, nessuna QA visuale o verifica di apertura del datepicker su Windows/mobile dichiarata.

## Applicazione prudente su Windows — un passaggio alla volta

1. Esporta dall'app un backup JSON e conservalo fuori dalla cartella del progetto; non è incluso nello ZIP. In GitHub Desktop seleziona `main`, verifica che sia pulito e allineato al tuo remoto. Qui non è stato letto il tuo main privato. Se hai cambiamenti locali, fermati senza sovrascriverli.
2. Scarica ZIP, `.sha256` e `.manifest.json` affiancati. Con `Get-FileHash -Algorithm SHA256 -LiteralPath 'percorso\Scadenzario-correzioni-cassa-ricorrenze.zip'` confronta il risultato con il `.sha256`. Estrai lo ZIP in una **nuova cartella di controllo**, non sopra il repository. Lo ZIP non ha cartella wrapper.
3. Prima di copiare qualunque file, confronta tutti i file del repository elencati nel manifest. Il frammento seguente è di sola lettura; imposta i due percorsi reali. Accetta solo hash base esatto oppure la normalizzazione descritta sopra. Per i file nuovi richiede che non esistano già. Un errore significa **STOP**: non applicare il delta; fornisci una nuova ZIP del tuo main aggiornato per un confronto/merge mirato, non una sovrascrittura alla cieca.

```powershell
$repo = 'C:\percorso\TESTAA26-main'
$manifest = Get-Content -Raw -LiteralPath 'C:\download\Scadenzario-correzioni-cassa-ricorrenze.manifest.json' | ConvertFrom-Json
function Get-NormalizedHash($path, $relative) {
  $text = [IO.File]::ReadAllText($path).Replace("`r`n", "`n")
  if ($relative -eq 'test/ui/harness.mjs' -and $text.EndsWith("`n`n")) {
    $text = $text.Substring(0, $text.Length - 1)
  }
  $sha = [Security.Cryptography.SHA256]::Create()
  try {
    $bytes = [Text.Encoding]::UTF8.GetBytes($text)
    return ([BitConverter]::ToString($sha.ComputeHash($bytes))).Replace('-', '').ToLowerInvariant()
  } finally { $sha.Dispose() }
}
foreach ($file in $manifest.files) {
  $path = Join-Path $repo $file.path
  if ($null -eq $file.base_sha256) {
    if (Test-Path -LiteralPath $path) { throw "STOP: file nuovo gia presente: $($file.path)" }
    continue
  }
  if (-not (Test-Path -LiteralPath $path -PathType Leaf)) { throw "STOP: manca $($file.path)" }
  $raw = (Get-FileHash -Algorithm SHA256 -LiteralPath $path).Hash.ToLowerInvariant()
  if ($raw -ne $file.base_sha256) {
    $normal = Get-NormalizedHash $path $file.path
    if ($normal -ne $file.base_normalized_sha256) { throw "STOP: main diverso dalla base: $($file.path)" }
    Write-Host "Compatibile solo dopo normalizzazione CRLF/EOF: $($file.path)"
  }
}
Write-Host 'Confronto base superato; nessun file e stato copiato.'
```

4. Solo dopo il confronto positivo, crea da `main` pulito un nuovo branch **correzioni-cassa-ricorrenze** con GitHub Desktop. Copia dalla cartella di controllo soltanto i file elencati nel manifest mantenendo i percorsi; nessun altro file, nessuna cancellazione. Controlla il diff prima di qualsiasi commit. Non aggiungere vecchi ZIP, build `site/`, log, `node_modules/` o backup personali. Nessun comando distruttivo, commit o push è stato eseguito da questa consegna.
5. Dal progetto esegui `npm run test:planning`, poi `npm run test:radar`, poi `npm run test:ui`, poi `node scripts/build-pages.mjs`, controllando ogni esito prima del successivo. `test:all` solo se le dipendenze sono già disponibili; questa tranche non richiede installazioni. Dopo la copia gli hash risultato esatti sono nel manifest; se Git applica CRLF confronta anche gli hash risultato normalizzati.
6. Primo controllo manuale consigliato, da svolgere da solo: su dati di prova registra un pagamento di novembre per una scadenza di ottobre, con saldo di riferimento successivo al pagamento. Verifica **Pagato nel mese** di novembre e il giorno di cassa: l'importo deve comparire, ma prima del saldo non deve comparire alcun saldo storico. Il saldo di riferimento non deve essere scalato di nuovo. Solo dopo questo controllo passa separatamente a focus e modalità cassa.

Se occorre tornare alla versione precedente, non cancellare dati o ripristinare un backup alla cieca: tieni il branch di lavoro distinto, conserva il backup JSON e confronta prima le modifiche. Il pacchetto non contiene istruzioni di reset forzato o cancellazione.
