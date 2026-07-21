/**
 * Widget host pure helpers: bundle URL construction with query-param auth
 * and v1 mount-contract module validation. The React component itself is
 * not rendered here (no DOM test environment in this repo — see
 * kody-chat-no-auto-dispatch.spec.ts).
 *
 * @testFramework vitest
 * @domain unit
 */
import { describe, expect, it } from "vitest";
import {
  WIDGET_CONTRACT_VERSION,
  buildWidgetBundleUrl,
  resolveWidgetMount,
} from "@dashboard/lib/chat/surface/widget-host";

describe("buildWidgetBundleUrl", () => {
  it("targets the widgets route with owner/repo/token query auth", () => {
    const url = buildWidgetBundleUrl("quiz", {
      owner: "acme",
      repo: "site",
      token: "tok",
    });
    expect(url).toBe("/api/kody/widgets/quiz?owner=acme&repo=site&token=tok");
  });

  it("encodes every URL component", () => {
    const url = buildWidgetBundleUrl("quiz", {
      owner: "acme co",
      repo: "site/one",
      token: "a&b=c",
    });
    const parsed = new URL(url, "https://dash.test");
    expect(parsed.pathname).toBe("/api/kody/widgets/quiz");
    expect(parsed.searchParams.get("owner")).toBe("acme co");
    expect(parsed.searchParams.get("repo")).toBe("site/one");
    expect(parsed.searchParams.get("token")).toBe("a&b=c");
  });
});

describe("resolveWidgetMount", () => {
  it("returns the default export when it is a function", () => {
    const mount = () => undefined;
    expect(resolveWidgetMount({ default: mount })).toBe(mount);
  });

  it("returns null for modules that break the contract", () => {
    expect(resolveWidgetMount(null)).toBeNull();
    expect(resolveWidgetMount(undefined)).toBeNull();
    expect(resolveWidgetMount({})).toBeNull();
    expect(resolveWidgetMount({ default: "nope" })).toBeNull();
    expect(resolveWidgetMount({ mount: () => undefined })).toBeNull();
  });
});

describe("contract version", () => {
  it("is v1", () => {
    expect(WIDGET_CONTRACT_VERSION).toBe(1);
  });
});
