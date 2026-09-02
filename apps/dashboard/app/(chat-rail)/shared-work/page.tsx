import { AuthGuard } from "@dashboard/lib/auth-guard";
import SharedWorkPage from "@kody-ade/kody-chat-dashboard/pages/shared-work";

export const dynamic = "force-dynamic";

export default function Page() {
  return (
    <AuthGuard>
      <SharedWorkPage />
    </AuthGuard>
  );
}
