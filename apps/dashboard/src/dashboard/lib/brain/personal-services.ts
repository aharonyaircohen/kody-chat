import "server-only";

import { decrypt } from "@kody-ade/base/vault/crypto";
import { setPersonalBrainServices } from "@kody-ade/brain/personal-services";
import { getCurrentKodySessionUser } from "@dashboard/lib/auth/kody-auth-server";
import {
  backendApi,
  getConvexClient,
} from "@dashboard/lib/backend/convex-backend";
import {
  ChatModelsSchema,
  engineModelSpec,
  engineRuntimeModelConfig,
  pickEngineDefaultModel,
} from "@kody-ade/base/variables/models";

const namespaceFor = (name: string) => `brain:${name}`;

setPersonalBrainServices({
  async resolveUser() {
    const identity = await getCurrentKodySessionUser();
    if (!identity) return null;
    return {
      id: identity.id,
      label: identity.name ?? identity.email ?? "Kody user",
      ...(identity.email ? { email: identity.email } : {}),
    };
  },

  async getCredential(userId, name) {
    const stored = await getConvexClient().query(
      backendApi.userCredentials.get,
      {
        userKey: userId,
        name,
      },
    );
    return stored?.encryptedValue ? decrypt(stored.encryptedValue) : null;
  },

  async getCredentials(userId) {
    const stored = await getConvexClient().query(
      backendApi.userCredentials.listEncrypted,
      { userKey: userId },
    );
    return Object.fromEntries(
      stored.map((credential) => [
        credential.name,
        decrypt(credential.encryptedValue),
      ]),
    );
  },

  async getRuntimeModel(userId) {
    const stored = await getConvexClient().query(
      backendApi.userPreferences.get,
      {
        namespace: "chat-models",
        userKey: userId,
      },
    );
    const parsed = ChatModelsSchema.safeParse(
      (stored?.data as { models?: unknown } | undefined)?.models,
    );
    const model = parsed.success ? pickEngineDefaultModel(parsed.data) : null;
    return model
      ? {
          engineModel: engineModelSpec(model),
          engineModelConfig: engineRuntimeModelConfig(model),
        }
      : {};
  },

  async loadState(userId, name) {
    const stored = await getConvexClient().query(
      backendApi.userPreferences.get,
      {
        namespace: namespaceFor(name),
        userKey: userId,
      },
    );
    return stored?.data ?? null;
  },

  async saveState(userId, name, data) {
    await getConvexClient().mutation(backendApi.userPreferences.save, {
      namespace: namespaceFor(name),
      userKey: userId,
      data,
      updatedAt: new Date().toISOString(),
    });
  },
});
