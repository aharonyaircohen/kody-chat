# Loop implementation

Status: **Dashboard definition management works; Engine integration is P0**

## Dashboard

- Page: `/agent-loops`
- API: `/api/kody/loops`
- Validator: `packages/agency-domain/src/index.ts`
- Storage:
  `.kody-engine/definitions/loops/<id>/loop.json` in the selected GitHub
  repository

The Dashboard can list, create, update, and delete the simple Loop definition.

## Engine

The Engine pool runs an Agency tick immediately at startup and then on an
interval. `dispatchAgencyLoops` loads older versioned Agency definitions and
Loop state from the backend through `AgencyModelRepository`.

It does **not** read the Dashboard's
`.kody-engine/definitions/loops/<id>/loop.json` files.

For the older Engine Loop contract:

- manual dispatch works when explicitly requested;
- schedule intervals work;
- idempotency, approval, capacity, retries, and Run recording exist;
- event, webhook, and condition triggers return “not enabled yet”.

## Required integration

Choose one contract and persistence authority, publish it with a new package
version, update the Engine loader, and remove the other path. Do not add a
long-lived fallback or dual reader.

## Live verification

The feature is complete only when a Loop created in `/agent-loops` fires in the
real Engine, invokes its real Workflow/Capability and LLM, writes a Run, avoids
duplicate firing, and appears in the Dashboard after reload.
