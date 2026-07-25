# Migration and compatibility removal

Status: **Required P0 work**

The desired public model is Intent, Todo, Loop, Workflow, Capability, Agent, and
Run. Operation, Goal, and a public Implementation model remain only in the
published Engine contract and must not be restored to the Dashboard.

Required migration:

1. Publish the simplified Agency contract under a new version.
2. Choose one persisted Loop definition format and authority.
3. Migrate or delete existing old Intent, Operation, Goal, and Loop records.
4. Update Engine loaders and dispatch to the selected contract.
5. Remove old readers, writers, types, and routes.
6. Remove the `agency:intent` compatibility reader.
7. Consolidate duplicate Agent, Workflow, and Todo contracts.
8. Run Dashboard persistence, Engine, real LLM, Run-history, and browser
   journeys.

Do not add dual-read, dual-write, fallback, or automatic legacy inference.
Migration is complete only when old paths are absent.
