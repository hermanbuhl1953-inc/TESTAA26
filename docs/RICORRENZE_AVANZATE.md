# Ricorrenze avanzate — aggiornamento PWA

## Base e perimetro

Base: archivio sorgente fornito, commento commit **ab9410b0865af1963bd723e3cfa95f59e4bcdc16**. Lavorazione su copia isolata; nessuna lettura del main remoto, commit, push o pubblicazione. Il delta contiene soltanto sorgenti modificati, test e questa documentazione, senza cartella contenitore. Non riapplicare vecchi aggiornamenti.

PWA vanilla esistente: motore ricorrenze, moduli UI/Radar, HTML, stili, generazione della shell e cache offline. Nessun App Builder, modifica Flutter, dipendenza o cambiamento a backend, ISEE, requisiti, fonti, cataloghi e misure REAL. La tranche precedente su cassa e consuntivo rimane integrata.

## Uso

- **Nuova scadenza**: scegli una ricorrenza; compaiono regola e mesi da saltare. Per il 20 esclusi gennaio/dicembre seleziona giorno fisso, indica 20 e spunta i due mesi. Il giorno lasciato vuoto usa quello della data iniziale.
- Per **primo mercoledì** scegli giorno della settimana nel mese, Primo, mercoledì. La data iniziale è un limite inferiore, non una rata aggiuntiva. Se quel mercoledì è già passato, si parte dal mese eleggibile successivo.
- **Modifica singola** conserva ancora e regola; l’eccezione mantiene l’identità originale anche spostando la scadenza. **Modifica serie** è un comando distinto, disponibile nelle schede e in **Planning → Gestisci serie e annullate**, anche per serie prive di rate visibili. La finestra esplicita l’ambito.
- **Annulla singola** non elimina la serie né sposta il termine. Recupera da **Planning → Gestisci serie e annullate** o dal filtro **Annullate (recuperabili)** dell’Agenda. Le entrate hanno i medesimi controlli di regola, modifica serie e recupero; la modifica della singola previsione resta nella finestra movimento esistente.

## Semantica e protezione della contabilità

Date civili e centesimi interi. Il 31 si adatta all’ultimo giorno dei mesi corti senza deriva; gli anni bisestili sono rispettati. Disponibili primo/secondo/terzo/quarto/quinto/ultimo giorno settimanale. Quinti assenti e mesi esclusi non consumano il conteggio. Le esclusioni sono mesi di calendario, non mesi dalla partenza; non si possono escludere tutti i mesi eleggibili.

Il numero comprende la prima occorrenza eleggibile; la data finale è inclusiva. Per nuove serie e nuove scelte il termine è esclusivo: nessuno, data oppure numero. Le vecchie serie con due termini mantengono entrambi e il più restrittivo finché non si seleziona esplicitamente un nuovo termine. Una modifica del solo titolo non converte i limiti.

Prima di modificare una serie si crea un’istantanea delle occorrenze con eccezioni: pagamenti/incassi, spostamenti, importi, testi, promemoria, completamenti e annullamenti. Le eccezioni non sono azzerate. Identità originali, date di scadenza/cassa e importi restano associati alla medesima occorrenza. Le altre rate seguono la nuova regola. **Il mese originale di ogni occorrenza protetta non riceve una seconda rata nella nuova data**; la rata protetta non viene rinominata o riattribuita. Questo vale anche per un’eccezione non pagata o annullata.

Se la nuova regola esclude quel mese, sposta la partenza o riduce il termine, le occorrenze protette restano comunque recuperabili/consultabili. Il conteggio della nuova regola considera i mesi eleggibili, compresi gli slot protetti coincidenti; le eccezioni fuori regola restano conservate e non sono una nuova rata generata. Una scadenza spostata conserva come mese protetto quello dell’identità originale, non il mese della data modificata. Con cassa «Altra data» rimane lo spostamento per mesi dalla data iniziale, non uno spostamento automatico per giorni dal mercoledì.

