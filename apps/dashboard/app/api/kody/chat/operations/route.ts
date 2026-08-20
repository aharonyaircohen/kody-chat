import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { generateText, tool } from "ai";

import { getRequestAuth } from "@kody-ade/base/auth";
import { getPublicBaseUrl } from "@kody-ade/base/auth/oauth-url";
import { createChatInputDispatcher } from "@kody-ade/kody-chat-dashboard/platform";
import { installEngine } from "@dashboard/lib/engine/install";
import { createUserOctokit } from "@dashboard/lib/github-client";
import { requireKodyUser } from "@dashboard/lib/auth/kody-user";
import { resolveChatModel } from "../resolve-model";
import {
  KODY_OPENROUTER_FREE_CHAT_MODEL,
  KODY_XKIRO_FREE_CHAT_MODEL,
} from "@kody-ade/kody-chat-dashboard/chat/model-catalog";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const requestSchema = z.object({
  input: z.string().trim().min(1).max(200),
});

class ChatOperationError extends Error {
  constructor(
    readonly code: string,
    readonly status: number,
  ) {
    super(code);
  }
}

const ONBOARDING_CHAT_MODELS = new Set<string>([
  KODY_OPENROUTER_FREE_CHAT_MODEL.id,
  KODY_XKIRO_FREE_CHAT_MODEL.id,
]);

function providerErrorText(error: unknown, depth = 0): string {
  if (depth > 2 || !error || typeof error !== "object") return String(error ?? "");
  const candidate = error as {
    message?: unknown;
    responseBody?: unknown;
    data?: { error?: { message?: unknown } };
    cause?: unknown;
  };
  return [
    candidate.message,
    candidate.responseBody,
    candidate.data?.error?.message,
    candidate.cause ? providerErrorText(candidate.cause, depth + 1) : undefined,
  ]
    .filter((value): value is string => typeof value === "string")
    .join(" ");
}

function chatReadinessFailure(modelLabel: string, error: unknown) {
  const message = providerErrorText(error);
  const providerPolicyFailure =
    /no allowed providers are available for the selected model/i.test(message) &&
    /allowed-providers?\s+setting/i.test(message);
  return {
    status: "needs_attention" as const,
    summary: providerPolicyFailure
      ? `${modelLabel} cannot currently route Kody tool requests. Allow compatible providers in OpenRouter Privacy settings, then run this check again.`
      : `${modelLabel} is not ready for Kody tools. Check the API key and provider settings, then run this check again.`,
  };
}

async function checkChatReadiness(req: NextRequest, modelId: string) {
  if (!ONBOARDING_CHAT_MODELS.has(modelId)) {
    throw new ChatOperationError("unsupported_chat_model", 400);
  }
  const user = await requireKodyUser();
  if (user instanceof NextResponse) {
    throw new ChatOperationError("missing_auth", 401);
  }
  const resolution = await resolveChatModel(req, modelId);
  if ("error" in resolution) {
    const payload = (await resolution.error.json().catch(() => ({}))) as {
      message?: unknown;
    };
    return chatReadinessFailure(
      modelId,
      typeof payload.message === "string" ? payload.message : "model unavailable",
    );
  }
  try {
    const result = await generateText({
      model: resolution.model,
      system:
        "This is a Kody readiness check. Call kody_readiness_check once with ready=true.",
      prompt: "Verify tool-response support.",
      tools: {
        kody_readiness_check: tool({
          description: "Confirm that the model can produce a Kody tool response.",
          inputSchema: z.object({ ready: z.literal(true) }),
        }),
      },
      // Match Chat's conservative contract for models that do not declare
      // stronger tool-choice support. Merely including this tool is enough to
      // catch provider-routing policies that reject Kody tool requests.
      toolChoice: "auto",
      maxOutputTokens: 64,
    });
    const succeeded = result.toolCalls.some(
      (call) =>
        call.toolName === "kody_readiness_check" &&
        typeof call.input === "object" &&
        call.input !== null &&
        "ready" in call.input &&
        call.input.ready === true,
    );
    return succeeded
      ? {
          status: "completed" as const,
          summary: `${resolution.resolvedModel.label || modelId} is ready.`,
        }
      : chatReadinessFailure(
          resolution.resolvedModel.label || modelId,
          "required tool response missing",
        );
  } catch (error) {
    return chatReadinessFailure(
      resolution.resolvedModel.label || modelId,
      error,
    );
  }
}

export async function POST(req: NextRequest): Promise<NextResponse> {
  const parsed = requestSchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json({ error: "validation_error" }, { status: 400 });
  }

  const dispatcher = createChatInputDispatcher([
    {
      command: "/init",
      execute: async (args) => {
        if (args.some((arg) => arg !== "--force") || args.length > 1) {
          throw new ChatOperationError("invalid_command_arguments", 400);
        }
        const auth = getRequestAuth(req);
        if (!auth) throw new ChatOperationError("missing_auth", 401);
        const result = await installEngine({
          octokit: createUserOctokit(auth.token),
          owner: auth.owner,
          repo: auth.repo,
          token: auth.token,
          hookUrl: `${getPublicBaseUrl(req)}/api/webhooks/github`,
          force: args.includes("--force"),
        });
        if (!result.ok) {
          throw new ChatOperationError(result.error, 502);
        }
        const needsAttention =
          result.webhook?.ok === false || result.kodyTokenSecret?.ok === false;
        return {
          status: needsAttention
            ? ("needs_attention" as const)
            : ("completed" as const),
          summary: result.summary,
          workflow: result.workflow,
          nextSteps: result.nextSteps,
        };
      },
    },
    {
      command: "/check-chat",
      execute: async (args) => {
        if (args.length !== 1) {
          throw new ChatOperationError("invalid_command_arguments", 400);
        }
        return checkChatReadiness(req, args[0]!);
      },
    },
  ]);

  try {
    return NextResponse.json(await dispatcher.dispatch(parsed.data.input));
  } catch (error) {
    if (error instanceof ChatOperationError) {
      return NextResponse.json(
        { error: error.code, message: error.message },
        { status: error.status },
      );
    }
    return NextResponse.json(
      { error: "chat_operation_failed" },
      { status: 500 },
    );
  }
}
