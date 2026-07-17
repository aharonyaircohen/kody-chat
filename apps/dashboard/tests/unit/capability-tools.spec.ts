import { beforeEach, describe, expect, it, vi } from "vitest";

import { createCapabilityTools } from "../../app/api/kody/chat/tools/capability-tools";

const listCapabilityFiles = vi.fn();
const readCapabilityFile = vi.fn();
const writeCapabilityFile = vi.fn();
const deleteCapabilityFile = vi.fn();
const composeProfile = vi.fn();
const validateProfile = vi.fn();

vi.mock("@dashboard/lib/capabilities", () => ({
  listCapabilityFiles: (...args: unknown[]) => listCapabilityFiles(...args),
  readCapabilityFile: (...args: unknown[]) => readCapabilityFile(...args),
  writeCapabilityFile: (...args: unknown[]) => writeCapabilityFile(...args),
  deleteCapabilityFile: (...args: unknown[]) => deleteCapabilityFile(...args),
  isValidSlug: (slug: string) => /^[a-z0-9][a-z0-9-]*$/.test(slug),
  composeProfile: (...args: unknown[]) => composeProfile(...args),
  validateProfile: (...args: unknown[]) => validateProfile(...args),
  PERMISSION_MODES: ["default", "acceptEdits", "bypassPermissions"] as const,
}));

vi.mock("@dashboard/lib/thread-link", () => ({
  dashboardCapabilityUrl: (slug: string) => `https://dash.test/capabilities/${slug}`,
}));

function makeOctokit() {
  return {
    rest: {
      repos: {
        get: vi.fn().mockResolvedValue({ data: { default_branch: "main" } }),
      },
      actions: {
        createWorkflowDispatch: vi.fn().mockResolvedValue({ data: {} }),
      },
    },
  };
}

type Tools = Record<
  string,
  { execute: (input: unknown) => Promise<Record<string, unknown>> }
>;

function makeTools(octokit = makeOctokit()) {
  const tools = createCapabilityTools({
    octokit: octokit as never,
    owner: "acme",
    repo: "app",
  }) as unknown as Tools;
  return { tools, octokit };
}

beforeEach(() => {
  vi.clearAllMocks();
  validateProfile.mockReturnValue([]);
  composeProfile.mockImplementation((fields: unknown) => fields);
});

describe("read_capability_creation_guide", () => {
  it("returns a non-empty guide and points at the creation tool", async () => {
    const { tools } = makeTools();
    const result = await tools.read_capability_creation_guide.execute({});
    expect(result.canCreateCapability).toBe(true);
    expect(result.creationTool).toBe("create_or_update_capability");
    expect(String(result.guide).length).toBeGreaterThan(50);
  });
});

describe("list_capabilities", () => {
  it("returns the capability list", async () => {
    listCapabilityFiles.mockResolvedValue([{ slug: "greet" }]);
    const { tools } = makeTools();
    expect(await tools.list_capabilities.execute({})).toEqual({
      capabilities: [{ slug: "greet" }],
    });
  });

  it("returns the error message when listing fails", async () => {
    listCapabilityFiles.mockRejectedValue(new Error("state repo missing"));
    const { tools } = makeTools();
    expect(await tools.list_capabilities.execute({})).toEqual({
      error: "state repo missing",
    });
  });
});

describe("read_capability", () => {
  it("rejects invalid slugs", async () => {
    const { tools } = makeTools();
    expect(await tools.read_capability.execute({ slug: "Bad Slug!" })).toEqual({
      error: 'invalid slug "Bad Slug!"',
    });
    expect(readCapabilityFile).not.toHaveBeenCalled();
  });

  it("reports a missing capability", async () => {
    readCapabilityFile.mockResolvedValue(null);
    const { tools } = makeTools();
    expect(await tools.read_capability.execute({ slug: "ghost" })).toEqual({
      error: 'capability "ghost" not found',
    });
  });

  it("returns the full capability", async () => {
    readCapabilityFile.mockResolvedValue({ slug: "greet", profileJson: "{}" });
    const { tools } = makeTools();
    expect(await tools.read_capability.execute({ slug: "greet" })).toEqual({
      capability: { slug: "greet", profileJson: "{}" },
    });
  });
});

describe("create_or_update_capability", () => {
  const input = {
    slug: "greet",
    describe: "Say hello",
    instructions: "Greet the user.",
    landing: "pr",
    model: "inherit",
    permissionMode: "acceptEdits",
    tools: ["Read"],
    skills: [{ name: "hello", body: "# hello" }],
    shellScripts: [{ name: "setup.sh", content: "echo hi" }],
  };

  it("rejects invalid slugs before any IO", async () => {
    const { tools } = makeTools();
    expect(
      await tools.create_or_update_capability.execute({
        ...input,
        slug: "UPPER",
      }),
    ).toEqual({ error: 'invalid slug "UPPER"' });
    expect(readCapabilityFile).not.toHaveBeenCalled();
    expect(writeCapabilityFile).not.toHaveBeenCalled();
  });

  it("rejects profiles that fail validation", async () => {
    validateProfile.mockReturnValue(["bad model", "bad tool"]);
    const { tools } = makeTools();
    expect(await tools.create_or_update_capability.execute(input)).toEqual({
      error: "invalid profile: bad model; bad tool",
    });
    expect(writeCapabilityFile).not.toHaveBeenCalled();
  });

  it("creates a new capability when none exists", async () => {
    readCapabilityFile.mockResolvedValue(null);
    writeCapabilityFile.mockResolvedValue(undefined);
    const { tools } = makeTools();

    const result = await tools.create_or_update_capability.execute(input);

    expect(result).toEqual({
      ok: true,
      action: "created",
      slug: "greet",
      htmlUrl: "https://dash.test/capabilities/greet",
    });
    expect(writeCapabilityFile).toHaveBeenCalledWith(
      expect.objectContaining({
        isUpdate: false,
        removedSkills: [],
        removedShellScripts: [],
        fields: expect.objectContaining({
          slug: "greet",
          prompt: "Greet the user.",
          skills: ["hello"],
          shellScripts: ["setup.sh"],
        }),
      }),
    );
  });

  it("computes removed skills and scripts on update", async () => {
    readCapabilityFile.mockResolvedValue({
      skills: [{ name: "hello" }, { name: "old-skill" }],
      shellScripts: [{ name: "setup.sh" }, { name: "old.sh" }],
    });
    writeCapabilityFile.mockResolvedValue(undefined);
    const { tools } = makeTools();

    const result = await tools.create_or_update_capability.execute(input);

    expect(result).toMatchObject({ ok: true, action: "updated" });
    expect(writeCapabilityFile).toHaveBeenCalledWith(
      expect.objectContaining({
        isUpdate: true,
        removedSkills: ["old-skill"],
        removedShellScripts: ["old.sh"],
      }),
    );
  });

  it("surfaces write failures as errors", async () => {
    readCapabilityFile.mockResolvedValue(null);
    writeCapabilityFile.mockRejectedValue(new Error("commit failed"));
    const { tools } = makeTools();
    expect(await tools.create_or_update_capability.execute(input)).toEqual({
      error: "commit failed",
    });
  });
});

