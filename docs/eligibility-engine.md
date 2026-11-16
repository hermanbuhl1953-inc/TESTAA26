# Rule Engine — dominio iniziale

Il modulo `src/domain/eligibility` valuta un `HouseholdProfile` rispetto alle regole strutturate di un `Benefit`; non dipende dalla UI, da Next.js, dal database o da servizi esterni. Le Zod schema validano gli input e il motore restituisce spiegazioni per ogni regola.

## Esiti

- `EXPIRED`: la misura non è ancora aperta oppure il termine è trascorso. Il messaggio distingue i due casi; le regole del profilo sono comunque valutate e restituite.
- `NOT_ELIGIBLE`: almeno una regola obbligatoria ha esito `FAIL`.
- `NEEDS_DATA`: nessuna regola obbligatoria è fallita, ma almeno un dato necessario è `MISSING`.
- `LIKELY`: le regole obbligatorie note sono soddisfatte, ma una regola facoltativa è fallita o non valutabile (`NOT_APPLICABLE`).
- `ELIGIBLE`: tutte le regole sono valutabili e passano.

Un dato mancante su una regola obbligatoria è `MISSING`; su una regola facoltativa è `NOT_APPLICABLE`. L’ISEE è memorizzato in centesimi di euro. Le età si riferiscono ai componenti esplicitamente marcati come adulti o figli; quando sono forniti, i totali adulti/figli devono coincidere con i componenti elencati.

Le sole fixture presenti nei test sono contrassegnate `DEMO`: non descrivono agevolazioni reali né attestano requisiti ufficiali. Il modello Prisma definisce le entità PostgreSQL, ma non include migrazioni o connessioni.
