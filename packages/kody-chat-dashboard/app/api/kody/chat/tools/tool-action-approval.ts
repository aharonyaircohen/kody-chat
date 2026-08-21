import { createHmac, timingSafeEqual } from "node:crypto";
import { createUIMessageStream, createUIMessageStreamResponse } from "ai";

import type { RenderedViewDirective } from "../../../../../src/dashboard/lib/chat-ui-actions";
import { getBuiltinViewRendererDefinition } from "../../../../../src/dashboard/lib/view-renderers/builtin";
import { buildRenderedViewDirective } from "../../../../../src/dashboard/lib/view-renderers/template";

const TOKEN_PREFIX = "kody-action";
const TOKEN_TTL_MS = 15 * 60 * 1_000;

export interface ToolActionApprovalContext {
  owner: string;
  repo: string;
  actorId: string;
}

interface ToolActionPayload extends ToolActionApprovalContext {
  toolName: string;
  input: unknown;
  issuedAt: number;
}

export interface ToolActionApproval {
  action: "approve" | "cancel";
  toolName: string;
  input: unknown;
}

type ExecutableTool = { execute?: (input: unknown) => Promise<unknown> | unknown };

export const APPROVAL_REQUIRED_TOOL_NAMES = new Set([
  "create_feature",
  "create_enhancement",
  "create_refactor",
  "create_documentation",
  "create_chore",
  "report_bug",
  "create_kody_agent",
  "create_or_update_workflow",
]);

function signature(encodedPayload: string, secret: string): Buffer {
  return createHmac("sha256", secret).update(encodedPayload).digest();
}

function encodePayload(payload: ToolActionPayload, secret: string): string {
  const encodedPayload = Buffer.from(JSON.stringify(payload)).toString("base64url");
  const encodedSignature = signature(encodedPayload, secret).toString("base64url");
  return `${TOKEN_PREFIX}.${encodedPayload}.${encodedSignature}`;
}

function decodePayload(token: string, secret: string): ToolActionPayload | null {
  const [prefix, encodedPayload, encodedSignature, extra] = token.split(".");
  if (
    prefix !== TOKEN_PREFIX ||
    !encodedPayload ||
    !encodedSignature ||
    extra !== undefined
  ) {
    return null;
  }
  const expected = signature(encodedPayload, secret);
  const actual = Buffer.from(encodedSignature, "base64url");
  if (actual.length !== expected.length || !timingSafeEqual(actual, expected)) {
    return null;
  }
  try {
    const value = JSON.parse(
      Buffer.from(encodedPayload, "base64url").toString("utf8"),
    ) as Partial<ToolActionPayload>;
    if (
      typeof value.owner !== "string" ||
      typeof value.repo !== "string" ||
      typeof value.actorId !== "string" ||
      typeof value.toolName !== "string" ||
      typeof value.issuedAt !== "number" ||
      !("input" in value)
    ) {
      return null;
    }
    return value as ToolActionPayload;
  } catch {
    return null;
  }
}

export function createToolActionApproval(input: {
  secret: string;
  context: ToolActionApprovalContext;
  toolName: string;
  input: unknown;
  title: string;
  body?: string;
  now?: number;
}): RenderedViewDirective {
  const definition = getBuiltinViewRendererDefinition("approval-card");
  if (!definition) throw new Error("Approval card renderer is unavailable");
  return buildRenderedViewDirective({
    id: encodePayload(
      {
        ...input.context,
        toolName: input.toolName,
        input: input.input,
        issuedAt: input.now ?? Date.now(),
      },
      input.secret,
    ),
    definition,
    data: {
      title: input.title,
      ...(input.body ? { body: input.body } : {}),
    },
  });
}

export function readToolActionApproval(
  latestUserText: string | null,
  input: {
    secret: string;
    context: ToolActionApprovalContext;
    now?: number;
  },
): ToolActionApproval | null {
  if (!latestUserText) return null;
  const match = latestUserText.match(/<view_result>([\s\S]*?)<\/view_result>/);
  if (!match) return null;
  try {
    const result = JSON.parse(match[1]) as Record<string, unknown>;
    if (
      result.kind !== "view_result" ||
      result.view !== "renderer" ||
      result.rendererSlug !== "approval-card" ||
      (result.actionId !== "approve" && result.actionId !== "cancel") ||
      typeof result.viewId !== "string"
    ) {
      return null;
    }
    const payload = decodePayload(result.viewId, input.secret);
    const now = input.now ?? Date.now();
    if (
      !payload ||
      payload.owner !== input.context.owner ||
      payload.repo !== input.context.repo ||
      payload.actorId !== input.context.actorId ||
      payload.issuedAt > now ||
      now - payload.issuedAt > TOKEN_TTL_MS
    ) {
      return null;
    }
    return {
      action: result.actionId as "approve" | "cancel",
      toolName: payload.toolName,
      input: payload.input,
    };
  } catch {
    return null;
  }
}

