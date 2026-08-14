import { NextRequest } from "next/server";
import { afterEach, describe, expect, it, vi } from "vitest";

import { executeGuidedFlowCommand } from "../../app/api/kody/guided-flows/command-execution";

function request(): NextRequest {
  return new NextRequest("https://dashboard.test/api/kody/guided-flows", {
    headers: {
      "x-kody-owner": "acme",
      "x-kody-repo": "widgets",
      "x-kody-token": "secret",
      "transfer-encoding": "chunked",
    },
  });
}

afterEach(() => vi.unstubAllGlobals());

describe("Guided Flow command execution", () => {
  it("forwards the raw command to the shared Chat operation boundary", async () => {
    const fetchMock = vi.fn<
      (input: URL, init?: RequestInit) => Promise<Response>
    >(async () =>
      Response.json({
        handled: true,
        command: "/init",
        result: {
          status: "completed",
          summary: "Engine ready",
          secret: "drop",
        },
      }),
    );
    vi.stubGlobal("fetch", fetchMock);

    await expect(
      executeGuidedFlowCommand(request(), "/init", "mutation-1"),
    ).resolves.toEqual({ status: "completed", summary: "Engine ready" });
    expect(fetchMock).toHaveBeenCalledWith(
      new URL("https://dashboard.test/api/kody/chat/operations"),
      expect.objectContaining({
        method: "POST",
        body: JSON.stringify({ input: "/init" }),
      }),
    );
    const headers = fetchMock.mock.calls[0]?.[1]?.headers as Headers;
    expect(headers.get("x-kody-idempotency-key")).toBe("mutation-1");
    expect(headers.get("x-kody-token")).toBe("secret");
    expect(headers.has("transfer-encoding")).toBe(false);
  });

  it("rejects commands that the shared boundary does not execute", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => Response.json({ handled: false })),
    );

    await expect(
      executeGuidedFlowCommand(request(), "/review", "mutation-1"),
    ).rejects.toMatchObject({
      code: "command_not_executable",
      status: 400,
    });
  });
});
