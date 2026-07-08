import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const DOCS_VIEW_SOURCE = readFileSync(
  resolve(process.cwd(), "src/dashboard/lib/components/DocsView.tsx"),
  "utf8",
);
const MARKDOWN_VIEWER_SOURCE = readFileSync(
  resolve(process.cwd(), "src/dashboard/lib/components/MarkdownViewer.tsx"),
  "utf8",
);

describe("docs RTL rendering", () => {
  it("renders selected docs with automatic markdown direction", () => {
    expect(DOCS_VIEW_SOURCE).toContain(
      'import { autoDirProps, rtlAwareMarkdownClassName } from "../text-direction";',
    );
    expect(DOCS_VIEW_SOURCE).toContain("<MarkdownPreview");
    expect(DOCS_VIEW_SOURCE).toContain("{...autoDirProps}");
    expect(DOCS_VIEW_SOURCE).toContain("text-start");
    expect(DOCS_VIEW_SOURCE).toContain("rtlAwareMarkdownClassName");
    expect(DOCS_VIEW_SOURCE).toContain("md:prose-base break-words");
  });

  it("keeps standalone markdown docs RTL-aware too", () => {
    expect(MARKDOWN_VIEWER_SOURCE).toContain("{...autoDirProps}");
    expect(MARKDOWN_VIEWER_SOURCE).toContain("text-start");
    expect(MARKDOWN_VIEWER_SOURCE).toContain("rtlAwareMarkdownClassName");
  });
});