export async function runApprovedToolAction(
  approval: ToolActionApproval | null,
  tools: Record<string, unknown>,
): Promise<
  | { action: "cancelled" }
  | { action: "approved"; toolName: string; input: unknown; output: unknown }
> {
  if (!approval) throw new Error("Approved action is invalid or expired");
  if (approval.action === "cancel") return { action: "cancelled" };
  const candidate = tools[approval.toolName];
  const execute =
    candidate && typeof candidate === "object"
      ? (candidate as ExecutableTool).execute
      : undefined;
  if (!execute) throw new Error("Approved action is no longer available");
  let output: unknown;
  try {
    output = await execute(approval.input);
  } catch (error) {
    output = {
      error: error instanceof Error ? error.message : "Approved action failed",
    };
  }
  return {
    action: "approved",
    toolName: approval.toolName,
    input: approval.input,
    output,
  };
}

function actionTitle(toolName: string, input: unknown): string {
  const record =
    input && typeof input === "object" && !Array.isArray(input)
      ? (input as Record<string, unknown>)
      : {};
  const name =
    typeof record.title === "string"
      ? record.title
      : typeof record.name === "string"
        ? record.name
        : typeof record.slug === "string"
          ? record.slug
          : typeof record.workflowId === "string"
            ? record.workflowId
            : "this action";
  if (toolName === "create_kody_agent") return `Create Agent ${name}?`;
  if (toolName === "create_or_update_workflow") return `Save Workflow ${name}?`;
  return `Create task ${name}?`;
}

export function stageToolsForApproval(
  tools: Record<string, unknown>,
  input: {
    secret: string;
    context: ToolActionApprovalContext;
  },
): Record<string, unknown> {
  return Object.fromEntries(
    Object.entries(tools).map(([toolName, candidate]) => {
      if (
        !APPROVAL_REQUIRED_TOOL_NAMES.has(toolName) ||
        !candidate ||
        typeof candidate !== "object" ||
        typeof (candidate as ExecutableTool).execute !== "function"
      ) {
        return [toolName, candidate];
      }
      return [
        toolName,
        {
          ...candidate,
          execute: async (toolInput: unknown) =>
            createToolActionApproval({
              ...input,
              toolName,
              input: toolInput,
              title: actionTitle(toolName, toolInput),
              body: "Approve to run this exact saved action, or cancel to leave everything unchanged.",
            }),
        },
      ];
    }),
  );
}

export function createApprovedToolActionResponse(
  result:
    | { action: "cancelled" }
    | { action: "approved"; toolName: string; input: unknown; output: unknown },
): Response {
  const stream = createUIMessageStream({
    execute: async ({ writer }) => {
      if (result.action === "cancelled") {
        const content = "Cancelled. Nothing was changed.";
        writer.write({
          type: "tool-input-available",
          toolCallId: "approved-action-cancelled",
          toolName: "final_answer",
          input: { content },
        });
        writer.write({
          type: "tool-output-available",
          toolCallId: "approved-action-cancelled",
          output: { content },
        });
        return;
      }
      const toolCallId = `approved-action-${result.toolName}`;
      writer.write({
        type: "tool-input-available",
        toolCallId,
        toolName: result.toolName,
        input: result.input,
      });
      writer.write({
        type: "tool-output-available",
        toolCallId,
        output: result.output,
      });
      const record =
        result.output &&
        typeof result.output === "object" &&
        !Array.isArray(result.output)
          ? (result.output as Record<string, unknown>)
          : {};
      const content =
        typeof record.error === "string"
          ? `Action failed: ${typeof record.message === "string" ? record.message : record.error}`
          : typeof record.number === "number"
            ? `Created task #${record.number}.`
            : result.toolName === "create_kody_agent"
              ? "Agent created."
              : result.toolName === "create_or_update_workflow"
                ? "Workflow saved."
                : "Approved action completed.";
      writer.write({
        type: "tool-input-available",
        toolCallId: `${toolCallId}-answer`,
        toolName: "final_answer",
        input: { content },
      });
      writer.write({
        type: "tool-output-available",
        toolCallId: `${toolCallId}-answer`,
        output: { content },
      });
    },
  });
  return createUIMessageStreamResponse({ stream });
}
