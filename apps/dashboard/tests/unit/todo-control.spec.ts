import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const source = readFileSync(
  "src/dashboard/features/tasks/components/TodoControl.tsx",
  "utf8",
);

describe("finite Todo UI", () => {
  it("keeps the previous list-and-card experience instead of a full-page form", () => {
    expect(source).toContain('const headerTitle = selected?.title ?? "Todos";');
    expect(source).toContain("title={headerTitle}");
    expect(source).toContain('aria-label="New todo"');
    expect(source).toContain('aria-label="Edit todo"');
    expect(source).toContain('aria-label="Delete todo"');
    expect(source).toContain("ChecklistItemCard");
    expect(source).toContain("TodoEditorDialog");
    expect(source).toContain("lg:grid-cols-[280px_minmax(0,1fr)]");
    expect(source).not.toContain('<form\n            className="space-y-5"');
  });

  it("edits only the finite Todo fields", () => {
    for (const field of [
      "Outcome",
      "Checklist",
      "Evidence",
      "Blockers",
      "Related Runs",
    ]) {
      expect(source).toContain(field);
    }
    expect(source).not.toContain("managed");
    expect(source).not.toContain("schedule");
    expect(source).not.toContain("workflow");
  });
});
