/**
 * @fileoverview Submit-response semantics for rendered views. A submit in
 * a view WITHOUT checkboxes is a plain confirmation (approval cards) and
 * must send the button label — "Selected: none" there reads as a
 * rejection to the model. Views WITH checkboxes keep the "Selected: …"
 * report, including the explicit "none" when nothing is checked.
 * @testFramework vitest
 * @domain chat-surface
 */

import { describe, it, expect } from "vitest";
import {
  buildSubmitResponse,
  hasCheckboxNodes,
} from "@dashboard/lib/chat/surface/RenderedViewCard";
import type { RenderedViewUiNode } from "@dashboard/lib/chat-ui-actions";

const approvalCard: RenderedViewUiNode = {
  type: "stack",
  children: [
    { type: "markdown", value: "Approve the plan?" },
    { type: "submit", label: "Confirm" },
  ],
};

const checkboxCard: RenderedViewUiNode = {
  type: "stack",
  children: [
    {
      type: "list",
      children: [
        { type: "checkbox", name: "picks", value: "a", label: "Option A" },
        { type: "checkbox", name: "picks", value: "b", label: "Option B" },
      ],
    },
    { type: "submit", label: "Submit" },
  ],
};

describe("buildSubmitResponse", () => {
  it("sends the button label for views without checkboxes (approval card)", () => {
    expect(buildSubmitResponse(approvalCard, {}, "Confirm")).toBe("Confirm");
  });

  it("reports Selected: none when checkboxes exist but nothing is checked", () => {
    expect(buildSubmitResponse(checkboxCard, {}, "Submit")).toBe(
      "Selected: none",
    );
  });

  it("reports the checked values with labels", () => {
    expect(
      buildSubmitResponse(
        checkboxCard,
        { picks: [{ value: "a", label: "Option A" }] },
        "Submit",
      ),
    ).toBe("Selected: Option A (a)");
  });

  it("omits the value when it equals the label", () => {
    expect(
      buildSubmitResponse(
        checkboxCard,
        { picks: [{ value: "Option A", label: "Option A" }] },
        "Submit",
      ),
    ).toBe("Selected: Option A");
  });
});

describe("hasCheckboxNodes", () => {
  it("finds checkboxes nested in stack/row/list containers", () => {
    expect(hasCheckboxNodes(checkboxCard)).toBe(true);
    expect(hasCheckboxNodes(approvalCard)).toBe(false);
  });
});
