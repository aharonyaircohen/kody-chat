import { describe, expect, it } from "vitest";

import {
  BUILTIN_SPECIALIST_SLUGS,
  listBuiltinAgentFiles,
  readBuiltinAgentCapability,
} from "../src/builtin-agents";

describe("built-in Kody specialists", () => {
  it("ships Kody with the seven focused specialists assigned", () => {
    const agents = listBuiltinAgentFiles();
    const kody = agents.find((agent) => agent.slug === "kody");

    expect(agents).toHaveLength(8);
    expect(new Set(agents.map((agent) => agent.slug)).size).toBe(8);
    expect(kody?.subagents).toEqual(BUILTIN_SPECIALIST_SLUGS);
    expect(kody?.lockedSubagents).toEqual(BUILTIN_SPECIALIST_SLUGS);
    expect(agents).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ slug: "context-scout" }),
        expect.objectContaining({ slug: "repository-analyst" }),
        expect.objectContaining({ slug: "operations-specialist" }),
        expect.objectContaining({ slug: "agency-specialist" }),
        expect.objectContaining({ slug: "system-admin" }),
        expect.objectContaining({ slug: "ui-vibe-specialist" }),
        expect.objectContaining({ slug: "cto", title: "CTO" }),
      ]),
    );
  });

  it("gives the built-in CTO read-only evidence tools and project-health ownership", () => {
    const cto = listBuiltinAgentFiles().find(({ slug }) => slug === "cto");
    const capability = readBuiltinAgentCapability(cto!.capabilities![0]!);
    const tools = capability!.capabilityTools.map(({ name }) => name);

    expect(cto).toMatchObject({
      title: "CTO",
      source: "builtin",
      readOnly: true,
      whenToUse: expect.stringContaining("project health"),
    });
    expect(cto?.capabilities).toEqual([
      "builtin-agent-cto",
      "assess-architecture",
      "assess-code-quality",
      "assess-security",
      "assess-test-reliability",
      "assess-delivery-system",
      "assess-operational-readiness",
      "assess-scalability",
      "assess-repository-history",
      "assess-team-capacity",
      "assess-continuous-product-qa",
    ]);
    for (const slug of cto!.capabilities!.slice(1)) {
      const assessment = readBuiltinAgentCapability(slug);
      expect(assessment, slug).not.toBeNull();
      expect(assessment?.instructions, slug).toMatch(
        /current repository evidence/i,
      );
      expect(assessment?.capabilityTools, slug).toEqual([]);
    }
    expect(capability?.instructions).toContain("maintainability");
    expect(cto?.body).toContain(
      "architecture and domain models are simple, cohesive, and clearly owned",
    );
    expect(cto?.body).toContain(
      "responsibilities and boundaries are separated without duplication",
    );
    expect(cto?.body).toContain(
      "code is readable, consistent, testable, and maintainable",
    );
    expect(cto?.body).toContain(
      "meet expected growth without unnecessary complexity",
    );
    expect(cto?.body).toContain("pragmatic, not dogmatic");
    expect(cto?.body).toContain("reuse before adding");
    expect(cto?.body).toContain("premature abstraction");
    expect(cto?.body).toContain("needless fragmentation");
    expect(cto?.body).toContain(
      "Preserve consistency with established project patterns",
    );
    expect(tools).toEqual(
      expect.arrayContaining([
        "github_list_tree",
        "github_get_file",
        "github_search_code",
        "github_blame",
        "github_commits_for_path",
        "github_list_commits",
        "github_list_workflow_runs",
        "github_get_pull_request",
        "github_list_issues",
      ]),
    );
    expect(tools).not.toEqual(
      expect.arrayContaining([
        "github_comment_on_issue",
        "create_feature",
        "request_release",
      ]),
    );
  });

  it("keeps every built-in read-only and gives each specialist scoped actions", () => {
    const agents = listBuiltinAgentFiles();

    for (const agent of agents) {
      expect(agent.source).toBe("builtin");
      expect(agent.readOnly).toBe(true);
    }

    for (const specialist of agents.filter(
      ({ slug }) => slug !== "kody" && slug !== "cto",
    )) {
      expect(specialist.whenToUse).toBeTruthy();
      expect(specialist.capabilities).toHaveLength(1);
      const capability = readBuiltinAgentCapability(
        specialist.capabilities![0]!,
      );
      expect(capability?.instructions).toContain(specialist.title);
      expect(capability?.capabilityTools.length).toBeGreaterThan(0);
    }
  });

  it("does not give presentation renderers to a specialist", () => {
    const specialistTools = listBuiltinAgentFiles()
      .filter(({ slug }) => slug !== "kody")
      .flatMap(({ capabilities }) =>
        capabilities!.flatMap(
          (slug) =>
            readBuiltinAgentCapability(slug)?.capabilityTools.map(
              ({ name }) => name,
            ) ?? [],
        ),
      );

    expect(specialistTools).not.toContain("final_answer");
    expect(specialistTools).not.toContain("show_view");
  });

  it("gives the single Agency Specialist workflow governance and execution tools", () => {
    const specialist = listBuiltinAgentFiles().find(
      ({ slug }) => slug === "agency-specialist",
    );
    const capability = readBuiltinAgentCapability(
      specialist!.capabilities![0]!,
    );
    const tools = capability!.capabilityTools.map(({ name }) => name);

    expect(tools).toEqual(
      expect.arrayContaining([
        "list_agents",
        "list_capabilities",
        "list_workflows",
        "read_workflow",
        "run_workflow",
        "list_loops",
        "list_intents",
        "list_todo_lists",
        "list_agency_runs",
        "read_agency_run",
      ]),
    );
  });
});
