import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const FILE_EDITOR_SOURCE = readFileSync(
  resolve(process.cwd(), "src/dashboard/components/files/FileEditor.tsx"),
  "utf8",
);
const MARKDOWN_VIEWER_SOURCE = readFileSync(
  resolve(process.cwd(), "src/dashboard/lib/components/MarkdownViewer.tsx"),
  "utf8",
);

describe("docs RTL rendering", () => {
  it("renders selected docs with automatic markdown direction", () => {
    expect(FILE_EDITOR_SOURCE).toContain("<MarkdownPreview");
    expect(FILE_EDITOR_SOURCE).toContain("{...autoDirProps}");
    expect(FILE_EDITOR_SOURCE).toContain("text-start");
    expect(FILE_EDITOR_SOURCE).toContain("rtlAwareMarkdownClassName");
    expect(FILE_EDITOR_SOURCE).toContain("break-words text-start md:prose-lg");
  });

  it("keeps standalone markdown docs RTL-aware too", () => {
    expect(MARKDOWN_VIEWER_SOURCE).toContain("{...autoDirProps}");
    expect(MARKDOWN_VIEWER_SOURCE).toContain("text-start");
    expect(MARKDOWN_VIEWER_SOURCE).toContain("rtlAwareMarkdownClassName");
  });
});