describe("delete_capability", () => {
  it("rejects invalid slugs", async () => {
    const { tools } = makeTools();
    expect(await tools.delete_capability.execute({ slug: "no/slash" })).toEqual(
      { error: 'invalid slug "no/slash"' },
    );
  });

  it("reports a missing capability without deleting", async () => {
    readCapabilityFile.mockResolvedValue(null);
    const { tools } = makeTools();
    expect(await tools.delete_capability.execute({ slug: "ghost" })).toEqual({
      error: 'capability "ghost" not found',
    });
    expect(deleteCapabilityFile).not.toHaveBeenCalled();
  });

  it("deletes an existing capability", async () => {
    readCapabilityFile.mockResolvedValue({ slug: "greet" });
    deleteCapabilityFile.mockResolvedValue(undefined);
    const { tools } = makeTools();
    expect(await tools.delete_capability.execute({ slug: "greet" })).toEqual({
      ok: true,
      action: "deleted",
      slug: "greet",
    });
  });

  it("surfaces delete failures", async () => {
    readCapabilityFile.mockResolvedValue({ slug: "greet" });
    deleteCapabilityFile.mockRejectedValue(new Error("locked"));
    const { tools } = makeTools();
    expect(await tools.delete_capability.execute({ slug: "greet" })).toEqual({
      error: "locked",
    });
  });
});

describe("run_capability", () => {
  it("dispatches kody.yml with the action from profile.json", async () => {
    readCapabilityFile.mockResolvedValue({
      profileJson: JSON.stringify({ action: "greet-users", name: "Greeter" }),
    });
    const { tools, octokit } = makeTools();

    const result = await tools.run_capability.execute({ slug: "greet" });

    expect(octokit.rest.actions.createWorkflowDispatch).toHaveBeenCalledWith({
      owner: "acme",
      repo: "app",
      workflow_id: "kody.yml",
      ref: "main",
      inputs: { capability: "greet-users" },
    });
    expect(result).toEqual({
      ok: true,
      workflowId: "kody.yml",
      ref: "main",
      action: "greet-users",
      capability: "greet",
    });
  });

  it("falls back to the profile name, then the slug", async () => {
    readCapabilityFile.mockResolvedValue({
      profileJson: JSON.stringify({ name: "Greeter" }),
    });
    const { tools } = makeTools();
    expect(
      (await tools.run_capability.execute({ slug: "greet" })).action,
    ).toBe("Greeter");

    readCapabilityFile.mockResolvedValue({ profileJson: "not-json{" });
    const { tools: tools2 } = makeTools();
    expect(
      (await tools2.run_capability.execute({ slug: "greet" })).action,
    ).toBe("greet");
  });

  it("reports a missing capability", async () => {
    readCapabilityFile.mockResolvedValue(null);
    const { tools } = makeTools();
    expect(await tools.run_capability.execute({ slug: "ghost" })).toEqual({
      error: 'capability "ghost" not found',
    });
  });

  it("surfaces dispatch failures", async () => {
    readCapabilityFile.mockResolvedValue({ profileJson: "{}" });
    const octokit = makeOctokit();
    octokit.rest.actions.createWorkflowDispatch.mockRejectedValue(
      new Error("workflow disabled"),
    );
    const { tools } = makeTools(octokit);
    expect(await tools.run_capability.execute({ slug: "greet" })).toEqual({
      error: "workflow disabled",
    });
  });
});

describe("run_workflow_creator", () => {
  it("dispatches the workflow-creator capability with the issue number", async () => {
    const { tools, octokit } = makeTools();
    const result = await tools.run_workflow_creator.execute({ issue: 42 });

    expect(octokit.rest.actions.createWorkflowDispatch).toHaveBeenCalledWith({
      owner: "acme",
      repo: "app",
      workflow_id: "kody.yml",
      ref: "main",
      inputs: { capability: "workflow-creator", issue_number: "42" },
    });
    expect(result).toMatchObject({
      ok: true,
      capability: "workflow-creator",
      issue: 42,
    });
  });

  it("surfaces dispatch failures", async () => {
    const octokit = makeOctokit();
    octokit.rest.repos.get.mockRejectedValue(new Error("repo gone"));
    const { tools } = makeTools(octokit);
    expect(await tools.run_workflow_creator.execute({ issue: 42 })).toEqual({
      error: "repo gone",
    });
  });
});
