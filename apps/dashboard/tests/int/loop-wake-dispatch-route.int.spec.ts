import { NextRequest } from "next/server";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const runScheduledKodyOnRunner = vi.fn();
const getInstallationToken = vi.fn();

vi.mock("@kody-ade/fly/runners/kody-runner", () => ({
  runScheduledKodyOnRunner: (...args: unknown[]) =>
    runScheduledKodyOnRunner(...args),
}));

vi.mock("@kody-ade/base/auth/app-token", () => ({
  getInstallationToken: (...args: unknown[]) => getInstallationToken(...args),
}));

import { POST } from "../../app/api/kody/loop-wakes/dispatch/route";

function request(token = "wake-secret", body: unknown = {
  jobId: "wake-1",
  repo: "acme/widgets",
  runRequest: {
    requestId: "wake-1",
    target: { type: "workflow", id: "scheduled-fanout" },
    intent: "tick",
    source: "schedule",
  },
}) {
  return new NextRequest("https://dashboard.test/api/kody/loop-wakes/dispatch", {
    method: "POST",
    headers: { authorization: `Bearer ${token}` },
    body: JSON.stringify(body),
  });
}

describe("POST /api/kody/loop-wakes/dispatch", () => {
  beforeEach(() => {
    vi.stubEnv("KODY_LOOP_WAKE_API_KEY", "wake-secret");
    getInstallationToken.mockResolvedValue("github-token");
    runScheduledKodyOnRunner.mockResolvedValue({
      ok: true,
      runner: "fly",
      machineId: "machine-1",
      ref: "main",
    });
  });

  afterEach(() => {
    vi.clearAllMocks();
    vi.unstubAllEnvs();
  });

  it("rejects a wrong service key", async () => {
    const response = await POST(request("wrong"));
    expect(response.status).toBe(401);
    expect(runScheduledKodyOnRunner).not.toHaveBeenCalled();
  });

  it("starts the canonical scheduled fan-out on a fresh runner", async () => {
    const response = await POST(request());
    expect(response.status).toBe(202);
    await expect(response.json()).resolves.toEqual({
      ok: true,
      runner: "fly",
      machineId: "machine-1",
    });

    const [runnerRequest, options] = runScheduledKodyOnRunner.mock.calls[0];
    expect(runnerRequest.headers.get("x-kody-token")).toBe("github-token");
    expect(runnerRequest.headers.get("x-kody-owner")).toBe("acme");
    expect(runnerRequest.headers.get("x-kody-repo")).toBe("widgets");
    expect(getInstallationToken).toHaveBeenCalledWith("acme", "widgets");
    expect(options).toEqual({
      taskId: "wake-1",
      dashboardUrl: "https://dashboard.test",
      runRequest: {
        requestId: "wake-1",
        target: { type: "workflow", id: "scheduled-fanout" },
        intent: "tick",
        source: "schedule",
      },
    });
  });

  it("rejects any request other than scheduled fan-out", async () => {
    const response = await POST(request("wake-secret", {
      jobId: "wake-1",
      repo: "acme/widgets",
      runRequest: {
        requestId: "wake-1",
        target: { type: "workflow", id: "dangerous" },
        intent: "tick",
        source: "schedule",
      },
    }));
    expect(response.status).toBe(400);
    expect(runScheduledKodyOnRunner).not.toHaveBeenCalled();
  });

  it("does not start when the GitHub App is not installed", async () => {
    getInstallationToken.mockResolvedValueOnce(null);
    const response = await POST(request());
    expect(response.status).toBe(503);
    expect(runScheduledKodyOnRunner).not.toHaveBeenCalled();
  });
});
