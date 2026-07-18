import { NextRequest } from "next/server";
import { beforeEach, describe, expect, it, vi } from "vitest";

const auth = vi.hoisted(() => ({
  requireKodyAuth: vi.fn(async () => null),
  getRequestAuth: vi.fn(() => ({ owner: "acme", repo: "widgets" })),
  verifyActorLogin: vi.fn(async () => ({ identity: { login: "alice" } })),
}));

const store = vi.hoisted(() => ({
  rows: [] as Array<Record<string, unknown>>,
}));

vi.mock("@kody-ade/base/auth", () => auth);
vi.mock("@kody-ade/backend/api", () => ({
  api: {
    guidedFlows: {
      get: "get",
      listActive: "listActive",
      upsert: "upsert",
      update: "update",
    },
  },
}));
vi.mock("@kody-ade/backend/client", () => ({
  createBackendClient: () => ({
    query: async (operation: string, args: Record<string, unknown>) => {
      if (operation === "listActive") {
        return store.rows.filter(
          (row) =>
            row.tenantId === args.tenantId &&
            row.actorId === args.actorId &&
            row.status === "active",
        );
      }
      return (
        store.rows.find(
          (row) =>
            row.tenantId === args.tenantId &&
            row.actorId === args.actorId &&
            row.instanceId === args.instanceId,
        ) ?? null
      );
    },
    mutation: async (operation: string, args: Record<string, unknown>) => {
      if (operation === "upsert") {
        store.rows.push({ ...args });
        return;
      }
      const row = store.rows.find(
        (candidate) => candidate.instanceId === args.instanceId,
      );
      if (row) Object.assign(row, args);
    },
  }),
}));

import { GET, POST } from "../../app/api/kody/guided-flows/route";

function request(body?: unknown): NextRequest {
  return new NextRequest("https://dash.test/api/kody/guided-flows", {
    method: body === undefined ? "GET" : "POST",
    headers: {
      "x-kody-owner": "acme",
      "x-kody-repo": "widgets",
      ...(body === undefined ? {} : { "content-type": "application/json" }),
    },
    ...(body === undefined ? {} : { body: JSON.stringify(body) }),
  });
}

describe("GuidedFlow route", () => {
  beforeEach(() => {
    store.rows = [];
    vi.clearAllMocks();
  });

  it("starts and lists an active flow for the authenticated actor", async () => {
    const response = await POST(
      request({ action: "start", flowId: "create-workflow" }),
    );
    expect(response.status).toBe(201);
    expect((await response.json()).view.guidedFlow.revision).toBe(0);

    const listed = await GET(request());
    expect(listed.status).toBe(200);
    expect((await listed.json()).flows).toHaveLength(1);
  });

  it("rejects stale renderer submissions", async () => {
    const started = await POST(
      request({ action: "start", flowId: "create-workflow" }),
    );
    const instanceId = (await started.json()).instance.instanceId as string;

    const advanced = await POST(
      request({
        action: "submit",
        instanceId,
        stepId: "choose-capability",
        expectedRevision: 0,
        actionId: "submit",
        result: { workflowName: "Checks", capabilitySlug: "run-tests" },
        mutationId: "m-1",
      }),
    );
    expect(advanced.status).toBe(200);

    const stale = await POST(
      request({
        action: "submit",
        instanceId,
        stepId: "choose-capability",
        expectedRevision: 0,
        actionId: "submit",
        result: { workflowName: "Checks", capabilitySlug: "run-tests" },
        mutationId: "m-2",
      }),
    );
    expect(stale.status).toBe(409);
    expect((await stale.json()).error).toBe("revision_conflict");
  });

  it("runs the real workflow writer before completing the flow", async () => {
    const started = await POST(
      request({ action: "start", flowId: "create-workflow" }),
    );
    const instanceId = (await started.json()).instance.instanceId as string;

    await POST(
      request({
        action: "submit",
        instanceId,
        stepId: "choose-capability",
        expectedRevision: 0,
        actionId: "submit",
        result: { workflowName: "Checks", capabilitySlug: "run-tests" },
        mutationId: "m-workflow-form",
      }),
    );

    const fetchSpy = vi.spyOn(globalThis, "fetch").mockResolvedValue(
      new Response(JSON.stringify({ workflow: { id: "checks" } }), {
        status: 200,
        headers: { "content-type": "application/json" },
      }),
    );
    try {
      const completed = await POST(
        request({
          action: "submit",
          instanceId,
          stepId: "review",
          expectedRevision: 1,
          actionId: "approve",
          mutationId: "m-workflow-approve",
        }),
      );
      expect(completed.status).toBe(200);
      expect((await completed.json()).workflow).toEqual({ id: "checks" });
      expect(fetchSpy).toHaveBeenCalledWith(
        new URL("https://dash.test/api/kody/company/workflows"),
        expect.objectContaining({ method: "POST" }),
      );
    } finally {
      fetchSpy.mockRestore();
    }
  });

  it("does not accept oversized request bodies", async () => {
    const response = await POST(
      new NextRequest("https://dash.test/api/kody/guided-flows", {
        method: "POST",
        headers: {
          "content-length": "100001",
          "x-kody-owner": "acme",
          "x-kody-repo": "widgets",
        },
      }),
    );
    expect(response.status).toBe(413);
  });
});
