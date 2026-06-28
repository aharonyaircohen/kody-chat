/**
 * Source-level structural tests for TaskList intake/backlog actions.
 *
 * The repo's Vitest setup runs in node mode without a DOM renderer, so this
 * follows the existing component source-assertion pattern.
 */
import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const TASK_LIST_PATH = resolve(
  __dirname,
  "../../src/dashboard/lib/components/TaskList.tsx",
);
const SOURCE = readFileSync(TASK_LIST_PATH, "utf8");

describe("TaskList intake actions", () => {
  it("keeps the run action available in intake/backlog mode", () => {
    expect(SOURCE).toMatch(
      /const canExecute = !isClosed && task\.column === "open" && onExecuteTask;/,
    );
    expect(SOURCE).toMatch(/Assign and run/);
  });

  it("keeps backlog closing scoped to intake mode and open issues", () => {
    expect(SOURCE).toMatch(/const canCloseBacklogItem =\s*intakeMode/);
    expect(SOURCE).toMatch(/task\.state === "open"/);
    expect(SOURCE).toMatch(/task\.column === "open"/);
    expect(SOURCE).toMatch(/Close backlog item/);
  });

  it("swallows close-item pointer and click events before opening the confirm dialog", () => {
    expect(SOURCE).toMatch(/const \[actionsMenuOpen, setActionsMenuOpen\]/);
    expect(SOURCE).toMatch(/const openCloseIssueConfirm = useCallback/);
    expect(SOURCE).toMatch(/onPointerDown=\{\(e\) => \{\s*e\.preventDefault\(\);\s*e\.stopPropagation\(\);\s*openCloseIssueConfirm\(\);/);
    expect(SOURCE).toMatch(/onClick=\{\(e\) => \{\s*e\.preventDefault\(\);\s*e\.stopPropagation\(\);/);
    expect(SOURCE).toMatch(/onSelect=\{\(e\) => \{\s*e\.preventDefault\(\);\s*e\.stopPropagation\(\);\s*openCloseIssueConfirm\(\);/);
  });
});
