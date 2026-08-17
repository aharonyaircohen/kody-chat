import "server-only";

import { NextRequest, NextResponse } from "next/server";
import {
  AutomaticModelSchema,
  ChatModelsSchema,
} from "@kody-ade/base/variables/models";
import { decrypt } from "@kody-ade/base/vault/crypto";
import { setChatModelSettingsProvider } from "@kody-ade/kody-chat-dashboard/chat/model-settings-provider";
import { setChatRequestContextProvider } from "@kody-ade/kody-chat-dashboard/chat/request-context-provider";
import {
  backendApi,
  getConvexClient,
} from "@dashboard/lib/backend/convex-backend";
import { requireKodyUser } from "@dashboard/lib/auth/kody-user";

const USER_HEADER = "x-kody-authenticated-user";
const MODELS_NAMESPACE = "chat-models";

setChatRequestContextProvider({
  async resolveUser() {
    const actor = await requireKodyUser();
    if (actor instanceof NextResponse) return null;
    return { id: actor.id, label: actor.label };
  },
});

export function withPersonalChatUser(
  request: NextRequest,
  userId: string | null,
): NextRequest {
  const headers = new Headers(request.headers);
  headers.delete(USER_HEADER);
  if (userId) {
    headers.set(USER_HEADER, userId);
  }
  return new NextRequest(request, { headers });
}

setChatModelSettingsProvider({
  async load(request) {
    const userKey = request.headers.get(USER_HEADER)?.trim();
    if (!userKey) return null;
    const stored = await getConvexClient().query(backendApi.userPreferences.get, {
      namespace: MODELS_NAMESPACE,
      userKey,
    });
    const data = stored?.data as
      | { models?: unknown; automatic?: unknown }
      | undefined;
    const models = ChatModelsSchema.safeParse(data?.models);
    const automatic = AutomaticModelSchema.safeParse(data?.automatic);
    return {
      models: models.success ? models.data : [],
      automatic: automatic.success
        ? { ...automatic.data, engineDefault: false }
        : AutomaticModelSchema.parse({}),
    };
  },

  async getCredential(request, name) {
    const userKey = request.headers.get(USER_HEADER)?.trim();
    if (!userKey) return null;
    const stored = await getConvexClient().query(backendApi.userCredentials.get, {
      userKey,
      name,
    });
    if (stored?.encryptedValue) return decrypt(stored.encryptedValue);
    return process.env[name] ?? null;
  },
});
