import { readFileSync } from "node:fs";

import { describe, expect, it } from "vitest";

const source = readFileSync(
  "src/dashboard/lib/components/TrustLevelControl.tsx",
  "utf8",
);
describe("TrustLevelControl source", () => {
  it("renders the three visible runnable trust options", () => {
    expect(source).toContain("Require approval");
    expect(source).toContain("Kody can run");
    expect(source).toContain("Auto approval");
    expect(source).toContain('aria-label="Trust level"');
    expect(source).not.toContain("Kody can trigger");
    expect(source).not.toContain("Run without approval");
  });

  it("keeps each option selectable and visibly selected", () => {
    expect(source).toContain("aria-pressed={selected}");
    expect(source).toContain("onChange(option)");
    expect(source).toContain("pending && selected");
    expect(source).not.toContain('className="hidden');
    expect(source).not.toContain("sm:inline");
  });
});
