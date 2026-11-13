# Architettura corrente: Scadenzario PWA

## Decisione di sviluppo

Per poter provare il prodotto senza installare Flutter, la versione attiva è una Progressive Web App (PWA) in HTML, CSS e JavaScript standard. Funziona in un browser moderno e può essere aggiunta alla schermata Home quando il browser lo consente.

## File attivi

```text
index.html                         schermate, moduli e dialog
styles.css                         design responsive desktop/mobile
app.js                             stato, flussi, calendario, backup e promemoria
manifest.webmanifest               metadati per installazione PWA
service-worker.js                 cache dell'interfaccia per uso offline
assets/catalog/deadlines.json     suggerimenti iniziali per i profili
assets/catalog/benefits.json      prime misure nazionali e una misura comunale di Milano verificate; catalogo territoriale incompleto
server.mjs                        server HTTP/API locale e pianificazione dei controlli
backend/source-registry.json      elenco iniziale di pagine ufficiali nazionali, Lombardia e Milano
backend/source-monitor.mjs        rilevamento cambiamenti e stato di revisione
backend/resolve-source-change.mjs registrazione CLI della revisione umana
backend/refresh-sources.mjs       aggiornamento del monitoraggio pubblicabile
scripts/build-pages.mjs           prepara la sola cartella pubblica per GitHub Pages
.github/workflows/pages.yml       esecuzione pianificata e deploy Pages
assets/catalog/source-monitoring.json snapshot del monitoraggio, senza impronte private
icons/icon.svg                     icona vettoriale
icons/icon-192.png                 icona per installazione mobile
icons/icon-512.png                 icona ad alta risoluzione PWA
```

## Stato e persistenza

- Il profilo, le scadenze e le preferenze sono salvati in `localStorage`.
- L'archivio segue uno schema versionato; il backup è un file JSON validato prima del ripristino.
- Non esistono account o sincronizzazione dei dati personali. È stato aggiunto un backend Node senza dipendenze per servire la PWA, fornire il catalogo e controllare periodicamente le fonti.
- Il saldo iniziale, la riserva, le entrate del piano e l'ISEE sono tenuti solo in memoria JavaScript: non sono scritti in `localStorage` e non compaiono nel backup.
- L'ISEE è facoltativo nella ricerca agevolazioni; se omesso, il filtro esclude le misure con una soglia ISEE dichiarata, ma non stabilisce l'idoneità per quelle rimanenti.
- La proiezione copre 12 mesi e usa scadenze attive con importo e ricorrenze presenti nell'app, più le entrate ricorrenti inserite; gli impegni arretrati sono conteggiati come uscite immediate. Non include spese quotidiane o dati bancari e non è una previsione certa.
- Il catalogo agevolazioni usa uno schema JSON separato; ogni misura deve avere ambito, fonte HTTPS, requisiti e riferimenti temporali. Include le prime misure nazionali consultate su INPS e la procedura comunale di revisione della quota nidi di Milano 2026/27. Non ha copertura sistematica delle fonti comunali/regionali né verifica automatica dell'idoneità.
- Il backend controlla all'avvio e ogni 24 ore un elenco esplicito di pagine ufficiali (INPS, ARERA, Regione Lombardia e Comune di Milano). Rileva cambiamenti del testo e possibili indisponibilità, ma non interpreta il contenuto né aggiorna il catalogo: una persona deve aprire la fonte, valutare l'impatto e aggiornare manualmente il JSON se necessario.
- Le variazioni rilevate vengono mostrate nell'interfaccia e restano in attesa finché un operatore non registra la revisione dalla CLI. Lo stato locale contiene solo informazioni delle pagine pubbliche e cronologia di revisione, non dati utente; per GitHub Actions viene mantenuto nel repository, mentre nella modalità solo locale è ignorato da Git.
- Il monitoraggio dipende dalla disponibilità e dalla politica dei siti sorgente, può generare falsi positivi dovuti a modifiche editoriali e non è una garanzia di completezza. L'elenco iniziale è un pilota, non copre tutti i programmi nazionali, le Regioni o i Comuni italiani.
- Per controlli mentre il computer è spento sono predisposti workflow GitHub Actions e pubblicazione GitHub Pages: l'esecuzione giornaliera mantiene le impronte nel repository e ridistribuisce lo snapshot. La configurazione è pronta ma non attiva finché il progetto non viene inviato a un repository remoto. In alternativa, il backend locale deve girare su un host sempre attivo con disco persistente. Il server ascolta per impostazione predefinita solo su `127.0.0.1`; per l'esposizione pubblica servono hosting adeguato, HTTPS e una configurazione operativa sicura. Le API non hanno endpoint di scrittura pubblici.
- Il catalogo è caricato da JSON e la creazione di una scadenza suggerita passa sempre dal modulo di modifica/conferma.
- La scadenza successiva ricorrente mantiene il giorno del mese quando esiste e lo limita all'ultimo giorno dei mesi più corti.

## Limiti tecnici e di sicurezza

`localStorage` non è cifrato. Anche i dati temporanei di pianificazione e ricerca ISEE sono visibili alla pagina e non sono protetti da cifratura; vengono persi al ricaricamento e non vanno considerati un archivio sicuro. Non inserire documenti ISEE o dati riservati. Le notifiche del browser sono un best effort mentre l'app è aperta; non sostituiscono le notifiche native affidabili in background.

Il valore ISEE è un criterio di ricerca indicativo, non prova del diritto a un bonus. Le misure possono dipendere anche da nucleo, residenza, età, bando, scadenze e fondi disponibili. Non popolare il catalogo da fonti non ufficiali o scraping non verificato; ogni voce richiede manutenzione e verifica. Il valore ISEE resta nel browser: le API del backend trasmettono solo il catalogo pubblico e lo stato delle fonti.

L'uso del service worker e il caricamento del catalogo richiedono un'origine `localhost`/HTTPS. `node server.mjs` avvia il server integrato su `http://127.0.0.1:4173`; Live Server resta utilizzabile per la PWA ma non espone le API di monitoraggio. Il doppio clic su `index.html` apre `file://` e non abilita correttamente catalogo, installazione o cache offline.

## Materiale Flutter precedente

I file iniziali Dart sotto `lib/` e `test/` sono conservati come riferimento; la PWA non li carica. Non installare Flutter per provare questa versione.
