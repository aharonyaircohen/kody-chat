import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const packageRoot = resolve(__dirname, "../..");
const releaseRoot = resolve(packageRoot, "library");

function readReleaseFile(path: string): string {
  return readFileSync(resolve(releaseRoot, path), "utf8");
}

describe("external package boundary", () => {
  it("publishes only documented compiled entry points", () => {
    const manifest = JSON.parse(readReleaseFile("package.json")) as {
      files: string[];
      exports: Record<string, unknown>;
    };

    expect(manifest.files).toEqual([
      "dist",
      "styles.css",
      "README.md",
      "LICENSE",
    ]);
    expect(Object.keys(manifest.exports)).toEqual([
      ".",
      "./react",
      "./core",
      "./styles.css",
    ]);
  });

  it("declares public release metadata and React compatibility", () => {
    const manifest = JSON.parse(readReleaseFile("package.json")) as {
      license: string;
      peerDependencies: Record<string, string>;
      publishConfig: { access: string };
    };

    expect(manifest.license).toBe("MIT");
    expect(manifest.publishConfig.access).toBe("public");
    expect(manifest.peerDependencies).toEqual({
      react: ">=18 <20",
      "react-dom": ">=18 <20",
    });
    expect(readReleaseFile("LICENSE")).toContain("MIT License");
  });

  it("has no workspace or unpublished Kody runtime dependencies", () => {
    const manifestText = readReleaseFile("package.json");

    expect(manifestText).not.toContain("workspace:");
    expect(manifestText).not.toContain("@dashboard/");
    expect(manifestText).not.toContain("@kody-ade/agency");
  });

  it("keeps public source independent from Dashboard and Kody internals", () => {
    const publicSource = [
      readReleaseFile("src/core.ts"),
      readReleaseFile("src/react.tsx"),
      readReleaseFile("src/index.ts"),
    ].join("\n");

    expect(publicSource).not.toContain("@dashboard/");
    expect(publicSource).not.toContain("@kody-ade/");
  });
});
