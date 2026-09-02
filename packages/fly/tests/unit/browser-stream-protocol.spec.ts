import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

import {
  browserActionForStreamMessage,
  parseBrowserStreamMessage,
} from "../../src/browsers/stream-protocol";

describe("browser stream protocol", () => {
  it("packages a headless page stream without an X desktop or VNC server", () => {
    const packageRoot = fileURLToPath(new URL("../..", import.meta.url));
    const startScript = readFileSync(`${packageRoot}/browser/start.sh`, "utf8");
    const dockerfile = readFileSync(
      `${packageRoot}/browser/Dockerfile`,
      "utf8",
    );
    const server = readFileSync(`${packageRoot}/browser/server.ts`, "utf8");

    expect(startScript).toContain("--headless=new");
    expect(startScript).not.toMatch(/Xvfb|fluxbox|x11vnc/);
    expect(dockerfile).not.toMatch(
      /fluxbox|x11vnc|xvfb|x11-xserver-utils|xcvt/,
    );
    expect(server).toContain("Page.startScreencast");
    expect(server).toContain("if (latestFrame) websocket.send(latestFrame);");
    expect(server).not.toContain("net.connect(5900");
    expect(server).toContain(
      '"fly-replay": `instance=${authorization.machineId}`',
    );
  });

  it("maps pointer input without dropping wheel details", () => {
    const parsed = parseBrowserStreamMessage(
      JSON.stringify({
        type: "pointer",
        action: "wheel",
        x: 320,
        y: 240,
        deltaX: 4,
        deltaY: 180,
      }),
    );

    expect(browserActionForStreamMessage(parsed)).toEqual({
      type: "pointer",
      action: "wheel",
      x: 320,
      y: 240,
      deltaX: 4,
      deltaY: 180,
    });
  });

  it("accepts keyboard, viewport, state, and frame acknowledgement messages", () => {
    expect(
      parseBrowserStreamMessage(
        JSON.stringify({ type: "keyboard", action: "down", key: "Enter" }),
      ),
    ).toEqual({ type: "keyboard", action: "down", key: "Enter" });
    expect(
      parseBrowserStreamMessage(
        JSON.stringify({ type: "viewport", width: 1600, height: 1500 }),
      ),
    ).toEqual({ type: "viewport", width: 1600, height: 1500 });
    expect(parseBrowserStreamMessage('{"type":"requestState"}')).toEqual({
      type: "requestState",
    });
    expect(
      parseBrowserStreamMessage(
        JSON.stringify({ type: "frameAck", frameId: 42 }),
      ),
    ).toEqual({ type: "frameAck", frameId: 42 });
  });

  it("rejects malformed, oversized, and unsupported input", () => {
    expect(() => parseBrowserStreamMessage("not-json")).toThrow(
      "browser_stream_message_invalid",
    );
    expect(() =>
      parseBrowserStreamMessage(
        JSON.stringify({ type: "viewport", width: 10, height: 10 }),
      ),
    ).toThrow("browser_stream_message_invalid");
    expect(() =>
      parseBrowserStreamMessage(
        JSON.stringify({
          type: "keyboard",
          action: "down",
          key: "x".repeat(5_000),
        }),
      ),
    ).toThrow("browser_stream_message_invalid");
    expect(() => parseBrowserStreamMessage('{"type":"unknown"}')).toThrow(
      "browser_stream_message_invalid",
    );
  });
});
