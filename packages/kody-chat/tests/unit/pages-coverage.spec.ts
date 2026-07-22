/**
 * @fileoverview Every canonical shared page (src/dashboard/lib/pages/*) must
 * be served by this app via a route file that re-exports it. Adding a page
 * without registering its route fails here with the missing path.
 * @testFramework vitest
 * @domain pages
 */
import { readdirSync, readFileSync, existsSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

/** Canonical page module -> this app's route file. */
const ROUTE_FOR: Record<string, string> = {
  models: "app/(shell)/models/page.tsx",
  brain: "app/(shell)/brain/page.tsx",
  secrets: "app/(shell)/secrets/page.tsx",
  brands: "app/(shell)/brands/page.tsx",
  "brand-detail": "app/(shell)/brands/[slug]/page.tsx",
  commands: "app/(shell)/commands/page.tsx",
  context: "app/(shell)/context/page.tsx",
  "context-detail": "app/(shell)/context/[slug]/page.tsx",
  memory: "app/(shell)/memory/page.tsx",
  "memory-detail": "app/(shell)/memory/[id]/page.tsx",
  instructions: "app/(shell)/instructions/page.tsx",
  "view-renderers": "app/(shell)/views/renderers/page.tsx",
  "view-renderer-detail": "app/(shell)/views/renderers/[slug]/page.tsx",
  widgets: "app/(shell)/views/widgets/page.tsx",
  snippets: "app/(shell)/snippets/page.tsx",
  triggers: "app/(shell)/triggers/page.tsx",
  "guided-flows": "app/(shell)/guided-flows/page.tsx",
  "user-journeys": "app/(shell)/user-journeys/page.tsx",
};

const PAGES_DIR = join(process.cwd(), "src/dashboard/lib/pages");

describe("shared pages route coverage", () => {
  const pages = readdirSync(PAGES_DIR)
    .filter((f) => f.endsWith(".tsx"))
    .map((f) => f.replace(/\.tsx$/, ""));

  it("every canonical page has a route mapping", () => {
    for (const page of pages) {
      expect(
        ROUTE_FOR[page],
        `add a route mapping for pages/${page}`,
      ).toBeTruthy();
    }
  });

  it("every route file exists and re-exports its canonical page", () => {
    for (const [page, route] of Object.entries(ROUTE_FOR)) {
      const abs = join(process.cwd(), route);
      expect(existsSync(abs), `${route} is missing`).toBe(true);
      expect(
        readFileSync(abs, "utf8"),
        `${route} must re-export pages/${page}`,
      ).toContain(`lib/pages/${page}"`);
    }
  });
});
