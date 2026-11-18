# Planning affidabile — prima fase

## Applicazione locale sul ramo esistente

Base dichiarata dell'input: `02e65031d9b7fb86b154bb6dba78956d8a7e987c`. L'archivio ricevuto non contiene `.git`: l'appartenenza effettiva a quel commit non è verificabile dal solo ZIP. Destinazione indicata: ramo **già esistente** `planning-affidabile` del repository `hermanbuhl1953-inc/TESTAA26`. Non creare un altro repository o un nuovo ramo omonimo; nessun push o commit viene effettuato da questo aggiornamento.

1. **Prima dell'aggiornamento**, dalla versione attualmente in uso esportare **Profilo → Esporta backup JSON**. Conservarlo fuori dal repository insieme a una copia dei file locali eventualmente modificati. Il vecchio saldo temporaneo non era salvato: annotarlo separatamente con data e movimenti già inclusi.
2. Nel clone locale controllare `git status --short`. Proteggere o risolvere modifiche locali prima di sovrascrivere file. Passare al ramo esistente con `git switch planning-affidabile`; verificare localmente la base con `git merge-base --is-ancestor 02e65031d9b7fb86b154bb6dba78956d8a7e987c HEAD`. Nessun `fetch`, `pull` o accesso remoto è richiesto dal pacchetto.
3. Confrontare il delta con eventuali modifiche successive alla base: se un file è già diverso, integrare manualmente le parti, non sovrascrivere alla cieca. Lo ZIP `Scadenzario-planning-affidabile-aggiornamento.zip` contiene **solo file aggiunti/modificati**, con nomi relativi alla radice progetto e senza cartella contenitore. Estrarlo nella radice del clone solo dopo questa verifica.
4. Avviare con il metodo già disponibile. `node server.mjs` necessita delle dipendenze backend già previste dal progetto e attiva il monitoraggio fonti esistente; non usarlo se non si desidera tale comportamento. Un server statico già disponibile può servire la sola PWA senza avviare quel backend. I moduli ES non funzionano con doppio clic `file://`.
5. Riaprire/ricaricare la PWA. La cache passa a `scadenzario-shell-v9-planning-fix` e comprende `planning.js`. La build statica copia ora anche quel file; nessun sito viene pubblicato da questo pacchetto. Se una scheda resta sulla vecchia versione, chiuderla e riaprirla prima di modificare dati.
6. Controllare le scadenze migrate; impostare **saldo, data non futura, riserva e scelta sugli effettivi della stessa data**. Esportare un nuovo backup v2 e provarne il ripristino su un'origine/profilo browser di prova, non sull'unica copia dei dati.

Il backup contiene dati finanziari personali in chiaro: non aggiungerlo a Git. Per tornare alla vecchia app occorrono sia i vecchi file sia il backup **v1** precedente: il codice v1 non legge backup v2.

## Comportamento implementato