L’annullamento è un tombstone recuperabile: nessuna previsione in Home, Agenda ordinaria, proiezione, consuntivo previsionale o Radar; nessun promemoria. Lo slot resta contato: non si aggiunge una rata alla fine. Il ripristino conserva identità ed eccezioni; se la serie è archiviata, rimane sospesa finché non si riattiva la serie. Le chiavi dei promemoria già inviati rimangono valide: ripristinare non reinvia lo stesso avviso.

**Una occorrenza pagata/incassata o già completata non è annullabile**; il comando non è mostrato e il motore rifiuta l’operazione. Correggere o annullare un effettivo resta un’operazione contabile distinta ed esplicita, come nella versione precedente. Nessun movimento duplicato o ricreato. Gli effettivi precedenti al saldo restano assorbiti soltanto nell’aritmetica del saldo, ma sempre presenti nel consuntivo per data di pagamento/incasso.

## Backup e rollback

Schema **v3**, necessario per regole, istantanee e tombstone. Import v1/v2 esplicitamente migrato in memoria: nessuna data, eccezione, effettivo o limite legacy viene reinterpretato. La copia iniziale, tutti i salvataggi successivi e l’esportazione usano v3. Un backup v3 viene validato e conserva tutti i nuovi campi al roundtrip. Dati nuovi malformati, mesi duplicati/non numerici, ordini/giorni invalidi, istantanee orfane e annullamenti di effettivi sono rifiutati. Testi utente sempre escaped nel rendering, nessun HTML eseguito. Errori di storage ripristinano lo stato precedente anche per modifica serie, annullamento/ripristino e importazione. Le protezioni tra schede e la separazione dell’archivio sono descritte sotto.

Esportare un backup prima di aggiornare. **Non aprire dati v3 con il vecchio codice**: la vecchia app non conosce il nuovo schema. Un rollback del codice non autorizza a sovrascrivere alla cieca dati nuovi con un backup vecchio: conservare entrambi e confrontare prima le operazioni registrate.

## Correzioni bloccanti della revisione: schede e aggiornamento offline

### Archivio isolato e concorrenza

La nuova app usa **`scadenzario.pwa.v3`**, non la chiave precedente `scadenzario.pwa.v1`. Alla prima apertura, soltanto se la chiave nuova manca, valida e copia i dati precedenti sotto un **Web Lock esclusivo**. Il vecchio valore rimane identico: nessuna cancellazione o riscrittura della chiave precedente. Sono gestiti v1, v2 e anche un eventuale stato v3 della candidata precedente rimasto nella vecchia chiave.

Una chiave v3 già presente ha sempre precedenza: non viene mai sostituita automaticamente da dati v2, neppure se una vecchia scheda modifica il profilo dopo un pagamento nella nuova app. Un archivio v3 corrotto produce un errore, non un ripiego silenzioso su dati vecchi. Il ripristino è possibile soltanto da backup valido con conferma esplicita. Due migratori contemporanei sono serializzati: il secondo non sovrascrive il primo e chiede di ricaricare.

Ogni salvataggio nuovo, inclusi gli identificativi dei promemoria, è serializzato con Web Locks e verifica sia il valore letto sia una revisione intera crescente. Se un’altra scheda ha salvato, la scheda obsoleta **non scrive**: mantiene i campi aperti, mostra un avviso italiano persistente e propone esportazione della copia locale e ricaricamento esplicito. Nessun merge automatico di contabilità. La copia di conflitto comprende il tentativo di modifica e i valori ancora digitati nei moduli; non può essere importata come backup sostitutivo. Va confrontata con un backup aggiornato e le modifiche necessarie vanno riapplicate consapevolmente. I controlli dei promemoria senza novità non incrementano la revisione e non ricreano i moduli.

Se Web Locks non è disponibile, l’app consente lettura/esportazione ma **blocca i salvataggi**, senza ripiego non sicuro. Occorre un browser aggiornato su HTTPS o localhost. Quota esaurita o errore di migrazione non cancellano i dati precedenti e non lasciano pagamenti parzialmente persistiti.

**Le schede vecchie già eseguite non sono trasformate dal service worker.** Continuano a usare soltanto l’archivio precedente: non possono cancellare la contabilità v3, ma le loro modifiche successive alla migrazione non confluiscono automaticamente nel nuovo archivio. Prima del passaggio esportare i dati più recenti, poi chiudere/ricaricare tutte le vecchie schede; non lavorare alternativamente sulle due versioni. L’archivio precedente resta conservato per confronto, non è una sincronizzazione bidirezionale.

