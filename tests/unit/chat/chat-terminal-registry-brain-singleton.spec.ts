/**
 * @fileoverview Unit coverage for per-chat Brain terminal registry rules.
 * @testFramework vitest
 * @domain terminal
 */
import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

import {
  BRAIN_TERMINAL_TRANSPORT,
  canUseChatTerminalFlyMachine,
  isBrainTerminalTransport,
  normalizeMountedChatTerminals,
  normalizeTerminalTransport,
  upsertMountedChatTerminal,
  type MountedChatTerminal,
} from "@dashboard/lib/hooks/useChatTerminalRegistry";
import type { FlyMachineRow } from "@dashboard/lib/runners/fly-machine-model";

const __dirname = dirname(fileURLToPath(import.meta.url));
const REGISTRY_SOURCE = readFileSync(
  resolve(
    __dirname,
    "../../../src/dashboard/lib/hooks/useChatTerminalRegistry.ts",
  ),
  "utf8",
);
const CHAT_SOURCE = readFileSync(
  resolve(__dirname, "../../../src/dashboard/lib/components/KodyChat.tsx"),
  "utf8",
);

function terminal(
  id: string,
  sessionId: string,
  feature?: "brain" | "runner",
): MountedChatTerminal {
  if (feature === "brain") {
    return {
      id,
      sessionId,
      transport: BRAIN_TERMINAL_TRANSPORT,
    };
  }
  return {
    id,
    sessionId,
    transport: {
      type: "fly",
      app: "runner-app",
      machineId: id,
      feature,
    },
  };
}

describe("chat terminal registry Brain sessions", () => {
  it("filters Fly terminal choices to Brain machines only", () => {
    const baseMachine = {
      app: "kody-runner",
      machineId: "machine-1",
      state: "started",
      region: "fra",
      label: "machine",
      sizeLabel: "perf 1x · 2 GB",
    } satisfies Omit<FlyMachineRow, "feature">;

    expect(
      canUseChatTerminalFlyMachine({ ...baseMachine, feature: "brain" }),
    ).toBe(true);
    expect(
      canUseChatTerminalFlyMachine({ ...baseMachine, feature: "runner" }),
    ).toBe(false);
  });

  it("recognizes Brain as a semantic terminal transport", () => {
    expect(isBrainTerminalTransport(BRAIN_TERMINAL_TRANSPORT)).toBe(true);
    expect(
      isBrainTerminalTransport({
        type: "fly",
        app: "brain",
        machineId: "m1",
        feature: "brain",
      }),
    ).toBe(true);
    expect(
      isBrainTerminalTransport({
        type: "fly",
        app: "runner",
        machineId: "m1",
        feature: "runner",
      }),
    ).toBe(false);
  });

  it("keeps one mounted Brain terminal per chat session", () => {
    const firstBrain = terminal("brain-1", "chat-1", "brain");
    const secondBrain = terminal("brain-2", "chat-2", "brain");

    expect(
      normalizeMountedChatTerminals([firstBrain, secondBrain]),
    ).toEqual([
      {
        id: "chat-1::brain",
        sessionId: "chat-1",
        transport: BRAIN_TERMINAL_TRANSPORT,
      },
      {
        id: "chat-2::brain",
        sessionId: "chat-2",
        transport: BRAIN_TERMINAL_TRANSPORT,
      },
    ]);
  });

  it("adds a second chat Brain terminal without replacing the first", () => {
    const firstBrain = {
      id: "chat-1::brain",
      sessionId: "chat-1",
      transport: BRAIN_TERMINAL_TRANSPORT,
    } satisfies MountedChatTerminal;
    const selectedBrain = {
      id: "chat-2::brain",
      sessionId: "chat-2",
      transport: BRAIN_TERMINAL_TRANSPORT,
    } satisfies MountedChatTerminal;

    expect(
      upsertMountedChatTerminal([firstBrain], selectedBrain),
    ).toEqual([firstBrain, selectedBrain]);
  });

  it("normalizes stale Brain machine selections to semantic Brain intent", () => {
    const staleTransport = {
      type: "fly",
      app: "brain-app",
      machineId: "old-machine",
      feature: "brain",
      label: "Brain server",
    } as const;
    const currentBrain = {
      app: "brain-app",
      machineId: "new-machine",
      state: "started",
      region: "fra",
      label: "Brain server",
      sizeLabel: "shared 2x · 4 GB",
      feature: "brain",
    } satisfies FlyMachineRow;

    expect(
      normalizeTerminalTransport(staleTransport, [currentBrain], {
        inventoryLoaded: true,
      }),
    ).toEqual(BRAIN_TERMINAL_TRANSPORT);
  });

  it("preserves restored Brain intent without depending on Fly inventory", () => {
    const staleTransport = {
      type: "fly",
      app: "brain-app",
      machineId: "old-machine",
      feature: "brain",
      label: "Brain server",
    } as const;

    expect(
      normalizeTerminalTransport(staleTransport, [], {
        inventoryLoaded: false,
      }),
    ).toEqual(BRAIN_TERMINAL_TRANSPORT);
    expect(
      normalizeTerminalTransport(staleTransport, [], {
        inventoryLoaded: true,
      }),
    ).toEqual(BRAIN_TERMINAL_TRANSPORT);
  });

  it("does not remount Brain when the selected target is unchanged", () => {
    const mounted = [
      {
        id: "chat-1::local",
        sessionId: "chat-1",
        transport: { type: "local" },
      },
      {
        id: "chat-1::brain",
        sessionId: "chat-1",
        transport: BRAIN_TERMINAL_TRANSPORT,
      },
    ] satisfies MountedChatTerminal[];

    expect(
      upsertMountedChatTerminal(mounted, {
        id: "chat-1::brain",
        sessionId: "chat-1",
        transport: BRAIN_TERMINAL_TRANSPORT,
      }),
    ).toBe(mounted);
  });

  it("selects Brain as an intent instead of a machine id", () => {
    expect(REGISTRY_SOURCE).toContain('if (value === "brain")');
    expect(REGISTRY_SOURCE).toContain("setActiveTransport(BRAIN_TERMINAL_TRANSPORT)");
    expect(REGISTRY_SOURCE).toContain('return "brain";');
    expect(CHAT_SOURCE).toContain('<option value="brain">');
  });

  it("does not switch chats when opening a Brain terminal", () => {
    expect(REGISTRY_SOURCE).not.toContain("focusMountedBrainTerminal");
    expect(REGISTRY_SOURCE).not.toContain("switchSession?.(");
    expect(CHAT_SOURCE).not.toContain(
      "switchSession: sessionHook.switchSession",
    );
  });

  it("saves Brain images through the Brain service, not stale terminal ids", () => {
    expect(CHAT_SOURCE).toContain("body: JSON.stringify({})");
    expect(CHAT_SOURCE).not.toContain("body: JSON.stringify(requestBody)");
  });
});
