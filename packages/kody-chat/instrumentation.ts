/**
 * @fileType bootstrap
 * @domain events
 * @pattern next-instrumentation
 * @ai-summary Next.js server-startup hook. Installs Next's `after()` as the
 *   system-event flush scheduler so `emitSystemEvent` fans out to sinks
 *   after the response is sent (the framework-free default in
 *   @kody-ade/base/events runs on the microtask queue instead), and wires
 *   the host-owned callbacks the @kody-ade/fly package needs (Brain service
 *   resolver, tracked-branches reader) into its injection hooks.
 */
export async function register(): Promise<void> {
  if (process.env.NEXT_RUNTIME !== "nodejs") return;
  const { after } = await import("next/server");
  const { setEventFlushScheduler } = await import("@kody-ade/base/events");
  setEventFlushScheduler(after);

  // Brain wiring — @kody-ade/brain registers its Fly service resolver and
  // the terminal remote-runtime connector into the lower layers' hooks.
  const { registerBrainHostHooks } = await import("@kody-ade/brain/register");
  registerBrainHostHooks();

  // Triggers wiring — the base trigger sink saves matched event data through
  // the product's user-state service (schema validation + entity events).
  const { setTriggerStateWriter } = await import("@kody-ade/base/triggers");
  const { setUserState } = await import("@dashboard/lib/user-state");
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

  const { setTrackedBranchesReader } = await import(
    "@kody-ade/fly/previews/tracked-branches-hook"
  );
  const { readDashboardConfig } = await import(
    "@dashboard/lib/dashboard-config/store"
  );
  setTrackedBranchesReader(async (octokit, owner, repo) => {
    const { doc } = await readDashboardConfig(octokit, owner, repo, {
      force: true,
    });
    return doc.branchPreviews ?? [];
  });
}