### Shell coerente fin dalla prima navigazione

Un semplice cambio del nome cache non bastava: il worker precedente poteva già aver sostituito `app.js` prima di perdere la rete su `planning.js`. Ora **`app.js` è un bundle autosufficiente**: contiene motore, Radar, UI, markup delle finestre e CSS coerenti, senza import da moduli a URL invariati. Se il worker precedente restituisce app nuova e planning vecchio, non c’è più alcun linking tra i due. Il bundle aggiorna anche il vecchio markup e sostituisce gli stili nella pagina, evitando di usare controlli della nuova app su una vecchia finestra HTML.

Anche **`index.html` è autosufficiente**: incorpora la stessa UI e gli stili. Quindi una prima navigazione in cui il worker precedente riceve l’HTML nuovo e perde subito la rete sulle altre risorse resta utilizzabile; non deve recuperare un nuovo URL JavaScript ancora assente dalla cache. Non servono CDN, font, librerie o installazioni aggiuntive.

La build emette inoltre un runtime con nome basato sul contenuto e un manifest di release in `assets/shell/`. Il worker v15 acquisisce tutte le risorse previste, verifica ogni SHA256 e sigilla la cache solo a completamento. Una risposta HTTP 200 appartenente a un’altra versione è rifiutata. Rete interrotta o quota esaurita non attivano una shell parziale; una cache nuova incompleta viene rimossa. La cache attiva non è aggiornata un file alla volta e le API restano fuori dalla cache della shell.

Non c’è più `skipWaiting()` automatico durante installazione: l’attivazione anticipata richiede il pulsante di aggiornamento, dopo l’avviso di salvare/esportare i moduli. Il ricaricamento avviene solo dopo consenso. Gli altri client ricevono un avviso, senza navigazione forzata che perda campi aperti. Le vecchie schede senza questo gestore devono essere ricaricate manualmente; le cache precedenti non sono cancellate mentre possono servire client legacy. Questo privilegia continuità e integrità, ma conserva più versioni nella cache; con spazio insufficiente l’aggiornamento fallisce senza sostituire quello attivo.

### File sorgenti e build obbligatoria

La UI si modifica in **`app-source.js`**; il motore rimane in `planning.js`, Radar in `radar.js`, gli stili in `styles.css`, il markup delle finestre nel corpo di `index.html`. Il worker si modifica in `scripts/service-worker.template.js`. Non modificare manualmente il bundle `app.js`, il runtime con hash, il blocco di runtime incorporato nell’HTML o `service-worker.js`: sono generati.

Dopo qualsiasi modifica eseguire **`node scripts/build-shell.mjs`** prima di servire il progetto. **`node scripts/build-pages.mjs` lo esegue automaticamente** e costruisce il sito statico. È una generazione locale deterministica con sole API Node, non un’installazione o avvio server. Gli hash della release riguardano i byte effettivi: rigenerare anche dopo conversioni CRLF o modifiche ai file statici prima del deploy. Confrontare il manifest del delta prima della build; la build può aggiornare gli hash generati in funzione dei byte locali. Pubblicare sempre l’intera build coerente, non singoli asset manualmente.

## Seconda revisione: intenti asincroni, sessioni ed eventi

### Destinatario e dati non cambiano mentre il lock è in attesa

Ogni invio cattura **prima dell’attesa** un destinatario stabile e un payload completo, copiato profondamente e congelato. Le callback che modificano i dati non leggono `editingSeries`, `editingOccurrence` o campi DOM per ricostruire cosa salvare. Le copie conservano anche valori numerici non validi fino alla validazione: un conteggio malformato non viene trasformato in `null`/senza termine.

Ogni apertura/chiusura di una finestra ha una sessione distinta. Un completamento può chiudere o aggiornare gli errori soltanto della stessa sessione con gli stessi campi inviati. Vale anche riaprendo la medesima serie, passando da scadenza a entrata nella stessa finestra oppure continuando a digitare nella stessa sessione mentre un salvataggio è in coda. La vecchia operazione salva solo il suo destinatario; la nuova bozza resta aperta e invariata.

