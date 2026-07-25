# Reports

Status: **Draft**

A Report is a retained presentation of Facts, Evidence, Artifacts, State, or
History for an audience and time window. It is a produced output/projection,
not an authoritative replacement for its sources.

A Report records report identity/type, tenant, subject references, source
revision/event range, generator and Run, generated time, format, content or
artifact reference, and freshness. Statements should link to source provenance.
Regeneration creates a new version; it does not rewrite the historical report.

Reports may be scheduled by a Loop targeting a reporting Workflow or
Capability. The Report itself owns no cadence. Access and redaction inherit the
strictest source requirements.

Current persistence exists in `packages/kody-backend/convex/reports.ts` with
Dashboard report routes/components. Their exact shape, versioning, and
authoritative source links remain to be verified.

Open decisions: report taxonomy, schema, retention, regeneration, delivery,
redaction, and whether Report needs domain identity or remains an Artifact
contract.

Agent rules: a Report cannot become the source for Facts it merely summarizes;
regeneration creates a new version; delivery cadence belongs to a Loop.

Recommended decision: keep Report as a typed Artifact until independent
lifecycle or editing proves it needs entity identity.
