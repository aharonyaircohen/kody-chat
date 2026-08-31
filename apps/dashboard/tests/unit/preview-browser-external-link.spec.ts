/**
 * @testFramework vitest
 * @domain preview
 */
import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

const __dirname = dirname(fileURLToPath(import.meta.url));
const PREVIEW_BROWSER_PATH = resolve(
  __dirname,
  "../../src/dashboard/features/previews/components/PreviewBrowser.tsx",
);
const REMOTE_SURFACE_PATH = resolve(
  __dirname,
  "../../src/dashboard/features/previews/components/FlyRemoteBrowserSurface.tsx",
);
const BROWSER_START_PATH = resolve(
  __dirname,
  "../../../../packages/fly/browser/start.sh",
);

const SOURCE = readFileSync(PREVIEW_BROWSER_PATH, "utf8");
const REMOTE_SURFACE_SOURCE = readFileSync(REMOTE_SURFACE_PATH, "utf8");
const BROWSER_START_SOURCE = readFileSync(BROWSER_START_PATH, "utf8");

describe("PreviewBrowser new-tab action", () => {
  it("renders an external-link icon that opens the iframe-ready preview URL", () => {
    expect(SOURCE).toMatch(/ExternalLink,?[\s\S]*from "lucide-react"/);
    expect(SOURCE).toMatch(
      /href=\{externalPreviewUrl\s*\?\?\s*activePreviewUrl\}[\s\S]*target="_blank"[\s\S]*rel="noopener noreferrer"[\s\S]*aria-label="Open preview in a new tab"[\s\S]*<ExternalLink/,
    );
  });

  it("does not push auth-only URL changes into preview history", () => {
    expect(SOURCE).toMatch(
      /function sameBrowserAddress[\s\S]*stripPreviewAuthParams\(left,[\s\S]*stripPreviewAuthParams\(right,/,
    );
  });

  it("keeps observed iframe URLs from remounting the iframe", () => {
    expect(SOURCE).toMatch(
      /const \[iframeSourceUrl,\s*setIframeSourceUrl\] = useState/,
    );
    expect(SOURCE).toMatch(
      /const iframeLoadUrl = iframeSourceUrl \?\? previewUrl/,
    );
    expect(SOURCE).toMatch(/src=\{iframeBypassedUrl \?\? undefined\}/);

    const syncBlock = SOURCE.match(
      /const syncBrowserHistoryUrl = useCallback\([\s\S]*?\n  \);/,
    );
    expect(syncBlock).not.toBeNull();
    expect(syncBlock![0]).toContain("setBrowserHistory");
    expect(syncBlock![0]).not.toContain("setIframeSourceUrl");
  });

  it("only explicit browser commands update the iframe load source", () => {
    expect(SOURCE).toContain("setIframeSourceUrl(nextUrl)");
    expect(SOURCE).toContain("setIframeSourceUrl(authedNextUrl)");
    expect(SOURCE).toContain("setIframeSourceUrl(nextRefreshSourceUrl)");
  });

  it("keeps one browser shell and routes its existing controls to Fly", () => {
    expect(SOURCE).toContain("useBrowserSession");
    expect(SOURCE).toContain(
      "remoteAct={remoteSession ? remoteBrowserAct : undefined}",
    );
    expect(SOURCE).toMatch(/if \(remoteSession\)[\s\S]*type: direction/);
    expect(SOURCE).toMatch(/if \(remoteSession\)[\s\S]*type: "navigate"/);
    expect(SOURCE).toMatch(/if \(remoteSession\)[\s\S]*type: "reload"/);
    expect(SOURCE).toContain("<FlyRemoteBrowserSurface");
  });

  it("retains the iframe renderer as the provider-free fallback", () => {
    expect(SOURCE).toMatch(
      /remoteBrowserMode\.kind === "error"[\s\S]*: activePreviewUrl \? \([\s\S]*<PreviewIframe/,
    );
  });

  it("retries transient stream disconnects while a Fly Machine starts", () => {
    expect(REMOTE_SURFACE_SOURCE).toContain("reconnectAttemptsRef.current < 5");
    expect(REMOTE_SURFACE_SOURCE).toMatch(
      /setTimeout\([\s\S]*onDisconnected\?\.\(\)[\s\S]*2_000/,
    );
    expect(REMOTE_SURFACE_SOURCE).toContain("if (disposed) return");
  });

  it("shows only a sharp webpage surface instead of Chromium chrome", () => {
    expect(BROWSER_START_SOURCE).toContain("1280x720x24");
    expect(BROWSER_START_SOURCE).toContain("--window-size=1280,720");
    expect(BROWSER_START_SOURCE).toContain("--app=about:blank");
    expect(REMOTE_SURFACE_SOURCE).toContain("rfb.scaleViewport = true");
    expect(REMOTE_SURFACE_SOURCE).toContain("rfb.resizeSession = false");
    expect(REMOTE_SURFACE_SOURCE).not.toContain("[&_canvas]:h-full");
  });
});
