import type { LoopDefinition } from "@kody-ade/agency-domain";
import { api as backendApi } from "@kody-ade/backend/api";
import { createBackendClient } from "@kody-ade/backend/client";

interface MutationClient {
  mutation(reference: unknown, args: Record<string, unknown>): Promise<unknown>;
}

type SyncInput = {
  owner: string;
  repo: string;
} & (
  { loop: LoopDefinition; loopId?: never } | { loop?: never; loopId: string }
);

export async function syncLoopWakeRegistration(
  input: SyncInput,
  client: MutationClient = createBackendClient(),
): Promise<void> {
  const loopId = input.loop?.id ?? input.loopId;
  const enabled =
    input.loop?.enabled === true && input.loop.trigger.type === "schedule";
  await client.mutation(backendApi.loopWakes.syncRegistration, {
    tenantId: `${input.owner}/${input.repo}`,
    loopId,
    enabled,
    ...(enabled && input.loop?.trigger.type === "schedule"
      ? { trigger: input.loop.trigger }
      : {}),
    updatedAt: new Date().toISOString(),
  });
}

export async function replaceLoopWakeRegistrations(
  input: { owner: string; repo: string; loops: readonly LoopDefinition[] },
  client: MutationClient = createBackendClient(),
): Promise<void> {
  await client.mutation(backendApi.loopWakes.replaceRegistrations, {
    tenantId: `${input.owner}/${input.repo}`,
    loops: input.loops,
    updatedAt: new Date().toISOString(),
  });
}
