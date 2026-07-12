/**
 * Unit tests for pure trigger evaluation
 * (@kody-ade/base/triggers/engine): matching, conditions, and action data
 * mapping.
 */
import { describe, it, expect } from "vitest";

import {
  resolveActionData,
  triggerMatches,
} from "@kody-ade/base/triggers/engine";
import type { TriggerConfig } from "@kody-ade/base/triggers/types";
import type { SystemEventEnvelope } from "@kody-ade/base/events/types";

function envelope(
  name: string,
  payload: Record<string, unknown>,
): SystemEventEnvelope {
  return {
    id: "e1",
    name,
    version: 1,
    occurredAt: "2026-07-12T10:00:00.000Z",
    userId: "client:jane@example.com",
    sessionId: "s-1",
    brand: { owner: "acme", repo: "shop" },
    source: "client",
    payload,
  };
}

function trigger(overrides: Partial<TriggerConfig> = {}): TriggerConfig {
  return {
    id: "t1",
    name: "Test",
    enabled: true,
    event: "ui.form.submitted",
    conditions: [],
    action: {
      type: "save-user-state",
      namespace: "selections",
      map: { formView: "payload.viewId" },
    },
    ...overrides,
  };
}

describe("triggerMatches", () => {
  it("matches on event name when enabled", () => {
    const event = envelope("ui.form.submitted", { viewId: "intake" });
    expect(triggerMatches(trigger(), event)).toBe(true);
    expect(triggerMatches(trigger({ enabled: false }), event)).toBe(false);
    expect(triggerMatches(trigger({ event: "page.viewed" }), event)).toBe(
      false,
    );
  });

  it("applies conditions (equals, not_equals, contains, exists)", () => {
    const event = envelope("ui.form.submitted", {
      viewId: "intake",
      fields: ["email", "name"],
    });
    const match = (conditions: TriggerConfig["conditions"]) =>
      triggerMatches(trigger({ conditions }), event);

    expect(match([{ path: "viewId", op: "equals", value: "intake" }])).toBe(
      true,
    );
    expect(match([{ path: "viewId", op: "equals", value: "other" }])).toBe(
      false,
    );
    expect(
      match([{ path: "viewId", op: "not_equals", value: "other" }]),
    ).toBe(true);
    expect(match([{ path: "fields", op: "contains", value: "email" }])).toBe(
      true,
    );
    expect(match([{ path: "missing", op: "exists" }])).toBe(false);
    expect(
      match([
        { path: "viewId", op: "equals", value: "intake" },
        { path: "missing", op: "exists" },
      ]),
    ).toBe(false);
  });
});

describe("resolveActionData", () => {
  it("maps payload paths, envelope fields, and literals; skips unresolved", () => {
    const event = envelope("ui.form.submitted", { viewId: "intake" });
    const data = resolveActionData(
      trigger({
        action: {
          type: "save-user-state",
          namespace: "selections",
          map: {
            view: "payload.viewId",
            what: "event.name",
            at: "event.occurredAt",
            session: "event.sessionId",
            fixed: "literal:yes",
            missing: "payload.nope",
          },
        },
      }),
      event,
    );
    expect(data).toEqual({
      view: "intake",
      what: "ui.form.submitted",
      at: "2026-07-12T10:00:00.000Z",
      session: "s-1",
      fixed: "yes",
    });
  });
});
