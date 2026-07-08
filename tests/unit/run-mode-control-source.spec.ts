import { readFileSync } from "node:fs";

import { describe, expect, it } from "vitest";

const source = readFileSync(
  "src/dashboard/lib/components/RunModeControl.tsx",
  "utf8",
);
const workflowsSource = readFileSync(
  "src/dashboard/lib/components/WorkflowsManager.tsx",
  "utf8",
);
const managedModelsSource = readFileSync(
  "src/dashboard/lib/components/ManagedModelsView.tsx",
  "utf8",
);

describe("RunModeControl source", () => {
  it("uses clear accessibility labels without visible button text", () => {
    expect(source).toContain("Human approval required");
    expect(source).toContain("Kody can trigger");
    expect(source).not.toContain("Autorun");
    expect(source).not.toContain("Run without approval");
  });

  it("keeps icon controls tooltipable while unavailable", () => {
    expect(source).toContain("SimpleTooltip");
    expect(source).toContain("aria-disabled={unavailable}");
    expect(source).toContain("if (capabilityCount === 0) return null");
    expect(source).not.toContain("disabled={disabled || pending}");
    expect(source).not.toContain("No capabilities to approve");
  });

  it("writes workflow, goal, and loop trigger approval through subject trust", () => {
    expect(workflowsSource).toContain('trustSubjectKey("workflow"');
    expect(workflowsSource).toContain("trust.setSubjectTrust");
    expect(workflowsSource).toContain(
      "runWithoutApprovalPending={trust.isMutating}",
    );

    expect(managedModelsSource).toContain("trustSubjectKey(");
    expect(managedModelsSource).toContain('"loop" : "goal"');
    expect(managedModelsSource).toContain("trust.setSubjectTrust");
    expect(managedModelsSource).toContain(
      "runWithoutApprovalPending={trust.isMutating}",
    );
  });
});
