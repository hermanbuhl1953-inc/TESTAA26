# Handoff per un LLM — Scadenzario

Aggiornato il 18 novembre 2026. Nota di contesto per riprendere il lavoro in questa repository.

## Prodotto e architettura

- L'app attiva è una PWA in HTML, CSS e JavaScript standard; non è necessario installare Flutter o Android Studio. I file Dart in `lib/` sono materiale precedente.
- L'interfaccia, lo stato, il calendario e i flussi sono in `index.html`, `styles.css` e `app.js`. Il manifest e la cache offline sono in `manifest.webmanifest` e `service-worker.js`.
- `node server.mjs` avvia server e API locali su `http://127.0.0.1:4173`. Per installazione PWA e service worker usare `localhost` o HTTPS, non aprire `index.html` con `file://`.
- Il backend in `backend/` controlla fonti istituzionali e gestisce proposte di modifica in staging. `OPENAI_API_KEY` è facoltativa: senza chiave il controllo manuale resta disponibile. Non aggiungere chiavi o altri segreti al repository.
- Il profilo e le scadenze personali sono salvati nel `localStorage` del browser; non ci sono account o sincronizzazione. Evitare di raccogliere o inserire dati personali/ISEE non necessari.
- Il catalogo web è in `assets/catalog/`. La pipeline TypeScript aggiunta in `src/` per acquisizione e normalizzazione misure è separata dall'interfaccia PWA: l'importazione manuale genera candidati, ma non scrive nel catalogo o nel database e non li approva.

Per una descrizione più completa consultare `README.md`, `docs/ARCHITETTURA_PWA.md` e `docs/measure-data-pipeline.md`.

## Dipendenze e comandi

- Node.js disponibile durante l'ultima verifica: v24.12.0 (il README richiede Node.js 22.3 o successivo).
- Le dipendenze npm sono dichiarate in `package.json` e bloccate in `package-lock.json`; `npm ci` è stato eseguito con successo e ha installato 7 pacchetti.
- Comandi verificati:
  - `node server.mjs` — avvio locale.
  - `npm run typecheck` — completato senza errori.
  - `npm run test:all` — 60 test superati, 0 falliti.
  - `npm run ingest:manual -- data/import/manual/<file>.json` — pipeline manuale, non persistente.
- La CLI Prisma non è stata verificata in questa sessione. La documentazione esistente segnala che `prisma validate` era bloccato dal proxy con HTTP 407; nessuna migration è stata creata.
- La PWA non richiede Flutter. Non aggiungere dipendenze di sistema o pacchetti Python alla runtime senza un requisito esplicito.

## Modifiche recenti

- La palette principale è stata portata da verde a Blue Navy: `--navy: #0a2540`, variante scura `#06182b` e chiara `#e8eff7`.
- Sono stati aggiornati componenti, focus e stati attivi in `styles.css`, colore del browser e tema PWA in `index.html`/`manifest.webmanifest`, icona SVG e PNG in `icons/`, e anteprima `anteprima-schermata.html`.
- Il renderer SVG Python provato per le icone dipendeva dalla libreria nativa Cairo non disponibile; le PNG sono state generate con Pillow. Questo non aggiunge una dipendenza runtime all'app.
- La palette primaria precedente è stata cercata nei file del progetto fuori da `node_modules/`; non restavano occorrenze dei vecchi token/valori principali.

## Attenzione al worktree

La repository non è pulita: sono presenti numerose modifiche e file non tracciati, inclusi `package.json`, `prisma/schema.prisma`, `docs/eligibility-engine.md`, `data/`, `src/`, `scripts/ingest-manual.mjs` e i test della pipeline. Preservarli: non usare comandi di reset/revert e non sovrascrivere modifiche senza prima esaminarle. Le modifiche di tema recenti riguardano soprattutto `styles.css`, `index.html`, `manifest.webmanifest`, `icons/` e `anteprima-schermata.html`.

## Indicazioni per proseguire

1. Controllare `git status --short` e leggere il file prima di modificare file già cambiati.
2. Per modifiche alla PWA intervenire sui file HTML/CSS/JS attivi, non sul Dart storico.
3. Tenere separati catalogo, candidati REAL e motore di eligibility: un candidato non equivale a una misura verificata o a un'approvazione.
4. Dopo cambiamenti eseguire il controllo più mirato possibile; per una verifica generale sono già disponibili `npm run typecheck` e `npm run test:all`.
