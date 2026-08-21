import { describe, expect, it } from "vitest";

import {
  listBuiltinAgentFiles,
  readBuiltinAgentCapability,
} from "../src/builtin-agents";

describe("Operations Specialist workflow tools", () => {
  it("can discover, inspect, and run an existing workflow", () => {
    const specialist = listBuiltinAgentFiles().find(
      ({ slug }) => slug === "operations-specialist",
    );
    const capability = readBuiltinAgentCapability(
      specialist!.capabilities![0]!,
    );
    const tools = capability!.capabilityTools.map(({ name }) => name);

    expect(tools).toEqual(
      expect.arrayContaining([
        "list_workflows",
        "read_workflow",
        "run_workflow",
        "github_list_tree",
        "github_get_file",
        "github_search_code",
      ]),
    );
    expect(capability?.instructions).toMatch(/research.*before.*creating/i);
    expect(capability?.instructions).toMatch(/code_search_unavailable/i);
  });
});
