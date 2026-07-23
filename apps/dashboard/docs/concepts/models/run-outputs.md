# Fact, Evidence, and Artifact

Status: **Draft** · Kind: **History value**

Run outputs are typed, attributable records.

```ts
interface RunOutput {
  kind: "fact" | "evidence" | "artifact";
  key: string;
  value: unknown;
  runId: string;
  producer: DefinitionRef;
  parentRef?: PinnedDefinitionRef & { kind: "goal" | "loop" };
  contract: string;
  createdAt: string;
}
```

A Fact is a claimed observation. Evidence is a Fact or verification result
accepted against a named proof contract. An Artifact is a produced durable
object or reference. The same value must not be promoted from Fact to Evidence
without evaluation.

Outputs are append-only, tenant-scoped, linked to a Run, and retain producer
and contract provenance. Large or sensitive payloads may be stored externally,
but the immutable record keeps a content hash and governed reference.

Open decisions: contract registry, schemas, content addressing, redaction,
retention, freshness, supersession, and Evidence acceptance authority.

