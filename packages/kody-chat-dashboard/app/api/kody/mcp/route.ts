import crypto from "node:crypto";
import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { api as backendApi } from "@kody-ade/backend/api";
import { createBackendClient } from "@kody-ade/backend/client";
import { logger } from "@kody-ade/base/logger";
import {
  KODY_MCP_CONTRACT_VERSION,
  KODY_MCP_PROTOCOL_VERSION,
  KODY_MCP_SERVER_VERSION,
  mcpPrincipalSchema,
  scopeForPrincipal,
  toJsonSchema,
  type McpPrincipal,
} from "../../../../src/dashboard/lib/mcp/contracts";
import {
  executeKodyAction,
  getKodyAction,
  KodyActionError,
  listKodyActions,
  type KodyMcpActionServices,
} from "../../../../src/dashboard/lib/mcp/catalog";
import {
  hashMcpAccessToken,
  isMcpAccessToken,
} from "../../../../src/dashboard/lib/mcp/access-token";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const revalidate = 0;

const NO_STORE_HEADERS = { "Cache-Control": "no-store, max-age=0" };
const MAX_BODY_BYTES = 256 * 1024;
const RATE_LIMIT_PER_MINUTE = 120;
const SUPPORTED_PROTOCOL_VERSIONS = new Set([
  "2025-03-26",
  "2025-06-18",
  KODY_MCP_PROTOCOL_VERSION,
]);
const FACADE_TOOL_NAMES = [
  "kody_status",
  "kody_search_tools",
  "kody_get_tool_details",
  "kody_execute_tool",
] as const;

type JsonRpcId = string | number | null;
type JsonRpcRequest = {
  jsonrpc?: string;
  id?: JsonRpcId;
  method?: string;
  params?: unknown;
};

const searchInput = z
  .object({
    query: z.string().trim().max(200).optional(),
    category: z.string().trim().max(80).optional(),
    cursor: z.string().max(100).optional(),
    limit: z.number().int().min(1).max(50).default(20),
  })
  .strict();
const detailsInput = z
  .object({ actionId: z.string().min(1).max(160) })
  .strict();
const executeInput = z
  .object({
    actionId: z.string().min(1).max(160),
    input: z.record(z.string(), z.unknown()).default({}),
    idempotencyKey: z.string().min(8).max(128).optional(),
  })
  .strict();

const facadeTools = [
  {
    name: "kody_status",
    title: "Kody status",
    description:
      "Get Kody MCP version, authenticated scope, and safe health data.",
    inputSchema: { type: "object", additionalProperties: false },
    annotations: { readOnlyHint: true, destructiveHint: false },
  },
  {
    name: "kody_search_tools",
    title: "Search Kody actions",
    description:
      "Search the scoped Kody action catalog without loading every action schema.",
    inputSchema: toJsonSchema(searchInput),
    annotations: { readOnlyHint: true, destructiveHint: false },
  },
  {
    name: "kody_get_tool_details",
    title: "Get Kody action details",
    description:
      "Get the full schema, permissions, side effects, approval policy, and examples for one action.",
    inputSchema: toJsonSchema(detailsInput),
    annotations: { readOnlyHint: true, destructiveHint: false },
  },
  {
    name: "kody_execute_tool",
    title: "Execute a Kody action",
    description:
      "Execute one discovered Kody action under the token's repository scope and permissions.",
    inputSchema: toJsonSchema(executeInput),
    annotations: { readOnlyHint: false, destructiveHint: true },
  },
];

function unauthorized(): NextResponse {
  return NextResponse.json(
    { error: "invalid_token" },
    {
      status: 401,
      headers: {
        ...NO_STORE_HEADERS,
        "WWW-Authenticate": 'Bearer realm="Kody MCP"',
      },
    },
  );
}

function originAllowed(req: NextRequest): boolean {
  const origin = req.headers.get("origin");
  if (!origin) return true;
  const configured = (process.env.KODY_MCP_ALLOWED_ORIGINS ?? "")
    .split(",")
    .map((item) => item.trim())
    .filter(Boolean);
  return origin === req.nextUrl.origin || configured.includes(origin);
}

