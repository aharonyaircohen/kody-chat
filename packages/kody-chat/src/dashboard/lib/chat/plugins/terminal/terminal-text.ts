/**
 * @fileType module
 * @domain chat-plugin-terminal
 * @pattern pure-helpers
 * @ai-summary Pure text/output helpers for the terminal surface: escape
 *   stripping, capture trimming, Brain image labels + mismatch notices,
 *   wheel-delta translation, and the web-link opener. Extracted from
 *   ChatTerminalSurface in Step 5a so their behavior is unit-testable
 *   without React.
 */

export const MAX_CAPTURE_CHARS = 16_000;
export const MAX_CAPTURE_LINES = 160;

export function stripTerminalSequences(value: string): string {
  return value
    .replace(/\x1B\][^\x07]*(?:\x07|\x1B\\)/g, "")
    .replace(/\x1B\[[0-?]*[ -/]*[@-~]/g, "")
    .replace(/\x1B[@-Z\\-_]/g, "");
}

export function cleanTerminalText(value: string): string {
  const stripped = stripTerminalSequences(value)
    .replace(/\r\n/g, "\n")
    .replace(/\r/g, "\n");
  let output = "";
  for (const char of stripped) {
    if (char === "\b" || char === "\x7f") {
      output = output.slice(0, -1);
      continue;
    }
    if (char === "\n" || char === "\t" || char >= " ") {
      output += char;
    }
  }
  return output;
}

export function usefulCapturedOutput(value: string): string {
  const lines = cleanTerminalText(value)
    .split("\n")
    .map((line) => line.trimEnd())
    .filter((line) => line.trim().length > 0);
  const tail = lines.slice(-MAX_CAPTURE_LINES).join("\n").trim();
  return tail.length > MAX_CAPTURE_CHARS
    ? tail.slice(tail.length - MAX_CAPTURE_CHARS).trimStart()
    : tail;
}

export function shortBrainImageLabel(imageRef?: string | null): string {
  if (!imageRef) return "none";
  const tag = imageRef.split(":").pop();
  if (tag && tag !== imageRef) return tag;
  return imageRef.split("/").pop() ?? imageRef;
}

export interface FlySessionWarning {
  code?: string;
  message?: string;
  desiredImageRef?: string;
  runningImageRef?: string | null;
}

/**
 * Non-blocking Brain image mismatch notice (one line per warning, no
 * recovery/apply action — the terminal simply connects to the running
 * Brain). Returns the lines to write into the terminal.
 */
export function brainImageMismatchNotices(
  warnings: readonly FlySessionWarning[] | undefined,
): string[] {
  const notices: string[] = [];
  for (const warning of warnings ?? []) {
    if (
      warning.code === "selected_image_not_running" &&
      warning.desiredImageRef
    ) {
      const selectedLabel = shortBrainImageLabel(warning.desiredImageRef);
      const runningLabel = shortBrainImageLabel(warning.runningImageRef);
      notices.push(
        `\x1b[33mSelected image differs from running Brain. Selected: ${selectedLabel}; running: ${runningLabel}. Terminal is connecting to the running Brain.\x1b[0m`,
      );
    }
  }
  return notices;
}

export function wheelDeltaToTerminalLines(
  event: WheelEvent,
  viewportRows: number,
): number {
  if (event.deltaY === 0) return 0;
  if (event.deltaMode === WheelEvent.DOM_DELTA_PAGE) {
    return Math.max(1, viewportRows - 1);
  }
  if (event.deltaMode === WheelEvent.DOM_DELTA_LINE) {
    return Math.max(1, Math.ceil(Math.abs(event.deltaY)));
  }
  return Math.max(1, Math.ceil(Math.abs(event.deltaY) / 24));
}

/**
 * Web links clicked inside the terminal open in a fresh, opener-less tab
 * (the terminal surface owns link handling — never the raw anchor).
 */
export function openTerminalWebLink(
  uri: string,
  openWindow: (
    url: string,
    target: string,
    features: string,
  ) => (Window & { opener: unknown }) | null = (url, target, features) =>
    window.open(url, target, features) as (Window & { opener: unknown }) | null,
): void {
  const opened = openWindow(uri, "_blank", "noopener,noreferrer");
  if (opened) opened.opener = null;
}
