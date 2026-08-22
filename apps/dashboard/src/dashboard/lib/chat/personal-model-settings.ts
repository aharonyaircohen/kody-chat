import "server-only";

import { NextResponse } from "next/server";
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

const MODELS_NAMESPACE = "chat-models";

async function authenticatedUserId(): Promise<string | null> {
  const actor = await requireKodyUser();
  return actor instanceof NextResponse ? null : actor.id;
}

export async function readPersonalCredential(
  name: string,
): Promise<string | null> {
  const userKey = await authenticatedUserId();
  if (!userKey) return null;
  const stored = await getConvexClient().query(backendApi.userCredentials.get, {
    userKey,
    name,
  });
  return stored?.encryptedValue ? decrypt(stored.encryptedValue) : null;
}

export async function readPersonalModelSettings(): Promise<{
  models: ReturnType<typeof ChatModelsSchema.parse>;
  automatic: ReturnType<typeof AutomaticModelSchema.parse>;
} | null> {
  const userKey = await authenticatedUserId();
  if (!userKey) return null;
  const stored = await getConvexClient().query(backendApi.userPreferences.get, {
    namespace: MODELS_NAMESPACE,
    userKey,
  });
  const data = stored?.data as
    { models?: unknown; automatic?: unknown } | undefined;
  const models = ChatModelsSchema.safeParse(data?.models);
  const automatic = AutomaticModelSchema.safeParse(data?.automatic);
  return {
    models: models.success ? models.data : [],
    automatic: automatic.success
      ? { ...automatic.data, engineDefault: false }
      : AutomaticModelSchema.parse({}),
  };
}

setChatRequestContextProvider({
  async resolveUser() {
    const actor = await requireKodyUser();
    if (actor instanceof NextResponse) return null;
    return { id: actor.id, label: actor.label };
  },
});

setChatModelSettingsProvider({
  async load() {
    return readPersonalModelSettings();
  },

  async getCredential(_request, name) {
    return (await readPersonalCredential(name)) ?? process.env[name] ?? null;
  },
});
