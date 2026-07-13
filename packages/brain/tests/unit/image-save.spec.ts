/**
 * @fileoverview Brain image save command security and cleanup behavior.
 * @testFramework vitest
 */
import { describe, expect, it } from "vitest";

import { brainImageBuildCommand } from "../../src/image-save";

describe("brainImageBuildCommand", () => {
  it("keeps GHCR credentials inside the disposable save directory", () => {
    const command = brainImageBuildCommand({
      app: "brain-app",
      machineId: "machine-123",
      orgSlug: "kody",
      tag: "20260713t151212z",
      baseImageRef: "ghcr.io/kody/base:latest",
      imageRef: "ghcr.io/kody/kody-brain-aguy:20260713t151212z",
      ghcrUser: "aguy",
    });

    expect(command).toContain('export DOCKER_CONFIG="$tmpdir/docker"');
    expect(command).toContain('install -d -m 0700 "$DOCKER_CONFIG"');
    expect(command).not.toContain("/root/.docker");
    expect(command.indexOf("export DOCKER_CONFIG")).toBeLessThan(
      command.indexOf("crane auth login"),
    );
  });
});
