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

  it("activates the three Store managers on a 15-minute pilot cadence", () => {
    const config = JSON.parse(
      readFileSync(resolve(repoRoot, "kody.config.json"), "utf8"),
    );

    expect(config.company.activeAgents).toEqual(
      expect.arrayContaining(["ceo", "cto", "coo"]),
    );
    expect(config.company.activeCapabilities).toEqual(
      expect.arrayContaining([
        "company-portfolio-management",
        "agency-portfolio-management",
        "agency-operations-management",
        "ai-agency-health-matrix",
        "agency-supervisor",
        "ceo-performance-review",
      ]),
    );
    expect(config.company.activeGoals).toEqual(
      expect.arrayContaining([
        { template: "agency-evolution-loop", every: "15m" },
        { template: "agency-observer", every: "15m" },
        { template: "agency-operating-loop", every: "15m" },
        { template: "agency-supervision-loop", every: "1h" },
      ]),
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
