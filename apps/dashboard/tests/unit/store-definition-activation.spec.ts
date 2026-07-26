import { describe, expect, it, vi } from "vitest";

import { publishStoreExecutionDefinitions } from "@dashboard/lib/store-definition-activation";

describe("Store execution-definition activation", () => {
  it("publishes the selected Agent, Capabilities, and shared runtime files", async () => {
    const publish = vi.fn().mockResolvedValue(undefined);

    await publishStoreExecutionDefinitions({
      tenantId: "acme/widgets",
      agents: { "memory-steward": "# Memory Steward\n" },
      capabilities: {
        "extract-run-learning": {
          "instructions.md": "# Extract\n",
          "tools/kody-memory.mjs": "export {};\n",
        },
      },
      shared: {
        "tools/kody-memory-client.mjs": "export async function call() {}\n",
      },
      createdAt: "2026-07-26T10:00:00.000Z",
      publish,
    });

    expect(publish).toHaveBeenCalledTimes(3);
    expect(publish).toHaveBeenCalledWith(
      expect.objectContaining({
        tenantId: "acme/widgets",
        kind: "agent",
        slug: "memory-steward",
        source: "store",
        bundle: {
          schemaVersion: 1,
          files: { "agent.md": "# Memory Steward\n" },
        },
        version: expect.stringMatching(/^sha256:/),
      }),
    );
    expect(publish).toHaveBeenCalledWith(
      expect.objectContaining({
        kind: "capability",
        slug: "extract-run-learning",
      }),
    );
    expect(publish).toHaveBeenCalledWith(
      expect.objectContaining({
        kind: "asset",
        slug: "company-store-shared",
      }),
    );
  });

  it("publishes nothing when there are no execution definitions", async () => {
    const publish = vi.fn();

    await publishStoreExecutionDefinitions({
      tenantId: "acme/widgets",
      agents: {},
      capabilities: {},
      shared: {},
      createdAt: "2026-07-26T10:00:00.000Z",
      publish,
    });

    expect(publish).not.toHaveBeenCalled();
  });
});
