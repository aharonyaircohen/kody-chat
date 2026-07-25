export type AdvancedFileRenderer = "archive" | "spreadsheet" | "word";

export interface AdvancedFilePreview {
  renderer: AdvancedFileRenderer;
}

export const MAX_ADVANCED_PREVIEW_SIZE_BYTES = 25 * 1024 * 1024;

export function canPreviewAdvancedFile(size: number): boolean {
  return size >= 0 && size <= MAX_ADVANCED_PREVIEW_SIZE_BYTES;
}

const WORD_EXTENSIONS = new Set(["doc", "docx"]);
const ARCHIVE_EXTENSIONS = new Set(["zip"]);
const SPREADSHEET_EXTENSIONS = new Set([
  "numbers",
  "ods",
  "xls",
  "xlsb",
  "xlsm",
  "xlsx",
  "xlt",
  "xltm",
  "xltx",
]);

export function advancedFilePreview(path: string): AdvancedFilePreview | null {
  const fileName = path.split("/").pop() ?? path;
  const separator = fileName.lastIndexOf(".");
  const extension =
    separator === -1 ? "" : fileName.slice(separator + 1).toLowerCase();

  if (WORD_EXTENSIONS.has(extension)) return { renderer: "word" };
  if (SPREADSHEET_EXTENSIONS.has(extension)) {
    return { renderer: "spreadsheet" };
  }
  if (ARCHIVE_EXTENSIONS.has(extension)) return { renderer: "archive" };
  return null;
}
