import { api as backendApi } from "@kody-ade/backend/api";
import { createBackendClient } from "@kody-ade/backend/client";

export type DurableTurnBackend = "direct" | "brain" | "engine" | "live";

export type DurableTurnIdentity = Readonly<{
  tenantId: string;
  conversationId: string;
  turnId: string;
  backend: DurableTurnBackend;
  agent: Readonly<{ slug: string; title: string }>;
  createIfMissing?: Readonly<{
    owner: string;
    repo: string;
    modelId: string;
    createdBy: string;
  }>;
}>;

export type DurableTurn = Readonly<{
  started: Promise<void>;
  complete(content: string): Promise<void>;
  fail(errorCode: string): Promise<void>;
}>;

/**
 * Starts persistence without delaying provider dispatch. Completion and failure
 * await that start, preserving ordering while the model and Convex run in
 * parallel.
 */
export function startDurableTurn(identity: DurableTurnIdentity): DurableTurn {
  const client = createBackendClient();
  const started = client
    .mutation(backendApi.conversationTurns.start, {
      ...identity,
      startedAt: new Date().toISOString(),
    })
    .then(() => undefined);
  // Completion/failure still observes and reports this rejection. Attaching a
  // handler now prevents a long model turn from producing an unhandled promise.
  void started.catch(() => undefined);

  return {
    started,
    async complete(content) {
      await started;
      await client.mutation(backendApi.conversationTurns.complete, {
        tenantId: identity.tenantId,
        conversationId: identity.conversationId,
        turnId: identity.turnId,
        content,
        completedAt: new Date().toISOString(),
      });
    },
    async fail(errorCode) {
      await started;
      await client.mutation(backendApi.conversationTurns.fail, {
        tenantId: identity.tenantId,
        conversationId: identity.conversationId,
        turnId: identity.turnId,
        errorCode,
        failedAt: new Date().toISOString(),
      });
    },
  };
}
