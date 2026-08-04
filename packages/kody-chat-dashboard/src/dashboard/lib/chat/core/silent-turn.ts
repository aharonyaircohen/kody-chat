/**
 * User-visible fallback for assistant turns that finish with reasoning but no
 * answer or rendered view.
 */
export const SILENT_ASSISTANT_NOTICE =
  "Kody returned no response. The model may not be configured for this repo, or it ended the turn without a reply — try again, or check Chat Models in Settings.";

export const TRANSIENT_ASSISTANT_NOTICE =
  "The assistant did not return a final result. The action may have completed; verify it before retrying.";

const TRANSIENT_ASSISTANT_STATUS =
  /^(registering|starting|working|processing|checking|trying|loading|running)\b/i;

export function isLikelyTransientAssistantStatus(answer: string): boolean {
  const normalized = answer.trim().replace(/\s+/g, " ");
  return (
    normalized.length > 0 &&
    normalized.length <= 120 &&
    TRANSIENT_ASSISTANT_STATUS.test(normalized)
  );
}
