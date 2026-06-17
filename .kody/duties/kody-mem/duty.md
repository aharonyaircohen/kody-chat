Persistent memory management. Use this when the user gives feedback, corrects a choice, shares a project fact, or the persona's memory triggers fire.

**Skills:**
- `memory` — apply the `.kody/memory/` index, use `recall` / `recall_search` / `list_memories` as needed, and `remember` / `update_memory` on every trigger

**Triggers (must `remember` in same turn):** explicit memory command ("remember X", "store this", "save this for later") → choose type by content; correction → `feedback`; confirmation of non-obvious choice → `feedback`; project fact not in code/git → `project`; external pointer (Linear, Grafana) → `reference`; user profile → `user`.
