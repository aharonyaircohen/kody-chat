import { NextRequest, NextResponse } from "next/server";
import { beforeEach, describe, expect, it, vi } from "vitest";

const octokit = vi.hoisted(() => ({
  rest: {
    repos: {
      get: vi.fn(async () => ({ data: { default_branch: "main" } })),
    },
    actions: {
      createWorkflowDispatch: vi.fn(async () => undefined),
    },
  },
}));
const auth = vi.hoisted(() => ({
  verifyRepoWriteAccess: vi.fn(async () => ({
    auth: {
      token: "token",
      owner: "acme",
      repo: "widgets",
    },
    actorLogin: "alice",
    permission: "push",
    octokit,
  })),
}));
const store = vi.hoisted(() => ({
  listStoredAgencyDefinitions: vi.fn(async () => [
    {
      recordId: "loop:knowledge-system-refresh:revision",
      kind: "loop",
      schemaVersion: 1,
      data: { id: "knowledge-system-refresh" },
      createdAt: "2026-07-23T00:00:00.000Z",
    },
  ]),
}));
const dispatch = vi.hoisted(() => ({
  buildKodyWorkflowDispatchInputs: vi.fn(async () => ({
    capability: "dispatch-due-loops",
    message: "knowledge-system-refresh",
  })),
}));

vi.mock("@kody-ade/base/auth", () => auth);
vi.mock("@kody-ade/agency/backend/agency-model-store", () => store);
vi.mock("@dashboard/lib/kody-workflow-dispatch", () => dispatch);

import { POST } from "../../app/api/kody/agency-loops/[id]/run/route";

beforeEach(() => {
  vi.clearAllMocks();
});

describe("POST /api/kody/agency-loops/:id/run", () => {
  it("dispatches one Loop through the generic Loop capability", async () => {
    const response = await POST(
      new NextRequest(
        "https://dash.test/api/kody/agency-loops/knowledge-system-refresh/run",
        { method: "POST" },
      ),
      { params: Promise.resolve({ id: "knowledge-system-refresh" }) },
    );

    expect(response.status).toBe(202);
    expect(dispatch.buildKodyWorkflowDispatchInputs).toHaveBeenCalledWith(
      octokit,
      expect.objectContaining({
        action: "dispatch-due-loops",
        message: "knowledge-system-refresh",
      }),
    );
    expect(octokit.rest.actions.createWorkflowDispatch).toHaveBeenCalledWith(
      expect.objectContaining({
        workflow_id: "kody.yml",
        inputs: {
          capability: "dispatch-due-loops",
          message: "knowledge-system-refresh",
        },
      }),
    );
  });

  it("rejects missing Loops and callers without write access", async () => {
    store.listStoredAgencyDefinitions.mockResolvedValueOnce([]);
    const missing = await POST(
      new NextRequest("https://dash.test/api/kody/agency-loops/missing/run", {
        method: "POST",
      }),
      { params: Promise.resolve({ id: "missing" }) },
    );
    auth.verifyRepoWriteAccess.mockResolvedValueOnce(
      NextResponse.json({ error: "forbidden" }, { status: 403 }) as never,
    );
    const forbidden = await POST(
      new NextRequest(
        "https://dash.test/api/kody/agency-loops/knowledge-system-refresh/run",
        { method: "POST" },
      ),
      { params: Promise.resolve({ id: "knowledge-system-refresh" }) },
    );

    expect(missing.status).toBe(404);
    expect(forbidden.status).toBe(403);
  });
});
