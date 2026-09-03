import crypto from "node:crypto";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";

const backend = {
  query: vi.fn(),
  mutation: vi.fn(),
};

vi.mock("@kody-ade/backend/client", () => ({
  createBackendClient: () => backend,
}));

vi.mock("@kody-ade/base/auth", () => ({
  verifyRepoWriteAccess: vi.fn(async () => ({
    auth: { owner: "acme", repo: "widgets", token: "github-pat" },
    actorLogin: "octocat",
    actorGithubId: 42,
  })),
}));

import {
  DELETE as mcpDELETE,
  GET as mcpGET,
  handleKodyMcpPost,
  POST as mcpPOST,
} from "../../app/api/kody/mcp/route";
import type { KodyMcpActionServices } from "../../src/dashboard/lib/mcp/catalog";
import {
  DELETE as tokenDELETE,
  GET as tokenGET,
  POST as tokenPOST,
} from "../../app/api/kody/mcp/tokens/route";

const endpoint = "https://dash.test/api/kody/mcp";
const activeToken = {
  tokenId: "token-1",
  name: "Codex",
  tenantId: "acme/widgets",
  actorLogin: "octocat",
  actorGithubId: 42,
  scopes: ["mcp:read", "mcp:execute"],
  createdAt: "2026-09-02T08:00:00.000Z",
  expiresAt: "2026-10-02T08:00:00.000Z",
};
const phaseFourServices = {
  listPolicies: vi.fn(),
  getPolicy: vi.fn(),
  getInstructions: vi.fn(),
  listCapabilities: vi.fn(),
  getCapability: vi.fn(),
  listWorkflows: vi.fn(),
  getWorkflow: vi.fn(),
  getQualityGates: vi.fn(),
  listApprovals: vi.fn(),
  getApproval: vi.fn(),
  requestWorkflowRun: vi.fn(),
  requestWorkflowResume: vi.fn(),
  requestCapabilityRun: vi.fn(),
  listSchedules: vi.fn(),
  getSchedule: vi.fn(),
  listTriggers: vi.fn(),
  getTrigger: vi.fn(),
  getWebhookStatus: vi.fn(),
  listNotificationRules: vi.fn(),
  listRuns: vi.fn(),
  getRun: vi.fn(),
  getUsage: vi.fn(),
  requestScheduleSave: vi.fn(),
  requestScheduleDelete: vi.fn(),
  requestTriggerSave: vi.fn(),
  requestTriggerDelete: vi.fn(),
  requestWebhookReconcile: vi.fn(),
  requestNotificationRuleCreate: vi.fn(),
  requestNotificationRuleDelete: vi.fn(),
} satisfies KodyMcpActionServices;

function request(
  body: unknown,
  bearer = "kody_mcp_0123456789012345678901234567890123456789012",
) {
  return new NextRequest(endpoint, {
    method: "POST",
    headers: {
      "content-type": "application/json",
      accept: "application/json, text/event-stream",
      ...(bearer ? { authorization: `Bearer ${bearer}` } : {}),
    },
    body: JSON.stringify(body),
  });
}

beforeEach(() => {
  vi.clearAllMocks();
  backend.query.mockResolvedValue(activeToken);
  backend.mutation.mockResolvedValue(true);
});

