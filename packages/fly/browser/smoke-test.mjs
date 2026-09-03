import crypto from "node:crypto";
import WebSocket from "ws";

const endpoint = process.env.BROWSER_TEST_ENDPOINT ?? "http://127.0.0.1:18080";
const key = Buffer.from(
  (process.env.BROWSER_TEST_VERIFY_KEY ?? "")
    .replace(/-/g, "+")
    .replace(/_/g, "/"),
  "base64",
);
const identity = {
  repository: process.env.BROWSER_TEST_REPOSITORY ?? "acme/app",
  actorId: process.env.BROWSER_TEST_ACTOR_ID ?? "octocat",
  sessionId: process.env.BROWSER_TEST_SESSION_ID ?? "session-local",
  machineId: process.env.BROWSER_TEST_MACHINE_ID ?? "machine-local",
};

if (key.length !== 32)
  throw new Error("BROWSER_TEST_VERIFY_KEY must decode to 32 bytes");

function mintTicket(ticketIdentity) {
  const expiresAt = Math.floor(Date.now() / 1000) + 300;
  const subject = [
    ticketIdentity.repository,
    ticketIdentity.actorId,
    ticketIdentity.sessionId,
    ticketIdentity.machineId,
    expiresAt,
  ].join("\n");
  const signature = crypto
    .createHmac("sha256", key)
    .update(subject)
    .digest("hex")
    .slice(0, 32);
  return Buffer.from(
    JSON.stringify({ ...ticketIdentity, expiresAt, signature }),
  ).toString("base64url");
}

const ticket = mintTicket(identity);

const unauthorized = await fetch(`${endpoint}/api/browser/action`, {
  method: "POST",
  headers: { "Content-Type": "application/json" },
  body: JSON.stringify({ type: "snapshot" }),
});
if (unauthorized.status !== 401)
  throw new Error("Unauthenticated action was accepted");

const replayMachineId = "machine-routed-elsewhere";
const replay = await fetch(`${endpoint}/api/browser/action`, {
  method: "POST",
  redirect: "manual",
  headers: {
    Authorization: `Bearer ${mintTicket({ ...identity, machineId: replayMachineId })}`,
    "Content-Type": "application/json",
  },
  body: JSON.stringify({ type: "snapshot" }),
});
if (
  replay.status !== 307 ||
  replay.headers.get("fly-replay") !== `instance=${replayMachineId}`
) {
  throw new Error("Exact Fly Machine replay was not requested");
}

async function action(body) {
  const response = await fetch(`${endpoint}/api/browser/action`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${ticket}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify(body),
  });
  const result = await response.json();
  if (!response.ok || !result.ok) {
    throw new Error(`action ${body.type} failed: ${JSON.stringify(result)}`);
  }
  return result;
}

const streamUrl = new URL(endpoint);
streamUrl.protocol = streamUrl.protocol === "https:" ? "wss:" : "ws:";
streamUrl.pathname = "/stream";
streamUrl.searchParams.set("ticket", ticket);
const socket = new WebSocket(streamUrl);
const messages = [];
let heartbeatPings = 0;
socket.on("message", (data) => messages.push(JSON.parse(data.toString())));
socket.on("ping", () => {
  heartbeatPings += 1;
});

async function waitFor(predicate, label, timeoutMs = 15_000) {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    const value = messages.find(predicate);
    if (value) return value;
    await new Promise((resolve) => setTimeout(resolve, 25));
  }
  throw new Error(`timed out waiting for ${label}`);
}

await waitFor((message) => message.type === "ready", "stream ready");
const firstFrame = await waitFor(
  (message) => message.type === "frame",
  "first frame",
);
await waitFor((message) => message.type === "state", "page state");

socket.send(JSON.stringify({ type: "viewport", width: 900, height: 1000 }));
await waitFor(
  (message) =>
    message.type === "state" &&
    message.page.viewport.width === 900 &&
    message.page.viewport.height === 1000,
  "viewport state",
);

