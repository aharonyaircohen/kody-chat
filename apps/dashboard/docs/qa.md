# QA guide

Test the requested behavior from the user's point of view. Use judgment to
choose the environment, journeys, risks, and depth that fit the change.

Use the connected repository's available context when needed. Non-sensitive
test information may come from Kody Variables. Sensitive test information may
come from Kody Secrets, unlocked only inside the trusted runtime using
`KODY_MASTER_KEY`. Never expose secret values in test output or reports.

When QA needs repository authentication, use this convention:

- `KODY_LOGIN_REPO` — Kody Variable containing the full repository URL.
- `KODY_LOGIN_PASS` — Kody Secret containing the QA login credential.

The engine uses these values to prepare an authenticated browser session before
QA starts. QA receives the session, not `KODY_LOGIN_PASS` or `KODY_MASTER_KEY`.

Verify the real result, not only the implementation or automated checks. Report
what was tested, what happened, useful evidence, and anything that remains
uncertain or blocked.

See [Variables](./variables.md) and [Secrets vault](./secrets-vault.md) for
configuration details.
