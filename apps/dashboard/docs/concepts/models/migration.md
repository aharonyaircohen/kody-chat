# Migration and compatibility removal

Status: **Draft**

Compatibility is temporary migration debt, not a second supported model.

For each legacy shape:

1. inventory every reader, writer, validator, route, job, UI projection,
   fallback, bootstrap, and dual-write;
2. classify fields into Definition, State, History, projection, or obsolete;
3. define stable identity and reversible backfill;
4. add target validation and observability;
5. backfill and reconcile counts/content;
6. switch writers, then readers;
7. reject new legacy writes;
8. remove inference, fallback, bootstrap, and dual-write;
9. run static, persistence, runtime, and browser proof;
10. record rollback and final removal evidence.

Do not call migration complete because a new table or API exists. Completion
requires zero live compatibility paths and verified authoritative data.
Irreversible deletion waits until backups, reconciliation, and rollback windows
are approved.