async function authenticate(
  req: NextRequest,
): Promise<McpPrincipal | NextResponse> {
  const authorization = req.headers.get("authorization") ?? "";
  if (!authorization.toLowerCase().startsWith("bearer ")) return unauthorized();
  const token = authorization.slice("bearer ".length).trim();
  if (!isMcpAccessToken(token)) return unauthorized();
  try {
    const backend = createBackendClient();
    const row = await backend.query(backendApi.mcpAccessTokens.authenticate, {
      tokenHash: hashMcpAccessToken(token),
      now: new Date().toISOString(),
    });
    const parsed = mcpPrincipalSchema.safeParse(row);
    if (!parsed.success) return unauthorized();
    const allowed = await checkRateLimit(backend, parsed.data.tokenId);
    if (!allowed)
      return NextResponse.json(
        { error: "rate_limit_exceeded" },
        {
          status: 429,
          headers: { ...NO_STORE_HEADERS, "Retry-After": "60" },
        },
      );
    return parsed.data;
  } catch (error) {
    logger.error({ err: error }, "public mcp authentication failed");
    return NextResponse.json(
      { error: "mcp_authentication_unavailable" },
      { status: 503, headers: NO_STORE_HEADERS },
    );
  }
}

async function checkRateLimit(
  backend: ReturnType<typeof createBackendClient>,
  tokenId: string,
): Promise<boolean> {
  try {
    return await backend.mutation(backendApi.mcpRateLimits.check, {
      key: tokenId,
      now: Math.floor(Date.now() / 1000),
      windowSec: 60,
      limit: RATE_LIMIT_PER_MINUTE,
    });
  } catch (error) {
    if (
      error instanceof Error &&
      error.message.includes("OptimisticConcurrencyControlFailure")
    )
      return false;
    throw error;
  }
}

export async function GET(req: NextRequest) {
  if (!originAllowed(req))
    return NextResponse.json(
      { error: "invalid_origin" },
      { status: 403, headers: NO_STORE_HEADERS },
    );
  const principal = await authenticate(req);
  if (principal instanceof NextResponse) return principal;
  return new NextResponse(": kody-mcp\n\n", {
    headers: {
      ...NO_STORE_HEADERS,
      "Content-Type": "text/event-stream",
      Connection: "keep-alive",
    },
  });
}

export async function DELETE(req: NextRequest) {
  const principal = await authenticate(req);
  if (principal instanceof NextResponse) return principal;
  const runId = validatedRunId(req.headers.get("mcp-session-id"));
  if (!runId)
    return NextResponse.json(
      { error: "invalid_session" },
      { status: 400, headers: NO_STORE_HEADERS },
    );
  await createBackendClient().mutation(backendApi.agentRuns.finish, {
    tenantId: principal.tenantId,
    runId,
    status: "completed",
    endedAt: new Date().toISOString(),
  });
  return new NextResponse(null, { status: 204, headers: NO_STORE_HEADERS });
}

export async function POST(req: NextRequest) {
  return await handleKodyMcpPost(req);
}

export async function handleKodyMcpPost(
  req: NextRequest,
  options: { services?: KodyMcpActionServices } = {},
) {
  if (!originAllowed(req))
    return NextResponse.json(
      { error: "invalid_origin" },
      { status: 403, headers: NO_STORE_HEADERS },
    );
  const principal = await authenticate(req);
  if (principal instanceof NextResponse) return principal;

  if (!(req.headers.get("content-type") ?? "").includes("application/json"))
    return NextResponse.json(
      { error: "unsupported_media_type" },
      { status: 415, headers: NO_STORE_HEADERS },
    );
  const requestedProtocol = req.headers.get("mcp-protocol-version");
  if (requestedProtocol && !SUPPORTED_PROTOCOL_VERSIONS.has(requestedProtocol))
    return NextResponse.json(
      { error: "unsupported_protocol_version" },
      { status: 400, headers: NO_STORE_HEADERS },
    );

  const declaredSize = Number(req.headers.get("content-length") ?? "0");
  if (declaredSize > MAX_BODY_BYTES)
    return NextResponse.json(
      { error: "request_too_large" },
      { status: 413, headers: NO_STORE_HEADERS },
    );

  let body: JsonRpcRequest | null = null;
  try {
    const raw = await req.text();
    if (Buffer.byteLength(raw, "utf8") > MAX_BODY_BYTES)
      return NextResponse.json(
        { error: "request_too_large" },
        { status: 413, headers: NO_STORE_HEADERS },
      );
    body = JSON.parse(raw) as JsonRpcRequest;
  } catch {
    return jsonRpcError(null, -32700, "Parse error");
  }
  if (!body || typeof body !== "object" || Array.isArray(body))
    return jsonRpcError(null, -32600, "Invalid Request");
  if (!("id" in body))
    return new NextResponse(null, { status: 202, headers: NO_STORE_HEADERS });
  if (body.jsonrpc !== "2.0")
    return jsonRpcError(body.id ?? null, -32600, "Invalid Request");

  if (body.method === "initialize") {
    const runId = `run-${crypto.randomUUID()}`;
    const clientName = z
      .object({
        clientInfo: z.object({ name: z.string().trim().min(1).max(120) }),
      })
      .passthrough()
      .safeParse(body.params);
    await beginAgentRun(
      principal,
      runId,
      clientName.success ? clientName.data.clientInfo.name : undefined,
    );
    return jsonRpcResult(
      body.id ?? null,
      {
        protocolVersion: KODY_MCP_PROTOCOL_VERSION,
        serverInfo: {
          name: "kody",
          version: KODY_MCP_SERVER_VERSION,
          description: "Shared Kody extensions for coding agents",
        },
        capabilities: { tools: { listChanged: false } },
      },
      { "Mcp-Session-Id": runId },
    );
  }
  if (body.method === "ping") return jsonRpcResult(body.id ?? null, {});
  if (body.method === "tools/list")
    return jsonRpcResult(body.id ?? null, { tools: facadeTools });
  if (body.method === "tools/call")
    return await callFacadeTool(
      body.id ?? null,
      body.params,
      principal,
      requestRunId(req, principal),
      options.services,
    );
  return jsonRpcError(body.id ?? null, -32601, "Method not found");
}

