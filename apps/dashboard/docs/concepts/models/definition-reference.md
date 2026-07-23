# Definition Reference and Revision

Status: **Draft** · Kind: **Shared contract**

Domain identity is `{ kind, id }`. Revision belongs to the immutable persistence
envelope, not the semantic definition.

```ts
interface DefinitionRef { kind: ReferenceKind; id: string }
interface PinnedDefinitionRef extends DefinitionRef { revision: string }
```

Definitions may use unpinned references to express a dependency on the current
compatible head. Runs must use pinned references for every
reproducibility-relevant definition. A revision is immutable; editing creates a
new revision and atomically advances a current head after validation.

Historical Runs remain valid if a head changes or a definition retires.
Deletion is blocked by live dependencies and never erases referenced History.
Cross-tenant references are invalid unless an explicit portable/shared contract
allows them.

Open decisions: revision identifier format, optimistic concurrency token,
compatibility ranges, head selection, and retention.

