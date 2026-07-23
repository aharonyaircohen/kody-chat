# Definition versioning

Status: **Draft**

Each semantic definition has stable `{tenant, kind, id}` identity and immutable
revisions. A separate head selects the current revision. Editing validates a
new revision and advances the head atomically using optimistic concurrency.

Runs always pin revisions. Definitions may reference an unpinned current head
only where compatibility is acceptable; dispatch resolves and pins before
execution. Historical revisions remain readable for audit and replay.

Current Convex code contains both generic agency definition records selected by
creation order and separate definition head/version structures. These are two
version-selection systems and must not remain competing authorities.

Migration must choose one authority, backfill stable revision IDs, translate
references, switch every reader/writer, and remove timestamp/newest-record
inference. Concurrent edits must conflict rather than silently overwrite.

Open decisions: revision format, head schema, draft publication, compatibility,
rollback, retention, and cross-tenant portability.