describe("public Kody MCP endpoint", () => {
  it("requires a header bearer and never accepts a query credential", async () => {
    expect((await mcpPOST(request({ id: 1, method: "ping" }, ""))).status).toBe(
      401,
    );
    const queryCredential = new NextRequest(`${endpoint}?token=secret`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ jsonrpc: "2.0", id: 1, method: "ping" }),
    });
    expect((await mcpPOST(queryCredential)).status).toBe(401);
  });

  it("negotiates stable Streamable HTTP MCP and exposes only four facade tools", async () => {
    for (const name of ["claude-code", "codex", "opencode", "hermes-agent"]) {
      const initialized = await mcpPOST(
        request({
          jsonrpc: "2.0",
          id: `initialize-${name}`,
          method: "initialize",
          params: {
            protocolVersion: "2025-11-25",
            capabilities: {},
            clientInfo: { name, version: "compatibility-fixture" },
          },
        }),
      );
      expect(initialized.status).toBe(200);
      expect(initialized.headers.get("mcp-session-id")).toMatch(/^run-/);
      await expect(initialized.json()).resolves.toMatchObject({
        result: {
          protocolVersion: "2025-11-25",
          serverInfo: { name: "kody" },
          capabilities: { tools: { listChanged: false } },
        },
      });
    }

    const listed = await mcpPOST(
      request({ jsonrpc: "2.0", id: 2, method: "tools/list" }),
    );
    const body = await listed.json();
    expect(
      body.result.tools.map((tool: { name: string }) => tool.name),
    ).toEqual([
      "kody_status",
      "kody_search_tools",
      "kody_get_tool_details",
      "kody_execute_tool",
    ]);
  });

  it("rejects unsupported protocol headers", async () => {
    const req = request({ jsonrpc: "2.0", id: 2, method: "tools/list" });
    req.headers.set("mcp-protocol-version", "2099-01-01");
    expect((await mcpPOST(req)).status).toBe(400);
  });

  it("discovers details and executes a scoped catalog action", async () => {
    const search = await mcpPOST(
      request({
        jsonrpc: "2.0",
        id: 3,
        method: "tools/call",
        params: {
          name: "kody_search_tools",
          arguments: { query: "scope", limit: 10 },
        },
      }),
    );
    const searchResult = (await search.json()).result.structuredContent;
    expect(searchResult.items).toContainEqual(
      expect.objectContaining({ id: "repository.scope.get" }),
    );

    const execute = await mcpPOST(
      request({
        jsonrpc: "2.0",
        id: 4,
        method: "tools/call",
        params: {
          name: "kody_execute_tool",
          arguments: { actionId: "repository.scope.get", input: {} },
        },
      }),
    );
    await expect(execute.json()).resolves.toMatchObject({
      result: {
        isError: false,
        structuredContent: {
          repository: "acme/widgets",
          actor: "octocat",
        },
      },
    });
    expect(backend.mutation).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({
        tenantId: "acme/widgets",
        agentName: "Codex",
        runId: expect.stringMatching(/^run-/),
        actionId: "repository.scope.get",
        outcome: "success",
      }),
    );
    const recorded = backend.mutation.mock.calls.find(
      ([, input]) => input.actionId === "repository.scope.get",
    )?.[1];
    expect(JSON.stringify(recorded)).not.toMatch(
      /arguments|structuredContent|prompt|transcript/,
    );
  });

  it("returns scoped status and full action details", async () => {
    const status = await mcpPOST(
      request({
        jsonrpc: "2.0",
        id: 5,
        method: "tools/call",
        params: {
          name: "kody_status",
          arguments: {},
          _meta: { progressToken: "codex-call" },
        },
      }),
    );
    await expect(status.json()).resolves.toMatchObject({
      result: {
        structuredContent: {
          status: "ready",
          repository: "acme/widgets",
          actor: "octocat",
        },
      },
    });

    const details = await mcpPOST(
      request({
        jsonrpc: "2.0",
        id: 6,
        method: "tools/call",
        params: {
          name: "kody_get_tool_details",
          arguments: { actionId: "mcp.contract.get" },
        },
      }),
    );
    await expect(details.json()).resolves.toMatchObject({
      result: {
        structuredContent: {
          id: "mcp.contract.get",
          permission: "read",
          approval: "none",
        },
      },
    });
  });

  it("supports Streamable HTTP notifications and an authenticated SSE GET", async () => {
    const notification = await mcpPOST(
      request({ jsonrpc: "2.0", method: "notifications/initialized" }),
    );
    expect(notification.status).toBe(202);

    const bearer = "kody_mcp_0123456789012345678901234567890123456789012";
    const stream = await mcpGET(
      new NextRequest(endpoint, {
        headers: { authorization: `Bearer ${bearer}` },
      }),
    );
    expect(stream.status).toBe(200);
    expect(stream.headers.get("content-type")).toContain("text/event-stream");

    const deleted = await mcpDELETE(
      new NextRequest(endpoint, {
        method: "DELETE",
        headers: {
          authorization: `Bearer ${bearer}`,
          "mcp-session-id": "run-session-12345678",
        },
      }),
    );
    expect(deleted.status).toBe(204);
    expect(backend.mutation).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({
        tenantId: "acme/widgets",
        runId: "run-session-12345678",
        status: "completed",
      }),
    );
  });

  it("returns safe protocol and tool errors", async () => {
    const unknownMethod = await mcpPOST(
      request({ jsonrpc: "2.0", id: 7, method: "not/a/method" }),
    );
    await expect(unknownMethod.json()).resolves.toMatchObject({
      error: { code: -32601, message: "Method not found" },
    });

    const unknownAction = await mcpPOST(
      request({
        jsonrpc: "2.0",
        id: 8,
        method: "tools/call",
        params: {
          name: "kody_execute_tool",
          arguments: { actionId: "not.an.action", input: {} },
        },
      }),
    );
    await expect(unknownAction.json()).resolves.toMatchObject({
      result: {
        isError: true,
        structuredContent: { error: { code: "action_not_found" } },
      },
    });

    const badContent = request({ jsonrpc: "2.0", id: 9, method: "ping" });
    badContent.headers.set("content-type", "text/plain");
    expect((await mcpPOST(badContent)).status).toBe(415);
  });

  it("routes approved Phase 4 requests through injected Kody services", async () => {
    phaseFourServices.requestWorkflowRun.mockResolvedValueOnce({
      requestId: "request-1",
      status: "pending",
      workflowId: "quality-run",
      runId: "run-1",
    });
    const response = await handleKodyMcpPost(
      request({
        jsonrpc: "2.0",
        id: 11,
        method: "tools/call",
        params: {
          name: "kody_execute_tool",
          arguments: {
            actionId: "workflow.run.request",
            idempotencyKey: "request-quality-run",
            input: {
              workflowId: "quality-run",
              workRecordId: "phase-4",
              input: {},
            },
          },
        },
      }),
      { services: phaseFourServices },
    );
    await expect(response.json()).resolves.toMatchObject({
      result: {
        isError: false,
        structuredContent: { requestId: "request-1", status: "pending" },
      },
    });
    expect(phaseFourServices.requestWorkflowRun).toHaveBeenCalledWith(
      expect.objectContaining({ idempotencyKey: "request-quality-run" }),
      expect.objectContaining({ tenantId: "acme/widgets" }),
    );
  });

  it("rejects expired or revoked tokens, invalid origins, and excess requests", async () => {
    backend.query.mockResolvedValueOnce(null);
    expect(
      (await mcpPOST(request({ jsonrpc: "2.0", id: 1, method: "ping" })))
        .status,
    ).toBe(401);

    const foreignOrigin = request({ jsonrpc: "2.0", id: 2, method: "ping" });
    foreignOrigin.headers.set("origin", "https://evil.test");
    expect((await mcpPOST(foreignOrigin)).status).toBe(403);

    backend.mutation.mockResolvedValueOnce(false);
    expect(
      (await mcpPOST(request({ jsonrpc: "2.0", id: 3, method: "ping" })))
        .status,
    ).toBe(429);
  });

  it("fails closed as rate limited when concurrent counter updates conflict", async () => {
    backend.mutation.mockRejectedValueOnce(
      new Error("OptimisticConcurrencyControlFailure"),
    );
    const response = await mcpPOST(
      request({ jsonrpc: "2.0", id: 10, method: "ping" }),
    );
    expect(response.status).toBe(429);
    expect(response.headers.get("retry-after")).toBe("60");
  });
});

