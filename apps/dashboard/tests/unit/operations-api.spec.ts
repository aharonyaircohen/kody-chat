/** @fileoverview Authenticated CRUD and runtime API tests for Operations. */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";

const h = vi.hoisted(() => ({
  listOperationFiles: vi.fn(),
  readOperationFile: vi.fn(),
  writeOperationFile: vi.fn(),
  deleteOperationFile: vi.fn(),
  loadOperationCatalog: vi.fn(),
  getUserOctokit: vi.fn(),
  verifyActorLogin: vi.fn(),
  buildDispatchInputs: vi.fn(),
  createWorkflowDispatch: vi.fn(),
}));

vi.mock("@kody-ade/base/auth", () => ({
  requireKodyAuth: vi.fn(async () => null),
  verifyActorLogin: h.verifyActorLogin,
  getUserOctokit: h.getUserOctokit,
  getRequestAuth: vi.fn(() => ({
    owner: "acme",
    repo: "app",
    token: "ghp_test",
    storeRepoUrl: "https://github.com/acme/store",
    storeRef: "main",
  })),
}));

vi.mock("@dashboard/lib/github-client", () => ({
  setGitHubContext: vi.fn(),
  clearGitHubContext: vi.fn(),
}));

vi.mock("@dashboard/lib/operation-files", () => ({
  listOperationFiles: h.listOperationFiles,
  readOperationFile: h.readOperationFile,
  writeOperationFile: h.writeOperationFile,
  deleteOperationFile: h.deleteOperationFile,
  loadOperationCatalog: h.loadOperationCatalog,
}));

vi.mock("@dashboard/lib/kody-workflow-dispatch", () => ({
  buildKodyWorkflowDispatchInputs: h.buildDispatchInputs,
}));

vi.mock("@dashboard/lib/activity/audit", () => ({ recordAudit: vi.fn() }));

import { GET, POST } from "../../app/api/kody/operations/route";
import {
  DELETE,
  GET as GET_ONE,
  PATCH,
} from "../../app/api/kody/operations/[id]/route";
import { POST as RUN } from "../../app/api/kody/operations/[id]/run/route";
import { buildOperation } from "@kody-ade/agency/operations";

const fullCatalog = {
  intents: ["reliable-delivery"],
  goals: ["web-release"],
  loops: ["deployment-health"],
};
const operation = buildOperation(
  {
    id: "release",
    name: "Release",
    responsibility: "Ship approved changes safely.",
    doesNotOwn: ["Product priority"],
    intentIds: ["reliable-delivery"],
    goals: ["web-release"],
    loops: ["deployment-health"],
  },
  "2026-07-14T10:00:00.000Z",
);
const stored = {
  id: "release",
  path: "app/operations/release/operation.json",
  sha: "operation-sha",
  operation,
};

function request(method: string, path = "", body?: unknown) {
  return new NextRequest(`https://dash.test/api/kody/operations${path}`, {
    method,
    headers: {
      "content-type": "application/json",
      "x-kody-token": "ghp_test",
      "x-kody-owner": "acme",
      "x-kody-repo": "app",
    },
    ...(body === undefined ? {} : { body: JSON.stringify(body) }),
  });
}

const params = { params: Promise.resolve({ id: "release" }) };

beforeEach(() => {
  vi.clearAllMocks();
  h.verifyActorLogin.mockResolvedValue({ identity: { login: "tester" } });
  h.getUserOctokit.mockResolvedValue({
    rest: {
      repos: {
        get: vi.fn(async () => ({ data: { default_branch: "main" } })),
      },
      actions: { createWorkflowDispatch: h.createWorkflowDispatch },
    },
  });
  h.loadOperationCatalog.mockResolvedValue(fullCatalog);
  h.listOperationFiles.mockResolvedValue([stored]);
  h.buildDispatchInputs.mockResolvedValue({
    action: "agency-operations-management",
    message: "Operate Operation release",
  });
});

afterEach(() => vi.clearAllMocks());

