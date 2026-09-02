import { AuthGuard } from "@dashboard/lib/auth-guard";
import SharedWorkPage from "@kody-ade/kody-chat-dashboard/pages/shared-work";

export const dynamic = "force-dynamic";

export default async function Page({
  params,
}: {
  params: Promise<{ recordId: string }>;
}) {
  const { recordId } = await params;
  return (
    <AuthGuard>
      <SharedWorkPage initialRecordId={recordId} />
    </AuthGuard>
  );
}
