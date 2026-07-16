/**
 * @fileType component
 * @domain kody-chat
 * @pattern kody-chat-dialogs
 *
 * Confirmation + issue-report dialogs owned by the KodyChat surface. Kept in
 * its own module so the KodyChat component file (a size-ratcheted hot path —
 * see eslint.config.mjs "kodychat-size-ratchet") doesn't have to host the JSX
 * alongside its state/handlers.
 */
"use client";

import { ConfirmDialog } from "@dashboard/lib/components/ConfirmDialog";
import {
  ChatIssueReportDialog,
  type ChatIssueReportState,
} from "@dashboard/lib/components/ChatIssueReportDialog";

interface KodyChatDialogsProps {
  showClearConfirm: boolean;
  onClearConfirm: () => void;
  onClearClose: () => void;
  showIssueReport: boolean;
  onIssueReportClose: () => void;
  issueReportState: ChatIssueReportState | null;
}

export function KodyChatDialogs({
  showClearConfirm,
  onClearConfirm,
  onClearClose,
  showIssueReport,
  onIssueReportClose,
  issueReportState,
}: KodyChatDialogsProps) {
  return (
    <>
      <ConfirmDialog
        open={showClearConfirm}
        title="Clear history"
        description="Clear conversation history? This cannot be undone."
        confirmLabel="Clear"
        variant="destructive"
        onConfirm={onClearConfirm}
        onClose={onClearClose}
      />
      <ChatIssueReportDialog
        open={showIssueReport}
        onClose={onIssueReportClose}
        capturedState={issueReportState}
      />
    </>
  );
}