- Stato unico persistito in `localStorage` e backup JSON `schemaVersion: 2`: profilo, scadenze, impostazioni, saldo datato, riserva, entrate previste, eccezioni per occorrenza ed effettivi. La chiave precedente `scadenzario.pwa.v1` resta per compatibilità di lettura. Il primo caricamento migra in memoria senza cancellare l'originale; il primo salvataggio riuscito scrive il formato v2. Backup v1 e v2 sono validati prima della sostituzione, con conferma. In caso di errore di scrittura lo stato in memoria torna alla copia precedente.
- Saldo anche negativo; riserva non negativa. Effettivi **prima** della data saldo già assorbiti; **dopo** la data applicati, anche se anteriori a oggi. Per lo stesso giorno si sceglie esplicitamente **tutti inclusi** oppure **nessuno incluso**. Un saldo aggiornato richiede conferma di riconciliazione: la UI non può dedurre quali movimenti bancari siano già compresi.
- Scadenza e cassa prevista distinte. Per una nuova scadenza la cassa è **non nota** finché non si sceglie una data diversa o esplicitamente «stessa data». Una cassa sconosciuta produce un avviso e non è inventata. Il calendario mostra le scadenze, la proiezione usa la cassa.
- Ricorrenze calcolate dall'ancora originale, mai dalla data precedentemente limitata: 31 gennaio → 28/29 febbraio → 31 marzo. È preservato il **giorno numerico originale**, non una regola implicita «ultimo giorno»: 30 aprile → 30 maggio. Anche una data di cassa distinta conserva il suo giorno originale. Termine per data inclusivo e/o numero totale comprensivo della prima occorrenza; se entrambi presenti vale il limite più vicino.
- Identità stabile `id-serie@data-originale`; completare non avanza né sovrascrive l'ancora. Rimangono le occorrenze saldate e gli effettivi collegati. Home essenziale: per serie mostra lo storico completato e la prima occorrenza ancora aperta; calendario e planning generano le occorrenze dallo stesso motore.
- Modifica **singola** di scadenza, cassa, importo, titolo, categoria, note e promemoria, senza alterare successive o effettivi. Per l'entrata è modificabile la singola previsione in data di cassa/importo. Pagamento/incasso effettivo **totale**, con data obbligatoria non futura e importo positivo: sostituisce la previsione collegata anziché duplicarla. Correzione e annullamento espliciti; annullare riapre la previsione. Anche un pagamento senza importo preventivato si può registrare con «Registra pagamento».
- I promemoria senza importo possono essere completati **senza movimento** dopo conferma esplicita; non vengono chiamati pagamenti e possono essere riaperti. Archiviare una serie esclude solo le previsioni: gli effettivi restano nel calcolo e nel backup. Le serie archiviate possono essere riattivate; le entrate archiviate restano elencate come tali.
- Nessun arretrato è spostato a oggi o marcato pagato/incassato automaticamente. Le previsioni con cassa già passata sono segnalate ed escluse dal saldo proiettato finché l'utente non registra l'effettivo o riprogramma la cassa. Non confondere questa esclusione con assenza del debito: **una proiezione con avvisi è incompleta e può sovrastimare il denaro disponibile**.
- Proiezione dalla data saldo fino al primo giorno del mese corrispondente dell'anno successivo: riepilogo mensile con entrate, uscite, saldo finale e minimo inframensile, elenco dei movimenti applicati, minimo complessivo, data del minimo, **prima** criticità sotto riserva, margine rispetto alla riserva anche negativo, deficit sotto zero e saldo finale. Nello stesso giorno, senza orari, le uscite precedono le entrate: minimo prudenziale, non un estratto conto bancario. Importi non noti, casse sconosciute e completamenti storici non riconciliabili restano visibili negli avvisi.
- Entrate sempre previste finché non si registra un incasso. Il catalogo bonus è soltanto informativo e non crea entrate o incassi.
- Motore puro `planning.js`, centesimi interi, date civili ISO senza conversioni UTC/DST; dati visualizzati con escaping. `server.mjs` cambia solo la lista statica dei file pubblici per servire il nuovo modulo; backend, cataloghi, pipeline misure `src/` e materiale Dart `lib/` non sono modificati.

## Limiti effettivi di questo rilascio

- **Non disponibile «questa e successive»** né modifica dell'ancora/ricorrenza/termine di una serie esistente: la UI lo dichiara e disabilita quei campi. Non simulare questa operazione con una nuova serie sovrapposta. Titolo e altri dati possono variare sulla singola occorrenza.
- Niente pagamenti parziali, rateizzazione di un singolo effettivo, importi effettivi negativi o storno contabile separato. Correggere/annullare sostituisce o rimuove l'effettivo corrente: viene conservato lo storico delle occorrenze, **non un audit immutabile delle revisioni**. Fare backup prima di correzioni rilevanti.
- Inclusione nella data saldo solo «tutti/nessuno», non per singolo movimento. Se il saldo include soltanto parte degli effettivi di quel giorno, usare un'altra data di riferimento riconciliabile.
- I dati v1 non permettono di ricostruire occorrenze già cancellate dal vecchio avanzamento delle ricorrenze, né pagamenti senza data/importo. Si conserva l'ancora ancora presente e si avvisa; non viene inventato lo storico perduto. Saldo/riserva/entrate temporanei della vecchia versione non sono recuperabili.
- Date supportate 1900–9998; ricorrenze intere 0–120 mesi; termine numerico fino a 1200 occorrenze; importo per movimento/saldo/riserva fino a 1.000.000.000.000 centesimi. Backup importabile massimo 5 MB. Il calcolo di una serie molto lunga ha un limite esplicito di sicurezza, non tronca in silenzio.
- Nessuna sincronizzazione, account, cifratura, estratto conto, gestione fondi/budget/carte o multi-conto. Le spese non registrate non sono stimate; nessuna garanzia finanziaria. Nessuna nuova dipendenza. Le notifiche preesistenti rimangono best effort a pagina aperta, **non garantite ad app/browser chiuso**.
- Nessuna prova visuale/accessibilità reale, installazione PWA o modalità offline in browser eseguita in questo ambiente: browser non disponibile. I test di integrazione hanno un DOM minimo simulato e non sostituiscono prove su dispositivi.