async function callFacadeTool(
  id: JsonRpcId,
  params: unknown,
  principal: McpPrincipal,
  runId: string,
  services?: KodyMcpActionServices,
): Promise<NextResponse> {
  const payload = z
    .object({
      name: z.enum(FACADE_TOOL_NAMES),
      arguments: z.record(z.string(), z.unknown()).optional(),
      _meta: z.record(z.string(), z.unknown()).optional(),
    })
    .passthrough()
    .safeParse(params);
  if (!payload.success)
    return jsonRpcError(id, -32602, "Invalid tools/call parameters");
  const args = payload.data.arguments ?? {};
  let outcome: "success" | "rejected" | "error" = "success";
  let actionId: string | undefined;
  let workRecordId: string | undefined;
  try {
    let result: unknown;
    switch (payload.data.name) {
      case "kody_status":
        result = {
          status: "ready",
          protocolVersion: KODY_MCP_PROTOCOL_VERSION,
          contractVersion: KODY_MCP_CONTRACT_VERSION,
          repository: principal.tenantId,
          actor: principal.actorLogin,
          tokenExpiresAt: principal.expiresAt,
          scope: scopeForPrincipal(principal),
          facadeTools: FACADE_TOOL_NAMES,
        };
        break;
      case "kody_search_tools": {
        const parsed = searchInput.parse(args);
        const offset = decodeCursor(parsed.cursor);
        const needle = parsed.query?.toLocaleLowerCase();
        const matches = listKodyActions().filter(
          (action) =>
            (!parsed.category || action.category === parsed.category) &&
            (!needle ||
              `${action.id} ${action.title} ${action.summary}`
                .toLocaleLowerCase()
                .includes(needle)),
        );
        const items = matches
          .slice(offset, offset + parsed.limit)
          .map((action) => ({
            id: action.id,
            title: action.title,
            summary: action.summary,
            category: action.category,
            permission: action.permission,
          }));
        result = {
          items,
          ...(offset + items.length < matches.length
            ? { nextCursor: encodeCursor(offset + items.length) }
            : {}),
        };
        break;
      }
      case "kody_get_tool_details": {
        const parsed = detailsInput.parse(args);
        actionId = parsed.actionId;
        const action = getKodyAction(actionId);
        if (!action)
          throw new KodyActionError("action_not_found", "Unknown action.");
        result = action;
        break;
      }
      case "kody_execute_tool": {
        if (!principal.scopes.includes("mcp:execute"))
          throw new KodyActionError(
            "insufficient_scope",
            "The access token cannot execute actions.",
          );
        const parsed = executeInput.parse(args);
        actionId = parsed.actionId;
        workRecordId = linkedWorkRecordId(parsed.input);
        const action = getKodyAction(actionId);
        if (action && action.permission !== "read" && !parsed.idempotencyKey)
          throw new KodyActionError(
            "idempotency_key_required",
            "Write actions require an idempotency key.",
          );
        result = await executeKodyAction(actionId, parsed.input, principal, {
          idempotencyKey: parsed.idempotencyKey,
          services,
        });
        break;
      }
    }
    await audit(
      principal,
      runId,
      payload.data.name,
      actionId,
      outcome,
      workRecordId,
    );
    return toolResult(id, result);
  } catch (error) {
    outcome =
      error instanceof KodyActionError || error instanceof z.ZodError
        ? "rejected"
        : "error";
    await audit(
      principal,
      runId,
      payload.data.name,
      actionId,
      outcome,
      workRecordId,
    );
    if (error instanceof KodyActionError)
      return toolError(id, error.code, error.message);
    if (error instanceof z.ZodError)
      return toolError(id, "invalid_input", "Tool input is invalid.");
    logger.error({ err: error }, "public mcp tool call failed");
    return toolError(
      id,
      "internal_error",
      "Kody could not complete the action.",
    );
  }
}

