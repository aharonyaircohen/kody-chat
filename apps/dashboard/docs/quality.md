# Quality authoring

Quality describes a real user test without storing browser scripts.

## Model

- **Action:** one simple semantic user step and its expected result. Examples:
  `Enter the token`, `Send the message`, or `Reload the chat`. Do not combine
  goals with “and”, and do not write selectors or implementation commands.
- **Journey:** ordered Actions that complete one user goal. Examples: `Sign in`
  or `Use Kody`. A Journey must not repeat setup already owned by an earlier
  Journey in the same Scenario.
- **Scenario:** ordered Journeys that complete one full test, together with its
  starting conditions and required proof.
- **Quality Run:** the evidence and result produced automatically when the
  Scenario runs. Checking that the Quality Run exists is not a test Action.

## Authoring order

1. Write the Scenario's full user outcome.
2. Split it into distinct user goals; these are the Journeys.
3. Split each Journey into the smallest meaningful user steps; these are the
   Actions.
4. Remove repeated setup and bundled steps.

Keep Actions semantic so Kody can choose the correct controls from the live
page. Write `Submit sign-in`, not `Click #login-button`.
