import { beforeEach, describe, expect, it, vi } from "vitest";

const capabilityFiles = vi.hoisted(() => ({
  listLocalCapabilityFiles: vi.fn(),
  readCapabilityFile: vi.fn(),
  writeCapabilityFolderFiles: vi.fn(),
  deleteCapabilityFile: vi.fn(),
}));
vi.mock("@kody-ade/agency/capabilities", () => ({
  listLocalCapabilityFiles: capabilityFiles.listLocalCapabilityFiles,
  readCapabilityFile: capabilityFiles.readCapabilityFile,
  writeCapabilityFolderFiles: capabilityFiles.writeCapabilityFolderFiles,
  deleteCapabilityFile: capabilityFiles.deleteCapabilityFile,
  isValidSlug: (slug: string) => /^[a-z0-9][a-z0-9_-]{0,63}$/.test(slug),
}));

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
};

describe("Convex capability chat tools", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    capabilityFiles.listLocalCapabilityFiles.mockResolvedValue([]);
    capabilityFiles.readCapabilityFile.mockResolvedValue(null);
    capabilityFiles.writeCapabilityFolderFiles.mockResolvedValue(undefined);
    capabilityFiles.deleteCapabilityFile.mockResolvedValue(undefined);
  });

  it("lists backend capabilities", async () => {
    capabilityFiles.listLocalCapabilityFiles.mockResolvedValue([
      { slug: "greet" },
    ]);
    const tools = createCapabilityTools(ctx as never);
    await expect(
      tools.list_capabilities.execute!({}, {} as never),
    ).resolves.toEqual({ capabilities: [{ slug: "greet" }] });
  });

  it("creates and updates a backend capability", async () => {
    const tools = createCapabilityTools(ctx as never);
    const result = await tools.create_or_update_capability.execute!(
      {
        slug: "greet",
        instructions: "say hello",
        contract: { input: {}, output: {} },
        tools: [],
        skills: [],
      },
      {} as never,
    );
    expect(result).toMatchObject({
      ok: true,
      action: "created",
      slug: "greet",
    });
    expect(capabilityFiles.writeCapabilityFolderFiles).toHaveBeenCalledWith(
      expect.objectContaining({
        slug: "greet",
        files: expect.objectContaining({
          "instructions.md": "say hello\n",
          "contract.json": '{\n  "input": {},\n  "output": {}\n}\n',
        }),
      }),
    );
  });

  it("deletes and dispatches backend capabilities", async () => {
    capabilityFiles.readCapabilityFile.mockResolvedValue({
      slug: "greet",
      instructions: "say hello",
    });
    const tools = createCapabilityTools(ctx as never);
    await expect(
      tools.delete_capability.execute!({ slug: "greet" }, {} as never),
    ).resolves.toMatchObject({ ok: true });
    await expect(
      tools.run_capability.execute!({ slug: "greet" }, {} as never),
    ).resolves.toMatchObject({ ok: true, capability: "greet" });
  });
});
