import { beforeEach, describe, expect, it, vi } from "vitest";

import { createCapabilityTools } from "../../app/api/kody/chat/tools/capability-tools";

const ctx = {
  owner: "acme",
  repo: "app",
  octokit: {
    rest: {
      repos: {
        get: vi.fn().mockResolvedValue({ data: { default_branch: "main" } }),
      },
      actions: { createWorkflowDispatch: vi.fn() },
    },
  },
  listCapabilities: vi.fn(),
  readCapability: vi.fn(),
  saveCapability: vi.fn(),
  removeCapability: vi.fn(),
  runCapability: vi.fn(),
};

describe("capability chat tools", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    ctx.listCapabilities.mockResolvedValue({ capabilities: [] });
    ctx.readCapability.mockResolvedValue({ capability: { slug: "greet" } });
    ctx.saveCapability.mockResolvedValue({ capability: { slug: "greet" } });
    ctx.removeCapability.mockResolvedValue({ success: true });
    ctx.runCapability.mockResolvedValue({ ok: true, capability: "greet" });
  });

  it("lists and reads local or active Store capabilities through the Dashboard API", async () => {
    const tools = createCapabilityTools(ctx as never);

    await tools.list_capabilities.execute!({}, {} as never);
    await tools.read_capability.execute!({ slug: "greet" }, {} as never);

    expect(ctx.listCapabilities).toHaveBeenCalledOnce();
    expect(ctx.readCapability).toHaveBeenCalledWith("greet");
  });

  it("saves the whole capability through the Dashboard API", async () => {
    const tools = createCapabilityTools(ctx as never);
    await tools.create_or_update_capability.execute!(
      {
        slug: "greet-script",
        instructions: "say hello deterministically",
        contract: {
          execution: "script",
          secrets: ["DEPLOY_TOKEN"],
          timeoutMs: 1_800_000,
          input: {},
          output: {},
        },
        tools: [{ path: "run.sh", content: "#!/bin/sh\nprintf '{}'\n" }],
        skills: [],
      },
      {} as never,
    );

    expect(ctx.saveCapability).toHaveBeenCalledWith({
      slug: "greet-script",
      instructions: "say hello deterministically",
      contract: expect.stringContaining('"execution": "script"'),
      tools: [{ path: "run.sh", content: "#!/bin/sh\nprintf '{}'\n" }],
      skills: [],
    });
  });

  it("removes or runs a capability through the Dashboard API", async () => {
    const tools = createCapabilityTools(ctx as never);

    await expect(
      tools.delete_capability.execute!({ slug: "greet" }, {} as never),
    ).resolves.toEqual({ success: true });
    await expect(
      tools.run_capability.execute!({ slug: "greet" }, {} as never),
    ).resolves.toMatchObject({ ok: true, capability: "greet" });

    expect(ctx.removeCapability).toHaveBeenCalledWith("greet");
    expect(ctx.runCapability).toHaveBeenCalledWith("greet");
  });
});
