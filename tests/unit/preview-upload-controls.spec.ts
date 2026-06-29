/**
 * Source-level structural tests for Preview upload controls.
 *
 * The dashboard runs Vitest in node mode and does not include happy-dom /
 * @testing-library/react, so this follows the existing component structural-test
 * pattern.
 */
import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const PREVIEW_WORKSPACE_PATH = resolve(
  __dirname,
  "../../src/dashboard/lib/components/PreviewWorkspace.tsx",
);
const PREVIEW_ENV_SWITCHER_PATH = resolve(
  __dirname,
  "../../src/dashboard/lib/components/PreviewEnvSwitcher.tsx",
);
const WORKSPACE_SOURCE = readFileSync(PREVIEW_WORKSPACE_PATH, "utf8");
const SWITCHER_SOURCE = readFileSync(PREVIEW_ENV_SWITCHER_PATH, "utf8");

describe("Preview upload controls", () => {
  it("opens uploads through a native file input surface", () => {
    expect(WORKSPACE_SOURCE).toMatch(/<label[\s\S]*<input[\s\S]*type="file"/);
    expect(WORKSPACE_SOURCE).toMatch(
      /className="absolute inset-0 h-full w-full cursor-pointer opacity-0"/,
    );
    expect(WORKSPACE_SOURCE).not.toMatch(/role="button"/);
    expect(WORKSPACE_SOURCE).not.toMatch(/emptyUploadRef\.current\?\.click/);

    expect(SWITCHER_SOURCE).toMatch(/<label[\s\S]*<input[\s\S]*type="file"/);
    expect(SWITCHER_SOURCE).toMatch(
      /className="absolute inset-0 h-full w-full cursor-pointer opacity-0 disabled:cursor-not-allowed"/,
    );
    expect(SWITCHER_SOURCE).not.toMatch(/role="button"/);
    expect(SWITCHER_SOURCE).not.toMatch(/fileInputRef\.current\?\.click/);
  });

  it("clears the file input after each selection", () => {
    expect(WORKSPACE_SOURCE).toMatch(/e\.currentTarget\.value = ""/);
    expect(SWITCHER_SOURCE).toMatch(/e\.currentTarget\.value = ""/);
  });

  it("keeps a just-uploaded environment selected while config catches up", () => {
    expect(WORKSPACE_SOURCE).toMatch(/pendingSelectionRef/);
    expect(WORKSPACE_SOURCE).toMatch(/selectedId !== pendingSelectedId/);
    expect(WORKSPACE_SOURCE).toMatch(
      /selectionPath\("\/preview", pendingSelectedId\)/,
    );
    expect(WORKSPACE_SOURCE).toMatch(/pendingSelectionRef\.current = env\.id/);
  });
});
