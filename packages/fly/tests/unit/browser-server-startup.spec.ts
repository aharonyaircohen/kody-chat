import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

import { describe, expect, it } from "vitest";

describe("Fly browser server startup", () => {
  it("opens the health port before retrying Chromium bootstrap", () => {
    const source = readFileSync(
      fileURLToPath(new URL("../../browser/server.ts", import.meta.url)),
      "utf8",
    );

    expect(source).toContain("async function bootstrapBrowser()");
    expect(source).toContain("while (!activePage)");
    expect(source).toContain('server.listen(PORT, "0.0.0.0", () => {');
    expect(source).toContain("void bootstrapBrowser()");
    expect(source).not.toContain(
      'await connectBrowser();\nserver.listen(PORT, "0.0.0.0");',
    );
  });
});
