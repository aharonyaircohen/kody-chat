import { createServer } from "node:net";
import { spawn, type ChildProcess } from "node:child_process";
import {
  chmodSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";

import { mintTerminalBridgeToken } from "@kody-ade/terminal/terminal-token";
import { TERMINAL_BRIDGE_SCRIPT } from "../../src/plugin/terminal/bridge";

const SECRET = "gateway-process-test-secret";
const roots: string[] = [];
const children: ChildProcess[] = [];

afterEach(() => {
  for (const child of children.splice(0)) child.kill("SIGTERM");
  for (const root of roots.splice(0)) rmSync(root, { recursive: true, force: true });
});

async function unusedPort(): Promise<number> {
  const server = createServer();
  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
  const address = server.address();
  if (!address || typeof address === "string") throw new Error("port unavailable");
  await new Promise<void>((resolve, reject) =>
    server.close((error) => (error ? reject(error) : resolve())),
  );
  return address.port;
}

async function waitForHealth(port: number): Promise<void> {
  for (let attempt = 0; attempt < 50; attempt += 1) {
    try {
      const response = await fetch(`http://127.0.0.1:${port}/healthz`);
      if (response.ok) return;
    } catch {
      // Process startup is asynchronous.
    }
    await new Promise((resolve) => setTimeout(resolve, 20));
  }
  throw new Error("gateway did not become healthy");
}

function nextMessages(
  socket: WebSocket,
  count: number,
): Promise<Record<string, unknown>[]> {
  return new Promise((resolve, reject) => {
    const messages: Record<string, unknown>[] = [];
    const onMessage = (event: MessageEvent) => {
      messages.push(JSON.parse(String(event.data)) as Record<string, unknown>);
      if (messages.length === count) {
        cleanup();
        resolve(messages);
      }
    };
    const onError = () => {
      cleanup();
      reject(new Error("websocket failed"));
    };
    const cleanup = () => {
      socket.removeEventListener("message", onMessage);
      socket.removeEventListener("error", onError);
    };
    socket.addEventListener("message", onMessage);
    socket.addEventListener("error", onError);
  });
}

function token(
  afterRevision?: number,
  options: { localExec?: boolean } = {},
): string {
  return mintTerminalBridgeToken({
    owner: "acme",
    repo: "widgets",
    app: "brain-test",
    machineId: "machine-1",
    chatSessionId: "terminal-1",
    conversationId: "conversation-1",
    afterRevision,
    flyToken: "FlyV1 test",
    cols: 100,
    rows: 30,
    secret: SECRET,
    ...(options.localExec ? { localExec: true } : {}),
  });
}

describe("stateless terminal gateway process", () => {
  it("opens one Brain agent per socket and forwards the same revision on reconnect", async () => {
    const root = mkdtempSync(join(tmpdir(), "kody-gateway-"));
    roots.push(root);
    const gatewayPath = join(root, "bridge.mjs");
    const flyctlPath = join(root, "flyctl");
    const logPath = join(root, "agent-requests.jsonl");
    writeFileSync(gatewayPath, TERMINAL_BRIDGE_SCRIPT);
    writeFileSync(
      flyctlPath,
      `#!/usr/bin/env node
const fs = require("node:fs");
const readline = require("node:readline");
const lines = readline.createInterface({ input: process.stdin });
let generation = 1;
lines.on("line", (line) => {
  const value = JSON.parse(line);
  fs.appendFileSync(process.env.AGENT_LOG, JSON.stringify(value) + "\\n");
  if (value.type === "open") {
    process.stdout.write(JSON.stringify({ type: "state", sessionId: value.session.id, generation, state: "ready" }) + "\\n");
    process.stdout.write(JSON.stringify({ type: "output", sessionId: value.session.id, generation, revision: 1, data: "durable screen" }) + "\\n");
  } else if (value.type === "input") {
    process.stdout.write(JSON.stringify({ type: "input-accepted", sessionId: value.sessionId, generation, inputId: value.inputId }) + "\\n");
  }
});
`,
    );
    chmodSync(flyctlPath, 0o755);
    const port = await unusedPort();
    const child = spawn(process.execPath, [gatewayPath], {
      env: {
        ...process.env,
        PATH: `${root}:${process.env.PATH ?? ""}`,
        PORT: String(port),
        BRIDGE_AUTH_SECRET: SECRET,
        AGENT_LOG: logPath,
      },
      stdio: ["ignore", "pipe", "pipe"],
    });
    children.push(child);
    await waitForHealth(port);

    const first = new WebSocket(`ws://127.0.0.1:${port}/?token=${token()}`);
    const firstMessages = nextMessages(first, 2);
    await new Promise<void>((resolve, reject) => {
      first.addEventListener("open", () => resolve(), { once: true });
      first.addEventListener("error", () => reject(new Error("open failed")), {
        once: true,
      });
    });
    const [firstState, firstOutput] = await firstMessages;
    expect(firstState).toMatchObject({
      type: "state",
      sessionId: "terminal-1",
      generation: 1,
      state: "ready",
    });
    expect(firstOutput).toMatchObject({
      type: "output",
      revision: 1,
      data: "durable screen",
    });
    first.close();

    const second = new WebSocket(
      `ws://127.0.0.1:${port}/?token=${token(1)}`,
    );
    const secondMessages = nextMessages(second, 1);
    await new Promise<void>((resolve, reject) => {
      second.addEventListener("open", () => resolve(), { once: true });
      second.addEventListener("error", () => reject(new Error("open failed")), {
        once: true,
      });
    });
    const [secondState] = await secondMessages;
    expect(secondState).toMatchObject({
      type: "state",
      sessionId: "terminal-1",
      generation: 1,
      state: "ready",
    });
    second.close();

    await new Promise((resolve) => setTimeout(resolve, 30));
    const opens = readFileSync(logPath, "utf8")
      .trim()
      .split("\n")
      .map((line) => JSON.parse(line) as Record<string, unknown>)
      .filter((value) => value.type === "open");
    expect(opens).toHaveLength(2);
    expect(opens[0]).toMatchObject({ afterRevision: 0 });
    expect(opens[1]).toMatchObject({ afterRevision: 1 });
  });

  it("runs authenticated local commands and exposes completed job output", async () => {
    const root = mkdtempSync(join(tmpdir(), "kody-gateway-exec-"));
    roots.push(root);
    const gatewayPath = join(root, "bridge.mjs");
    const flyctlPath = join(root, "flyctl");
    writeFileSync(gatewayPath, TERMINAL_BRIDGE_SCRIPT);
    writeFileSync(flyctlPath, "#!/bin/sh\nexit 1\n");
    chmodSync(flyctlPath, 0o755);
    const port = await unusedPort();
    const child = spawn(process.execPath, [gatewayPath], {
      env: {
        ...process.env,
        PATH: `${root}:${process.env.PATH ?? ""}`,
        PORT: String(port),
        BRIDGE_AUTH_SECRET: SECRET,
      },
      stdio: ["ignore", "pipe", "pipe"],
    });
    children.push(child);
    await waitForHealth(port);
    const auth = {
      Authorization: `Bearer ${token(undefined, { localExec: true })}`,
    };

    const direct = await fetch(`http://127.0.0.1:${port}/exec`, {
      method: "POST",
      headers: { ...auth, "Content-Type": "application/json" },
      body: JSON.stringify({ command: "printf direct-output", local: true }),
    });
    await expect(direct.json()).resolves.toMatchObject({
      ok: true,
      code: 0,
      stdout: "direct-output",
    });

    const started = await fetch(`http://127.0.0.1:${port}/jobs`, {
      method: "POST",
      headers: { ...auth, "Content-Type": "application/json" },
      body: JSON.stringify({
        command: "printf job-output; printf job-warning >&2",
        local: true,
      }),
    });
    const startedBody = (await started.json()) as { job: { id: string } };
    let completed: Record<string, unknown> | null = null;
    for (let attempt = 0; attempt < 50; attempt += 1) {
      const response = await fetch(
        `http://127.0.0.1:${port}/jobs/${startedBody.job.id}`,
        { headers: auth },
      );
      const body = (await response.json()) as {
        job?: Record<string, unknown>;
      };
      if (body.job?.status !== "running") {
        completed = body.job ?? null;
        break;
      }
      await new Promise((resolve) => setTimeout(resolve, 20));
    }
    expect(completed).toMatchObject({
      status: "completed",
      code: 0,
      stdout: "job-output",
      stderr: "job-warning",
    });
  });
});
