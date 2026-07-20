import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const CORE_FILE_SURFACES = ["FileEditor.tsx", "FileViewer.tsx", "FileTree.tsx"];

describe("file workspace themes", () => {
  it("uses shared theme colors instead of fixed dark surfaces", () => {
    for (const file of CORE_FILE_SURFACES) {
      const source = readFileSync(
        resolve(process.cwd(), "src/dashboard/components/files", file),
        "utf8",
      );

      expect(source, file).not.toMatch(/bg-\[#(?:090909|101010)\]/);
      expect(source, file).not.toContain("border-white/");
      expect(source, file).not.toContain("text-white/");
    }
  });

  it("fills the shared page content area without generic page padding", () => {
    const source = readFileSync(
      resolve(process.cwd(), "src/dashboard/components/files/FilesPage.tsx"),
      "utf8",
    );

    expect(source).toContain('contentClassName="!p-0"');
  });
});
