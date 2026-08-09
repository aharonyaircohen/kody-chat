import { beforeEach, describe, expect, it, vi } from "vitest";

const h = vi.hoisted(() => ({
  getEngineConfig: vi.fn(),
  readLocal: vi.fn(),
  readStore: vi.fn(),
}));

vi.mock("@kody-ade/base/engine/config", () => ({
  getEngineConfig: h.getEngineConfig,
}));
vi.mock("@dashboard/lib/workflow-definition-files", () => ({
  readWorkflowDefinitionFile: h.readLocal,
  readCompanyStoreWorkflowDefinitionFile: h.readStore,
}));

import { createCompanyWorkflowLoader } from "@dashboard/features/workflows/server/company-workflow-loader";

describe("company workflow loader", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    h.readLocal.mockResolvedValue(null);
    h.readStore.mockResolvedValue({ workflow: { name: "Quality Run" } });
    h.getEngineConfig.mockResolvedValue({
      config: { company: { activeWorkflows: [] } },
    });
  });

  it("always makes the system-owned Quality Run workflow available", async () => {
    const load = createCompanyWorkflowLoader({
      octokit: {} as never,
      owner: "acme",
      repo: "widgets",
    });

    await expect(load("quality-run")).resolves.toEqual({
      workflow: { name: "Quality Run" },
    });
    expect(h.readStore).toHaveBeenCalledWith("quality-run", {});
  });

  it("keeps the normal repository override behavior", async () => {
    h.readLocal.mockResolvedValue({ workflow: { name: "Repository Quality" } });
    const load = createCompanyWorkflowLoader({
      octokit: {} as never,
      owner: "acme",
      repo: "widgets",
    });

    await expect(load("quality-run")).resolves.toEqual({
      workflow: { name: "Repository Quality" },
    });
    expect(h.readStore).not.toHaveBeenCalled();
  });
});
