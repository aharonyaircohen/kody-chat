/**
 * @fileoverview Code-owned Agents remain editable through local overrides.
 * @testFramework vitest
 * @domain agents
 */
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

const SOURCE = readFileSync(
  join(process.cwd(), "src/dashboard/lib/components/AgentsControl.tsx"),
  "utf8",
);

describe("Kody agent editability", () => {
  it("no permanent read-only dead-end remains", () => {
    expect(SOURCE).not.toContain("Built-in · permanent");
    expect(SOURCE).not.toContain("never editable");
  });

  it("the built-in offers Edit and the first save creates a local override", () => {
    expect(SOURCE).toContain("Edit — saves a repo override");
    expect(SOURCE).toContain("isFileless");
    expect(SOURCE).toMatch(
      /createMutation\.mutate\(\s*\{\s*slug:\s*member\.slug,/,
    );
  });

  it("uses the API-resolved roster as the single source of truth", () => {
    expect(SOURCE).toContain("const agent = rawStaff");
    expect(SOURCE).not.toContain("BUILTIN_KODY_AGENT");
  });
});
