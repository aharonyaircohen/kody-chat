/**
 * Source-level structural tests for the Workflows page run button.
 *
 * The dashboard runs Vitest in node mode and does not include happy-dom /
 * @testing-library/react, so this follows the existing source-level component
 * test pattern.
 */
import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const WORKFLOWS_MANAGER_PATH = resolve(
  __dirname,
  "../../src/dashboard/lib/components/WorkflowsManager.tsx",
);
const SOURCE = readFileSync(WORKFLOWS_MANAGER_PATH, "utf8");
const WORKFLOW_EDITOR_SOURCE = readFileSync(
  resolve(
    __dirname,
    "../../src/dashboard/lib/components/WorkflowEditorDialog.tsx",
  ),
  "utf8",
);

describe("WorkflowsManager run button", () => {
  it("uses the workflow-definition run hook", () => {
    expect(SOURCE).toMatch(/useRunWorkflowDefinition/);
  });

  it("renders a Play button in the workflow detail action bar", () => {
    expect(SOURCE).toMatch(/Play/);
    expect(SOURCE).toMatch(/aria-label=\{`Run workflow \$\{workflow\.id\}`\}/);
    expect(SOURCE).toMatch(/Run workflow now/);
  });

  it("only enables immediate run for runnable workflow records", () => {
    expect(SOURCE).toMatch(/workflow\.runnable === true/);
    expect(SOURCE).toMatch(/disabled=\{!runnable \|\| runPending\}/);
  });

  it("uses the visible trust-level control before running workflows", () => {
    expect(SOURCE).toContain("TrustLevelControl");
    expect(SOURCE).toContain("trustLevelForSubject");
    expect(SOURCE).toContain('trustSubjectKey("workflow"');
    expect(SOURCE).toContain("trust.setTrustLevel");
    expect(SOURCE).not.toContain("RunModeControl");
    expect(SOURCE).not.toContain("RunModeBadge");
    expect(SOURCE).not.toContain("KodyTriggerControl");
    expect(SOURCE).not.toContain("applyRunModeToCapabilities(");
    expect(SOURCE).toContain("runWorkflow.mutateAsync(selectedWorkflow.id)");
  });

  it("gives the visual workflow editor enough dialog room", () => {
    expect(WORKFLOW_EDITOR_SOURCE).toContain('modalSize="wide"');
    expect(WORKFLOW_EDITOR_SOURCE).toContain('modalHeight="viewport"');
    expect(WORKFLOW_EDITOR_SOURCE).toContain("WorkflowGraphCanvas");
    expect(WORKFLOW_EDITOR_SOURCE).toContain("Add step");
  });
});
