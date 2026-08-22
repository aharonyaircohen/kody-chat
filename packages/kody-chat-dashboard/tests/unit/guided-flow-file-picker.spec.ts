import { describe, expect, it } from "vitest";

import {
  buildGuidedFlowFilePickerHref,
  consumeGuidedFlowFileSelection,
  fileMatchesPicker,
  parseGuidedFlowFilePicker,
  storeGuidedFlowFileSelection,
} from "../../src/dashboard/lib/guided-flows/file-picker";

describe("Guided Flow file picker contract", () => {
  const picker = {
    instanceId: "instance-1",
    stepId: "step-4",
    revision: 3,
    resultField: "pdfPath",
    extensions: [".pdf"],
  };

  it("adds picker state without changing the file route", () => {
    expect(buildGuidedFlowFilePickerHref("/files", picker)).toBe(
      "/files?guidedFlowPicker=1&instanceId=instance-1&stepId=step-4&revision=3&resultField=pdfPath&extensions=.pdf",
    );
  });

  it("round-trips valid picker state", () => {
    const href = buildGuidedFlowFilePickerHref("/files", picker);
    expect(
      parseGuidedFlowFilePicker(
        new URL(href, "https://kody.test").searchParams,
      ),
    ).toEqual(picker);
  });

  it("does not treat ordinary File Manager navigation as picker mode", () => {
    expect(parseGuidedFlowFilePicker(new URLSearchParams())).toBeNull();
  });

  it("accepts only configured file extensions", () => {
    expect(fileMatchesPicker("lessons/algebra.pdf", picker)).toBe(true);
    expect(fileMatchesPicker("lessons/algebra.txt", picker)).toBe(false);
  });

  it("returns one matching selection to the Guide", () => {
    const values = new Map<string, string>();
    const storage = {
      getItem: (key: string) => values.get(key) ?? null,
      setItem: (key: string, value: string) => values.set(key, value),
      removeItem: (key: string) => values.delete(key),
    };
    const selection = {
      ...picker,
      filePath: "lessons/algebra.pdf",
      fileName: "algebra.pdf",
    };
    storeGuidedFlowFileSelection(storage, selection);

    expect(consumeGuidedFlowFileSelection(storage, picker)).toEqual(selection);
    expect(consumeGuidedFlowFileSelection(storage, picker)).toBeNull();
  });
});