await action({ type: "navigate", url: "https://httpbin.org/forms/post" });
await action({ type: "recordStart" });
await action({ type: "click", selector: "input[name=custname]" });
const frameBeforeScroll = Math.max(
  ...messages
    .filter((message) => message.type === "frame")
    .map((message) => message.frameId),
);
socket.send(
  JSON.stringify({ type: "keyboard", action: "insertText", key: "שלום" }),
);
await new Promise((resolve) => setTimeout(resolve, 250));
await action({ type: "click", selector: "body" });
const recording = await action({ type: "recordStop" });
if (!JSON.stringify(recording.data).includes("שלום")) {
  throw new Error("Unicode keyboard input was not preserved");
}

socket.send(
  JSON.stringify({
    type: "pointer",
    action: "wheel",
    x: 450,
    y: 500,
    deltaX: 0,
    deltaY: 500,
  }),
);
await waitFor(
  (message) => message.type === "frame" && message.frameId > frameBeforeScroll,
  "post-scroll frame",
);

const navigationStartedAt = Date.now();
const second = await action({
  type: "navigate",
  url: "https://www.iana.org/help/example-domains",
});
if (Date.now() - navigationStartedAt > 8_000) {
  throw new Error("Committed navigation took too long to return");
}
if (!second.page?.canGoBack)
  throw new Error("Chromium history did not expose Back");
const back = await action({ type: "back" });
if (!back.url?.includes("httpbin.org/forms/post")) {
  throw new Error(`Back opened the wrong page: ${back.url}`);
}
const forward = await action({ type: "forward" });
if (!forward.url?.includes("iana.org/help/example-domains")) {
  throw new Error(`Forward opened the wrong page: ${forward.url}`);
}

const snapshot = await action({ type: "snapshot" });
if (!snapshot.data?.snapshot?.text || snapshot.url !== forward.url) {
  throw new Error("Fresh page snapshot did not match the visible page");
}

const beforeZoom = await action({ type: "screenshot" });
socket.send(JSON.stringify({ type: "zoom", delta: 1 }));
await new Promise((resolve) => setTimeout(resolve, 250));
const afterZoom = await action({ type: "screenshot" });
if (beforeZoom.data === afterZoom.data) {
  throw new Error("Browser zoom shortcut did not change the rendered page");
}

if (process.env.BROWSER_TEST_HEARTBEAT === "1") {
  const heartbeatDeadline = Date.now() + 85_000;
  while (heartbeatPings < 3 && Date.now() < heartbeatDeadline) {
    await new Promise((resolve) => setTimeout(resolve, 100));
  }
  if (heartbeatPings < 3 || socket.readyState !== WebSocket.OPEN) {
    throw new Error(
      `stream did not remain healthy for three heartbeats: ${heartbeatPings}`,
    );
  }
  const afterHeartbeat = await action({ type: "snapshot" });
  if (afterHeartbeat.url !== snapshot.url) {
    throw new Error(
      "Browser state changed during the heartbeat endurance test",
    );
  }
}

await new Promise((resolve) => {
  socket.once("close", resolve);
  socket.close();
});
const reconnectFrame = await new Promise((resolve, reject) => {
  const reconnect = new WebSocket(streamUrl);
  const timeout = setTimeout(() => {
    reconnect.close();
    reject(new Error("reconnected viewer did not receive a cached frame"));
  }, 2_000);
  reconnect.on("message", (data) => {
    const message = JSON.parse(data.toString());
    if (message.type !== "frame") return;
    clearTimeout(timeout);
    reconnect.close();
    resolve(message);
  });
  reconnect.on("error", reject);
});
process.stdout.write(
  JSON.stringify({
    ok: true,
    firstFrameId: firstFrame.frameId,
    finalUrl: snapshot.url,
    unicodeInput: true,
    zoom: true,
    viewport: "900x1000",
    heartbeatPings,
    reconnectFrame: reconnectFrame.frameId,
  }),
);
