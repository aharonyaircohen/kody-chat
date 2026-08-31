import http from "node:http";
import net from "node:net";
import { setTimeout as delay } from "node:timers/promises";

import { chromium, type BrowserContext, type Page } from "playwright-core";
import { WebSocketServer, WebSocket } from "ws";

import { validatePublicBrowserUrl } from "./src/browsers/security.ts";
import {
  verifyBrowserTicket,
  type BrowserTicketIdentity,
} from "./src/browsers/ticket.ts";

const PORT = Number.parseInt(process.env.PORT ?? "8080", 10);
const MAX_BODY_BYTES = 64 * 1024;
const MAX_TEXT_BYTES = 50 * 1024;
const ACTIONS_PER_MINUTE = 120;
const SESSION_ID = process.env.KODY_BROWSER_SESSION_ID ?? "";
const REPOSITORY = process.env.KODY_BROWSER_REPOSITORY ?? "";
const ACTOR_ID = process.env.KODY_BROWSER_ACTOR_ID ?? "";
const MACHINE_ID = process.env.FLY_MACHINE_ID ?? "";
const VERIFY_KEY = decodeVerifyKey(process.env.KODY_BROWSER_VERIFY_KEY ?? "");
const INITIAL_URL =
  process.env.KODY_BROWSER_INITIAL_URL ?? "https://example.com";

const expectedIdentity: BrowserTicketIdentity = {
  repository: REPOSITORY,
  actorId: ACTOR_ID,
  sessionId: SESSION_ID,
  machineId: MACHINE_ID,
};

const consoleEntries: Array<{ type: string; text: string }> = [];
const failedRequests: Array<{ url: string; error: string }> = [];
let activePage: Page | null = null;
let activeContext: BrowserContext | null = null;
let actionWindowStartedAt = Date.now();
let actionCount = 0;

function acceptAction(): boolean {
  const now = Date.now();
  if (now - actionWindowStartedAt >= 60_000) {
    actionWindowStartedAt = now;
    actionCount = 0;
  }
  actionCount += 1;
  return actionCount <= ACTIONS_PER_MINUTE;
}

function decodeVerifyKey(raw: string): Buffer {
  if (/^[0-9a-fA-F]{64}$/.test(raw)) return Buffer.from(raw, "hex");
  try {
    return Buffer.from(raw.replace(/-/g, "+").replace(/_/g, "/"), "base64");
  } catch {
    return Buffer.alloc(0);
  }
}

function redact(value: string): string {
  return value
    .replace(
      /(authorization|cookie|token|password|secret)=?[^\s&]+/gi,
      "$1=[redacted]",
    )
    .slice(0, 2_000);
}

function ticketFromRequest(req: http.IncomingMessage): string | null {
  const authorization = req.headers.authorization;
  if (authorization?.startsWith("Bearer ")) return authorization.slice(7);
  try {
    return new URL(req.url ?? "/", "http://browser.local").searchParams.get(
      "ticket",
    );
  } catch {
    return null;
  }
}

function isAuthorized(req: http.IncomingMessage): boolean {
  if (
    VERIFY_KEY.length !== 32 ||
    Object.values(expectedIdentity).some((v) => !v)
  ) {
    return false;
  }
  const ticket = ticketFromRequest(req);
  return !!ticket && verifyBrowserTicket(ticket, expectedIdentity, VERIFY_KEY);
}

function json(
  res: http.ServerResponse,
  status: number,
  body: Record<string, unknown>,
): void {
  const data = JSON.stringify(body);
  res.writeHead(status, {
    "Content-Type": "application/json",
    "Content-Length": Buffer.byteLength(data),
    "Cache-Control": "no-store",
  });
  res.end(data);
}

async function readJson(req: http.IncomingMessage): Promise<unknown> {
  const chunks: Buffer[] = [];
  let size = 0;
  for await (const chunk of req) {
    const buffer = Buffer.from(chunk);
    size += buffer.length;
    if (size > MAX_BODY_BYTES) throw new Error("request_too_large");
    chunks.push(buffer);
  }
  return JSON.parse(Buffer.concat(chunks).toString("utf8"));
}

async function waitForChromium(): Promise<void> {
  for (let attempt = 0; attempt < 60; attempt += 1) {
    try {
      const response = await fetch("http://127.0.0.1:9222/json/version");
      if (response.ok) return;
    } catch {
      // Chromium is still starting.
    }
    await delay(250);
  }
  throw new Error("chromium_start_timeout");
}

function attachPageEvents(page: Page): void {
  page.on("console", (message) => {
    consoleEntries.push({ type: message.type(), text: redact(message.text()) });
    if (consoleEntries.length > 100) consoleEntries.shift();
  });
  page.on("requestfailed", (request) => {
    failedRequests.push({
      url: request.url().slice(0, 2_000),
      error: redact(request.failure()?.errorText ?? "request_failed"),
    });
    if (failedRequests.length > 100) failedRequests.shift();
  });
}

