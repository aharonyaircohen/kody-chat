import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const source = readFileSync(
  new URL(
    "../../src/dashboard/lib/components/SharedWorkManager.tsx",
    import.meta.url,
  ),
  "utf8",
);

describe("Shared Work page", () => {
  it("uses the approved master-detail layout with routable selection", () => {
    expect(source).toContain("MasterDetailShell");
    expect(source).toContain("/shared-work/${work.recordId}");
  });

  it("shows agent attribution, handoff, evidence, artifacts, and activity", () => {
    for (const content of [
      "updatedBy",
      "Handoff",
      "Evidence",
      "Artifacts",
      "Activity",
    ]) {
      expect(source).toContain(content);
    }
  });

  it("automatically refreshes agent updates and keeps approval decisions explicit", () => {
    expect(source).toContain("window.setInterval");
    expect(source).toContain("Approve and run");
    expect(source).toContain("Reject");
    expect(source).not.toContain("Create work");
    expect(source).not.toContain("Save work");
  });
});
