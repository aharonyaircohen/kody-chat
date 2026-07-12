/**
 * @fileType page
 * @domain kody-chat
 * @pattern shared-page
 * @ai-summary Canonical Lessons page — hosts serve it as a one-line
 *   re-export.
 */
import { AuthGuard } from "../auth-guard";
import { LessonsManager } from "../components/LessonsManager";

export default function LessonsPage() {
  return (
    <AuthGuard>
      <LessonsManager />
    </AuthGuard>
  );
}
