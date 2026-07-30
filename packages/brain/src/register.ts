/**
 * @fileType bootstrap
 * @domain brain
 * @pattern host-injection-wiring
 *
 * One-call wiring of the Brain feature into the lower layers' injection
 * hooks. Hosts call this from instrumentation.ts at server startup:
 * - @kody-ade/fly inventory gets the Brain service resolver (so the saved
 *   Brain machine overlays the server inventory).
 * - @kody-ade/terminal gets the remote runtime connector (so
 *   `target: "brain"` sessions resolve the running Brain machine, with
 *   image-drift warnings).
 *
 * Brain depends on terminal and fly (one direction); the lower layers only
 * see these hook setters — never this package.
 */
import { setGitHubContext, clearGitHubContext } from "./github";
import { setBrainServiceResolver } from "@kody-ade/fly/plugin/runners/brain-resolver-hook";
import { setRemoteRuntimeConnector } from "@kody-ade/terminal/remote-runtime-connector";

import { readBrainRuntimeView } from "./runtime-manager";
import { resolveBrainService } from "./service-resolver";
import { connectBrainTerminal } from "./terminal-connect";

/** Wire Brain implementations into fly + terminal injection hooks. */
export function registerBrainHostHooks(): void {
  setBrainServiceResolver(resolveBrainService);

  setRemoteRuntimeConnector(async ({ context, inventory, requestedTarget }) => {
    setGitHubContext(
      context.owner,
      context.repo,
      context.githubToken,
      context.storeRepoUrl,
      context.storeRef,
    );
    try {
      const runtime = await readBrainRuntimeView(
        context.account,
        context.githubToken,
      );
      return connectBrainTerminal({ runtime, inventory, requestedTarget });
    } finally {
      clearGitHubContext();
    }
  });
}
