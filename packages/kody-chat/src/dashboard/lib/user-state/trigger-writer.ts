/**
 * @fileType utility
 * @domain user-state
 * @pattern trigger-writer-install
 * @ai-summary Installs the user-state service as the trigger engine's state
 *   writer. Idempotent and callable from any server entry — event-emitting
 *   routes call it directly so trigger execution never depends on the
 *   host's instrumentation having run in the same process.
 */
import "server-only";
import {
  setTriggerStateWriter,
  type TriggerStateWrite,
} from "@kody-ade/base/triggers";
import { getUserState, setUserState, type UserStateServiceContext } from "./service";

/** Cap per-trigger history so append-mode triggers can't grow unbounded. */
const MAX_APPEND_ENTRIES = 200;

/**
 * Append mode stores one complete record per event — the mapped data plus
 * `event`/`at` bookkeeping — in a list keyed by the trigger id. This keeps
 * each occurrence intact and queryable instead of smearing values across
 * parallel per-key arrays.
 */
async function resolveData(
  ctx: UserStateServiceContext,
  write: TriggerStateWrite,
): Promise<Record<string, unknown>> {
  if (write.mode !== "append") return write.data;
  const current = await getUserState(ctx, write.namespace);
  const existing = current?.data[write.triggerId];
  const list = Array.isArray(existing) ? existing : [];
  const record = {
    ...write.data,
    event: write.eventName,
    at: write.occurredAt,
  };
  return {
    [write.triggerId]: [...list, record].slice(-MAX_APPEND_ENTRIES),
  };
}

/**
 * Install the trigger→user-state writer. Always overwrites: a stale writer
 * from an earlier bundle/startup (pre-dating newer write semantics like
 * append mode) must never shadow the current implementation.
 */
export function ensureTriggerStateWriter(): void {
  setTriggerStateWriter(async (write) => {
    const ctx: UserStateServiceContext = {
      octokit: write.octokit,
      owner: write.owner,
      repo: write.repo,
      userId: write.userId,
      sessionId: write.sessionId,
    };
    await setUserState(ctx, write.namespace, await resolveData(ctx, write), {
      source: "system",
    });
  });
}
