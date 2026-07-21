import { beforeEach, describe, expect, it, vi } from "vitest";

const backend = vi.hoisted(() => ({
  userState: {} as Record<string, unknown>,
  rows: [] as Array<Record<string, unknown>>,
}));

vi.mock("@kody-ade/backend/api", () => ({
  api: {
    guidedFlows: {
      listActive: "guidedFlows.listActive",
      upsert: "guidedFlows.upsert",
      listDefinitions: "guidedFlows.listDefinitions",
    },
    userState: { get: "userState.get" },
  },
}));
vi.mock("@kody-ade/backend/client", () => ({
  createBackendClient: () => ({
    query: async (operation: string, args: Record<string, unknown>) => {
      if (operation === "userState.get") {
        const data = backend.userState[String(args.namespace)];
        return data === undefined ? null : { data };
      }
      if (operation === "guidedFlows.listDefinitions") {
        const definitions = backend.userState["guided-flow-definitions"];
        return Array.isArray(definitions)
          ? definitions.map((definition) => ({
              flowId: (definition as { id: string }).id,
              version: (definition as { version?: number }).version ?? 1,
              archived: (definition as { archived?: boolean }).archived,
              definition,
            }))
          : [];
      }
      if (operation === "guidedFlows.listActive") {
        return backend.rows.filter((row) => row.status === "active");
      }
      return null;
    },
    mutation: async (operation: string, args: Record<string, unknown>) => {
      if (operation === "guidedFlows.upsert") backend.rows.push({ ...args });
    },
  }),
}));

import { createGuidedFlowTools } from "../../app/api/kody/chat/tools/guided-flow-tools";

const CUSTOM_DEFINITION = {
  id: "custom-lesson",
  version: 1,
  title: "Custom lesson",
  steps: [
    {
      id: "step-1",
      title: "Question",
      explanation: "Pick the right answer.",
      rendererSlug: "selection-list",
      rendererData: {
        title: "Question",
        items: [
          { id: "opt-1", label: "Right", response: "Right" },
          { id: "opt-2", label: "Wrong", response: "Wrong" },
        ],
      },
      transitions: { "opt-1": "done", "opt-2": "step-1" },
      allowedActions: ["opt-1", "opt-2"],
    },
    {
      id: "done",
      title: "Done",
      explanation: "Finished.",
      rendererSlug: "approval-card",
      allowedActions: ["continue"],
    },
  ],
};

describe("guided_flow_start chat tool", () => {
  beforeEach(() => {
    backend.userState = {};
    backend.rows = [];
    vi.clearAllMocks();
  });

  it("starts a built-in flow", async () => {
    const tools = createGuidedFlowTools({
      tenantId: "acme/widgets",
      actorId: "alice",
    });
    const result = (await tools.guided_flow_start.execute!(
      { flowId: "create-workflow" },
      {} as never,
    )) as { guidedFlow?: { instanceId: string } };
    expect(result.guidedFlow?.instanceId).toBeTruthy();
  });

  it("starts a custom flow stored for the tenant and actor", async () => {
    backend.userState["guided-flow-definitions"] = [CUSTOM_DEFINITION];
    const tools = createGuidedFlowTools({
      tenantId: "acme/widgets",
      actorId: "alice",
    });
    const result = (await tools.guided_flow_start.execute!(
      { flowId: "custom-lesson" },
      {} as never,
    )) as { guidedFlow?: { stepId: string }; error?: string };
    expect(result.error).toBeUndefined();
    expect(result.guidedFlow?.stepId).toBe("step-1");
    expect(backend.rows).toHaveLength(1);
    expect(backend.rows[0]).toMatchObject({ flowId: "custom-lesson" });
  });

  it("ignores archived custom flows and unknown ids", async () => {
    backend.userState["guided-flow-definitions"] = [
      { ...CUSTOM_DEFINITION, version: 2, archived: true },
    ];
    const tools = createGuidedFlowTools({
      tenantId: "acme/widgets",
      actorId: "alice",
    });
    const archived = (await tools.guided_flow_start.execute!(
      { flowId: "custom-lesson" },
      {} as never,
    )) as { error?: string };
    expect(archived.error).toContain("custom-lesson");

    const unknown = (await tools.guided_flow_start.execute!(
      { flowId: "does-not-exist" },
      {} as never,
    )) as { error?: string };
    expect(unknown.error).toContain("does-not-exist");
  });
});