describe("Operations API", () => {
  it("lists persisted Operations with derived activation issues", async () => {
    h.listOperationFiles.mockResolvedValue([stored]);

    const response = await GET(request("GET"));
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body.catalog).toEqual(fullCatalog);
    expect(body.operations[0]).toMatchObject({
      id: "release",
      activationIssues: [],
    });
    expect(body.operations[0]).not.toHaveProperty("sha");
  });

  it("creates a proposed Operation and writes its state file", async () => {
    h.readOperationFile.mockResolvedValue(null);
    h.writeOperationFile.mockResolvedValue(undefined);

    const response = await POST(
      request("POST", "", {
        name: "Release",
        responsibility: "Ship approved changes safely.",
        doesNotOwn: ["Product priority"],
        intentIds: ["reliable-delivery"],
        goals: ["web-release"],
        loops: ["deployment-health"],
      }),
    );
    const body = await response.json();

    expect(response.status).toBe(201);
    expect(body.operation.operation).toMatchObject({
      id: "release",
      status: "proposed",
    });
    expect(h.writeOperationFile).toHaveBeenCalledWith(
      expect.objectContaining({
        owner: "acme",
        repo: "app",
        operation: expect.objectContaining({ id: "release" }),
      }),
    );
  });

  it("reads one Operation with its derived validation state", async () => {
    h.readOperationFile.mockResolvedValue(stored);

    const response = await GET_ONE(request("GET", "/release"), params);
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body.operation).toMatchObject({
      id: "release",
      activationIssues: [],
      operation: { responsibility: "Ship approved changes safely." },
    });
  });

  it("rejects a draft whose required Intent does not exist", async () => {
    h.readOperationFile.mockResolvedValue(null);
    h.listOperationFiles.mockResolvedValue([]);
    h.loadOperationCatalog.mockResolvedValue({
      intents: [],
      goals: ["web-release"],
      loops: ["deployment-health"],
    });

    const response = await POST(
      request("POST", "", {
        name: "Release",
        responsibility: "Ship approved changes safely.",
        doesNotOwn: ["Product priority"],
        intentIds: ["reliable-delivery"],
        goals: ["web-release"],
        loops: ["deployment-health"],
      }),
    );

    expect(response.status).toBe(409);
    expect((await response.json()).error).toBe("operation_missing_intent");
    expect(h.writeOperationFile).not.toHaveBeenCalled();
  });

  it("blocks activation until every linked resource exists", async () => {
    h.readOperationFile.mockResolvedValue(stored);
    h.loadOperationCatalog.mockResolvedValue({
      intents: ["reliable-delivery"],
      goals: [],
      loops: ["deployment-health"],
    });

    const response = await PATCH(
      request("PATCH", "/release", { status: "active" }),
      params,
    );
    const body = await response.json();

    expect(response.status).toBe(409);
    expect(body.error).toBe("operation_not_ready");
    expect(body.issues).toEqual(['Missing Goal "web-release"']);
    expect(h.writeOperationFile).not.toHaveBeenCalled();
  });

  it("activates with a versioned write and protects active deletion", async () => {
    h.readOperationFile.mockResolvedValue(stored);
    h.writeOperationFile.mockResolvedValue(undefined);

    const response = await PATCH(
      request("PATCH", "/release", { status: "active" }),
      params,
    );
    expect(response.status).toBe(200);
    expect(h.writeOperationFile).toHaveBeenCalledWith(
      expect.objectContaining({
        sha: "operation-sha",
        operation: expect.objectContaining({ status: "active" }),
      }),
    );

    h.readOperationFile.mockResolvedValue({
      ...stored,
      operation: { ...operation, status: "active" },
    });
    const deleteResponse = await DELETE(request("DELETE", "/release"), params);
    expect(deleteResponse.status).toBe(409);
    expect(h.deleteOperationFile).not.toHaveBeenCalled();

    h.readOperationFile.mockResolvedValue({
      ...stored,
      operation: { ...operation, status: "retired" },
    });
    const retiredDeleteResponse = await DELETE(
      request("DELETE", "/release"),
      params,
    );
    expect(retiredDeleteResponse.status).toBe(200);
    expect(h.deleteOperationFile).toHaveBeenCalledWith(
      expect.objectContaining({ id: "release", sha: "operation-sha" }),
    );
  });

  it("blocks activation when another Operation owns the same work", async () => {
    h.readOperationFile.mockResolvedValue(stored);
    h.listOperationFiles.mockResolvedValue([
      stored,
      {
        ...stored,
        id: "platform",
        operation: {
          ...operation,
          id: "platform",
          name: "Platform",
        },
      },
    ]);

    const response = await PATCH(
      request("PATCH", "/release", { status: "active" }),
      params,
    );
    const body = await response.json();

    expect(response.status).toBe(409);
    expect(body.issues).toContain(
      'Goal "web-release" is already owned by Operation "platform"',
    );
  });

  it("keeps a retired Operation immutable", async () => {
    h.readOperationFile.mockResolvedValue({
      ...stored,
      operation: { ...operation, status: "retired" },
    });

    const response = await PATCH(
      request("PATCH", "/release", { name: "Changed" }),
      params,
    );

    expect(response.status).toBe(409);
    expect((await response.json()).error).toBe("operation_retired");
    expect(h.writeOperationFile).not.toHaveBeenCalled();
  });

  it("runs only an active, still-valid Operation with its exact scope", async () => {
    h.readOperationFile.mockResolvedValue(stored);
    let response = await RUN(request("POST", "/release/run", {}), params);
    expect(response.status).toBe(409);

    h.readOperationFile.mockResolvedValue({
      ...stored,
      operation: { ...operation, status: "active" },
    });
    response = await RUN(request("POST", "/release/run", {}), params);
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body).toMatchObject({
      ok: true,
      action: "agency-operations-management",
      operationId: "release",
    });
    expect(h.buildDispatchInputs).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({
        action: "agency-operations-management",
        message: expect.stringContaining("operations/release/operation.json"),
      }),
    );
    expect(h.createWorkflowDispatch).toHaveBeenCalledTimes(1);
  });

  it("revalidates active scope immediately before dispatch", async () => {
    h.readOperationFile.mockResolvedValue({
      ...stored,
      operation: { ...operation, status: "active" },
    });
    h.loadOperationCatalog.mockResolvedValue({
      intents: ["reliable-delivery"],
      goals: [],
      loops: ["deployment-health"],
    });

    const response = await RUN(request("POST", "/release/run", {}), params);
    const body = await response.json();

    expect(response.status).toBe(409);
    expect(body.error).toBe("operation_not_ready");
    expect(h.createWorkflowDispatch).not.toHaveBeenCalled();
  });
});
