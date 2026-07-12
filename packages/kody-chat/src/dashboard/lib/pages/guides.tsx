/**
 * @fileType page
 * @domain kody-chat
 * @pattern shared-page
 * @ai-summary Canonical Guides page — hosts serve it as a one-line
 *   re-export.
 */
import { AuthGuard } from "../auth-guard";
import { GuidesManager } from "../components/GuidesManager";

export default function GuidesPage() {
  return (
    <AuthGuard>
      <GuidesManager />
    </AuthGuard>
  );
}
