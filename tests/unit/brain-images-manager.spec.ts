/**
 * @fileoverview Source-level guard for Brain Images manager mutation refreshes.
 * @testFramework vitest
 * @domain brain
 */
import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

const __dirname = dirname(fileURLToPath(import.meta.url));
const SOURCE = readFileSync(
  resolve(
    __dirname,
    "../../src/dashboard/lib/components/BrainImagesManager.tsx",
  ),
  "utf8",
);

describe("BrainImagesManager", () => {
  it("reloads authoritative image state after each mutating action", () => {
    expect(SOURCE).toContain("await loadImages();");
    expect(SOURCE).toContain('toast.success("Brain image applied");');
    expect(SOURCE).toContain(
      'await loadImages();\n      toast.success("Brain image forgotten");',
    );
  });

  it("requires confirmation before forgetting an image", () => {
    expect(SOURCE).toContain(
      'import { ConfirmDialog } from "./ConfirmDialog";',
    );
    expect(SOURCE).toContain("const [pendingForgetRef, setPendingForgetRef]");
    expect(SOURCE).toContain(
      "onClick={() => setPendingForgetRef(image.imageRef)}",
    );
    expect(SOURCE).toContain("<ConfirmDialog");
    expect(SOURCE).toContain('confirmLabel="Forget"');
    expect(SOURCE).toContain('variant="destructive"');
    expect(SOURCE).toContain(
      "if (pendingForgetRef) void forgetImage(pendingForgetRef);",
    );
  });

  it("requires confirmation before running or rerunning a Brain image", () => {
    expect(SOURCE).toContain("const [pendingApplyRef, setPendingApplyRef]");
    expect(SOURCE).toContain("requestApplyImage(image.imageRef)");
    expect(SOURCE).toContain("This will replace the Brain machine image");
    expect(SOURCE).toContain("This will rerun the active Brain image");
    expect(SOURCE).toContain(
      "Unsaved changes in the current machine may be lost",
    );
    expect(SOURCE).toContain(
      'confirmLabel={pendingApplyIsRunning ? "Rerun image" : "Run image"}',
    );
    expect(SOURCE).toContain("void applyImage(");
    expect(SOURCE).toContain("pendingApplyIsRunning");
    expect(SOURCE).toContain(
      "function requestApplyImage(imageRef: string) {\n    setPendingApplyRef(imageRef);\n  }",
    );
    expect(SOURCE).not.toContain("void applyImage(imageRef);");
  });

  it("refreshes terminal machine targets after applying an image", () => {
    expect(SOURCE).toContain(
      'window.dispatchEvent(new Event("kody:fly-machines-refresh"));',
    );
  });

  it("runs the clicked image as the only image activation action", () => {
    expect(SOURCE).toContain("body: JSON.stringify({ imageRef, reset }),");
    expect(SOURCE).toContain(
      'headers: { "content-type": "application/json", ...headers },',
    );
    expect(SOURCE).toContain(
      'running ? "Rerun Brain image" : "Run Brain image"',
    );
    expect(SOURCE).toContain(
      'title={running ? "Rerun Brain image" : "Run Brain image"}',
    );
    expect(SOURCE).toContain("<RotateCcw");
    expect(SOURCE).not.toContain("<Square");
    expect(SOURCE).toContain('size="icon"');
    expect(SOURCE).toContain("disabled={busy}");
    expect(SOURCE).not.toContain("disabled={running || busy}");
    expect(SOURCE).not.toContain(
      '{running ? "Running Brain image" : "Run this image"}',
    );
    expect(SOURCE).not.toContain("selectImage(");
    expect(SOURCE).not.toContain('toast.success("Brain image selected")');
    expect(SOURCE).not.toContain('method: "PATCH"');
    expect(SOURCE).not.toContain("disabled={!selected || running || busy}");
  });

  it("does not show a duplicate running badge in each image row", () => {
    expect(SOURCE).not.toContain("text-emerald-200");
    expect(SOURCE).not.toContain("Running Brain image</span>");
  });

  it("shows a compact active marker for the running image row", () => {
    expect(SOURCE).toContain('title="Active Brain image"');
    expect(SOURCE).toContain('aria-label="Active Brain image"');
    expect(SOURCE).toContain("<CheckCircle2");
    expect(SOURCE).toContain("text-emerald-300");
    expect(SOURCE).toContain("bg-emerald-400/10");
    expect(SOURCE).not.toContain("\n                          Active\n");
  });

  it("shows running Brain image, latest save, and saved image count separately", () => {
    expect(SOURCE).toContain(
      "Run this image replaces the saved Brain machine image",
    );
    expect(SOURCE).toContain("Running Brain image");
    expect(SOURCE).toContain("Latest save");
    expect(SOURCE).toContain("Saved images");
    expect(SOURCE).not.toContain(">Selected<");
    expect(SOURCE).not.toContain(">Running<");
    expect(SOURCE).toContain("Pending image");
    expect(SOURCE).toContain('Machine {machineState ?? "state unknown"}');
    expect(SOURCE).toContain("machineImageRef");
    expect(SOURCE).toContain("Saved {formatDate(image.updatedAt)}");
    expect(SOURCE).toContain("`Applied ${formatDate(runningAt)}`");
  });

  it("shows running save elapsed time against now instead of last update", () => {
    expect(SOURCE).toContain("elapsedLabel(save.startedAt)");
    expect(SOURCE).not.toContain(
      "elapsedLabel(save.startedAt, save.updatedAt)",
    );
  });

  it("shows live save heartbeat separately from elapsed time", () => {
    expect(SOURCE).toContain("function liveSignalLabel");
    expect(SOURCE).toContain("heartbeatAt: body.heartbeatAt");
    expect(SOURCE).toContain("liveSignalLabel(save.heartbeatAt)");
  });
});
