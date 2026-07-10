/**
 * @fileType page
 * @domain kody-chat
 * @pattern shared-page
 * @ai-summary Canonical Memory page — hosts serve it as a one-line
 *   re-export (see pages-coverage specs in each host).
 */
import { AuthGuard } from "../auth-guard";
import { MemoryManager } from "../components/MemoryManager";

export default function MemoryPage() {
  return (
    <AuthGuard>
      <MemoryManager />
    </AuthGuard>
  );
}
