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

  // @kody-ade/fly host wiring — the Brain feature and dashboard config are
  // host-owned; the fly package consumes them via injection hooks.
  const { setBrainServiceResolver } = await import(
    "@kody-ade/fly/plugin/runners/brain-resolver-hook"
  );
  const { resolveBrainService } = await import(
    "@dashboard/lib/brain/service-resolver"
  );
  setBrainServiceResolver(resolveBrainService);

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