Il rendering successivo al salvataggio è effettuato **dopo il lock** e solo se vista, sessioni e campi sono ancora quelli dell’invio. Altrimenti i dati vengono salvati senza ricreare il DOM della bozza più recente; il messaggio lo esplicita. Gli elenchi si riallineano al successivo aggiornamento della vista, dopo aver terminato la bozza. I campi non sono disabilitati. Un doppio invio dello stesso modulo/sessione mentre il primo è ancora in attesa viene rifiutato con messaggio italiano: la bozza rimane modificabile e può essere salvata di nuovo al termine.

### Audit mirato di tutti i percorsi che scrivono

| Percorso | Cattura e controllo durante l’attesa |
| --- | --- |
| Scadenza singola / serie / nuova | Identità originale o ID serie, intero payload inclusi categoria, note, promemoria, regola, esclusioni e termini; sessione finestra e fingerprint dei campi |
| Incasso, pagamento e singola previsione | Tipo entrata/uscita, identità occorrenza, modalità effettivo/previsione, data e centesimi catturati; nessuna rilettura del dataset della finestra riaperta |
| Nuova entrata / saldo | Payload completo prima del lock; il saldo aggiorna solo i propri campi e conserva le entrate; una nuova bozza inline non viene ricreata al completamento |
| Profilo / primo accesso | Nome, tipo e metadati catturati; la vecchia richiesta non chiude il profilo riaperto né forza una nuova navigazione |
| Annullamento, recupero, completamento, annullamento effettivo, archiviazione e riattivazione | Identità e scelta catturate prima del lock; la contabilità corrente viene riletta soltanto per applicare e validare quella precisa operazione, mai per scegliere un altro bersaglio |
| Importazione | Payload immutabile, ultima selezione file, revisione di partenza e contesto confermato; controlli anche dentro il lock |
| Permesso notifiche | Token dell’ultima scelta e generazione dell’archivio: una risposta tardiva non riattiva dopo disattivazione o import |
| Promemoria | Derivazione intenzionalmente dallo stato aggiornato sotto lock; nessun invio se nel frattempo notifiche disattivate, occorrenza saldata/annullata o archivio sostituito |
| Migrazione iniziale | Copia immutabile dei dati validati; precedenza della nuova chiave e blocco esclusivo invariati |

Un’importazione vecchia che termina la lettura dopo una più recente non può sostituirla né svuotare il nuovo file selezionato. Se dati o bozza cambiano durante lettura/attesa, l’importazione non sovrascrive le modifiche: occorre riaprire il backup e confermare di nuovo. La sostituzione riuscita incrementa una generazione dell’archivio: comandi già in coda dal vecchio archivio vengono rifiutati **anche se gli ID coincidono**, con copia locale del tentativo basata sui dati precedenti, non sui dati appena importati. La conferma del ripristino avverte della chiusura delle bozze; la chiusura avviene solo dopo salvataggio riuscito e nello stesso contesto confermato.

### Pulsanti degli avvisi e propagazione

Click e change hanno un unico punto di delegazione su **document**, antenato comune di app, finestre e avvisi aggiunti al body. Non rimane un secondo listener delle azioni su app. Il gestore di sola chiusura finestre resta separato e non ripete l’azione. Funzionano quindi esportazione copia locale, ricaricamento dati e consenso al nuovo worker, oltre ai controlli ricorrenza/cassa nelle finestre esterne all’app.

Le nuove prove non chiamano direttamente il gestore per verificare gli avvisi: registrano i listener reali del sorgente e propagano l’evento lungo l’albero **span → button → avviso → body → document**, controllando una sola esportazione/attivazione/ricarica. Verificati anche un pulsante dentro app, la chiusura singola di una finestra e il change di un selettore fuori app. È un DOM di test con albero ed eventi, **non un browser** né una QA visuale.

## Applicazione dopo la review

