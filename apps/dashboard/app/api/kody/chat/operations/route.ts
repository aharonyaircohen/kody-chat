import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";

import { getRequestAuth } from "@kody-ade/base/auth";
import { getPublicBaseUrl } from "@kody-ade/base/auth/oauth-url";
import { createChatInputDispatcher } from "@kody-ade/kody-chat-dashboard/platform";
import { installEngine } from "@dashboard/lib/engine/install";
import { createUserOctokit } from "@dashboard/lib/github-client";

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