async function installNetworkGuard(context: BrowserContext): Promise<void> {
  await context.route("**/*", async (route) => {
    const requestUrl = route.request().url();
    const protocol = new URL(requestUrl).protocol;
    if (["about:", "blob:", "data:"].includes(protocol)) {
      await route.continue();
      return;
    }
    try {
      await validatePublicBrowserUrl(requestUrl);
      await route.continue();
    } catch {
      await route.abort("blockedbyclient");
    }
  });
}

async function connectBrowser(): Promise<void> {
  await waitForChromium();
  const browser = await chromium.connectOverCDP("http://127.0.0.1:9222");
  activeContext = browser.contexts()[0] ?? (await browser.newContext());
  await installNetworkGuard(activeContext);
  activePage = activeContext.pages()[0] ?? (await activeContext.newPage());
  attachPageEvents(activePage);
  activeContext.on("page", async (page) => {
    attachPageEvents(page);
    activePage = page;
  });
  try {
    await activePage.goto(await validatePublicBrowserUrl(INITIAL_URL), {
      waitUntil: "domcontentloaded",
      timeout: 30_000,
    });
  } catch {
    // The session stays usable at about:blank when the initial URL fails.
  }
}

function requirePage(): Page {
  if (!activePage) throw new Error("browser_not_ready");
  return activePage;
}

