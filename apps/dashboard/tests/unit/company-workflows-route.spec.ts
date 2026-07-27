import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const listSource = readFileSync(
  "app/api/kody/company/workflows/route.ts",
  "utf8",
);
const detailSource = readFileSync(
  "app/api/kody/company/workflows/[id]/route.ts",
  "utf8",
);

describe("Workflow API boundary", () => {
  it("reads Workflows only from the Workflow stores", () => {
    expect(listSource).toContain("listCompanyStoreWorkflowDefinitionFiles");
    expect(listSource).toContain("reconcileProjectedStoreWorkflows");
    expect(listSource).not.toContain("if (projected.length > 0)");
    expect(listSource).not.toContain(
      "listCompanyStoreCapabilityWorkflowDefinitionFiles",
    );
    expect(detailSource).not.toContain(
      "readCompanyStoreCapabilityWorkflowDefinitionFile",
    );
  });

  it("keeps Workflow validation and approval behavior", () => {
    expect(listSource).toContain("validateWorkflowDefinition");
    expect(listSource).toContain("runWithoutApproval");
    expect(listSource).not.toContain("workflowInputMappingSchema");
    expect(detailSource).toContain("validateWorkflowDefinition");
    expect(detailSource).not.toContain("workflowInputMappingSchema");
  });
});
