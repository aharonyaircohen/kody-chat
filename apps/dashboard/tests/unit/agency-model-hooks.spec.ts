import { describe, expect, it } from "vitest";
import { agencyModelQueryKeys } from "@dashboard/lib/hooks/useAgencyModel";

describe("Agency model query keys", () => {
  it("partitions cached definitions and states by repository", () => {
    expect(agencyModelQueryKeys.definitions("acme", "one")).not.toEqual(
      agencyModelQueryKeys.definitions("acme", "two"),
    );
    expect(agencyModelQueryKeys.states("acme", "one")).not.toEqual(
      agencyModelQueryKeys.states("other", "one"),
    );
  });
});