1. Conservare backup JSON fuori dal repository. Verificare main aggiornato e pulito; creare un branch separato, senza applicare ancora il delta se la base differisce.
2. Confrontare SHA256 dello ZIP con il file `.sha256` affiancato; estrarre in una cartella di controllo. Il manifest affiancato elenca tutti e soli i file del delta, hash base e risultato. Per ogni file esistente richiedere hash base esatto, oppure hash base normalizzato dopo la sola sostituzione CRLF→LF. Non rimuovere spazi o newline finali. Per file nuovi richiedere assenza del percorso. **Qualunque altra differenza: fermarsi e fare un merge mirato**, senza sovrascrivere main.
3. Solo dopo controllo positivo, copiare i file elencati conservandone i percorsi. Controllare il diff; non copiare cartelle di build, log o vecchi overlay. Verificare gli hash risultato, eventualmente con la stessa normalizzazione CRLF. Il pacchetto non cancella file.
4. Eseguire la build statica prima di servire il progetto e i test riportati sotto; non occorre avviare il server né il monitoraggio automatico. Procedere alle prove manuali desktop/mobile con dati fittizi e in un profilo browser separato. Nessun commit o push eseguito da questo aggiornamento.

## Verifiche e limiti

- Suite combinate `node --test test/planning/*.test.mjs test/radar/*.test.mjs test/ui/*.test.mjs test/real-measures/cli-args.test.mjs`: **222/222 superati** — Planning 75, Radar 42, UI 100, argomenti CLI 5. Comprendono 27 regressioni delle ricorrenze, 24 prove dei primi blocchi e 29 nuove prove per sessioni asincrone, payload immutabili, import concorrenti e propagazione degli eventi.
- Seconda revisione: lock trattenuti con apertura A→B per scadenze ed entrate, anche fra tipi diversi; singole, nuove, movimenti, profilo, saldo, bozze inline e reinvio; errori non applicati alla nuova finestra; import invertiti/in coda, nuovi dati durante lettura, ID riutilizzati dopo import; risposta tardiva del permesso; delegazione gerarchica senza doppio evento.
- Probe precedenti mantenuti: due VM con writer v2 originale e nuova app su storage condiviso; pagamento seguito da modifica profilo legacy; due writer nuovi asincroni sotto lock; migrazione concorrente, precedenza v3, v3 corrotta senza fallback, draft, promemoria stale e rollback. Worker base realmente eseguito in VM con app nuova/planning vecchio offline e HTML nuovo/tutte le dipendenze offline; installazione interrotta, hash errato, quota cache, cache sigillata e consenso al reload. Sono simulazioni, non browser.
- Coperti anno bisestile, 31, esclusioni/numero/data, ordinali, doppi limiti legacy, cambi regola dopo effettivi ed eccezioni, assorbimento nel saldo senza perdita del consuntivo, annullamento/ripristino/report/Radar/promemoria, backup/migrazione/rigetto/roundtrip e rollback storage.
- Controllo sintassi di sorgenti, bundle, worker e script di build: superato. Build ripetibile e hash delle risorse della release verificati.
- `node scripts/build-pages.mjs`: superato senza avviare server. La cache shell passa a v15 con identificativo della release. Runtime versionato nella directory assets già ammessa dal server, nessuna modifica al backend.
- Delta verificato con CRC, SHA256, overlay ricostruito sulla base immutata e confronto byte per byte del risultato. Le stesse 222 prove e la build statica sono ripetute sul ricostruito.
- **Non eseguiti full suite e typecheck**: dipendenze applicative e TypeScript non disponibili; nessuna installazione effettuata. Le prove CLI degli argomenti sono autonome e superate; ciò non equivale all’intera suite di ingestion.
- **Nessun browser disponibile**, inclusi strumenti Playwright/Puppeteer: test UI in DOM minimo/VM, non QA visuale, test screen reader, offline reale o verifica del datepicker su Windows/mobile. Layout navy esistente mantenuto; aggiunti soltanto controlli nativi, etichette/legend e griglie compatte responsive. Rimangono da verificare manualmente focus, tastiera, scrolling della finestra e cache PWA installata.
- Non implementata la variante «questa e successive»: nessuna estensione oltre la modifica singola/intera serie richiesta.
