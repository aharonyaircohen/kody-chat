#!/usr/bin/env node
/**
 * Smoke layer — boots the app and hits the endpoints that must never 500.
 *
 * No browser, no GitHub token needed: asserts the server boots, pages render,
 * and unauthenticated API calls fail *cleanly* (4xx JSON, not a crash).
 *
 * Usage:
 *   pnpm test:smoke                  # starts `next dev` itself, then probes
 *   BASE_URL=https://... pnpm test:smoke   # probes a running deployment
 */
import { spawn } from "node:child_process";

const EXTERNAL = !!process.env.BASE_URL;
const BASE = process.env.BASE_URL ?? "http://127.0.0.1:3344";
const BOOT_TIMEOUT_MS = 120_000;

/** Each check: path, allowed status codes, optional body predicate. */
const CHECKS = [
  { path: "/", ok: [200], name: "operator shell home renders" },
  { path: "/models", ok: [200], name: "models page renders" },
  { path: "/secrets", ok: [200], name: "secrets page renders" },
  { path: "/brands", ok: [200], name: "brands page renders" },
  { path: "/instructions", ok: [200], name: "instructions page renders" },
  { path: "/memory/some-entry", ok: [200], name: "memory detail route exists" },
  { path: "/context/some-slug", ok: [200], name: "context detail route exists" },
  { path: "/brands/kody", ok: [200], name: "brand detail route exists" },
  { path: "/commands/docs", ok: [200], name: "commands docs page renders" },
  { path: "/secrets/docs", ok: [200], name: "secrets docs page renders" },
  { path: "/client/kody", ok: [200], name: "builtin brand page renders", body: (t) => t.includes("<html") },
  { path: "/client/unknown-brand-xyz", ok: [404], name: "unknown brand 404s cleanly (no 500)" },
  { path: "/api/kody/chat/kody", ok: [400, 401, 403, 405], name: "chat API rejects unauthenticated GET cleanly", method: "GET" },
  {
    path: "/api/kody/chat/kody",
    ok: [401, 403],
    name: "chat API rejects unauthenticated POST cleanly",
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ messages: [{ role: "user", content: "hi" }] }),
  },
];

async function waitForServer() {
  const deadline = Date.now() + BOOT_TIMEOUT_MS;
  while (Date.now() < deadline) {
    try {
      const res = await fetch(BASE, { redirect: "manual" });
      if (res.status < 500) return;
    } catch {
      // not up yet
    }
    await new Promise((r) => setTimeout(r, 1000));
  }
  throw new Error(`server did not come up at ${BASE} within ${BOOT_TIMEOUT_MS / 1000}s`);
}

async function runChecks() {
  let failed = 0;
  for (const c of CHECKS) {
    try {
      const res = await fetch(BASE + c.path, {
        method: c.method ?? "GET",
        headers: c.headers,
        body: c.body,
        redirect: "manual",
      });
      const statusOk = c.ok.includes(res.status);
      let bodyOk = true;
      if (statusOk && c.bodyPredicate) bodyOk = c.bodyPredicate(await res.text());
      if (statusOk && bodyOk) {
        console.log(`  ✓ ${c.name} [${res.status}]`);
      } else {
        failed++;
        console.error(`  ✗ ${c.name} — got ${res.status}${bodyOk ? "" : " (body predicate failed)"}`);
      }
    } catch (err) {
      failed++;
      console.error(`  ✗ ${c.name} — ${err.message}`);
    }
  }
  return failed;
}

let server;
try {
  if (!EXTERNAL) {
    console.log("smoke: starting dev server...");
    server = spawn("pnpm", ["dev"], { stdio: "ignore", detached: true });
  }
  console.log(`smoke: waiting for ${BASE} ...`);
  await waitForServer();
  console.log("smoke: running checks");
  const failed = await runChecks();
  if (failed > 0) {
    console.error(`smoke: ${failed} check(s) FAILED`);
    process.exitCode = 1;
  } else {
    console.log("smoke: all checks passed");
  }
} finally {
  if (server) {
    try {
      process.kill(-server.pid, "SIGTERM");
    } catch {
      // already gone
    }
  }
}