describe("MCP access-token issuance", () => {
  it("issues a repository-scoped expiring token and returns plaintext once", async () => {
    const req = new NextRequest(`${endpoint}/tokens`, {
      method: "POST",
      headers: {
        "content-type": "application/json",
        "x-kody-token": "github-pat",
        "x-kody-owner": "acme",
        "x-kody-repo": "widgets",
      },
      body: JSON.stringify({ name: "Claude Code", expiresInDays: 30 }),
    });
    const response = await tokenPOST(req);
    expect(response.status).toBe(201);
    const body = await response.json();
    expect(body.accessToken).toMatch(/^kody_mcp_/);
    expect(JSON.stringify(body)).not.toContain("tokenHash");
    expect(backend.mutation).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({
        tenantId: "acme/widgets",
        actorLogin: "octocat",
        name: "Claude Code",
        tokenHash: expect.not.stringContaining("kody_mcp_"),
      }),
    );
  });

  it("lists metadata without hashes and revokes only a scoped caller token", async () => {
    backend.query.mockResolvedValueOnce([
      { ...activeToken, revokedAt: undefined },
    ]);
    const headers = {
      "content-type": "application/json",
      "x-kody-token": "github-pat",
      "x-kody-owner": "acme",
      "x-kody-repo": "widgets",
    };
    const listed = await tokenGET(
      new NextRequest(`${endpoint}/tokens`, { headers }),
    );
    const listBody = await listed.json();
    expect(listBody.tokens).toHaveLength(1);
    expect(JSON.stringify(listBody)).not.toContain("tokenHash");

    backend.mutation.mockResolvedValueOnce(true);
    const revoked = await tokenDELETE(
      new NextRequest(`${endpoint}/tokens`, {
        method: "DELETE",
        headers,
        body: JSON.stringify({ tokenId: crypto.randomUUID() }),
      }),
    );
    expect(revoked.status).toBe(200);
    expect(backend.mutation).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({
        tenantId: "acme/widgets",
        actorLogin: "octocat",
      }),
    );
  });
});
