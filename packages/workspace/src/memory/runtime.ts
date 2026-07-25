import { createBackendClient } from "@kody-ade/backend/client";
import { createConvexMemoryStore } from "@kody-ade/backend/memory-store";
import {
  createMemoryApplication,
  type MemoryPrincipal,
  type MemoryScope,
} from "@kody-ade/memory";

export interface MemoryRuntimeContext {
  readonly actorId: string;
  readonly tenantId: string;
}

export function createMemoryRuntime(
  context: Readonly<MemoryRuntimeContext>,
) {
  const principal: MemoryPrincipal = {
    userId: context.actorId,
    tenantIds: [context.tenantId],
  };
  const store = createConvexMemoryStore(createBackendClient(), context);
  const application = createMemoryApplication({
    store,
    nextId: () => crypto.randomUUID(),
    now: () => new Date().toISOString(),
  });
  const scopes: readonly MemoryScope[] = [
    { kind: "user", userId: context.actorId },
    { kind: "repository", tenantId: context.tenantId },
  ];
  return Object.freeze({
    application,
    principal,
    scopes,
    tenantId: context.tenantId,
  });
}
