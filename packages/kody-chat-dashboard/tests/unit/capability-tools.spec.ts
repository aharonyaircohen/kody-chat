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
        contract: { execution: "agent", input: {}, output: {} },
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
          "contract.json":
            '{\n  "execution": "agent",\n  "input": {},\n  "output": {}\n}\n',
        }),
      }),
    );
  });

  it("creates a script-backed capability with the fixed entrypoint", async () => {
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

    expect(capabilityFiles.writeCapabilityFolderFiles).toHaveBeenCalledWith(
      expect.objectContaining({
        slug: "greet-script",
        files: expect.objectContaining({
          "contract.json": expect.stringContaining('"execution": "script"'),
          "tools/run.sh": "#!/bin/sh\nprintf '{}'\n",
        }),
      }),
    );
    expect(
      capabilityFiles.writeCapabilityFolderFiles.mock.calls.at(-1)?.[0].files[
        "contract.json"
      ],
    ).toContain('"secrets":');
    expect(
      capabilityFiles.writeCapabilityFolderFiles.mock.calls.at(-1)?.[0].files[
        "contract.json"
      ],
    ).toContain('"timeoutMs": 1800000');
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
