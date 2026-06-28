/**
 * @testFramework vitest
 * @domain preview
 */
import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

const __dirname = dirname(fileURLToPath(import.meta.url));
const PREVIEW_BROWSER_PATH = resolve(
  __dirname,
  "../../src/dashboard/lib/components/PreviewBrowser.tsx",
);

const SOURCE = readFileSync(PREVIEW_BROWSER_PATH, "utf8");

describe("PreviewBrowser new-tab action", () => {
  it("renders an external-link icon that opens the iframe-ready preview URL", () => {
    expect(SOURCE).toMatch(/ExternalLink,?[\s\S]*from "lucide-react"/);
    expect(SOURCE).toMatch(
      /href=\{bypassedUrl\s*\?\?\s*activePreviewUrl\}[\s\S]*target="_blank"[\s\S]*rel="noopener noreferrer"[\s\S]*aria-label="Open preview in a new tab"[\s\S]*<ExternalLink/,
    );
  });
});
