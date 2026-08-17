import { NextRequest, NextResponse } from "next/server";
import {
  resolveChatModel as resolvePackageChatModel,
  type ResolveChatModelOptions,
} from "@kody-ade/kody-chat-dashboard/chat/resolve-model";
import { requireKodyUser } from "@dashboard/lib/auth/kody-user";
import { withPersonalChatUser } from "@dashboard/lib/chat/personal-model-settings";

export type { ResolvedChatModel, ResolveChatModelOptions } from "@kody-ade/kody-chat-dashboard/chat/resolve-model";

export async function resolveChatModel(
  request: NextRequest,
  modelId?: string,
  options: ResolveChatModelOptions = {},
) {
  const actor = await requireKodyUser();
  return resolvePackageChatModel(
    withPersonalChatUser(
      request,
      actor instanceof NextResponse ? null : actor.id,
    ),
    modelId,
    options,
  );
}