async function executeAction(action: Record<string, unknown>) {
  const page = requirePage();
  switch (action.type) {
    case "navigate": {
      const url = await validatePublicBrowserUrl(String(action.url ?? ""));
      await page.goto(url, { waitUntil: "domcontentloaded", timeout: 30_000 });
      break;
    }
    case "back":
      await page.goBack({ waitUntil: "domcontentloaded", timeout: 30_000 });
      break;
    case "forward":
      await page.goForward({ waitUntil: "domcontentloaded", timeout: 30_000 });
      break;
    case "reload":
      await page.reload({ waitUntil: "domcontentloaded", timeout: 30_000 });
      break;
    case "viewport":
      await page.setViewportSize({
        width: Math.max(320, Math.min(1920, Number(action.width))),
        height: Math.max(480, Math.min(1080, Number(action.height))),
      });
      break;
    case "pointer": {
      const x = Number(action.x);
      const y = Number(action.y);
      if (action.action === "move") await page.mouse.move(x, y);
      if (action.action === "down")
        await page.mouse.down({
          button: String(action.button ?? "left") as "left",
        });
      if (action.action === "up")
        await page.mouse.up({
          button: String(action.button ?? "left") as "left",
        });
      if (action.action === "wheel")
        await page.mouse.wheel(
          Number(action.deltaX ?? 0),
          Number(action.deltaY ?? 0),
        );
      break;
    }
    case "keyboard":
      if (action.action === "insertText")
        await page.keyboard.insertText(String(action.key ?? ""));
      else if (action.action === "down")
        await page.keyboard.down(String(action.key ?? ""));
      else await page.keyboard.up(String(action.key ?? ""));
      break;
    case "click":
      await page
        .locator(String(action.selector ?? ""))
        .click({ timeout: 10_000 });
      break;
    case "fill":
      await page
        .locator(String(action.selector ?? ""))
        .fill(String(action.value ?? ""), { timeout: 10_000 });
      break;
    case "scroll":
      if (action.selector)
        await page
          .locator(String(action.selector))
          .scrollIntoViewIfNeeded({ timeout: 10_000 });
      else await page.mouse.wheel(0, Number(action.deltaY ?? 600));
      break;
    case "wait":
      await page.waitForTimeout(
        Math.min(10_000, Math.max(0, Number(action.ms ?? 500))),
      );
      break;
    case "screenshot": {
      const screenshot = await page.screenshot({ type: "jpeg", quality: 80 });
      return { ok: true, url: page.url(), data: screenshot.toString("base64") };
    }
    case "pick": {
      const element = await page.evaluate(
        () =>
          new Promise<Record<string, unknown>>((resolve) => {
            const root = window as typeof window & {
              __kodyCancelPick?: () => void;
            };
            const selectorFor = (element: Element): string => {
              if (element.id) return `#${CSS.escape(element.id)}`;
              const parts: string[] = [];
              let current: Element | null = element;
              while (
                current &&
                current !== document.documentElement &&
                parts.length < 6
              ) {
                const siblings = current.parentElement
                  ? Array.from(current.parentElement.children).filter(
                      (node) => node.tagName === current!.tagName,
                    )
                  : [];
                parts.unshift(
                  `${current.tagName.toLowerCase()}${siblings.length > 1 ? `:nth-of-type(${siblings.indexOf(current) + 1})` : ""}`,
                );
                current = current.parentElement;
              }
              return parts.join(" > ");
            };
            const cleanup = () =>
              document.removeEventListener("click", handler, true);
            const handler = (event: MouseEvent) => {
              event.preventDefault();
              event.stopPropagation();
              cleanup();
              const target = event.target as HTMLElement;
              const rect = target.getBoundingClientRect();
              const attributes = Object.fromEntries(
                Array.from(target.attributes)
                  .slice(0, 20)
                  .map((a) => [a.name, a.value.slice(0, 500)]),
              );
              const styles = getComputedStyle(target);
              resolve({
                selector: selectorFor(target),
                tagName: target.tagName.toLowerCase(),
                id: target.id || null,
                classes: Array.from(target.classList).slice(0, 20),
                text: (target.innerText || "")
                  .trim()
                  .replace(/\s+/g, " ")
                  .slice(0, 500),
                attributes,
                computedStyles: {
                  color: styles.color,
                  backgroundColor: styles.backgroundColor,
                  fontSize: styles.fontSize,
                  fontWeight: styles.fontWeight,
                  padding: styles.padding,
                  margin: styles.margin,
                  gap: styles.gap,
                  border: styles.border,
                  borderRadius: styles.borderRadius,
                  boxShadow: styles.boxShadow,
                  width: styles.width,
                  maxWidth: styles.maxWidth,
                  display: styles.display,
                },
                rect: {
                  x: rect.x,
                  y: rect.y,
                  width: rect.width,
                  height: rect.height,
                },
                url: location.href,
              });
            };
            root.__kodyCancelPick = () => {
              cleanup();
              resolve({});
            };
            document.addEventListener("click", handler, true);
          }),
      );
      return {
        ok: true,
        url: page.url(),
        data: { element: Object.keys(element).length ? element : undefined },
      };
    }
    case "cancelPick":
      await page.evaluate(() =>
        (
          window as typeof window & { __kodyCancelPick?: () => void }
        ).__kodyCancelPick?.(),
      );
      break;
    case "perf": {
      const data = await page.evaluate(() => {
        const nav = performance.getEntriesByType("navigation")[0] as
          PerformanceNavigationTiming | undefined;
        const resources = performance.getEntriesByType(
          "resource",
        ) as PerformanceResourceTiming[];
        return {
          url: location.href,
          ttfbMs: nav ? nav.responseStart : 0,
          domContentLoadedMs: nav ? nav.domContentLoadedEventEnd : 0,
          loadMs: nav ? nav.loadEventEnd : 0,
          fcpMs:
            performance.getEntriesByName("first-contentful-paint")[0]
              ?.startTime ?? 0,
          lcpMs: 0,
          resourceCount: resources.length,
          totalBytes: resources.reduce(
            (sum, item) => sum + (item.transferSize || 0),
            0,
          ),
          slowest: resources
            .sort((a, b) => b.duration - a.duration)
            .slice(0, 10)
            .map((item) => ({
              url: item.name,
              type: item.initiatorType,
              durationMs: item.duration,
              bytes: item.transferSize || 0,
            })),
        };
      });
      return { ok: true, url: page.url(), data };
    }
    case "edit": {
      const command = action.command as {
        selector: string;
        mutation: Record<string, unknown>;
      };
      await page.evaluate(({ selector, mutation }) => {
        const root = window as typeof window & {
          __kodyEdits?: Array<{ selector: string; html: string }>;
        };
        const target = document.querySelector<HTMLElement>(selector);
        if (!target) throw new Error("selector_not_found");
        root.__kodyEdits ??= [];
        root.__kodyEdits.push({ selector, html: target.outerHTML });
        if (mutation.op === "style")
          Object.assign(
            target.style,
            mutation.styles as Record<string, string>,
          );
        if (mutation.op === "text")
          target.textContent = String(mutation.value ?? "");
        if (mutation.op === "attribute")
          target.setAttribute(
            String(mutation.name),
            String(mutation.value ?? ""),
          );
        if (mutation.op === "hide") target.style.display = "none";
        if (mutation.op === "remove") target.remove();
        if (mutation.op === "duplicate") target.after(target.cloneNode(true));
      }, command);
      break;
    }
    case "undoEdit":
      await page.evaluate(() => {
        const root = window as typeof window & {
          __kodyEdits?: Array<{ selector: string; html: string }>;
        };
        const edit = root.__kodyEdits?.pop();
        if (!edit) return;
        const target = document.querySelector(edit.selector);
        if (!target) return;
        const template = document.createElement("template");
        template.innerHTML = edit.html;
        target.replaceWith(template.content.firstElementChild!);
      });
      break;
    case "resetEdits":
      await page.reload({ waitUntil: "domcontentloaded", timeout: 30_000 });
      break;
    case "recordStart":
      await page.evaluate(() => {
        const root = window as typeof window & {
          __kodyRecording?: Array<Record<string, string>>;
          __kodyRecordCleanup?: () => void;
        };
        root.__kodyRecordCleanup?.();
        root.__kodyRecording = [];
        const selectorFor = (element: Element) =>
          element.id
            ? `#${CSS.escape(element.id)}`
            : element.tagName.toLowerCase();
        const click = (event: Event) => {
          const target = event.target as HTMLElement;
          root.__kodyRecording?.push({
            type: "click",
            selector: selectorFor(target),
            text: (target.innerText || "").trim().slice(0, 100),
          });
        };
        const change = (event: Event) => {
          const target = event.target as HTMLInputElement;
          if (target.matches("input,textarea"))
            root.__kodyRecording?.push({
              type: "fill",
              selector: selectorFor(target),
              value:
                target.type === "password" ? "" : target.value.slice(0, 2_000),
            });
        };
        document.addEventListener("click", click, true);
        document.addEventListener("change", change, true);
        root.__kodyRecordCleanup = () => {
          document.removeEventListener("click", click, true);
          document.removeEventListener("change", change, true);
        };
      });
      break;
    case "recordStop": {
      const data = await page.evaluate(() => {
        const root = window as typeof window & {
          __kodyRecording?: Array<Record<string, string>>;
          __kodyRecordCleanup?: () => void;
        };
        root.__kodyRecordCleanup?.();
        return { steps: root.__kodyRecording ?? [], url: location.href };
      });
      return { ok: true, url: page.url(), data };
    }
    case "snapshot": {
      const snapshot = await page.evaluate((maxBytes) => {
        const elements = Array.from(
          document.querySelectorAll<HTMLElement>(
            "a,button,input,textarea,select,[role],[contenteditable=true]",
          ),
        )
          .slice(0, 500)
          .map((element, index) => {
            const rect = element.getBoundingClientRect();
            return {
              ref: `e${index + 1}`,
              tag: element.tagName.toLowerCase(),
              role: element.getAttribute("role"),
              name:
                element.getAttribute("aria-label") ??
                element.getAttribute("title") ??
                element.innerText?.trim().slice(0, 200) ??
                "",
              disabled: element.matches(":disabled"),
              box: {
                x: rect.x,
                y: rect.y,
                width: rect.width,
                height: rect.height,
              },
            };
          });
        return {
          text: (document.body?.innerText ?? "").slice(0, maxBytes),
          elements,
        };
      }, MAX_TEXT_BYTES);
      return {
        ok: true,
        url: page.url(),
        title: await page.title(),
        data: { snapshot, console: consoleEntries, failedRequests },
      };
    }
    default:
      throw new Error("unsupported_browser_action");
  }
  return { ok: true, url: page.url(), title: await page.title() };
}

