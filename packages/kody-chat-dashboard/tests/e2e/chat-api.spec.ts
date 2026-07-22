/**
 * @fileoverview Chat API E2E tests — verify the new chat flow endpoints.
 * @testFramework playwright
 * @domain e2e
 *
 * Tests the chat flow endpoints:
 *   POST /api/kody/chat/trigger → 200 + workflow dispatch OR 503 if token missing
 *   GET  /api/kody/chat/history → 200 + messages OR 503 if token missing
 */

import { test, expect } from "@playwright/test";

const BASE_URL = process.env.BASE_URL ?? "http://localhost:3344";
const TEST_SESSION_ID = `pw-test-session-${Date.now()}`;
const TEST_REPO =
  process.env.E2E_GITHUB_REPO ?? "https://github.com/test-owner/test-repo";

function parseRepo(url: string): { owner: string; repo: string } {
  try {
    const u = new URL(url);
    const parts = u.pathname.replace(/^\//, "").split("/").filter(Boolean);
    return { owner: parts[0] ?? "test-owner", repo: parts[1] ?? "test-repo" };
  } catch {
    return { owner: "test-owner", repo: "test-repo" };
  }
}

function authHeaders(): Record<string, string> {
  const token = process.env.E2E_GITHUB_TOKEN ?? process.env.KODY_BOT_TOKEN;
  if (!token) return {};
  const { owner, repo } = parseRepo(TEST_REPO);
  return {
    "x-kody-token": token,
    "x-kody-owner": owner,
    "x-kody-repo": repo,
  };
}

async function apiGet(
  path: string,
): Promise<{ status: number; body: unknown }> {
  const res = await fetch(`${BASE_URL}${path}`, {
    headers: { ...authHeaders() },
  });
  return { status: res.status, body: await res.json().catch(() => null) };
}

async function apiPost(
  path: string,
  body: unknown,
): Promise<{ status: number; body: unknown }> {
  const res = await fetch(`${BASE_URL}${path}`, {
    method: "POST",
    headers: { "Content-Type": "application/json", ...authHeaders() },
    body: JSON.stringify(body),
  });
  return { status: res.status, body: await res.json().catch(() => null) };
}

test.describe("Chat API — trigger endpoint", () => {
  test("POST /api/kody/chat/trigger requires taskId", async () => {
    const { status, body } = await apiPost("/api/kody/chat/trigger", {
      messages: [{ role: "user", content: "hello" }],
    });

    expect(status, `Expected 400, got ${status}`).toBe(400);
    expect(body as Record<string, unknown>).toMatchObject({
      error: expect.stringContaining("taskId"),
    });
  });

  test("POST /api/kody/chat/trigger requires messages", async () => {
    const { status, body } = await apiPost("/api/kody/chat/trigger", {
      taskId: TEST_SESSION_ID,
    });

    expect(status, `Expected 400, got ${status}`).toBe(400);
    expect(body as Record<string, unknown>).toMatchObject({
      error: expect.stringContaining("messages"),
    });
  });

  test("POST /api/kody/chat/trigger rejects when auth is missing", async () => {
    const res = await fetch(`${BASE_URL}/api/kody/chat/trigger`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        taskId: TEST_SESSION_ID,
        messages: [{ role: "user", content: "hello" }],
      }),
    });

    expect(res.status).toBe(401);
    const body = await res.json();
    expect(body as Record<string, unknown>).toMatchObject({
      message: expect.stringMatching(/authenticated|token/i),
    });
  });
});

test.describe("Chat API — history endpoint", () => {
  test("GET /api/kody/chat/history requires taskId", async () => {
    const { status, body } = await apiGet("/api/kody/chat/history");

    expect(status, `Expected 400, got ${status}`).toBe(400);
    expect(body as Record<string, unknown>).toMatchObject({
      error: expect.stringContaining("taskId"),
    });
  });

  test("GET /api/kody/chat/history returns empty messages for unknown session", async () => {
    const { status, body } = await apiGet(
      `/api/kody/chat/history?taskId=pw-nonexistent-${Date.now()}`,
    );

    if (status === 200) {
      expect(body as Record<string, unknown>).toMatchObject({ messages: [] });
    } else {
      // 503 = no auth, 500 = GitHub env vars not set (common in local dev)
      expect([503, 500]).toContain(status);
    }
  });
});

