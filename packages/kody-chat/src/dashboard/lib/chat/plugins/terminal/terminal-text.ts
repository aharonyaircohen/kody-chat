/**
 * @fileType module
 * @domain chat-plugin-terminal
 * @pattern pure-helpers
 * @ai-summary Pure text/output helpers for the terminal surface: escape
 *   stripping, capture trimming, wheel-delta translation, and the web-link
 *   opener. Extracted from
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