const server = http.createServer(async (req, res) => {
  if (req.method === "GET" && req.url === "/health") {
    json(res, activePage ? 200 : 503, { ok: !!activePage });
    return;
  }
  if (req.method !== "POST" || req.url !== "/api/browser/action") {
    json(res, 404, { error: "not_found" });
    return;
  }
  if (!isAuthorized(req)) {
    json(res, 401, { error: "unauthorized" });
    return;
  }
  if (!acceptAction()) {
    json(res, 429, { error: "rate_limited" });
    return;
  }
  try {
    const action = (await readJson(req)) as Record<string, unknown>;
    json(res, 200, await executeAction(action));
  } catch (error) {
    const code =
      error instanceof Error ? error.message : "browser_action_failed";
    json(res, code === "browser_url_blocked" ? 400 : 500, { error: code });
  }
});

const websocketServer = new WebSocketServer({
  noServer: true,
  handleProtocols: (protocols) => (protocols.has("binary") ? "binary" : false),
});

server.on("upgrade", (req, socket, head) => {
  const url = new URL(req.url ?? "/", "http://browser.local");
  if (url.pathname !== "/stream" || !isAuthorized(req)) {
    socket.write("HTTP/1.1 401 Unauthorized\r\nConnection: close\r\n\r\n");
    socket.destroy();
    return;
  }
  websocketServer.handleUpgrade(req, socket, head, (websocket) => {
    websocketServer.emit("connection", websocket, req);
  });
});

websocketServer.on("connection", (websocket) => {
  const vnc = net.connect(5900, "127.0.0.1");
  vnc.on("data", (chunk) => {
    if (websocket.readyState === WebSocket.OPEN) websocket.send(chunk);
  });
  vnc.on("error", () => websocket.close(1011, "vnc_unavailable"));
  vnc.on("close", () => websocket.close());
  websocket.on("message", (data) => vnc.write(Buffer.from(data as Buffer)));
  websocket.on("close", () => vnc.destroy());
  websocket.on("error", () => vnc.destroy());
});

await connectBrowser();
server.listen(PORT, "0.0.0.0");
