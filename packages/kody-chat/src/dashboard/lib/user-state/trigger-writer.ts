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
  getTriggerStateWriter,
  setTriggerStateWriter,
} from "@kody-ade/base/triggers";
import { setUserState } from "./service";

/** Install the trigger→user-state writer once per process. */
export function ensureTriggerStateWriter(): void {
  if (getTriggerStateWriter()) return;
  setTriggerStateWriter(async (write) => {
    await setUserState(
      {
        octokit: write.octokit,
        owner: write.owner,
        repo: write.repo,
        userId: write.userId,
        sessionId: write.sessionId,
      },
      write.namespace,
      write.data,
      { source: "system" },
    );
  });
}
