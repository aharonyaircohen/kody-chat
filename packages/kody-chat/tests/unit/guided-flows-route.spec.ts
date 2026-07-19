import { NextRequest } from "next/server";
import { beforeEach, describe, expect, it, vi } from "vitest";

const auth = vi.hoisted(() => ({
  requireKodyAuth: vi.fn(async () => null),
  getRequestAuth: vi.fn(() => ({ owner: "acme", repo: "widgets" })),
  verifyActorLogin: vi.fn(async () => ({ identity: { login: "alice" } })),
}));

const store = vi.hoisted(() => ({
  rows: [] as Array<Record<string, unknown>>,
  definitions: [] as Array<Record<string, unknown>>,
}));

vi.mock("@kody-ade/base/auth", () => auth);
vi.mock("@kody-ade/backend/api", () => ({
  api: {
    guidedFlows: {
      get: "get",
      listActive: "listActive",
      list: "list",
      upsert: "upsert",
      update: "update",
    },
    userState: {
      get: "userState.get",
      save: "userState.save",
    },
  },
}));
vi.mock("@kody-ade/backend/client", () => ({
  createBackendClient: () => ({
    query: async (operation: string, args: Record<string, unknown>) => {
      if (operation === "userState.get") {
        return store.definitions.length ? { data: store.definitions } : null;
      }
      if (operation === "listActive") {
        return store.rows.filter(
          (row) =>
            row.tenantId === args.tenantId &&
            row.actorId === args.actorId &&
            row.status === "active",
        );
      }
      if (operation === "list") {
        return store.rows.filter(
          (row) =>
            row.tenantId === args.tenantId && row.actorId === args.actorId,
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
      if (operation === "userState.save") {
        store.definitions = args.data as Array<Record<string, unknown>>;
        return;
      }
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
    store.definitions = [];
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

  it("creates and persists a custom renderer-backed flow definition", async () => {
    const created = await POST(
      request({
        action: "create-definition",
        draft: {
          title: "Review a release",
          steps: [
            {
              title: "Confirm the release",
              explanation: "Check the release details.",
              rendererSlug: "approval-card",
            },
          ],
        },
      }),
    );
    expect(created.status).toBe(201);
    expect((await created.json()).definition).toMatchObject({
      id: "review-a-release",
      steps: [{ rendererSlug: "approval-card" }],
    });

    const listed = await GET(request());
    expect(listed.status).toBe(200);
    expect((await listed.json()).definitions).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ id: "review-a-release" }),
      ]),
    );
  });

  it("updates and deletes a custom flow definition but protects built-ins", async () => {
    const created = await POST(
      request({
        action: "create-definition",
        draft: {
          title: "Review a release",
          steps: [
            {
              title: "Confirm the release",
              explanation: "Check the release details.",
              rendererSlug: "approval-card",
            },
          ],
        },
      }),
    );
    expect(created.status).toBe(201);

    const updated = await POST(
      request({
        action: "update-definition",
        flowId: "review-a-release",
        draft: {
          title: "Review the release",
          steps: [
            {
              title: "Confirm the release",
              explanation: "Review the final details.",
              rendererSlug: "guided-form",
            },
          ],
        },
      }),
    );
    expect(updated.status).toBe(200);
    expect((await updated.json()).definition).toMatchObject({
      id: "review-a-release",
      title: "Review the release",
      steps: [{ rendererSlug: "guided-form" }],
    });

    const protectedBuiltin = await POST(
      request({
        action: "update-definition",
        flowId: "create-workflow",
        draft: {
          title: "Do not change",
          steps: [
            {
              title: "Nope",
              explanation: "Nope",
              rendererSlug: "guided-form",
            },
          ],
        },
      }),
    );
    expect(protectedBuiltin.status).toBe(403);

    const deleted = await POST(
      request({ action: "delete-definition", flowId: "review-a-release" }),
    );
    expect(deleted.status).toBe(200);
    const afterDelete = await GET(request());
    expect(await afterDelete.json()).toMatchObject({
      definitions: expect.not.arrayContaining([
        expect.objectContaining({ id: "review-a-release" }),
      ]),
    });
  });

  it("lists completed flows and loads an exact instance", async () => {
    const started = await POST(
      request({ action: "start", flowId: "create-workflow" }),
    );
    const instanceId = (await started.json()).instance.instanceId as string;
    const cancelled = await POST(
      request({
        action: "cancel",
        instanceId,
        expectedRevision: 0,
        mutationId: "m-cancel",
      }),
    );
    expect(cancelled.status).toBe(200);

    const listed = await GET(request());
    expect((await listed.json()).flows[0].instance.status).toBe("cancelled");

    const exact = await GET(
      new NextRequest(
        `https://dash.test/api/kody/guided-flows?instanceId=${instanceId}`,
        { headers: { "x-kody-owner": "acme", "x-kody-repo": "widgets" } },
      ),
    );
    expect(exact.status).toBe(200);
    expect((await exact.json()).flow.instance.instanceId).toBe(instanceId);
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

  it("keeps the flow active and returns a safe code when workflow creation is rejected", async () => {
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
        result: {
          workflowName: "Existing workflow",
          capabilitySlug: "run-tests",
        },
        mutationId: "m-rejected-form",
      }),
    );

    vi.spyOn(globalThis, "fetch").mockResolvedValue(
      new Response(
        JSON.stringify({
          error: "workflow_exists",
          message: "Workflow already exists.",
        }),
        { status: 409, headers: { "content-type": "application/json" } },
      ),
    );
    const rejected = await POST(
      request({
        action: "submit",
        instanceId,
        stepId: "review",
        expectedRevision: 1,
        actionId: "approve",
        mutationId: "m-rejected-approve",
      }),
    );

    expect(rejected.status).toBe(409);
    expect(await rejected.json()).toEqual({
      error: "guided_flow_workflow_exists",
    });
    const current = await GET(
      new NextRequest(
        `https://dash.test/api/kody/guided-flows?instanceId=${instanceId}`,
        { headers: { "x-kody-owner": "acme", "x-kody-repo": "widgets" } },
      ),
    );
    expect((await current.json()).flow.instance.status).toBe("active");
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
