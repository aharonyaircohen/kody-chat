import { describe, expect, it } from "vitest";

import { readFileSync } from "node:fs";
import { resolve } from "node:path";

describe("Dashboard chat model resolution boundary", () => {
  it("adds Kody-account context around the package-owned resolver", () => {
    const source = readFileSync(
      resolve(process.cwd(), "app/api/kody/chat/resolve-model.ts"),
      "utf8",
    );
    expect(source).toContain("resolvePackageChatModel(");
    expect(source).toContain("withPersonalChatUser(");
    expect(source).toContain("requireKodyUser()");
  });
});
