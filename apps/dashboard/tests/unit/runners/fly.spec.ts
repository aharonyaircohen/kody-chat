/**
 * spawnRunner tests. Exercises the one-shot Fly Machine create call against a
 * mocked Fly Machines API (globalThis.fetch — no network).
 *
 * Focus: the request is BOUNDED. A hung Fly API must reject quickly (via an
 * abort signal) rather than hold the Vibe/start request open until the
 * serverless runtime kills it — that's the warmup-fragility this guards.
 */

import { afterEach, describe, expect, it, vi } from "vitest";

import { spawnRunner } from "@dashboard/lib/infrastructure/plugins/fly/runners/fly";
import {
  chatRunRequest,
  goalRunRequest,
} from "@dashboard/lib/runners/run-request";

const BASE_INPUT = {
  repo: "acme/widgets",
  githubToken: "gh-pat",
  runRequest: chatRunRequest("sess-1"),
  flyToken: "fly-test-token",
};

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("spawnRunner", () => {
  it("returns the machine id + region on success", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(
        async () =>
          new Response(JSON.stringify({ id: "m-123", region: "fra" }), {
            status: 200,
            headers: { "content-type": "application/json" },
          }),
      ),
    );

    const out = await spawnRunner(BASE_INPUT);
    expect(out).toMatchObject({ machineId: "m-123", region: "fra" });
  });

  it("passes an abort signal so a hung Fly API can't block forever", async () => {
    const fetchMock = vi.fn(
      async (_input: RequestInfo | URL, _init?: RequestInit) =>
        new Response(JSON.stringify({ id: "m-1" }), {
          status: 200,
          headers: { "content-type": "application/json" },
        }),
    );
    vi.stubGlobal("fetch", fetchMock);

    await spawnRunner(BASE_INPUT);

    const init = fetchMock.mock.calls[0]![1];
    expect(init?.signal).toBeInstanceOf(AbortSignal);
  });

  it("does not wire a shared LiteLLM URL into runner env", async () => {
    const fetchMock = vi.fn(
      async (_input: RequestInfo | URL, _init?: RequestInit) =>
        new Response(JSON.stringify({ id: "m-1" }), {
          status: 200,
          headers: { "content-type": "application/json" },
        }),
    );
    vi.stubGlobal("fetch", fetchMock);

    await spawnRunner({
      ...BASE_INPUT,
      allSecrets: { MINIMAX_API_KEY: "k" },
    });

    const body = JSON.parse(String(fetchMock.mock.calls[0]![1]?.body)) as {
      config: { env: Record<string, string> };
    };
    expect(body.config.env).not.toHaveProperty("KODY_LITELLM_URL");
    expect(body.config.env.ALL_SECRETS).toBe(
      JSON.stringify({ MINIMAX_API_KEY: "k" }),
    );
  });

  it("spawns a goal request without legacy mode/action env", async () => {
    const fetchMock = vi.fn(
      async (_input: RequestInfo | URL, _init?: RequestInit) =>
        new Response(JSON.stringify({ id: "m-1" }), {
          status: 200,
          headers: { "content-type": "application/json" },
        }),
    );
    vi.stubGlobal("fetch", fetchMock);

    await spawnRunner({
      repo: "acme/widgets",
      githubToken: "gh-pat",
      runRequest: goalRunRequest("weekly-docs"),
      flyToken: "fly-test-token",
    });

    const body = JSON.parse(String(fetchMock.mock.calls[0]![1]?.body)) as {
      config: { env: Record<string, string> };
    };
    expect(JSON.parse(body.config.env.KODY_RUN_REQUEST_JSON)).toMatchObject({
      target: { type: "goal", id: "weekly-docs" },
      intent: "manage",
      source: "dashboard",
    });
    expect(body.config.env).not.toHaveProperty("KODY_RUN_MODE");
    expect(body.config.env).not.toHaveProperty("GITHUB_EVENT_NAME");
    expect(body.config.env).not.toHaveProperty("KODY_FORCE_ACTION");
    expect(body.config.env).not.toHaveProperty("KODY_FORCE_MESSAGE");
    expect(body.config.env).not.toHaveProperty("SESSION_ID");
    expect(body.config.env).not.toHaveProperty("ISSUE_NUMBER");
  });

  it("wraps a timeout/network rejection in a clean error (no raw DOMException)", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => {
        // What AbortSignal.timeout produces when it fires.
        throw new DOMException(
          "The operation was aborted due to timeout",
          "TimeoutError",
        );
      }),
    );

    await expect(spawnRunner(BASE_INPUT)).rejects.toThrow(
      /Fly Machines API request failed/,
    );
  });

  it("throws with the status code when the Fly API returns non-ok", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(
        async () =>
          new Response(JSON.stringify({ error: "capacity" }), {
            status: 503,
            headers: { "content-type": "application/json" },
          }),
      ),
    );

    await expect(spawnRunner(BASE_INPUT)).rejects.toThrow(/503/);
  });

  it("rejects when no Fly token is provided", async () => {
    await expect(
      spawnRunner({ ...BASE_INPUT, flyToken: "   " }),
    ).rejects.toThrow(/not configured/);
  });
});
