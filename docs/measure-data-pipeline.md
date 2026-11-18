# Pipeline dati delle misure

## Flusso

`fonti istituzionali → RawMeasure → normalizzazione → validazione → catalogo → eligibility`

- `src/data/sources/` contiene il registro centrale e i moduli per Regione Lombardia e Comune di Milano. Gli URL sono pagine ufficiali già presenti nel registro precedente; sono riferimenti da consultare manualmente, non endpoint di acquisizione. Le fonti sono disabilitate (`enabled: false`) e `lastChecked` resta `null`.
- `RawMeasure` è il dato in ingresso. `normalizeRawMeasure()` è pura: usa il contesto della fonte per autorità e territorio, conserva la provenienza e non sostituisce un URL di misura mancante con l’URL base della fonte.
- `source.documents` conserva URL, titolo e data (se disponibile) dei documenti ufficiali collegati alla pagina sorgente.
- `validateMeasure()` restituisce errori, avvisi, decisione di importazione e qualità raccomandata. Gli errori bloccano l’importazione; gli avvisi la consentono ma possono abbassare la qualità a `PARTIAL` o `TO_VERIFY`.
- `getMeasureFingerprint()` e `compareMeasures()` segnalano corrispondenze e conflitti. Non cancellano né sostituiscono record.
- Il motore eligibility esistente resta separato. Non convertire o valutare automaticamente una misura con requisiti testuali o non strutturati: prima occorre una revisione e la definizione esplicita di regole supportate.
- `src/services/ingestion/` fornisce un client HTTP conservativo per verificare una singola pagina alla volta e un import manuale che esegue normalizzazione, validazione, fingerprint e content hash. L’acquisizione HTTP non estrae HTML e quindi non crea record autonomamente.
- I record importati diventano `CandidateMeasure` con tipo `REAL`, `SAMPLE` o `DEMO` conservato e stato `PENDING` o `NEEDS_REVIEW`; la qualità `VERIFIED` in ingresso viene abbassata a `TO_VERIFY`. Errori di validazione e conflitti bloccano l’approvabilità. La modalità manuale non salva nel catalogo o nel database e non approva candidate.

Non esistono crawler, fetch automatici, database o servizi cloud in questo step. I record pilota si trovano in `src/data/samples/pilot-measures.ts`; sono placeholder tecnici, senza URL specifici di misura e quindi bloccati dalla validazione per l’importazione nel catalogo.

Il controllo di una fonte istituzionale effettua solo una GET esplicita quando chiamato dal codice. Limita la concorrenza a una richiesta, applica un intervallo conservativo, identifica lo User-Agent e limita i redirect ai domini configurati. Un HTTP 403 è `BLOCKED`, senza bypass; un HTTP 429 non viene ritentato.

Per un’importazione manuale, copiare il template vuoto `data/import/manual/template.json` in un nuovo file e compilare solo campi verificati sulla pagina istituzionale. I tre file `regione-lombardia-*.json` e `comune-milano-*.json` sono fixture del collaudo reale, non approvate:

```powershell
npm run ingest:manual -- data/import/manual/misura.json
```

Il comando stampa il candidato, gli errori/avvisi, il fingerprint e il content hash; non scrive file o database.

## Etichette

- `DEMO`: fixture sintetica dei test dell’eligibility engine. Non è una misura.
- `SAMPLE`: placeholder tecnico per provare questa pipeline. Non è una misura né un dato reale.
- `REAL`: record proposto come misura effettiva. Richiede fonte `OFFICIAL`, URL e data di ultima verifica; un record senza questi elementi non è importabile.

La qualità informativa è distinta dal tipo del record:

- `VERIFIED`: controllato con fonte ufficiale e data di verifica presente; non trasforma `DEMO` o `SAMPLE` in misure reali.
- `PARTIAL`: alcune informazioni o requisiti testuali non sono ancora strutturati.
- `TO_VERIFY`: placeholder, dati insufficienti o provenienza non ancora verificata.

Gli importi e le soglie ISEE sono rappresentati in centesimi di euro. I campi non disponibili restano `null`; i requisiti non ancora modellati si conservano in `unstructuredRequirements` o `otherRequirements`.

## TODO tecnici

- Sostituire `src/types/node-crypto.d.ts` con i tipi ufficiali `@types/node` quando il registry npm aziendale sarà disponibile.
- Validare `prisma/schema.prisma` con Prisma CLI quando sarà disponibile; attualmente `prisma validate` è bloccato perché il proxy aziendale restituisce HTTP 407. Nessuna migration è stata creata.
