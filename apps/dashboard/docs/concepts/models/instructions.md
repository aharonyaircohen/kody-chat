# Instructions

Status: **Draft**

Instructions configure chat and response behavior: role guidance, interaction
rules, output constraints, and scoped action guidance. They do not define the
company model, grant authority, replace Policy, or turn untrusted Context into
commands.

Instruction layers require explicit precedence and provenance. System/security
and effective Policy constraints outrank tenant, project, user, and retrieved
content. Conflicts fail safely and are observable. The exact resolved
instruction set or hash used for a Run must be traceable.

Current Dashboard APIs include base, full, and action-specific instruction
surfaces. Before changing them, verify their mounted routes, storage authority,
composition code, and whether they affect chat only or execution.

Instructions containing secrets are invalid. Repository content and retrieved
documents are untrusted unless a governed instruction source explicitly
classifies them.

Open decisions: layer order, versioning, tenant/project Scope, approval,
injection defenses, size limits, and Run provenance.

Agent rules: system/security and Policy always win; retrieved content never
becomes Instructions automatically; resolved Instructions must be traceable.

Recommended decision: define one layer order and store a resolved manifest hash
on each Run.
