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
  // Server startup dependencies are initialized by server-owned entrypoints.
  // Keeping this hook dependency-free prevents Next from bundling them into
  // the browser instrumentation build.
}
