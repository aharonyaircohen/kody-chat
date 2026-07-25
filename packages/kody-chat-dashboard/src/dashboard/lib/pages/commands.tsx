/**
 * @fileType page
 * @domain kody-chat
 * @pattern shared-page
 * @ai-summary Canonical Commands page — hosts serve it as a one-line
 *   re-export (see pages-coverage specs in each host).
 */
import { AuthGuard } from "../auth-guard";
import { CommandsManager } from "../components/CommandsManager";

export default function CommandsPage() {
  return (
    <AuthGuard>
      <CommandsManager />
    </AuthGuard>
  );
}
