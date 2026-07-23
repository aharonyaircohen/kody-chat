# Dashboard projections and health

Status: **Draft**

Dashboard shapes are read/edit projections over authoritative models. They may
join Definitions, State, and recent History for operators, but must not become
a competing domain model or persistence authority.

Every projection documents:

- authoritative source fields and join keys;
- computed fields and formula/version;
- freshness and loading/error/unknown behavior;
- permitted edits and command/API used;
- tenant and authorization checks;
- compatibility fields scheduled for removal.

Health is derived, not manually invented per component. A formula names its
signals, windows, thresholds, missing-data behavior, and precedence. `unknown`
is distinct from healthy. Operation health derives from owned Goal/Loop
signals; Loop health derives from eligibility and Run outcomes; execution
health derives from Run/Implementation evidence.

UI status labels such as blocked, stuck, waiting, or recorded must map to
documented domain State or projection rules. Browser verification must use the
actually mounted route and real API/persistence.

Open decisions: canonical health formulas, refresh/SLA, edit command model,
optimistic UI behavior, and compatibility projection removal.

