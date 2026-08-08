import { describe, expect, it, vi } from "vitest";

import { orchestratePublicAgentTurn } from "../../app/api/kody/chat/kody/public-agent-orchestrator";

const agents = [
  {
    slug: "agency-specialist",
    title: "Agency Specialist",
    body: "Owns Agency configuration.",
    capabilities: ["manage-agency"],
  },
];

const capabilities = [
  {
    instructions: "Manage Agency safely.",
    capabilityTools: [{ name: "update_agent" }],
  },
];

const availableTools = {
  update_agent: { description: "update Agent" },
  inspect_repository: { description: "inspect repository" },
  show_view: { description: "render a view" },
  final_answer: { description: "answer" },
};

describe("public Agent orchestrator", () => {
  it("keeps claimed specialist tools away from Kody on a self-routed turn", async () => {
    const result = await orchestratePublicAgentTurn({
      userText: "Hello",
      assignedAgents: agents,
      availableTools,
      outputToolNames: ["show_view", "final_answer"],
      loadCapabilities: vi.fn(async () => capabilities),
      route: vi.fn(async () => ({ mode: "self" as const })),
      invoke: vi.fn(),
    });

    expect(result.parentTools).toEqual({
      inspect_repository: availableTools.inspect_repository,
      show_view: availableTools.show_view,
      final_answer: availableTools.final_answer,
    });
    expect(result.results).toEqual([]);
  });

  it("runs selected specialists and leaves Kody only presentation tools", async () => {
    const invoke = vi.fn(async ({ agent, task, tools }) => ({
      status: "completed" as const,
      agent: agent.slug,
      result: `${task}:${Object.keys(tools).join(",")}`,
    }));
    const result = await orchestratePublicAgentTurn({
      userText: "Update the Agency",
      assignedAgents: agents,
      availableTools,
      outputToolNames: ["show_view", "final_answer"],
      loadCapabilities: vi.fn(async () => capabilities),
      route: vi.fn(async () => ({
        mode: "delegate" as const,
        assignments: [
          { agent: "agency-specialist", task: "Update the Agency" },
        ],
      })),
      invoke,
    });

    expect(invoke).toHaveBeenCalledWith({
      agent: agents[0],
      task: "Update the Agency",
      capabilities,
      tools: { update_agent: availableTools.update_agent },
    });
    expect(result.parentTools).toEqual({
      show_view: availableTools.show_view,
      final_answer: availableTools.final_answer,
    });
    expect(result.results).toEqual([
      {
        status: "completed",
        agent: "agency-specialist",
        result: "Update the Agency:update_agent",
      },
    ]);
  });

  it("restores Kody's tools when every delegated Agent fails", async () => {
    const result = await orchestratePublicAgentTurn({
      userText: "Update the Agency",
      assignedAgents: agents,
      availableTools,
      outputToolNames: ["show_view", "final_answer"],
      loadCapabilities: vi.fn(async () => capabilities),
      route: vi.fn(async () => ({
        mode: "delegate" as const,
        assignments: [
          { agent: "agency-specialist", task: "Update the Agency" },
        ],
      })),
      invoke: vi.fn(async () => ({
        status: "failed" as const,
        agent: "agency-specialist",
        failure: {
          code: "provider_error" as const,
          detail: "specialist unavailable",
        },
      })),
    });

    expect(result.parentTools).toEqual(availableTools);
    expect(result.results[0]).toMatchObject({
      status: "failed",
      agent: "agency-specialist",
      failure: {
        code: "provider_error",
        detail: "specialist unavailable",
      },
    });
  });
});
