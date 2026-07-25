import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const repoRoot = resolve(process.cwd(), "../..");

describe("kody-chat executive management activation", () => {
  it("identifies this repo as its own Kody company", () => {
    const config = JSON.parse(
      readFileSync(resolve(repoRoot, "kody.config.json"), "utf8"),
    );

    expect(config.github).toEqual({
      owner: "aharonyaircohen",
      repo: "kody-chat",
      operators: ["aguyaharonyair", "aharonyaircohen"],
    });
    expect(config).not.toHaveProperty("state");
  });

  it("activates the Kody captain on a 15-minute CI repair loop", () => {
    const config = JSON.parse(
      readFileSync(resolve(repoRoot, "kody.config.json"), "utf8"),
    );

    expect(config.company.activeAgents).toEqual(
      expect.arrayContaining(["kody"]),
    );
    expect(config.company.activeCapabilities).toEqual(
      expect.arrayContaining([
        "ci-health-check",
        "run",
        "review",
        "fix",
        "merge",
      ]),
    );
    expect(config.company.activeWorkflows).toEqual(
      expect.arrayContaining(["ci-repair"]),
    );
  });

  it("ships the standard root workflow with a 15-minute scheduler wake", () => {
    const workflow = readFileSync(
      resolve(repoRoot, ".github/workflows/kody.yml"),
      "utf8",
    );

    expect(workflow).toContain('cron: "*/15 * * * *"');
    expect(workflow).toContain("@kody-ade/kody-engine@latest");
  });
});
