import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

const __dirname = dirname(fileURLToPath(import.meta.url));
const inboxSource = readFileSync(
  resolve(
    __dirname,
    "../../src/dashboard/features/inbox/components/InboxList.tsx",
  ),
  "utf8",
);

describe("UI Review acceptance fixture", () => {
  it("shows an accessible marker on the signed-in Inbox page", () => {
    expect(inboxSource).toContain('role="status"');
    expect(inboxSource).toContain("UI review acceptance test");
  });
});
