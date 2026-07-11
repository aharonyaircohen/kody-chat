/**
 * Built-in default renderers: shipped with the package, overridable by
 * state-repo files with the same slug.
 *
 * @testFramework vitest
 * @domain unit
 */
import { describe, expect, it } from "vitest";
import {
  BUILTIN_VIEW_RENDERER_DEFINITIONS,
  getBuiltinViewRendererDefinition,
} from "@dashboard/lib/view-renderers/builtin";
import { matchViewRendererDefinition } from "@dashboard/lib/view-renderers/renderers";

describe("builtin view renderers", () => {
  it("ships the three default renderers, validated", () => {
    expect(
      BUILTIN_VIEW_RENDERER_DEFINITIONS.map((d) => d.slug).sort(),
    ).toEqual(["approval-card", "multi-select-list", "selection-list"]);
    for (const definition of BUILTIN_VIEW_RENDERER_DEFINITIONS) {
      expect(definition.ui.type).toBe("stack");
      expect(definition.rule?.trim()).toBeTruthy();
    }
  });

  it("looks up a built-in by slug", () => {
    expect(getBuiltinViewRendererDefinition("approval-card")?.name).toBe(
      "Approval card",
    );
    expect(getBuiltinViewRendererDefinition("nope")).toBeNull();
  });

  it("built-ins are matchable by purpose", () => {
    const matched = matchViewRendererDefinition(
      [...BUILTIN_VIEW_RENDERER_DEFINITIONS],
      "selection-list",
      { title: "Pick one", items: [{ label: "A" }, { label: "B" }] },
      "choose one item",
    );
    expect(matched?.slug).toBe("selection-list");
  });
});
