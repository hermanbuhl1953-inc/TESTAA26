# Roadmap di sviluppo Scadenzario

La scelta attuale è una PWA in HTML, CSS e JavaScript, così il prototipo si può provare senza installare Flutter o Android Studio. Le attività Flutter iniziali in `lib/` e `test/` sono materiale di riferimento, non il prodotto attivo.

## Sprint 1 - Prototipo utilizzabile

### Completato nella prima milestone web

- [x] interfaccia responsive desktop e mobile
- [x] profilo locale e scelta tra cinque profili
- [x] persistenza locale nel browser con schema versionato
- [x] gestione manuale delle scadenze: inserimento, modifica, completamento, riapertura e archiviazione
- [x] importi convertiti in centesimi, senza memorizzarli come decimali
- [x] ricorrenza mensile con gestione corretta dei mesi più corti
- [x] panoramica con scadenze scadute e in arrivo
- [x] filtri per categoria e stato
- [x] calendario mensile con selezione del giorno
- [x] suggerimenti catalogo per profilo e conferma prima del salvataggio
- [x] backup JSON esportabile e ripristino con validazione e conferma
- [x] manifest e service worker per installazione/cache offline dove supportati
- [x] promemoria browser facoltativi mentre l'app è aperta

### Verifiche ancora richieste sul dispositivo dell'utente

- [ ] provare l'avvio con Live Server in VS Code
- [ ] provare installazione PWA su Android e iOS
- [ ] verificare accessibilità e contrasto con utenti reali
- [ ] eseguire un ciclo completo di backup e ripristino su più browser

### Incremento avviato - Pianificazione e agevolazioni

- [x] calcolo di proiezione mensile a 12 mesi, senza persistenza di saldo o entrate
- [x] inserimento di saldo, riserva minima e accrediti ricorrenti
- [x] esclusione esplicita di scadenze senza importo e avviso per eventi non modellati
- [x] selezione di regione e comune e ricerca per soglia ISEE
- [x] prime misure nazionali (Assegno unico e ADI) inserite da schede INPS ufficiali con soglie, requisiti, fonte e data di verifica
- [x] aggiunta la procedura comunale di revisione della quota nidi di Milano 2026/27 con fonte, finestra temporale e requisiti
- [x] backend Node senza dipendenze per servire catalogo e stato fonti
- [x] controllo giornaliero dei cambiamenti su fonti ufficiali nazionali e pilota Lombardia/Milano
- [x] coda esplicita di variazioni da verificare, senza aggiornamenti automatici o pubblicazione di requisiti
- [x] attivato il controllo giornaliero GitHub Actions e predisposto il deploy Pages opzionale
- [ ] verificare su bando ufficiale finestra, soglie e requisiti di Nidi Gratis Plus 2026/27 prima di inserirlo
- [ ] raccogliere ulteriori fonti istituzionali e definire una procedura verificabile di aggiornamento per una regione/comune pilota
- [ ] verificare piano e visibilità; abilitare Pages nelle impostazioni e impostare `PUBLISH_GITHUB_PAGES=true` se il sito può essere pubblicato
- [ ] censire endpoint API, feed o open data ufficiali nazionali e per ciascuna Regione/Comune, documentando copertura e frequenza
- [ ] definire un processo editoriale per verificare le variazioni, pubblicare gli aggiornamenti e ritirare misure scadute
- [ ] ampliare progressivamente il registro fonti; nessun controllo web può garantire da solo copertura totale di tutti i Comuni italiani
- [ ] ampliare copertura e testare scadenze fiscali, bando, graduatoria e requisiti non ISEE prima di mostrare programmi reali
- [ ] valutare un archivio protetto se l'utente richiede persistenza di dati finanziari o ISEE

## Sprint 2 - Affidabilità e importazione assistita

- [ ] aggiungere test automatici per ricorrenze, parsing importi, backup e schema catalogo
- [ ] aggiungere gestione di persone/membri per i profili famiglia
- [ ] esportare e importare dati per singolo profilo, oltre al backup completo
- [ ] valutare libreria di notifica PWA e documentare compatibilità reale; non promettere notifiche a browser chiuso senza test
- [ ] validare il formato QR PagoPA su specifiche e campioni autorizzati
- [ ] implementare scansione QR con parsing validato, anteprima e conferma manuale
- [ ] implementare selezione di file/documenti e OCR locale solo dopo valutazione privacy
- [ ] mostrare in anteprima i campi estratti e richiedere sempre conferma prima del salvataggio

## Sprint 3 - Privacy, backup sicuro e possibile sincronizzazione

- [ ] decidere se la PWA basta o se i requisiti necessitano un'app nativa
- [ ] valutare cifratura locale e gestione chiavi prima di usare dati reali
- [ ] svolgere revisione legale/privacy e DPIA prima di OCR, AI o dati sanitari
- [ ] definire threat model, minimizzazione, retention e cancellazione dei dati
- [ ] valutare backend UE, autenticazione e sincronizzazione soltanto dopo aver validato il valore della funzione
- [ ] se introdotta, aggiungere code offline, versione record e gestione dei conflitti
- [ ] beta chiusa e test con utenti, device e browser reali

## Fuori ambito attuale

- account e backend
- sincronizzazione tra dispositivi
- servizi AI e upload documenti
- collegamenti email, open banking o cassetto fiscale
- fonti di scadenze ottenute tramite scraping

## Principi che restano invariati

- nessuna scadenza importata o suggerita viene salvata senza conferma esplicita
- importi in centesimi e date locali nel formato ISO `YYYY-MM-DD`
- nessun dato sensibile in log o servizi terzi
- catalogo e date fiscali sono solo indicativi finché non verificati con fonti ufficiali
