import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

const workspaceSource = readFileSync(
  join(
    process.cwd(),
    "src/dashboard/features/previews/components/PreviewWorkspace.tsx",
  ),
  "utf8",
);

describe("localhost preview boundary", () => {
  it("does not silently embed an external saved preview on localhost", () => {
    expect(workspaceSource).toContain("isExternalPreviewOnLocalhost");
    expect(workspaceSource).toContain("External preview blocked on localhost");
    expect(workspaceSource).toContain("previewBaseUrl");
    expect(workspaceSource).toContain("Open saved preview externally");
  });
});
