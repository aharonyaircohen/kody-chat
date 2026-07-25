import { describe, expect, it } from "vitest";

import {
  htmlPreviewDocument,
  isHtmlFile,
} from "@dashboard/features/file-manager/lib/html-preview";

describe("htmlPreviewDocument", () => {
  it("places a restrictive content policy before repository HTML", () => {
    const document = htmlPreviewDocument(
      "<!doctype html><html><body><h1>Preview</h1></body></html>",
    );

    expect(document).toMatch(
      /^<meta http-equiv="Content-Security-Policy" content="/,
    );
    expect(document).toContain("default-src 'none'");
    expect(document).toContain("style-src 'unsafe-inline'");
    expect(document).toContain("img-src data: blob:");
    expect(document).toContain("base-uri 'none'");
    expect(document).toContain("form-action 'none'");
    expect(document).toContain("<h1>Preview</h1>");
  });

  it("does not grant script or network access", () => {
    const document = htmlPreviewDocument("<script>unsafe()</script>");

    expect(document).not.toContain("script-src");
    expect(document).not.toContain("connect-src");
  });

  it("recognizes both HTML extensions case-insensitively", () => {
    expect(isHtmlFile("index.html")).toBe(true);
    expect(isHtmlFile("legacy.HTM")).toBe(true);
    expect(isHtmlFile("template.html.txt")).toBe(false);
  });
});
