/**
 * @fileoverview Guard the Brain-specific full cleanup action in Live Machines.
 * @testFramework vitest
 * @domain fly
 */
import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

const __dirname = dirname(fileURLToPath(import.meta.url));
const SOURCE = readFileSync(
  resolve(__dirname, "../../src/dashboard/lib/components/FlyMachinesTable.tsx"),
  "utf8",
);

describe("Live Machines Brain deletion", () => {
  it("routes Brain deletion through full Brain cleanup", () => {
    expect(SOURCE).toContain('row.feature === "brain"');
    expect(SOURCE).toContain('fetch("/api/kody/brain/destroy"');
    expect(SOURCE).toContain("body: JSON.stringify({ appName: row.app })");
    expect(SOURCE).toContain("Turns off this Brain app");
  });
});
