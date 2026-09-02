import { describe, expect, it } from "vitest";

import {
  browserPointerCoordinates,
  keyboardStreamMessages,
  parseBrowserStreamServerMessage,
} from "@dashboard/lib/previews/browser-stream-client";

describe("browser stream client protocol", () => {
  it("parses authoritative page state and rendered frames", () => {
    expect(
      parseBrowserStreamServerMessage(
        JSON.stringify({
          type: "state",
          page: {
            url: "https://example.com/docs",
            title: "Docs",
            loading: false,
            canGoBack: true,
            canGoForward: false,
            revision: 3,
            viewport: { width: 1280, height: 720 },
          },
        }),
      ),
    ).toMatchObject({ type: "state", page: { revision: 3 } });
    expect(
      parseBrowserStreamServerMessage(
        JSON.stringify({
          type: "frame",
          frameId: 7,
          data: "jpeg-base64",
          metadata: { deviceWidth: 1280, deviceHeight: 720 },
        }),
      ),
    ).toMatchObject({ type: "frame", frameId: 7 });
  });

  it("maps scaled canvas input to the Chromium viewport", () => {
    expect(
      browserPointerCoordinates(
        { left: 10, top: 20, width: 640, height: 360 },
        { width: 1280, height: 720 },
        330,
        200,
      ),
    ).toEqual({ x: 640, y: 360 });
  });

  it("inserts printable Hebrew text without keyboard-layout translation", () => {
    expect(
      keyboardStreamMessages(
        { key: "ש", ctrlKey: false, metaKey: false, altKey: false },
        "down",
      ),
    ).toEqual([{ type: "keyboard", action: "insertText", key: "ש" }]);
    expect(
      keyboardStreamMessages(
        { key: "Enter", ctrlKey: false, metaKey: false, altKey: false },
        "down",
      ),
    ).toEqual([{ type: "keyboard", action: "down", key: "Enter" }]);
    expect(
      keyboardStreamMessages(
        { key: "Enter", ctrlKey: false, metaKey: false, altKey: false },
        "up",
      ),
    ).toEqual([{ type: "keyboard", action: "up", key: "Enter" }]);
  });

  it("rejects malformed remote messages", () => {
    expect(() => parseBrowserStreamServerMessage("not-json")).toThrow(
      "browser_stream_response_invalid",
    );
    expect(() =>
      parseBrowserStreamServerMessage('{"type":"frame","frameId":-1}'),
    ).toThrow("browser_stream_response_invalid");
  });
});
