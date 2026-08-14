import { describe, expect, it } from "vitest";

import {
  BUILTIN_GUIDED_FLOW_DEFINITIONS,
  BUILTIN_REQUEST_BLUEPRINT_DEFINITIONS,
} from "../../src/dashboard/lib/guided-flows/builtins";
import { buildGuidedFlowFromRequestBlueprint } from "../../src/dashboard/lib/request-blueprints";

describe("built-in Request Blueprints", () => {
  it("owns every built-in Guided Flow through one generated source", () => {
    expect(BUILTIN_REQUEST_BLUEPRINT_DEFINITIONS).toHaveLength(
      BUILTIN_GUIDED_FLOW_DEFINITIONS.length,
    );
    expect(
      BUILTIN_REQUEST_BLUEPRINT_DEFINITIONS.map((blueprint) =>
        buildGuidedFlowFromRequestBlueprint(blueprint),
      ),
    ).toEqual(BUILTIN_GUIDED_FLOW_DEFINITIONS);
  });

  it("preserves versioned definitions as separate generated flows", () => {
    const identities = BUILTIN_REQUEST_BLUEPRINT_DEFINITIONS.map(
      ({ id, version }) => `${id}@${version}`,
    );
    expect(new Set(identities).size).toBe(identities.length);
  });
});
