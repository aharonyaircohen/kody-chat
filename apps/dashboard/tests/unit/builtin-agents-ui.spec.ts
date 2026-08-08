/**
 * @fileoverview Source contract for code-owned Agent presentation.
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

describe("built-in Agents UI", () => {
  it("uses the API roster instead of maintaining a second UI-only roster", () => {
    expect(SOURCE).not.toContain("BUILTIN_KODY_AGENT");
    expect(SOURCE).not.toContain("fileKody ??");
  });

  it("labels code-owned agents and prevents deletion while allowing overrides", () => {
    expect(SOURCE).toContain('member.source === "builtin"');
    expect(SOURCE).toContain("isCodeOwnedAgent");
    expect(SOURCE).toContain("saves a repo override");
  });
});
