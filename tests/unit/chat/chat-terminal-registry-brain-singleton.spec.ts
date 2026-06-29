/**
 * @fileoverview Unit coverage for the single Brain terminal registry rule.
 * @testFramework vitest
 * @domain terminal
 */
import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

import {
  findMountedBrainTerminal,
  isBrainTerminalTransport,
  normalizeMountedChatTerminals,
  type MountedChatTerminal,
} from "@dashboard/lib/hooks/useChatTerminalRegistry";

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
  return {
    id,
    sessionId,
    transport: {
      type: "fly",
      app: feature === "brain" ? "brain-app" : "runner-app",
      machineId: id,
      feature,
    },
  };
}

describe("chat terminal registry Brain singleton", () => {
  it("recognizes Brain as the singleton terminal transport", () => {
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

  it("keeps only the newest mounted Brain terminal", () => {
    const firstBrain = terminal("brain-1", "chat-1", "brain");
    const runner = terminal("runner-1", "chat-2", "runner");
    const secondBrain = terminal("brain-2", "chat-3", "brain");

    expect(findMountedBrainTerminal([firstBrain, runner, secondBrain])).toBe(
      secondBrain,
    );
    expect(
      normalizeMountedChatTerminals([firstBrain, runner, secondBrain]),
    ).toEqual([runner, secondBrain]);
  });

  it("focuses the existing Brain session instead of creating another one", () => {
    expect(REGISTRY_SOURCE).toContain("switchSession?:");
    expect(REGISTRY_SOURCE).toContain("focusMountedBrainTerminal");
    expect(REGISTRY_SOURCE).toContain(
      "switchSession?.(existingBrain.sessionId)",
    );
    expect(REGISTRY_SOURCE).toContain(
      "if (focusMountedBrainTerminal(transport)) return;",
    );
    expect(CHAT_SOURCE).toContain("switchSession: sessionHook.switchSession");
  });
});
