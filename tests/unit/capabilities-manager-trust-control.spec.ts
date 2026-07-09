import { readFileSync } from "node:fs";

import { describe, expect, it } from "vitest";

const source = readFileSync(
  "src/dashboard/lib/components/CapabilitiesManager.tsx",
  "utf8",
);

describe("CapabilitiesManager trust control", () => {
  it("renders the shared trust-level control on capability details", () => {
    expect(source).toContain("TrustLevelControl");
    expect(source).toContain("trustLevelForCapability");
    expect(source).toContain('trustSubjectKey("capability"');
    expect(source).toContain("trust.setTrustLevel");
    expect(source).toContain("capability: selected.slug");
  });
});
