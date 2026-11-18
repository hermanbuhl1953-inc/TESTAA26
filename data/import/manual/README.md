# Importazione manuale controllata

Copiare `template.json` in un nuovo file, mantenere `sourceId` tra quelli del registry e riportare solo contenuti verificati sulla pagina istituzionale. Non inserire dati personali.

Avvio:

```powershell
npm run ingest:manual -- data/import/manual/misura.json
```

Il comando normalizza e valida i record, calcola fingerprint e content hash e stampa candidate e conflitti. Non salva nel catalogo o nel database, non crea misure da una pagina 403 e non promuove candidate a `VERIFIED`. Lasciare `null` i valori non disponibili.

Il collaudo locale in questa cartella contiene tre record `REAL` tratti da pagine istituzionali specifiche, inizialmente `TO_VERIFY`. Sono candidate per revisione, non agevolazioni approvate o pubblicabili. Riferimenti, PDF ufficiali collegati e limiti di verifica sono documentati in [real-measures-pilot.md](../../../docs/real-measures-pilot.md). Le fixture `SAMPLE` restano separate in `src/data/samples/pilot-measures.ts`.
