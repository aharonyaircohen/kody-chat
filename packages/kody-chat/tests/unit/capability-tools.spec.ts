import { beforeEach, describe, expect, it, vi } from "vitest";

const capabilityFiles = vi.hoisted(() => ({
  listLocalCapabilityFiles: vi.fn(),
  readCapabilityFile: vi.fn(),
  writeCapabilityFile: vi.fn(),
  deleteCapabilityFile: vi.fn(),
}));
vi.mock("@kody-ade/agency/capabilities", () => ({
  listLocalCapabilityFiles: capabilityFiles.listLocalCapabilityFiles,
  readCapabilityFile: capabilityFiles.readCapabilityFile,
  writeCapabilityFile: capabilityFiles.writeCapabilityFile,
  deleteCapabilityFile: capabilityFiles.deleteCapabilityFile,
}));
vi.mock("@dashboard/lib/capabilities", () => ({
  isValidSlug: (slug: string) => /^[a-z0-9][a-z0-9_-]{0,63}$/.test(slug),
  PERMISSION_MODES: ["default", "acceptEdits", "plan", "bypassPermissions"],
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
    capabilityFiles.writeCapabilityFile.mockResolvedValue({ slug: "greet" });
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
        describe: "",
        instructions: "say hello",
        landing: "pr",
        model: "inherit",
        permissionMode: "acceptEdits",
        tools: [],
        skills: [],
        shellScripts: [],
      },
      {} as never,
    );
    expect(result).toMatchObject({
      ok: true,
      action: "created",
      slug: "greet",
    });
    expect(capabilityFiles.writeCapabilityFile).toHaveBeenCalled();
  });

  it("deletes and dispatches backend capabilities", async () => {
    capabilityFiles.readCapabilityFile.mockResolvedValue({
      slug: "greet",
      profileJson: "{}",
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
