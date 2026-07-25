import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const SOURCE = readFileSync(
  resolve(__dirname, "../../src/dashboard/lib/components/TriggersManager.tsx"),
  "utf8",
);

describe("TriggersManager data fetching", () => {
  it("queries triggers and user-state namespaces from the kody API", () => {
    expect(SOURCE).toContain('"/api/kody/triggers"');
    expect(SOURCE).toContain('"/api/kody/user-state"');
  });

  it("scopes query keys per repo so switching repos refetches", () => {
    expect(SOURCE).toContain('["kody-triggers", owner, repo] as const');
    expect(SOURCE).toContain(
      '["kody-user-state-namespaces", owner, repo] as const',
    );
  });

  it("only fetches once authenticated and sends auth headers", () => {
    expect(SOURCE).toContain("enabled: !!auth");
    expect(SOURCE).toContain("buildAuthHeaders(auth)");
  });

  it("surfaces API error details instead of a bare status code when available", () => {
    expect(SOURCE).toContain(
      "json.detail || json.message || json.error || `HTTP ${res.status}`",
    );
  });

  it("bypasses the browser cache on every fetch", () => {
    expect(SOURCE).toContain('cache: "no-store"');
  });
});

describe("TriggersManager listing", () => {
  it("shows a spinner while loading and an empty state with a hint otherwise", () => {
    expect(SOURCE).toContain("triggersQuery.isLoading");
    expect(SOURCE).toContain('title="No triggers yet"');
  });

  it("summarizes each trigger as event → namespace with a condition count", () => {
    expect(SOURCE).toContain("<code>{trigger.event}</code>");
    expect(SOURCE).toContain("<code>{trigger.action.namespace}</code>");
    expect(SOURCE).toContain("${trigger.conditions.length} condition(s)");
  });

  it("toggles enabled state by re-posting the trigger with enabled flipped", () => {
    expect(SOURCE).toContain(
      "trigger: { ...trigger, enabled: !trigger.enabled }",
    );
  });
});

describe("TriggersManager editor", () => {
  it("opens a blank editor defaulting to the first event and namespace", () => {
    expect(SOURCE).toContain("event: SYSTEM_EVENT_NAMES[0]");
    expect(SOURCE).toContain(
      "setEditor(emptyEditor(namespaces[0]?.name ?? \"\"))",
    );
    expect(SOURCE).toContain('conditionsJson: "[]"');
    expect(SOURCE).toContain('mapJson: "{}"');
  });

  it("prefills the editor from an existing trigger with pretty-printed JSON", () => {
    expect(SOURCE).toContain(
      "JSON.stringify(trigger.conditions, null, 2)",
    );
    expect(SOURCE).toContain("JSON.stringify(trigger.action.map, null, 2)");
  });

  it("slugifies the name into an id only for new triggers", () => {
    expect(SOURCE).toContain(
      "state.isNew ? slugifyTitle(state.name) : state.id",
    );
  });

  it("disables Save while pending or when name/namespace are missing", () => {
    expect(SOURCE).toContain("saveMutation.isPending ||");
    expect(SOURCE).toContain("!editor.name.trim() ||");
    expect(SOURCE).toContain("!editor.namespace");
  });

  it("updates editor state immutably via spread", () => {
    expect(SOURCE).toContain("setEditor({ ...editor, name: e.target.value })");
    expect(SOURCE).toContain("setEditor({ ...editor, event: value })");
  });
});

describe("TriggersManager validation and errors", () => {
  it("rejects invalid conditions/map JSON before hitting the API", () => {
    expect(SOURCE).toContain("JSON.parse(state.conditionsJson)");
    expect(SOURCE).toContain("JSON.parse(state.mapJson)");
    expect(SOURCE).toContain(
      'throw new Error("Conditions and map must be valid JSON")',
    );
  });

  it("toasts errors from every mutation", () => {
    const errorToasts = SOURCE.match(
      /onError: \(error: Error\) => toast\.error\(error\.message\)/g,
    );
    expect(errorToasts).toHaveLength(3);
  });

  it("closes the editor and refetches only on successful save", () => {
    expect(SOURCE).toContain('toast.success("Trigger saved")');
    expect(SOURCE).toContain("setEditor(null)");
    expect(SOURCE).toContain("void invalidate()");
  });
});

describe("TriggersManager deletion", () => {
  it("requires confirmation via ConfirmDialog before deleting", () => {
    expect(SOURCE).toContain("<ConfirmDialog");
    expect(SOURCE).toContain('confirmLabel="Delete"');
    expect(SOURCE).toContain(
      "deleteTarget && deleteMutation.mutate(deleteTarget.id)",
    );
  });

  it("deletes via DELETE with an encoded id and accepts 204 responses", () => {
    expect(SOURCE).toContain(
      "`/api/kody/triggers/${encodeURIComponent(id)}`",
    );
    expect(SOURCE).toContain('method: "DELETE"');
    expect(SOURCE).toContain("!res.ok && res.status !== 204");
  });
});
