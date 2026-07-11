/**
 * @fileType bootstrap
 * @domain events
 * @pattern next-instrumentation
 * @ai-summary Next.js server-startup hook. Installs Next's `after()` as the
 *   system-event flush scheduler so `emitSystemEvent` fans out to sinks
 *   after the response is sent (the framework-free default in
 *   @kody-ade/base/events runs on the microtask queue instead).
 */
export async function register(): Promise<void> {
  if (process.env.NEXT_RUNTIME !== "nodejs") return;
  const { after } = await import("next/server");
  const { setEventFlushScheduler } = await import("@kody-ade/base/events");
  setEventFlushScheduler(after);
}
