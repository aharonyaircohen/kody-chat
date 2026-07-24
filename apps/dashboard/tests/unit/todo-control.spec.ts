import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const source = readFileSync(
  "src/dashboard/features/tasks/components/TodoControl.tsx",
  "utf8",
);

describe("finite Todo UI", () => {
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
