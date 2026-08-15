import { describe, expect, it } from "vitest";

import {
  formatInternalLinks,
  isSafeInternalHref,
  stripConflictingInternalLinks,
} from "../src/internal-links";

describe("internal chat links", () => {
  it("formats validated internal links as Markdown", () => {
    expect(
      formatInternalLinks([
        { href: "/repo/acme/app/todos/launch", label: "Open todo: launch" },
      ]),
    ).toBe("[Open todo: launch](/repo/acme/app/todos/launch)");
  });

  it("rejects external and protocol-relative destinations", () => {
    expect(isSafeInternalHref("https://example.com")).toBe(false);
    expect(isSafeInternalHref("//example.com")).toBe(false);
    expect(isSafeInternalHref("/repo/acme/app/todos/launch")).toBe(true);
    expect(
      formatInternalLinks([{ href: "javascript:alert(1)", label: "Bad" }]),
    ).toBe("");
  });

  it("keeps only the canonical destination for a known link label", () => {
    expect(
      stripConflictingInternalLinks(
        "[Open todo: test](https://repo.example/todos/test)",
        [{ href: "/repo/acme/app/todos/test", label: "Open todo: test" }],
      ),
    ).toBe("");
  });
});
