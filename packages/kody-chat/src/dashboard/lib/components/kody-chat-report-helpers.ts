/**
 * @fileType ui
 * @domain kody
 * @pattern kody-chat-report-helpers
 * @ai-summary Pure formatting helpers for KodyChat's issue-report payload
 *   (string coercion, length compaction, null filtering). Extracted so
 *   KodyChat.tsx can shrink toward the size ratchet cap without losing
 *   the issue-report capture path.
 */

export function reportValue(value: unknown, max = 1_000): string | null {
  if (value === null || value === undefined || value === "") return null;
  const raw =
    typeof value === "string"
      ? value
      : Array.isArray(value)
        ? value.join(", ")
        : typeof value === "object"
          ? JSON.stringify(value)
          : String(value);
  const compact = raw.replace(/\s+/g, " ").trim();
  if (!compact) return null;
  return compact.length > max ? `${compact.slice(0, max - 3)}...` : compact;
}

export function reportItem(
  label: string,
  value: unknown,
  max?: number,
): { label: string; value: string } | null {
  const normalized = reportValue(value, max);
  return normalized ? { label, value: normalized } : null;
}

export function compactReportItems(
  items: Array<{ label: string; value: string } | null>,
): Array<{ label: string; value: string }> {
  return items.filter(Boolean) as Array<{ label: string; value: string }>;
}