async function audit(
  principal: McpPrincipal,
  runId: string,
  toolName: string,
  actionId: string | undefined,
  outcome: "success" | "rejected" | "error",
  workRecordId?: string,
) {
  try {
    await createBackendClient().mutation(backendApi.agentRuns.recordCall, {
      eventId: crypto.randomUUID(),
      tenantId: principal.tenantId,
      runId,
      tokenId: principal.tokenId,
      agentName: principal.name,
      ...(workRecordId ? { workRecordId } : {}),
      method: "tools/call",
      toolName,
      ...(actionId ? { actionId } : {}),
      outcome,
      occurredAt: new Date().toISOString(),
    });
  } catch (error) {
    logger.error({ err: error }, "public mcp audit failed");
  }
}

async function beginAgentRun(
  principal: McpPrincipal,
  runId: string,
  clientName?: string,
) {
  try {
    await createBackendClient().mutation(backendApi.agentRuns.begin, {
      tenantId: principal.tenantId,
      runId,
      tokenId: principal.tokenId,
      agentName: principal.name,
      ...(clientName ? { clientName } : {}),
      startedAt: new Date().toISOString(),
    });
  } catch (error) {
    logger.error({ err: error }, "public mcp agent run start failed");
  }
}

function linkedWorkRecordId(
  input: Record<string, unknown>,
): string | undefined {
  const value = input.workRecordId ?? input.recordId;
  return typeof value === "string" && value.trim() ? value.trim() : undefined;
}

function validatedRunId(value: string | null): string | undefined {
  if (!value || !/^run-[a-zA-Z0-9._-]{8,160}$/.test(value)) return undefined;
  return value;
}

function requestRunId(req: NextRequest, principal: McpPrincipal): string {
  const session = validatedRunId(req.headers.get("mcp-session-id"));
  if (session) return session;
  const bucket = Math.floor(Date.now() / (30 * 60 * 1_000));
  const digest = crypto
    .createHash("sha256")
    .update(`${principal.tenantId}:${principal.tokenId}:${bucket}`)
    .digest("hex")
    .slice(0, 24);
  return `run-rolling-${digest}`;
}

function encodeCursor(offset: number): string {
  return Buffer.from(String(offset), "utf8").toString("base64url");
}

function decodeCursor(cursor?: string): number {
  if (!cursor) return 0;
  const value = Number(Buffer.from(cursor, "base64url").toString("utf8"));
  if (!Number.isSafeInteger(value) || value < 0)
    throw new KodyActionError(
      "invalid_cursor",
      "Pagination cursor is invalid.",
    );
  return value;
}

function toolResult(id: JsonRpcId, value: unknown): NextResponse {
  return jsonRpcResult(id, {
    content: [{ type: "text", text: JSON.stringify(value, null, 2) }],
    structuredContent: value,
    isError: false,
  });
}

function toolError(id: JsonRpcId, code: string, message: string): NextResponse {
  const value = { error: { code, message } };
  return jsonRpcResult(id, {
    content: [{ type: "text", text: JSON.stringify(value) }],
    structuredContent: value,
    isError: true,
  });
}

function jsonRpcResult(
  id: JsonRpcId,
  result: unknown,
  headers: Record<string, string> = {},
): NextResponse {
  return NextResponse.json(
    { jsonrpc: "2.0", id, result },
    { headers: { ...NO_STORE_HEADERS, ...headers } },
  );
}

function jsonRpcError(
  id: JsonRpcId,
  code: number,
  message: string,
): NextResponse {
  return NextResponse.json(
    { jsonrpc: "2.0", id, error: { code, message } },
    { headers: NO_STORE_HEADERS },
  );
}
