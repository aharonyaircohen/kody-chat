import { AuthGuard } from "@dashboard/lib/auth-guard";
import AppsPage from "@kody-ade/kody-chat-dashboard/pages/apps";
export const dynamic = "force-dynamic";
export default function Page() {
  return (
    <AuthGuard>
      <AppsPage />
    </AuthGuard>
  );
}
