# Collaudo manuale di tre misure istituzionali

Verifica delle pagine eseguita il **16 novembre 2026, ora italiana**. I dati sono stati riportati manualmente nelle fixture RawMeasure e poi passati al CLI locale. Le ricerche web sono state usate solo per individuare le pagine; le evidenze qui riportate provengono dalle pagine istituzionali. Nessun crawler o fetch automatico è stato eseguito.

Le tre candidate sono `REAL` perché descrivono misure effettivamente pubblicate. Restano `TO_VERIFY`: il CLI non salva nel catalogo, non approva, non promuove a `VERIFIED` e non le collega all’eligibility engine. Le date indicate nei risultati CLI sono quelle registrate nei rispettivi RawMeasure.

## Misura 1 — Nidi Gratis Plus 2026/27

### Identificazione

- **Titolo:** NIDI GRATIS PLUS - 2026/27 - ADESIONE FAMIGLIE
- **Ente:** Regione Lombardia
- **Territorio:** Lombardia
- **Categoria / tipo:** Servizi per l’infanzia / CONTRIBUTION
- **Pagina istituzionale:** [scheda Nidi Gratis Plus 2026/27](https://www.bandi.regione.lombardia.it/servizi/servizio/bandi/dettaglio/politiche-sociali/famiglia/nidi-gratis-plus-2026-27-adesione-famiglie-RLD12026053903)
- **Verifica e acquisizione:** 16/11/2026, 14:04 (UTC+01:00); pagina accessibile e scheda contrassegnata Aperto.

### Dati strutturati

| Campo | Valore |
|---|---|
| Importo | **NON DISPONIBILE** come importo della misura. I limiti INPS citati dalla fonte sono requisiti sulla retta, non l’importo del beneficio. |
| ISEE | Massimo €25.000 (2.500.000 centesimi); ISEE minorenni oppure ISEE per prestazioni familiari e inclusione, secondo la scelta del Comune. |
| Apertura / scadenza | 27/10/2026 ore 12:00 – 19/11/2026 ore 12:00; la fonte aggiunge “fino a esaurimento delle risorse”. |
| Territorio | Regione Lombardia; non è stato strutturato un requisito di residenza non esplicitato nella scheda consultata. |
| Requisiti familiari | Genitore richiedente; figli iscritti a nidi o micro-nidi ammessi alla misura. `minChildren` resta non disponibile. |
| Altri requisiti | Almeno un genitore occupato oppure disoccupato con DID e PSP. Retta mensile superiore al rimborso INPS: €272,73 per le prime 10 mensilità e €272,70 per l’undicesima, oppure €327,27 e €327,30 per i minori nati dal 01/01/2024. |
| Modalità | Domanda dal collegamento “Fai domanda” nella scheda Bandi e Servizi. |

### Evidenza e documenti

La scheda ufficiale riporta stato Aperto, date di domanda, soglia ISEE e requisiti per genitore, iscrizione al nido, occupazione e retta. I PDF elencati dalla scheda sono [DDUO 13777 del 19/10/2026 - Avviso famiglie](https://www.bandi.regione.lombardia.it/servizi/servizio/bandi/download/8a5aa436a15b6cfe01a15de02e3f002f?fileName=DDUO%2013777%20del%20191026%20AVVISO%20FAMIGLIE.pdf) e [Allegato A - Avviso famiglie Nidi Gratis 2026/27](https://www.bandi.regione.lombardia.it/servizi/servizio/bandi/download/8a5aa436a15b6cfe01a15de091460030?fileName=ALLEGATO%20A%20AVVISO%20FAMIGLIE%20NIDI%20GRATIS%2026_27.pdf). I link sono conservati nella candidate; i PDF non sono stati estratti né confrontati con la pagina. La scheda indica pubblicazione 22/09/2026 e un decreto collegato del 19/10/2026: non è stata rilevata una divergenza sui dati riportati, ma il confronto con il testo dei PDF resta da fare.

### Pipeline e revisione

- **Record / qualità / review:** REAL / TO_VERIFY / NEEDS_REVIEW
- **Normalizzazione:** OK; **validazione:** 0 errori, 1 warning (requisiti testuali); qualità raccomandata PARTIAL.
- **Approvabile:** sì solo dopo revisione umana; **approvata:** no.
- **Fingerprint:** `["REGION","regione lombardia","nidi gratis plus 2026 27 adesione famiglie","lombardia","","","https://www.bandi.regione.lombardia.it/servizi/servizio/bandi/dettaglio/politiche-sociali/famiglia/nidi-gratis-plus-2026-27-adesione-famiglie-RLD12026053903"]`
- **contentHash:** `47184f8d0b6a9aa3c0e18bbe274140f7b210ae3e4a11c6c1bec25a95e4052ea5`
- **Conflitti:** nessuno nel set di revisione fornito; non è stato eseguito un confronto con catalogo/database.
- **Da rivedere:** criteri della retta e casi INPS, definizione di almeno un figlio ammesso, stato occupazionale con DID/PSP e corrispondenza con i PDF.

### Compatibilità eligibility

- **Supportati se modellati:** soglia ISEE massima e tipo ISEE; il motore dispone anche di campi regionali.
- **Non supportati o da lasciare testuali:** iscrizione del figlio a struttura ammessa; occupazione del genitore **oppure** disoccupazione con DID e PSP; retta rispetto al rimborso INPS, dipendente da mensilità e data di nascita.
- **Dati profilo da raccogliere in futuro:** iscrizione e struttura del figlio, stato e documentazione lavorativa del genitore, importo retta e mensilità applicabile. Non collegati al motore in questo step.

## Misura 2 — Dote Scuola, componente Buono Scuola 2026/2027

### Identificazione

- **Titolo:** Dote Scuola – Componente Buono Scuola, Anno Scolastico 2026/2027
- **Ente:** Regione Lombardia
- **Territorio:** Lombardia
- **Categoria / tipo:** Diritto allo studio / CONTRIBUTION
- **Pagina istituzionale:** [scheda Buono Scuola 2026/2027](https://www.bandi.regione.lombardia.it/servizi/servizio/bandi/dettaglio/istruzione-formazione-lavoro/dote-scuola/dote-scuola-componente-buono-scuola-anno-scolastico-2026-2027-RLW12025050894)
- **Verifica e acquisizione:** 16/11/2026, 14:06 (UTC+01:00); pagina accessibile e scheda contrassegnata Aperto.

### Dati strutturati

| Campo | Valore |
|---|---|
| Importo | **NON DISPONIBILE** nella parte della scheda consultata; non dedotto. |
| ISEE | Massimo €40.000 (4.000.000 centesimi); ISEE valido alla data di domanda. |
| Apertura / scadenza | 03/11/2026 ore 12:00 – 10/12/2026 ore 12:00. |
| Territorio | Residenza in Lombardia; la scuola può essere in Lombardia o in Regione confinante con rientro quotidiano. |
| Requisiti scolastici | Studenti iscritti e frequentanti corsi ordinari di scuola primaria o secondaria di primo o secondo grado; scuola statale o paritaria con retta. |
| Modalità | Domanda dal collegamento “Fai domanda” nella scheda Bandi e Servizi. |

### Evidenza e documenti

La scheda ufficiale riporta le date e la condizione ISEE; la sezione “Chi può partecipare” specifica residenza, grado scolastico, tipo di scuola, retta e ubicazione. I PDF elencati sono [DDS 14111 del 22/10/2026 - Approvazione avviso](https://www.bandi.regione.lombardia.it/servizi/servizio/bandi/download/8a5aa37da17aaa1f01a17d2ee5a30108?fileName=DDS%2014111%2022_10_2026%20Approvazione%20Avviso.pdf) e [Allegato A - Avviso pubblico](https://www.bandi.regione.lombardia.it/servizi/servizio/bandi/download/8a5aa37da17aaa1f01a17d301f6d0109?fileName=DDS%2014111_26%20Allegato%20A%20Avviso%20pubblico.pdf). Sono registrati nelle candidate ma non estratti né confrontati con la scheda. La pagina riporta pubblicazione 27/10/2026; il decreto collegato è datato 22/10/2026, senza divergenza rilevata sui dati riportati.

### Pipeline e revisione

- **Record / qualità / review:** REAL / TO_VERIFY / NEEDS_REVIEW
- **Normalizzazione:** OK; **validazione:** 0 errori, 1 warning (requisiti testuali); qualità raccomandata PARTIAL.
- **Approvabile:** sì solo dopo revisione umana; **approvata:** no.
- **Fingerprint:** `["REGION","regione lombardia","dote scuola componente buono scuola anno scolastico 2026 2027","lombardia","","","https://www.bandi.regione.lombardia.it/servizi/servizio/bandi/dettaglio/istruzione-formazione-lavoro/dote-scuola/dote-scuola-componente-buono-scuola-anno-scolastico-2026-2027-RLW12025050894"]`
- **contentHash:** `0d882cc08159d370d28ba9df284d7305c6c208b9800ae5c1c5559ae95ac1215d`
- **Conflitti:** nessuno nel set di revisione fornito; non è stato eseguito un confronto con catalogo/database.
- **Da rivedere:** importo e modalità di calcolo, validità dei requisiti contenuti nel testo dei PDF e condizioni di frequenza.

### Compatibilità eligibility

- **Supportati se modellati:** ISEE massimo, residenza/territorio regionale.
- **Non supportati o da lasciare testuali:** ordine e frequenza scolastica, iscrizione a corsi ordinari, tipo di scuola e pagamento della retta; eccezione delle scuole in Regioni confinanti con rientro quotidiano.
- **Dati profilo da raccogliere in futuro:** ordine e stato di frequenza, scuola, Regione della scuola e retta. La validità temporale dell’ISEE all’atto della domanda non è modellata. Nessun collegamento al motore in questo step.

## Misura 3 — scegliMI, sostegno all’affitto per under 35

### Identificazione

- **Titolo:** scegliMI - Sostegno all'affitto per under 35
- **Ente:** Comune di Milano
- **Territorio:** Comune di Milano, Lombardia
- **Categoria / tipo:** Casa e sostegno all’affitto / CONTRIBUTION
- **Pagina istituzionale:** [scheda scegliMI del Comune](https://www.comune.milano.it/servizi/casa/sceglimi-sostegno-all-affitto-per-under-35)
- **Verifica e acquisizione:** 16/11/2026, 14:06:37.641 (UTC+01:00); pagina accessibile. L’avviso collegato indica stato APERTO.

### Dati strutturati

| Campo | Valore |
|---|---|
| Importo | Massimo €2.400; tipo MAXIMUM. |
| ISEE | **NON DISPONIBILE**; nessuna soglia compilata. |
| Apertura / scadenza | **NON DISPONIBILI** nella pagina servizio consultata. |
| Stato | OPEN, perché l’avviso ufficiale collegato riporta APERTO; nessuna finestra temporale aggiunta. |
| Territorio | Il contratto deve riguardare un immobile nel Comune di Milano. `residenceRequired` resta null: la pagina consultata non stabilisce tale requisito come condizione distinta. |
| Requisiti economici e abitativi | Canone mensile superiore al 30% del reddito netto mensile del nucleo; contratto con almeno 24 mesi residui. |
| Età / lavoro | Destinatari descritti come giovani lavoratori “under 35”; la scheda usa anche “fino a 35 anni”. Nessun limite anagrafico è stato strutturato per questa ambiguità. |
| Modalità | Modulo online collegato alla scheda comunale. |

### Evidenza e documenti

La pagina del Comune descrive il contributo fino a €2.400, il contratto nell’immobile a Milano, la durata residua di 24 mesi e il rapporto canone/reddito. L’avviso istituzionale collegato indica stato APERTO e data emissione 31/07/2026: [pagina dell’avviso scegliMI](https://servizi.comune.milano.it/en/dettaglio-contenuto/-/asset_publisher/pqxq/content/sceglimi). Sono registrati anche l’[Avviso pubblico scegliMI (PDF, 18/08/2026)](https://servizi.comune.milano.it/documents/20121/377948422/Avviso+scegliMI_signed.pdf/11f5d714-6a73-6878-2841-500d9906f608?t=1787042162386) e le [FAQ (PDF, aggiornate al 19/08/2026; file datato 20/08/2026)](https://servizi.comune.milano.it/documents/20121/377948422/FAQ+da+pubblicare_19082026.pdf/71295d3d-88b4-fcae-d363-ca3175fe3e15?t=1787223689050). La pagina e i link PDF sono accessibili; il PDF Avviso ha restituito content type `application/pdf` ma non è stato estratto né confrontato col testo web. Nessuna divergenza documentale è stata dichiarata.

### Pipeline e revisione

- **Record / qualità / review:** REAL / TO_VERIFY / NEEDS_REVIEW
- **Normalizzazione:** OK; **validazione:** 0 errori, 1 warning (requisiti testuali); qualità raccomandata PARTIAL.
- **Approvabile:** sì solo dopo revisione umana; **approvata:** no.
- **ID:** `COMUNE-MILANO-SCEGLIMI-2026` è un identificativo tecnico interno, non un codice ufficiale del bando.
- **Fingerprint:** `["MUNICIPALITY","comune di milano","sceglimi sostegno all affitto per under 35","lombardia","milano","milano","https://www.comune.milano.it/servizi/casa/sceglimi-sostegno-all-affitto-per-under-35"]`
- **contentHash:** `73296bcd5e9d71ea118d93e2bf3f1ff85b8e242a28eeb6626f1881243e8a3a0f`
- **Conflitti:** nessuno nel set di revisione fornito; non è stato eseguito un confronto con catalogo/database.
- **Da rivedere:** inclusione dei 35 anni, requisiti completi nel PDF Avviso/FAQ, data di chiusura e modalità di calcolo/erogazione.

### Compatibilità eligibility

- **Supportati se modellati:** abitazione in affitto. Il campo `municipality` dell’engine riguarda però la residenza dell’utente, non l’ubicazione dell’immobile locato: non è sufficiente per valutare questo requisito.
- **Non supportati o da lasciare testuali:** durata residua del contratto, rapporto canone/reddito netto, definizione di “under 35/fino a 35” e condizione “lavoratore”.
- **Dati profilo da raccogliere in futuro:** età secondo la definizione approvata, impiego, Comune dell’immobile, durata residua, canone e reddito netto del nucleo. Nessun collegamento al motore in questo step.

## Riepilogo test e persistenza

- I tre CLI sono stati eseguiti localmente; ogni file ha prodotto una candidate accettata, senza errori, con un warning per requisiti non strutturati.
- Tutte restano `NEEDS_REVIEW`, `TO_VERIFY`; nessuna è stata approvata o salvata.
- Conflitti indicati come nessuno solo rispetto al set di revisione vuoto passato al CLI: non attestano unicità rispetto a un catalogo persistente.
- Le date `retrievedAt`/`lastVerifiedAt` e gli URL delle pagine e dei documenti sono conservati nelle fixture JSON.
- Nessun profilo utente, documento personale, dato d’idoneità o risultato eligibility è stato prodotto.

## Limiti e TODO

1. Revisione umana dei PDF ufficiali, dei requisiti non strutturati, delle date e degli importi.
2. Definire un flusso esplicito di approvazione e promozione, senza automatismi.
3. Decidere quali condizioni possono essere formalizzate; solo dopo, integrare consapevolmente l’eligibility engine.
4. Progettare la persistenza candidate/catalogo e le migrazioni separatamente.
5. Validare Prisma: CLI non disponibile; `prisma validate` resta **BLOCKED** per proxy HTTP 407. Nessuna migration e nessuna modifica al database.
6. Sostituire la dichiarazione locale `node:crypto` con `@types/node` quando il registry aziendale sarà accessibile.
