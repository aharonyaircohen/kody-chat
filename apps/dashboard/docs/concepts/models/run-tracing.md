# Run tracing and provenance

Status: **Draft**

Every Run carries a unique ID, correlation ID, optional parent Run ID, pinned
origin/target/trace, selected Capability and Implementation, effective Policy
hash/snapshot, actor/tenant attribution, timestamps, events, outputs, and usage.

Correlation groups one business execution. Parent-child links describe the
execution tree. Pinned references describe the definition graph actually used.
These are complementary and must not be collapsed.

Events are append-only and ordered per Run with sequence numbers assigned by
the authoritative store. Outputs name producer, contract, creation time, and
content/reference integrity. Logs are diagnostic and are not a substitute for
domain events.

Secrets and sensitive inputs are redacted at ingestion; redaction must preserve
auditability through hashes or governed references. Trace context propagates
across processes and external adapters.

Open decisions: event schema, ordering guarantees, trace standard, redaction,
retention, and replay support.

Agent rule: correlation, parent-child lineage, and pinned definition trace are
separate required links. Never replace them with log text.

Recommended decision: assign monotonic event sequence numbers in Convex and
propagate W3C trace context to adapters.