## Correzione di sicurezza prima della pubblicazione

La revisione ha rilevato una possibile iniezione HTML persistente da un backup v2: con `ready: false`, una `balanceDate` non valida poteva superare la validazione ed essere interpolata nell'attributo del modulo Planning. Questa consegna sostituisce il precedente ZIP, che non deve essere pubblicato.

- `balanceDate` è validata **sempre**, anche quando il planning non è pronto: in quello stato sono ammessi soltanto `null` oppure una data civile ISO valida. Un planning pronto continua a richiedere data presente e non futura, oltre alla scelta sugli effettivi del giorno.
- Il rendering dell'attributo `value` applica comunque `escapeHtml`, indipendentemente dalla validazione: difesa aggiuntiva anche se una futura modifica inserisse un dato non validato nello stato in memoria.
- Backup malevoli vengono rifiutati prima del ripristino e della persistenza, senza sostituire lo stato precedente. Anche dati locali preesistenti con la stessa anomalia vengono rifiutati senza cancellarli: usare un backup affidabile per il recupero, non aggirare il controllo.
- Ispezione mirata delle analoghe interpolazioni dei dati modello e dei relativi validatori: nessun altro percorso sfruttabile dimostrato nel perimetro verificato. Non equivale a una certificazione di sicurezza generale.
- Sette nuovi test coprono date valide/invalide con planning pronto e non pronto, migrazione, ripristino malevolo, stato locale preesistente ed escaping del rendering anche senza validazione preventiva. Prima della correzione cinque test riproducevano il problema; dopo la correzione l'intera suite Planning è verde. Gli esiti misurati sono in `VERIFICA_PLANNING.txt`.
- Cache aggiornata a `scadenzario-shell-v9-planning-fix` per distribuire insieme il validatore e il rendering corretti. Nessuna pubblicazione automatica.

## Verifica ripetibile

Dalla radice del progetto, senza installare nuove dipendenze:

```sh
npm run test:planning
node --check planning.js
node --check app.js
node --check service-worker.js
node --check server.mjs
node --check scripts/build-pages.mjs
npm run test:all
node --test backend/source-monitor.test.mjs backend/staging.test.mjs
# Solo se TypeScript e dipendenze del progetto sono già disponibili:
npm run typecheck
```

Per gli esistenti test backend che usano `os.tmpdir()`, in un ambiente con restrizioni sui percorsi impostare `TMPDIR` (oppure `TEMP`/`TMP` su Windows) a una cartella di prova sotto il progetto, senza modificare i test originali.

Esiti di questa consegna: consultare il riepilogo `VERIFICA_PLANNING.txt` nella radice. I comandi originali falliti per dipendenze mancanti non equivalgono a regressioni dimostrate né a test superati. Typecheck non eseguito in assenza di TypeScript; nessuna installazione effettuata.

### Prova manuale consigliata prima dell'uso personale

1. Importare un backup v1 di prova e controllare avvisi e titoli; verificare un 31 mensile fino a marzo e un termine a tre occorrenze.
2. Salvare saldo e riserva, ricaricare, esportare e ripristinare il backup v2 su un browser/profilo separato.
3. Registrare un pagamento dopo il saldo ma prima di oggi, uno prima del saldo e uno nella stessa data con entrambe le scelte di inclusione. Correggere e annullare.
4. Separare scadenza e cassa, riprogrammare un arretrato, lasciare una data sconosciuta; controllare che non sia registrato un pagamento automatico.
5. Inserire entrata prevista, incasso, correzione, annullamento; verificare che il catalogo bonus non cambi mai il saldo.
6. Creare una prima criticità sotto riserva prima del minimo assoluto; verificare i due giorni distinti e un deficit negativo non nascosto. Controllare tastiera, focus dei dialoghi e larghezza mobile.
7. Dopo un primo caricamento completo, provare riapertura offline e aggiornamento da una vecchia cache. Queste prove restano da eseguire in un browser reale.
