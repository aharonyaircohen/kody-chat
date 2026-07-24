import { readFileSync } from "node:fs";

import { describe, expect, it } from "vitest";

const source = readFileSync(
  "src/dashboard/features/admin/components/CapabilitiesManager.tsx",
  "utf8",
);

describe("CapabilitiesManager trust control", () => {
  it("does not expose runnable trust on capability details", () => {
    expect(source).not.toContain("TrustLevelControl");
    expect(source).not.toContain("trustLevelForCapability");
    expect(source).not.toContain('trustSubjectKey("capability"');
    expect(source).not.toContain("trust.setTrustLevel");
    expect(source).not.toContain("capability: selected.slug");
  });

  it("uses the shared file manager instead of a capability-specific editor", () => {
    expect(source).toContain("FilesPage");
    expect(source).toContain("FilesTransport");
    expect(source).toContain('"@dashboard/features/file-manager"');
    expect(source).toContain("<FilesPage");
    expect(source).not.toContain("function CapabilityForm");
    expect(source).not.toContain("function AssetEditor");
    expect(source).not.toContain("function ContractEditor");
    expect(source).not.toContain("function FileItem");
    expect(source).not.toContain("function FolderItems");
  });

  it("keeps the exact four-part capability folder in the shared workspace", () => {
    expect(source).toContain("const root = detail.slug");
    for (const entry of ["instructions.md", "contract.json", "skills", "tools"]) {
      expect(source).toContain(entry);
    }
  });
});
