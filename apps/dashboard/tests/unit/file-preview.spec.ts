import { describe, expect, it } from "vitest";
import {
  filePreview,
  fileSupportsTextEditing,
} from "@dashboard/features/file-manager/lib/file-preview";
import { createFilePreviewBlob } from "@dashboard/features/file-manager/lib/file-preview-source";

describe("filePreview", () => {
  it.each([
    ["photo.png", { kind: "image", mediaType: "image/png" }],
    ["document.pdf", { kind: "pdf", mediaType: "application/pdf" }],
    ["clip.mp4", { kind: "video", mediaType: "video/mp4" }],
    ["recording.mp3", { kind: "audio", mediaType: "audio/mpeg" }],
  ] as const)("maps %s to its native preview", (path, expected) => {
    expect(filePreview(path)).toEqual(expected);
  });

  it("uses a safe fallback for unknown binary extensions", () => {
    expect(filePreview("archive.custom")).toEqual({
      kind: "unsupported",
      mediaType: "application/octet-stream",
    });
  });

  it("matches extensions case-insensitively", () => {
    expect(filePreview("PHOTO.PNG")).toEqual({
      kind: "image",
      mediaType: "image/png",
    });
  });

  it("keeps media out of the text editor while allowing text and code", () => {
    expect(fileSupportsTextEditing("photo.png", false)).toBe(false);
    expect(fileSupportsTextEditing("README.md", false)).toBe(true);
    expect(fileSupportsTextEditing("src/index.ts", false)).toBe(true);
    expect(fileSupportsTextEditing("unknown.bin", true)).toBe(false);
  });

  it("creates a typed binary blob without embedding content in a data URL", () => {
    const blob = createFilePreviewBlob("aGVsbG8=", "image/png");

    expect(blob.type).toBe("image/png");
    expect(blob.size).toBe(5);
  });
});
